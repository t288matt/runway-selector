// The fetching loader, driven by a fake fetch (it is injected, never global).
import { describe, expect, it } from 'vitest';
import { BOUNDS, loadPack, parseAppConfig, reloadPack, PackValidationError, type FetchLike } from '../../src/refdata';
import { TEST_PACK, YSSY_PACK, loadPackFrom, readJson, readRaw, type RawFiles } from '../helpers/packs';

interface Served {
  app: string;
  packs: Record<string, RawFiles>;
  /** Overrides: URL path (no query) -> a ready Response factory. */
  special?: Record<string, () => Response>;
}

const APP = JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'YSSY', description: 'x' });

function fake(served: Served): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchFn: FetchLike = (input) => {
    urls.push(input);
    const path = input.split('?')[0] ?? '';
    const special = served.special?.[path];
    if (special) return Promise.resolve(special());
    if (path === './refdata/app.json') return Promise.resolve(new Response(served.app));
    const m = /^\.\/refdata\/airports\/([A-Za-z0-9]+)\/([a-z_]+\.json)$/.exec(path);
    const body = m ? (served.packs[m[1] ?? ''] as Record<string, string> | undefined)?.[m[2] ?? ''] : undefined;
    return Promise.resolve(body === undefined ? new Response('not found', { status: 404 }) : new Response(body));
  };
  return { fetch: fetchFn, urls };
}

const good = (): Served => ({ app: APP, packs: { YSSY: readRaw(YSSY_PACK) } });

describe('loadPack: slow answers and redirects (issue 18)', () => {
  it('asks with redirect: error and a timeout signal, and no cookies', async () => {
    const inits: (RequestInit | undefined)[] = [];
    const inner = fake(good()).fetch;
    const r = await loadPack((url, init) => (inits.push(init), inner(url, init)), { cacheBust: 'x1' });
    expect(r.ok).toBe(true);
    expect(inits).toHaveLength(6);
    for (const init of inits) {
      expect(init).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('a response that came from a redirect is refused and names the file', async () => {
    const served = good();
    served.special = { './refdata/airports/YSSY/runways.json': () => Object.defineProperty(new Response(readRaw(YSSY_PACK)['runways.json']), 'redirected', { value: true }) };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('runways.json');
      expect(r.message).toContain('redirected');
    }
  });

  it('a redirect status is refused too, with no following of it', async () => {
    const served = good();
    served.special = { './refdata/app.json': () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/app.json' } }) };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('redirected');
  });

  it('a file that never answers is given up on at the timeout', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('aborted')), { once: true });
      });
    const r = await loadPack(hang, { cacheBust: 'x1', timeoutMs: 30 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('did not arrive within');
  });

  it('a body that never ends is cut at the timeout', async () => {
    const served = good();
    served.special = { './refdata/app.json': () => new Response(new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) })) };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1', timeoutMs: 30 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('did not arrive within');
  });
});

describe('loadPack', () => {
  it('loads a valid pack and asks for every file with the cache-bust query', async () => {
    const { fetch, urls } = fake(good());
    const r = await loadPack(fetch, { cacheBust: 'abc123' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.airport.icao).toBe('YSSY');
    expect(r.pack).toEqual(loadPackFrom(YSSY_PACK));
    expect(urls).toHaveLength(6);
    expect(urls[0]).toBe('./refdata/app.json?v=abc123');
    for (const u of urls) expect(u).toMatch(/\?v=abc123$/);
  });

  it('a different token gives different addresses (no stale copy)', async () => {
    const a = fake(good());
    const b = fake(good());
    await loadPack(a.fetch, { cacheBust: 'one' });
    await loadPack(b.fetch, { cacheBust: 'two' });
    expect(a.urls.every((u) => u.endsWith('?v=one'))).toBe(true);
    expect(b.urls.every((u) => u.endsWith('?v=two'))).toBe(true);
  });

  it('refuses a cache-bust token that could alter the address', async () => {
    const { fetch, urls } = fake(good());
    const r = await loadPack(fetch, { cacheBust: 'a&b=../x' });
    expect(r.ok).toBe(false);
    expect(urls).toHaveLength(0);
  });

  it('uses the base address given', async () => {
    const { fetch, urls } = fake(good());
    await loadPack(fetch, { cacheBust: 'v1', baseUrl: './elsewhere/' });
    expect(urls[0]).toBe('./elsewhere/app.json?v=v1');
  });

  it('a 404 on one file is refused with the file and the status', async () => {
    const served = good();
    served.special = { './refdata/airports/YSSY/modes.json': () => new Response('gone', { status: 404 }) };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('modes.json');
    expect(r.message).toContain('404');
  });

  it('a 404 on app.json is refused', async () => {
    const served = good();
    served.special = { './refdata/app.json': () => new Response('gone', { status: 404 }) };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('app.json');
  });

  it('a network failure is reported, not thrown', async () => {
    const r = await loadPack(() => Promise.reject(new Error('offline')), { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('app.json');
      expect(r.message).toContain('offline');
    }
  });

  it('refuses an oversize body (no length header) and stops reading at the cap', async () => {
    let pulls = 0;
    const chunk = new Uint8Array(64 * 1024).fill(32);
    const served = good();
    served.special = {
      './refdata/airports/YSSY/settings.json': () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulls += 1;
              if (pulls > 1000) controller.close();
              else controller.enqueue(chunk);
            },
          }),
        ),
    };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('settings.json');
    expect(r.message).toContain('byte limit');
    expect(pulls).toBeLessThan(10);
  });

  it('refuses an oversize body by its declared length, even when the body itself is valid', async () => {
    const served = good();
    served.special = {
      './refdata/airports/YSSY/runways.json': () =>
        new Response(readRaw(YSSY_PACK)['runways.json'], { headers: { 'content-length': String(BOUNDS.cap.packFileBytes + 1) } }),
    };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('runways.json');
      expect(r.message).toContain('byte limit');
    }
  });

  it('refuses an oversize app.json (16 KB cap)', async () => {
    const served = good();
    served.app = JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'YSSY', description: 'x'.repeat(20000) });
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('app.json');
  });

  it('refuses an invalid pack with the file and field', async () => {
    const served = good();
    const files = readJson(YSSY_PACK);
    files['settings.json'].tailwindDryKt.value = 500;
    served.packs.YSSY = { ...readRaw(YSSY_PACK), 'settings.json': JSON.stringify(files['settings.json']) };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('settings.json');
    expect(r.message).toContain('tailwindDryKt.value');
  });

  it('refuses invalid text that is not UTF-8', async () => {
    const served = good();
    served.special = { './refdata/airports/YSSY/airport.json': () => new Response(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])) };
    const r = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('airport.json');
  });

  it('refuses an airport that app.json does not list, and a folder whose icao disagrees', async () => {
    const unlisted = await loadPack(fake(good()).fetch, { cacheBust: 'x1', airportId: 'ABCD' });
    expect(unlisted.ok).toBe(false);
    if (!unlisted.ok) expect(unlisted.message).toContain('app.json');

    const served: Served = { app: APP, packs: { YSSY: readRaw(TEST_PACK) } };
    const mismatch = await loadPack(fake(served).fetch, { cacheBust: 'x1' });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.message).toContain('airport.json: icao');
  });

  it('an airport id from app.json cannot climb out of the pack folder', () => {
    expect(() => parseAppConfig(JSON.stringify({ schemaVersion: 1, airports: ['../x'], default: '../x' }))).toThrow(PackValidationError);
  });
});

describe('app.json', () => {
  it('needs a supported schemaVersion, no unknown keys and a default that is listed', () => {
    expect(parseAppConfig(APP).default).toBe('YSSY');
    expect(() => parseAppConfig(JSON.stringify({ schemaVersion: 9, airports: ['YSSY'], default: 'YSSY' }))).toThrow(/app\.json: schemaVersion/);
    expect(() => parseAppConfig(JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'YSSY', extra: 1 }))).toThrow(/app\.json: extra/);
    expect(() => parseAppConfig(JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'OTHER' }))).toThrow(/app\.json: default/);
    expect(() => parseAppConfig(JSON.stringify({ schemaVersion: 1, airports: ['YSSY', 'YSSY'], default: 'YSSY' }))).toThrow(/Duplicate/);
    expect(() => parseAppConfig('{"schemaVersion":1,"airports":["YSSY"],"default":"YSSY","__proto__":{}}')).toThrow(/__proto__/);
    expect(() => parseAppConfig('not json')).toThrow(/app\.json/);
  });
});

describe('reloadPack', () => {
  it('returns the new pack when the files are valid', async () => {
    const first = await loadPack(fake(good()).fetch, { cacheBust: 'a1' });
    if (!first.ok) throw new Error('setup failed');
    const served = good();
    const files = readJson(YSSY_PACK);
    files['settings.json'].calmWindKt.value = 4;
    served.packs.YSSY = { ...readRaw(YSSY_PACK), 'settings.json': JSON.stringify(files['settings.json']) };
    const r = await reloadPack(fake(served).fetch, { cacheBust: 'a2' }, first.pack);
    expect(r.ok).toBe(true);
    expect(r.pack.settings.calmWindKt).toBe(4);
    expect(r.pack).not.toBe(first.pack);
  });

  it('keeps the previous valid pack, unchanged, when the new files are rejected', async () => {
    const first = await loadPack(fake(good()).fetch, { cacheBust: 'a1' });
    if (!first.ok) throw new Error('setup failed');
    const served = good();
    const files = readJson(YSSY_PACK);
    delete files['settings.json'].tailwindDryKt.description;
    served.packs.YSSY = { ...readRaw(YSSY_PACK), 'settings.json': JSON.stringify(files['settings.json']) };
    const r = await reloadPack(fake(served).fetch, { cacheBust: 'a2' }, first.pack);
    expect(r.ok).toBe(false);
    expect(r.pack).toBe(first.pack);
    if (!r.ok) {
      expect(r.message).toContain('tailwindDryKt.description');
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it('keeps the previous pack when the network fails or a file is missing', async () => {
    const first = await loadPack(fake(good()).fetch, { cacheBust: 'a1' });
    if (!first.ok) throw new Error('setup failed');
    const down = await reloadPack(() => Promise.reject(new Error('offline')), { cacheBust: 'a2' }, first.pack);
    expect(down.ok).toBe(false);
    expect(down.pack).toBe(first.pack);
    const served = good();
    served.special = { './refdata/airports/YSSY/modes.json': () => new Response('', { status: 500 }) };
    const missing = await reloadPack(fake(served).fetch, { cacheBust: 'a3' }, first.pack);
    expect(missing.ok).toBe(false);
    expect(missing.pack).toBe(first.pack);
  });

  it('reloads the airport of the previous pack, and requests with the new token', async () => {
    const first = await loadPack(fake(good()).fetch, { cacheBust: 'a1' });
    if (!first.ok) throw new Error('setup failed');
    const f = fake(good());
    await reloadPack(f.fetch, { cacheBust: 'fresh9' }, first.pack);
    expect(f.urls.some((u) => u.includes('/airports/YSSY/'))).toBe(true);
    expect(f.urls.every((u) => u.endsWith('?v=fresh9'))).toBe(true);
  });
});

describe('purity', () => {
  it('parsePack is exported from the package and needs no fetch', async () => {
    const mod = await import('../../src/refdata');
    expect(typeof mod.parsePack).toBe('function');
    expect(mod.parsePack(readRaw(TEST_PACK)).airport.icao).toBe('TEST');
  });
});

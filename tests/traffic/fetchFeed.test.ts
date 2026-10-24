// fetchFeed and isStale, driven by a fake fetch and a fake clock.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEED_MAX_BYTES, VATSIM_FEED_URL } from '../../src/traffic/config';
import { fetchFeed, formatDuration, isStale, type FeedFetch } from '../../src/traffic/fetchFeed';
import { YSSY_PACK, loadPackFrom } from '../helpers/packs';

const fixture = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'traffic', 'synthetic-feed.json'), 'utf8');
const NOW = 1_800_000_000_000;

const serve = (make: () => Response): { fetch: FeedFetch; calls: { url: string; init?: RequestInit }[] } => {
  const calls: { url: string; init?: RequestInit }[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(make());
    },
  };
};

const run = (f: FeedFetch, extra: { url?: string; timeoutMs?: number } = {}) => fetchFeed({ fetch: f, now: () => NOW, ...extra });

describe('fetchFeed success', () => {
  it('returns the parsed aircraft, the injected fetch time and the feed time', async () => {
    const s = serve(() => new Response(fixture));
    const r = await run(s.fetch);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.aircraft).toHaveLength(3);
    expect(r.fetchedAtMs).toBe(NOW);
    expect(r.feedTimestampMs).toBe(Date.UTC(2026, 9, 23, 10, 0, 0, 123));
    expect(r.skippedPilots).toBe(1);
  });

  it('asks the one configured HTTPS address with no cookies and no custom headers (no CORS preflight)', async () => {
    const s = serve(() => new Response(fixture));
    await run(s.fetch);
    expect(s.calls[0]?.url).toBe(VATSIM_FEED_URL);
    expect(VATSIM_FEED_URL.startsWith('https://')).toBe(true);
    expect(s.calls[0]?.init?.credentials).toBe('omit');
    expect(s.calls[0]?.init?.headers).toBeUndefined();
    expect(s.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('asks with redirect: error, and refuses an answer that came from a redirect (issue 18)', async () => {
    const s = serve(() => Object.defineProperty(new Response(fixture), 'redirected', { value: true }));
    const r = await run(s.fetch);
    expect(s.calls[0]?.init?.redirect).toBe('error');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('redirect');
  });
});

describe('fetchFeed failures return an error object (the caller keeps its previous data)', () => {
  it('refuses a non-HTTPS address without calling fetch', async () => {
    const s = serve(() => new Response(fixture));
    const r = await run(s.fetch, { url: 'http://data.example.invalid/feed.json' });
    expect(r).toEqual({ ok: false, error: { kind: 'insecure', message: expect.any(String) } });
    expect(s.calls).toHaveLength(0);
  });

  it('refuses an address that is not an address', async () => {
    const r = await run(serve(() => new Response('')).fetch, { url: 'nonsense' });
    expect(r.ok).toBe(false);
  });

  it('HTTP error status', async () => {
    const r = await run(serve(() => new Response('no', { status: 503 })).fetch);
    expect(r).toMatchObject({ ok: false, error: { kind: 'http' } });
    if (!r.ok) expect(r.error.message).toContain('503');
  });

  it('timeout: the signal aborts a fetch that never answers', async () => {
    const hang: FeedFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const r = await run(hang, { timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('a sub-second timeout is worded in milliseconds, not 0 seconds', async () => {
    const hang: FeedFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const r = await run(hang, { timeoutMs: 20 });
    const message = r.ok ? '' : r.error.message;
    expect(message).toContain('20 ms');
    expect(message).not.toContain('0 seconds');
    expect(formatDuration(20000)).toBe('20 seconds');
    expect(formatDuration(1500)).toBe('1.5 seconds');
    expect(formatDuration(1000)).toBe('1 second');
  });

  it('a body that never ends is cut at the timeout', async () => {
    const endless = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) });
    const r = await run(() => Promise.resolve(new Response(endless)), { timeoutMs: 30 });
    expect(r).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('network failure', async () => {
    const r = await run(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(r).toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('oversize body is cut off while reading, not after', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
        if (pulled > 50) controller.close();
      },
    });
    const r = await run(() => Promise.resolve(new Response(body)));
    expect(r).toMatchObject({ ok: false, error: { kind: 'oversize' } });
    expect(pulled).toBeLessThan(20); // stopped near the 10 MB cap, not at the end of the stream
    expect(pulled * chunk.byteLength).toBeGreaterThan(FEED_MAX_BYTES);
  });

  it('oversize declared by Content-Length is refused before reading', async () => {
    const r = await run(() => Promise.resolve(new Response('{}', { headers: { 'content-length': String(FEED_MAX_BYTES + 1) } })));
    expect(r).toMatchObject({ ok: false, error: { kind: 'oversize' } });
  });

  it('bad JSON', async () => {
    const r = await run(serve(() => new Response('<html>oops</html>')).fetch);
    expect(r).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('a feed that fails validation (forbidden key)', async () => {
    const r = await run(serve(() => new Response('{"pilots":[],"__proto__":{}}')).fetch);
    expect(r).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('bytes that are not UTF-8', async () => {
    const r = await run(serve(() => new Response(new Uint8Array([0xff, 0xfe, 0x7b]))).fetch);
    expect(r.ok).toBe(false);
  });

  it('never throws and carries no feed content in the error', async () => {
    const r = await run(serve(() => new Response(fixture.replace('"general"', '"constructor"'))).fetch);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('CANARY');
  });
});

describe('isStale (UP-3, UP-5)', () => {
  const pack = loadPackFrom(YSSY_PACK);
  const limit = pack.settings.vatsimStaleMinutes * 60_000;

  it('fresh just inside the limit, and exactly at it', () => {
    expect(isStale(NOW + limit - 1, NOW, pack)).toBe(false);
    expect(isStale(NOW + limit, NOW, pack)).toBe(false);
  });

  it('stale one millisecond past the limit', () => {
    expect(isStale(NOW + limit + 1, NOW, pack)).toBe(true);
  });

  it('reads the limit from the pack', () => {
    const tighter = { ...pack, settings: { ...pack.settings, vatsimStaleMinutes: 1 } };
    expect(isStale(NOW + 61_000, NOW, tighter)).toBe(true);
    expect(isStale(NOW + 61_000, NOW, pack)).toBe(false);
  });

  it('a fetch time in the future (clock skew) is not stale', () => {
    expect(isStale(NOW, NOW + 5 * 60_000, pack)).toBe(false);
  });
});

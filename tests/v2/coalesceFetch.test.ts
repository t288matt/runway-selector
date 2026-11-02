import { describe, expect, it, vi } from 'vitest';
import { coalesceFetch } from '../../src/v2/coalesceFetch';

const URL_A = 'https://example.test/feed.json';

function setup() {
  let t = 1_000;
  const inner = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"ok":true}', { status: 200 }));
  const wrapped = coalesceFetch(inner, () => t, 5_000);
  return { inner, wrapped, advance: (ms: number) => { t += ms; } };
}

describe('coalesceFetch', () => {
  it('ten simultaneous calls to one URL call the inner fetch once', async () => {
    const { inner, wrapped } = setup();
    await Promise.all(Array.from({ length: 10 }, () => wrapped(URL_A, { cache: 'no-store' })));
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('a call within ttlMs reuses the response and a call after ttlMs calls again', async () => {
    const { inner, wrapped, advance } = setup();
    await wrapped(URL_A);
    advance(4_999);
    await wrapped(URL_A);
    expect(inner).toHaveBeenCalledTimes(1);
    advance(1);
    await wrapped(URL_A);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('different URLs are not shared', async () => {
    const { inner, wrapped } = setup();
    await Promise.all([wrapped(URL_A), wrapped('https://example.test/other.json')]);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('non-GET calls pass straight through', async () => {
    const { inner, wrapped } = setup();
    await wrapped(URL_A, { method: 'POST' });
    await wrapped(URL_A, { method: 'POST' });
    await wrapped(URL_A, { method: 'GET' });
    await wrapped(URL_A);
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it('a rejected fetch is not cached', async () => {
    let t = 0;
    const inner = vi
      .fn<(u: string, i?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(new Response('ok'));
    const wrapped = coalesceFetch(inner, () => t, 5_000);
    await expect(wrapped(URL_A)).rejects.toThrow('network down');
    t += 1;
    const res = await wrapped(URL_A);
    expect(await res.text()).toBe('ok');
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('a non-ok response is not cached', async () => {
    const inner = vi
      .fn<(u: string, i?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('bad', { status: 503 }))
      .mockResolvedValue(new Response('good'));
    const wrapped = coalesceFetch(inner, () => 0, 5_000);
    expect((await wrapped(URL_A)).status).toBe(503);
    expect(await (await wrapped(URL_A)).text()).toBe('good');
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('each caller can read the body', async () => {
    const { wrapped } = setup();
    const results = await Promise.all(Array.from({ length: 3 }, () => wrapped(URL_A)));
    const texts = await Promise.all(results.map((r) => r.text()));
    expect(texts).toEqual(['{"ok":true}', '{"ok":true}', '{"ok":true}']);
    // and a later caller within the ttl can still read it
    expect(await (await wrapped(URL_A)).text()).toBe('{"ok":true}');
  });

  it('callers waiting on a shared rejection all see it', async () => {
    const inner = vi.fn(async () => { throw new Error('boom'); });
    const wrapped = coalesceFetch(inner, () => 0, 5_000);
    const settled = await Promise.allSettled([wrapped(URL_A), wrapped(URL_A)]);
    expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected']);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

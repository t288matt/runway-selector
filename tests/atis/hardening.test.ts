// Review fixes on the ATIS endpoint (issue 159): the cache runs from the start of the NAIPS call so two consecutive page
// polls both see fresh data, and a foreign page or an unknown airport cannot spend the NAIPS budget. Fake clock and fetch only.
import { request, createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ATIS_POLL_MARGIN_MS } from '../../src/atis/config';
import { ATIS_MIN_INTERVAL_MS, airportsWithPacks, createAtisMiddleware, createAtisService, isForeignRequest } from '../../scripts/atisMiddleware';

const MIN = 60_000;
const soap = (text: string): string => `<r status="SUCCESS"><content>${text}</content></r>`;
const block = 'ATIS ZZZA B 291200\n  RWY: 27 FOR ARR. RWY 27 FOR DEP.';

describe('two consecutive page polls both get fresh data (cache runs from the start of the call)', () => {
  const LATENCY = 5_000;
  function rig() {
    const clock = { now: 1_000_000 };
    const started: number[] = [];
    const service = createAtisService({
      getCredentials: () => ({ username: 'u', password: 'p' }),
      // NAIPS takes 5 seconds to answer.
      fetch: async () => {
        started.push(clock.now);
        clock.now += LATENCY;
        return new Response(soap(block));
      },
      now: () => clock.now,
      isKnownAirport: () => true,
    });
    return { clock, started, service };
  }
  it('the server serves a new call exactly 30 minutes after the previous one STARTED, even though it ended 5 s later', async () => {
    const r = rig();
    const t0 = r.clock.now;
    await r.service('GET', 'ZZZA');
    r.clock.now = t0 + ATIS_MIN_INTERVAL_MS;
    const second = await r.service('GET', 'ZZZA');
    expect(r.started).toEqual([t0, t0 + ATIS_MIN_INTERVAL_MS]);
    expect(second.status).toBe(200);
  });
  it('a page that polls every atisPollMinutes (plus its margin) from its own request start sees a newer reading each time, and NAIPS is never called twice inside 30 minutes', async () => {
    const r = rig();
    const pageInterval = 30 * MIN + ATIS_POLL_MARGIN_MS;
    const readings: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const out = await r.service('GET', 'ZZZA');
      if (out.status === 200) readings.push(out.body.fetchedAt);
      r.clock.now = r.started[0]! + (i + 1) * pageInterval;
    }
    expect(r.started).toHaveLength(4);
    expect(new Set(readings).size).toBe(4);
    for (let i = 1; i < r.started.length; i += 1) expect(r.started[i]! - r.started[i - 1]!).toBeGreaterThanOrEqual(ATIS_MIN_INTERVAL_MS);
  });
  it('the margin is positive and small', () => {
    expect(ATIS_POLL_MARGIN_MS).toBeGreaterThan(5_000);
    expect(ATIS_POLL_MARGIN_MS).toBeLessThanOrEqual(5 * MIN);
  });
});

describe('only airports with a pack are asked for', () => {
  const packs = airportsWithPacks(join(import.meta.dirname, '..', '..', 'refdata', 'airports'));
  it('is built from the pack folders and holds each pack airport', () => {
    expect(packs.size).toBeGreaterThanOrEqual(2);
    for (const icao of packs) expect(icao).toMatch(/^[A-Z]{4}$/);
  });
  it('an unknown code is refused with no NAIPS call; a pack airport works', async () => {
    const calls: string[] = [];
    const [known] = [...packs];
    const service = createAtisService({
      getCredentials: () => ({ username: 'u', password: 'p' }),
      fetch: async (url) => {
        calls.push(url);
        return new Response(soap(`ATIS ${known} B 291200\n  RWY: 27 FOR ARR. RWY 27 FOR DEP.`));
      },
      now: () => 1,
      isKnownAirport: (i) => packs.has(i),
    });
    expect((await service('GET', 'QQQQ')).status).toBe(404);
    expect(calls).toHaveLength(0);
    expect((await service('GET', known!)).status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});

describe('a request from another site is refused', () => {
  it('isForeignRequest: cross-site, or an Origin that is not our own host', () => {
    expect(isForeignRequest({ host: 'localhost:5173' })).toBe(false);
    expect(isForeignRequest({ host: 'localhost:5173', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' })).toBe(false);
    expect(isForeignRequest({ host: 'localhost:5173', 'sec-fetch-site': 'cross-site' })).toBe(true);
    expect(isForeignRequest({ host: 'localhost:5173', origin: 'https://evil.example' })).toBe(true);
    expect(isForeignRequest({ host: 'localhost:5173', origin: 'http://localhost:9999' })).toBe(true);
    expect(isForeignRequest({ host: 'localhost:5173', origin: 'null' })).toBe(true);
  });
  let server: Server | undefined;
  afterEach(() => new Promise<void>((done) => (server === undefined ? done() : server.close(() => done()))));
  const get = (port: number, path: string, headers: Record<string, string>): Promise<number> =>
    new Promise((ok, bad) => {
      const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
        res.resume();
        res.on('end', () => ok(res.statusCode ?? 0));
      });
      req.on('error', bad);
      req.end();
    });
  it('403 with no NAIPS call for a foreign Origin or cross-site; the same page works', async () => {
    let calls = 0;
    const handler = createAtisMiddleware({
      getCredentials: () => ({ username: 'u', password: 'p' }),
      fetch: async () => {
        calls += 1;
        return new Response(soap(block));
      },
      now: () => 1,
      isKnownAirport: (i) => i === 'ZZZA',
    });
    server = createServer((req, res) => handler(req, res));
    await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
    const port = (server.address() as AddressInfo).port;
    expect(await get(port, '/ZZZA', { Origin: 'https://evil.example' })).toBe(403);
    expect(await get(port, '/ZZZA', { 'Sec-Fetch-Site': 'cross-site' })).toBe(403);
    expect(calls).toBe(0);
    expect(await get(port, '/ZZZA', { Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': 'same-origin' })).toBe(200);
    expect(calls).toBe(1);
  });
});

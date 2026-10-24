// fetchMetarText and fetchTafText, driven by a fake fetch: the addresses asked,
// the Datamask "TAF TAF" prefix, the fallback to the second TAF service, and
// every failure returning an error object (the caller keeps its previous report).
import { describe, expect, it } from 'vitest';
import { METAR_URL_BASE, TAF_FALLBACK_URL_BASE, TAF_PRIMARY_URL_BASE, WEATHER_MAX_BYTES } from '../../src/weather/config';
import { fetchMetarText, fetchTafText, stripDuplicateTafPrefix, type WeatherFetchFn } from '../../src/weather/fetchWeather';

const TAF_TEXT = 'TAF YSSY 240516Z 2406/2512 04020KT CAVOK FM240900 01010KT CAVOK';
const METAR_TEXT = 'YSSY 240730Z AUTO 03015KT 9999 // NCD 24/16 Q1012';

const datamask = (raw: string): string => JSON.stringify({ icao: 'YSSY', issuedAt: '2026/10/24 06:51', raw, source: 'noaa-tgftp', attribution: 'NOAA NWS · Datamask Aviation' });
const metarsEu = (rawText: string): string => JSON.stringify([{ station: 'YSSY', rawText, groups: [] }]);

interface Served {
  readonly fetch: WeatherFetchFn;
  readonly calls: { url: string; init?: RequestInit }[];
}

/** answers by address prefix; a function result is thrown if it is an Error. */
function serve(answers: Record<string, () => Response | Error>): Served {
  const calls: { url: string; init?: RequestInit }[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      const key = Object.keys(answers).find((k) => url.startsWith(k));
      const answer = key === undefined ? new Response('unexpected', { status: 404 }) : (answers[key] as () => Response | Error)();
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
}

describe('redirects are refused (issue 18)', () => {
  it('asks with redirect: error and refuses an answer that came from a redirect', async () => {
    const s = serve({ [METAR_URL_BASE]: () => Object.defineProperty(new Response(metarsEu(METAR_TEXT)), 'redirected', { value: true }) });
    const r = await fetchMetarText('YSSY', { fetch: s.fetch });
    expect(s.calls[0]?.init?.redirect).toBe('error');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('redirect');
  });
});

describe('stripDuplicateTafPrefix', () => {
  it.each([
    ['TAF TAF YSSY 240516Z 2406/2512 04020KT CAVOK', 'TAF YSSY 240516Z 2406/2512 04020KT CAVOK'],
    ['  TAF   TAF YSSY 240516Z', 'TAF YSSY 240516Z'],
    ['TAF YSSY 240516Z', 'TAF YSSY 240516Z'],
    ['TAF AMD YSSY 240516Z', 'TAF AMD YSSY 240516Z'],
    ['TAF TAFFY', 'TAF TAFFY'],
  ])('%j -> %j', (input, expected) => {
    expect(stripDuplicateTafPrefix(input)).toBe(expected);
  });
});

describe('fetchMetarText', () => {
  it('asks the one METAR address for the station, with no cookies and no custom headers (no CORS preflight)', async () => {
    const s = serve({ [METAR_URL_BASE]: () => new Response(`${METAR_TEXT}\n`) });
    const r = await fetchMetarText('YSSY', { fetch: s.fetch });
    expect(r).toEqual({ ok: true, text: METAR_TEXT });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.url).toBe(`${METAR_URL_BASE}YSSY`);
    expect(METAR_URL_BASE.startsWith('https://')).toBe(true);
    expect(s.calls[0]?.init?.credentials).toBe('omit');
    expect(s.calls[0]?.init?.headers).toBeUndefined();
  });

  it('encodes the station into the address', async () => {
    const s = serve({ [METAR_URL_BASE]: () => new Response(METAR_TEXT) });
    await fetchMetarText('A/../B', { fetch: s.fetch });
    expect(s.calls[0]?.url).toBe(`${METAR_URL_BASE}A%2F..%2FB`);
  });

  it.each([
    ['an HTTP error', () => new Response('down', { status: 503 }), 'http', 'HTTP 503'],
    ['a network failure', () => new Error('network down'), 'network', 'network down'],
    ['an empty body (unknown station)', () => new Response(''), 'empty', 'No METAR was returned for YSSY'],
    ['a blank body', () => new Response('  \n '), 'empty', 'No METAR was returned for YSSY'],
    ['a body over the size cap', () => new Response('X'.repeat(WEATHER_MAX_BYTES + 1)), 'oversize', 'byte limit'],
  ] as const)('%s returns an error and no text', async (_name, answer, kind, words) => {
    const s = serve({ [METAR_URL_BASE]: answer });
    const r = await fetchMetarText('YSSY', { fetch: s.fetch });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe(kind);
    expect(r.message).toContain(words);
  });

  it('gives up after the timeout', async () => {
    const hang: WeatherFetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const r = await fetchMetarText('YSSY', { fetch: hang, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, kind: 'timeout' });
  });
});

describe('fetchTafText', () => {
  it('uses Datamask first and strips its duplicated "TAF TAF" prefix', async () => {
    const s = serve({ [TAF_PRIMARY_URL_BASE]: () => new Response(datamask(`TAF ${TAF_TEXT}`)) });
    const r = await fetchTafText('YSSY', { fetch: s.fetch });
    expect(r).toEqual({ ok: true, text: TAF_TEXT });
    expect(s.calls.map((c) => c.url)).toEqual([`${TAF_PRIMARY_URL_BASE}YSSY`]);
  });

  it('collapses the line breaks and indentation in the text', async () => {
    const s = serve({ [TAF_PRIMARY_URL_BASE]: () => new Response(datamask('TAF YSSY 240516Z 2406/2512 04020KT\n  FM240900 01010KT CAVOK')) });
    const r = await fetchTafText('YSSY', { fetch: s.fetch });
    expect(r).toEqual({ ok: true, text: 'TAF YSSY 240516Z 2406/2512 04020KT FM240900 01010KT CAVOK' });
  });

  it.each([
    ['an HTTP error', () => new Response('down', { status: 502 })],
    ['a network failure', () => new Error('refused')],
    ['an answer that is not JSON', () => new Response('<html>nope</html>')],
    ['JSON of the wrong shape', () => new Response('{"raw":42}')],
    ['an empty report', () => new Response(datamask(''))],
    ['a body over the size cap', () => new Response('X'.repeat(WEATHER_MAX_BYTES + 1))],
  ] as const)('falls back to metars.eu after %s from Datamask', async (_name, primary) => {
    const s = serve({ [TAF_PRIMARY_URL_BASE]: primary, [TAF_FALLBACK_URL_BASE]: () => new Response(metarsEu(TAF_TEXT)) });
    const r = await fetchTafText('YSSY', { fetch: s.fetch });
    expect(r).toEqual({ ok: true, text: TAF_TEXT });
    expect(s.calls.map((c) => c.url)).toEqual([`${TAF_PRIMARY_URL_BASE}YSSY`, `${TAF_FALLBACK_URL_BASE}YSSY`]);
  });

  it.each([
    ['an HTTP error', () => new Response('down', { status: 500 })],
    ['a network failure', () => new Error('refused')],
    ['an empty array (no TAF for the station)', () => new Response('[]')],
    ['an array entry of the wrong shape', () => new Response('[{"rawText":7}]')],
    ['a body that is not JSON', () => new Response('nope')],
  ] as const)('returns one error naming both services when metars.eu also gives %s', async (_name, fallback) => {
    const s = serve({ [TAF_PRIMARY_URL_BASE]: () => new Response('down', { status: 503 }), [TAF_FALLBACK_URL_BASE]: fallback });
    const r = await fetchTafText('YSSY', { fetch: s.fetch });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('The TAF could not be fetched');
    expect(r.message).toContain('datamask.org');
    expect(r.message).toContain('metars.eu');
  });

  it('asks both addresses over HTTPS with no cookies and no custom headers', async () => {
    const s = serve({});
    await fetchTafText('YSSY', { fetch: s.fetch });
    expect(s.calls).toHaveLength(2);
    for (const c of s.calls) {
      expect(c.url.startsWith('https://')).toBe(true);
      expect(c.init?.credentials).toBe('omit');
      expect(c.init?.headers).toBeUndefined();
    }
  });
});

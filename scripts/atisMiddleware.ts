// Server-side fetch of the real-world ATIS from NAIPS (issue 159). Runs only inside the
// Vite dev server (vite.config.ts mounts it at /api/atis); it is never bundled into the page.
//
// Why on the server: the NAIPS account password must never reach the browser, and
// Airservices sends no CORS header. The credentials are read from the environment at
// request time (NAIPS_USERNAME, NAIPS_PASSWORD; never VITE_ prefixed). They go only
// into the request to NAIPS. They are never put in a response, a log or an error.
//
// 30-MINUTE FLOOR (owner requirement): every ICAO's result, failures included, is kept
// in memory for ATIS_MIN_INTERVAL_MS and served from there. NAIPS is never called for
// the same ICAO more often than that, whatever the client asks.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLimited } from '../src/net/readLimited.ts';

/** The floor between two NAIPS calls for the same airport. Change it only on the owner's say-so (tests pin it at 30 minutes). */
export const ATIS_MIN_INTERVAL_MINUTES = 30;
export const ATIS_MIN_INTERVAL_MS = ATIS_MIN_INTERVAL_MINUTES * 60_000;

export const NAIPS_URL = 'https://www.airservicesaustralia.com/naips/briefing-service?wsdl';
/** Largest NAIPS answer read, in decoded bytes. */
export const NAIPS_MAX_BYTES = 512 * 1024;
export const NAIPS_TIMEOUT_MS = 20_000;
/** Most airports held at once, so a stream of made-up codes cannot grow the cache without limit. */
const MAX_CACHED = 64;

export type NaipsFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export interface AtisMiddlewareOptions {
  /** Read at each request; undefined fields (or a missing object) mean the feature is not set up. */
  readonly getCredentials: () => { username?: string | undefined; password?: string | undefined };
  readonly fetch: NaipsFetch;
  readonly now: () => number;
  /** True for an airport the server was started with a pack for (built from refdata/airports/*\/airport.json). */
  readonly isKnownAirport: (icao: string) => boolean;
}

/** The `icao` of every `<dir>/*\/airport.json`: the airports the server will ask NAIPS about. Unreadable entries are skipped. */
export function airportsWithPacks(dir: string): ReadonlySet<string> {
  const found = new Set<string>();
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    try {
      const icao = (JSON.parse(readFileSync(join(dir, name, 'airport.json'), 'utf8')) as { icao?: unknown }).icao;
      if (typeof icao === 'string' && ICAO.test(icao)) found.add(icao);
    } catch {
      // not a pack folder
    }
  }
  return found;
}

/**
 * A request from another site is refused: Sec-Fetch-Site says cross-site, or an Origin is present and is not this server's own
 * (its Host). A page on the same origin sends neither a foreign Origin nor cross-site. Returns true when it must be refused.
 */
export function isForeignRequest(headers: IncomingMessage['headers']): boolean {
  if (headers['sec-fetch-site'] === 'cross-site') return true;
  const origin = headers['origin'];
  if (origin === undefined) return false;
  try {
    return new URL(origin).host !== headers['host'];
  } catch {
    return true;
  }
}

export type AtisOutcome =
  | { readonly status: 200; readonly body: { readonly atis: string; readonly fetchedAt: number } }
  | { readonly status: 400 | 403 | 404 | 405 | 503; readonly body: { readonly error: string } };

const ICAO = /^[A-Z]{4}$/;

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const unescapeXml = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** The SOAP request. The username is upper-cased (NAIPS rejects lower case); both values are XML-escaped. */
export function buildEnvelope(icao: string, creds: Credentials): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<SOAP-ENV:Envelope xmlns:ns0="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.airservicesaustralia.com/naips/xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<SOAP-ENV:Header/><ns0:Body>' +
    `<ns1:loc-brief-rqs password="${escapeXml(creds.password)}" requestor="${escapeXml(creds.username.toUpperCase())}" source="atis">` +
    `<ns1:loc>${icao}</ns1:loc><ns1:flags met="true"/></ns1:loc-brief-rqs></ns0:Body></SOAP-ENV:Envelope>`
  );
}

/** The status NAIPS reports, from a `status` attribute or element; null when none is found. */
function naipsStatus(xml: string): string | null {
  const attr = /\sstatus\s*=\s*"([^"]*)"/i.exec(xml);
  if (attr !== null) return (attr[1] ?? '').trim();
  const el = /<(?:[\w-]+:)?status>([^<]*)</i.exec(xml);
  return el === null ? null : (el[1] ?? '').trim();
}

/** The text of the first `<content>` element, with CDATA and entities resolved. */
export function contentOf(xml: string): string | null {
  const m = /<(?:[\w-]+:)?content(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?content>/i.exec(xml);
  if (m === null) return null;
  const inner = m[1] ?? '';
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(inner);
  return cdata !== null ? (cdata[1] ?? '') : unescapeXml(inner);
}

/**
 * The ATIS block: the line starting `ATIS <ICAO> <letter> <ddhhmm>` and the indented
 * lines that follow it, up to the next blank line or the next line that is not indented.
 */
export function extractAtisBlock(content: string, icao: string): string | null {
  const lines = content.split(/\r?\n/);
  const header = new RegExp(`^\\s*ATIS\\s+${icao}\\s+[A-Z]\\s+\\d{6}\\b`);
  const at = lines.findIndex((l) => header.test(l));
  if (at < 0) return null;
  const block = [(lines[at] ?? '').trim()];
  for (const l of lines.slice(at + 1)) {
    if (l.trim() === '' || !/^\s/.test(l)) break;
    block.push(l.trim());
  }
  return block.join('\n');
}

type Cached = { readonly at: number; readonly outcome: AtisOutcome };

const UNAVAILABLE: AtisOutcome = { status: 503, body: { error: 'The real-world ATIS is not available.' } };
const NOT_SET_UP: AtisOutcome = { status: 503, body: { error: 'The real-world ATIS is not set up on this server.' } };

export function createAtisService(options: AtisMiddlewareOptions): (method: string, icao: string) => Promise<AtisOutcome> {
  const cache = new Map<string, Cached>();
  const inFlight = new Map<string, Promise<AtisOutcome>>();

  const callNaips = async (icao: string, creds: Credentials): Promise<AtisOutcome> => {
    const signal = AbortSignal.timeout(NAIPS_TIMEOUT_MS);
    try {
      const res = await options.fetch(NAIPS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
        body: buildEnvelope(icao, creds),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal,
      });
      if (!res.ok) return UNAVAILABLE;
      const xml = await readLimited(res, NAIPS_MAX_BYTES, signal);
      const status = naipsStatus(xml);
      if (status !== null && status.toUpperCase() !== 'SUCCESS') return UNAVAILABLE;
      const content = contentOf(xml);
      const atis = content === null ? null : extractAtisBlock(content, icao);
      if (atis === null) return UNAVAILABLE;
      return { status: 200, body: { atis, fetchedAt: options.now() } };
    } catch {
      // Nothing about the failure is passed on: an error text could echo the request.
      return UNAVAILABLE;
    }
  };

  return async (method, icao) => {
    if (method !== 'GET') return { status: 405, body: { error: 'Method not allowed.' } };
    if (!ICAO.test(icao)) return { status: 400, body: { error: 'Expected a four-letter airport code.' } };
    // Only airports that have a pack are asked for, so a stray page cannot spend the NAIPS budget on made-up codes.
    if (!options.isKnownAirport(icao)) return { status: 404, body: { error: 'Unknown airport.' } };
    const now = options.now();
    const hit = cache.get(icao);
    if (hit !== undefined && now - hit.at < ATIS_MIN_INTERVAL_MS) return hit.outcome;
    const pending = inFlight.get(icao);
    if (pending !== undefined) return pending;
    const { username, password } = options.getCredentials();
    if (username === undefined || username === '' || password === undefined || password === '') return NOT_SET_UP;
    if (cache.size >= MAX_CACHED && !cache.has(icao)) {
      for (const [k, v] of cache) if (now - v.at >= ATIS_MIN_INTERVAL_MS) cache.delete(k);
      if (cache.size >= MAX_CACHED) return UNAVAILABLE;
    }
    // The floor runs from the START of the call (not its end), so a page that polls every 30 minutes from its own request start
    // is never served the same cache twice. A client that asks again at once gets the same single call.
    const p = callNaips(icao, { username, password }).then((outcome) => {
      cache.set(icao, { at: now, outcome });
      return outcome;
    });
    inFlight.set(icao, p);
    try {
      return await p;
    } finally {
      inFlight.delete(icao);
    }
  };
}

/** The connect-style handler mounted at /api/atis: the rest of the URL is the ICAO. */
export function createAtisMiddleware(options: AtisMiddlewareOptions): (req: IncomingMessage, res: ServerResponse) => void {
  const service = createAtisService(options);
  return (req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const icao = path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (isForeignRequest(req.headers)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not allowed.' }));
      return;
    }
    void service(req.method ?? 'GET', icao)
      .catch((): AtisOutcome => UNAVAILABLE)
      .then((outcome) => {
        res.statusCode = outcome.status;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(outcome.body));
      });
  };
}

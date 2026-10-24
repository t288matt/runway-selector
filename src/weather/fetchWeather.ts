// Fetches the latest METAR and TAF text for a station through the fetch function
// it is given (so tests pass a fake). No timers: the page polls. On any failure
// it returns an error object and the caller keeps its previous report. The text
// returned here is only raw text: it still goes through the same decode and
// station checks as pasted text (applyMetarText, applyTafText).
import { Oversize, readLimited } from '../net/readLimited';
import { METAR_URL_BASE, TAF_FALLBACK_URL_BASE, TAF_PRIMARY_URL_BASE, WEATHER_MAX_BYTES, WEATHER_TIMEOUT_MS } from './config';

export type WeatherFetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchWeatherOptions {
  readonly fetch: WeatherFetchFn;
  readonly timeoutMs?: number;
}

export type WeatherErrorKind = 'timeout' | 'network' | 'http' | 'oversize' | 'invalid' | 'empty';

export interface WeatherFetchFailure {
  readonly ok: false;
  readonly kind: WeatherErrorKind;
  readonly message: string;
}

export type WeatherFetchResult = { readonly ok: true; readonly text: string } | WeatherFetchFailure;

const fail = (kind: WeatherErrorKind, message: string): WeatherFetchFailure => ({ ok: false, kind, message });

async function getBody(url: string, options: FetchWeatherOptions): Promise<{ ok: true; body: string } | WeatherFetchFailure> {
  const timeoutMs = options.timeoutMs ?? WEATHER_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const res = await options.fetch(url, { cache: 'no-store', credentials: 'omit', signal });
    if (!res.ok) return fail('http', `HTTP ${res.status}`);
    return { ok: true, body: await readLimited(res, WEATHER_MAX_BYTES, signal) };
  } catch (e) {
    if (e instanceof Oversize) return fail('oversize', `larger than the ${WEATHER_MAX_BYTES} byte limit`);
    if (signal.aborted || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'))) {
      return fail('timeout', `no answer within ${Math.round(timeoutMs / 1000)} seconds`);
    }
    return fail('network', e instanceof Error ? e.message : 'unknown error');
  }
}

/** Datamask passes a duplicated "TAF TAF" prefix through from its own upstream: one is removed. */
export function stripDuplicateTafPrefix(raw: string): string {
  return raw.trim().replace(/^TAF\s+TAF\b/, 'TAF');
}

const clean = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Datamask: an object with the report in `raw`. */
function tafFromPrimary(body: string): WeatherFetchResult {
  const json = parseJson(body);
  if (!isRecord(json) || typeof json['raw'] !== 'string') return fail('invalid', 'the answer was not in the expected form');
  const text = clean(stripDuplicateTafPrefix(json['raw']));
  return text === '' ? fail('empty', 'no TAF was returned') : { ok: true, text };
}

/** metars.eu: an array whose first entry has the report in `rawText`. */
function tafFromFallback(body: string): WeatherFetchResult {
  const json = parseJson(body);
  const first: unknown = Array.isArray(json) ? json[0] : undefined;
  if (!Array.isArray(json) || (json.length > 0 && (!isRecord(first) || typeof first['rawText'] !== 'string'))) {
    return fail('invalid', 'the answer was not in the expected form');
  }
  if (!isRecord(first)) return fail('empty', 'no TAF was returned');
  const text = clean(String(first['rawText']));
  return text === '' ? fail('empty', 'no TAF was returned') : { ok: true, text };
}

const addressOf = (base: string, station: string): string => `${base}${encodeURIComponent(station)}`;

export async function fetchMetarText(station: string, options: FetchWeatherOptions): Promise<WeatherFetchResult> {
  const got = await getBody(addressOf(METAR_URL_BASE, station), options);
  if (!got.ok) return fail(got.kind, `The METAR could not be fetched: ${got.message}`);
  // The service answers one line per station; an unknown station gives an empty body.
  const text = clean(got.body);
  return text === '' ? fail('empty', `No METAR was returned for ${station}`) : { ok: true, text };
}

export async function fetchTafText(station: string, options: FetchWeatherOptions): Promise<WeatherFetchResult> {
  const reasons: string[] = [];
  const attempts: readonly (readonly [string, string, (body: string) => WeatherFetchResult])[] = [
    ['datamask.org', TAF_PRIMARY_URL_BASE, tafFromPrimary],
    ['metars.eu', TAF_FALLBACK_URL_BASE, tafFromFallback],
  ];
  let last: WeatherErrorKind = 'network';
  for (const [name, base, read] of attempts) {
    const got = await getBody(addressOf(base, station), options);
    const result = got.ok ? read(got.body) : got;
    if (result.ok) return result;
    last = result.kind;
    reasons.push(`${name}: ${result.message}`);
  }
  return fail(last, `The TAF could not be fetched (${reasons.join('; ')})`);
}

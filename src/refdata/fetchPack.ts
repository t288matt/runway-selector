// The only file in src/refdata that talks to the network, and only through the
// `fetch` function it is given (so tests pass a fake). It reads app.json, then
// the five files of one pack, each with a cache-bust query, refusing any body
// over its size cap BEFORE parsing. An invalid pack is refused with a precise
// message; reloadPack keeps the previous valid pack in that case.
import type { PackIssue } from './issues';
import { PackValidationError, formatIssue } from './issues';
import { PACK_FILE_NAMES, parseAppConfig, parsePack, type PackFileName } from './parsePack';
import { AIRPORT_ID, BOUNDS, type AppFile } from './schema';
import type { AirportPack } from './types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface LoadOptions {
  /** Where refdata is served from, relative or absolute. No trailing slash needed. */
  readonly baseUrl?: string;
  /** A version or content hash (or a reload counter) added to every address so a browser cache cannot serve an old copy. */
  readonly cacheBust: string;
  /** Which pack to load; defaults to the default in app.json. */
  readonly airportId?: string;
}

export type LoadResult =
  | { readonly ok: true; readonly pack: AirportPack; readonly app: AppFile }
  | { readonly ok: false; readonly issues: readonly PackIssue[]; readonly message: string };

export type ReloadResult =
  | { readonly ok: true; readonly pack: AirportPack; readonly app: AppFile }
  | { readonly ok: false; readonly pack: AirportPack; readonly issues: readonly PackIssue[]; readonly message: string };

const DEFAULT_BASE = './refdata';
const BUST_SHAPE = /^[A-Za-z0-9._-]{1,64}$/;

const failure = (issues: readonly PackIssue[]): LoadResult => ({
  ok: false,
  issues,
  message: new PackValidationError(issues).message,
});

/** Read a response body as text, refusing it as soon as it passes the cap. */
async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`File is larger than the ${maxBytes} byte limit`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`File is larger than the ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }
  } else {
    const all = new Uint8Array(await res.arrayBuffer());
    if (all.byteLength > maxBytes) throw new Error(`File is larger than the ${maxBytes} byte limit`);
    chunks.push(all);
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function fetchText(fetchFn: FetchLike, url: string, file: string, maxBytes: number): Promise<{ text: string } | { issue: PackIssue }> {
  try {
    const res = await fetchFn(url, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return { issue: { file, path: '', message: `Could not be fetched: HTTP ${res.status} from ${url}` } };
    return { text: await readLimited(res, maxBytes) };
  } catch (e) {
    return { issue: { file, path: '', message: `Could not be read: ${e instanceof Error ? e.message : 'unknown error'}` } };
  }
}

/** Load and validate one pack. Never throws; returns the precise reason on failure. */
export async function loadPack(fetchFn: FetchLike, options: LoadOptions): Promise<LoadResult> {
  if (BUST_SHAPE.exec(options.cacheBust) === null) {
    return failure([{ file: 'app.json', path: '', message: 'The cache-bust token must be 1 to 64 letters, digits, ".", "_" or "-"' }]);
  }
  if (options.airportId !== undefined && !AIRPORT_ID.exec(options.airportId)) {
    return failure([{ file: 'app.json', path: 'airports', message: `Airport id "${options.airportId}" must be 3 to 8 capital letters or digits` }]);
  }
  const base = (options.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
  const query = `?v=${options.cacheBust}`;

  const appResult = await fetchText(fetchFn, `${base}/app.json${query}`, 'app.json', BOUNDS.cap.appFileBytes);
  if ('issue' in appResult) return failure([appResult.issue]);
  let app: AppFile;
  try {
    app = parseAppConfig(appResult.text);
  } catch (e) {
    return failure(e instanceof PackValidationError ? e.issues : [{ file: 'app.json', path: '', message: 'Could not be checked' }]);
  }

  const airportId = options.airportId ?? app.default;
  if (!app.airports.includes(airportId)) {
    return failure([{ file: 'app.json', path: 'airports', message: `Airport "${airportId}" is not listed in app.json` }]);
  }

  const results = await Promise.all(
    PACK_FILE_NAMES.map((name) =>
      fetchText(fetchFn, `${base}/airports/${airportId}/${name}${query}`, name, BOUNDS.cap.packFileBytes).then((r) => [name, r] as const),
    ),
  );
  const issues: PackIssue[] = [];
  const raw: Partial<Record<PackFileName, string>> = {};
  for (const [name, r] of results) {
    if ('issue' in r) issues.push(r.issue);
    else raw[name] = r.text;
  }
  if (issues.length > 0) return failure(issues);

  try {
    const pack = parsePack(raw);
    if (pack.airport.icao !== airportId) {
      return failure([{ file: 'airport.json', path: 'icao', message: `The pack folder is "${airportId}" but airport.json says "${pack.airport.icao}"` }]);
    }
    return { ok: true, pack, app };
  } catch (e) {
    if (e instanceof PackValidationError) return failure(e.issues);
    throw e;
  }
}

/**
 * Reload the pack. If the new files are rejected, the previous valid pack is
 * returned unchanged (alongside the reasons) so the app keeps working.
 */
export async function reloadPack(fetchFn: FetchLike, options: LoadOptions, previous: AirportPack): Promise<ReloadResult> {
  const result = await loadPack(fetchFn, { ...options, airportId: options.airportId ?? previous.airport.icao });
  if (result.ok) return result;
  return { ok: false, pack: previous, issues: result.issues, message: result.message };
}

export { formatIssue };

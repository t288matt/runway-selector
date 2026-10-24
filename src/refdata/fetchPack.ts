// The only file in src/refdata that talks to the network, and only through the
// `fetch` function it is given (so tests pass a fake). It reads app.json, then
// the five files of one pack, each with a cache-bust query, refusing any body
// over its size cap BEFORE parsing. An invalid pack is refused with a precise
// message; reloadPack keeps the previous valid pack in that case.
import { Oversize, readLimited } from '../net/readLimited';
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
  /** How long each file may take before it is given up on; defaults to PACK_TIMEOUT_MS. Tests set it small. */
  readonly timeoutMs?: number;
}

export type LoadResult =
  | { readonly ok: true; readonly pack: AirportPack; readonly app: AppFile }
  | { readonly ok: false; readonly issues: readonly PackIssue[]; readonly message: string };

export type ReloadResult =
  | { readonly ok: true; readonly pack: AirportPack; readonly app: AppFile }
  | { readonly ok: false; readonly pack: AirportPack; readonly issues: readonly PackIssue[]; readonly message: string };

const DEFAULT_BASE = './refdata';
/** A pack file that has not arrived by now is given up on, so a slow or hung answer cannot leave the loading screen hanging (issue 18). */
export const PACK_TIMEOUT_MS = 20_000;
const BUST_SHAPE = /^[A-Za-z0-9._-]{1,64}$/;

const failure = (issues: readonly PackIssue[]): LoadResult => ({
  ok: false,
  issues,
  message: new PackValidationError(issues).message,
});

async function fetchText(fetchFn: FetchLike, url: string, file: string, maxBytes: number, timeoutMs: number): Promise<{ text: string } | { issue: PackIssue }> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    // A redirect is an error, not something to follow (issue 18): the pack is served from its own address or not at all.
    const res = await fetchFn(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal });
    if (res.redirected || (res.status >= 300 && res.status < 400)) return { issue: { file, path: '', message: `Could not be fetched: ${url} redirected, which is refused` } };
    if (!res.ok) return { issue: { file, path: '', message: `Could not be fetched: HTTP ${res.status} from ${url}` } };
    return { text: await readLimited(res, maxBytes, signal) };
  } catch (e) {
    if (e instanceof Oversize) return { issue: { file, path: '', message: `Could not be read: File is larger than the ${maxBytes} byte limit` } };
    if (signal.aborted || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'))) {
      return { issue: { file, path: '', message: `Could not be read: did not arrive within ${Math.max(1, Math.round(timeoutMs / 1000))} seconds` } };
    }
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

  const timeoutMs = options.timeoutMs ?? PACK_TIMEOUT_MS;
  const appResult = await fetchText(fetchFn, `${base}/app.json${query}`, 'app.json', BOUNDS.cap.appFileBytes, timeoutMs);
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
      fetchText(fetchFn, `${base}/airports/${airportId}/${name}${query}`, name, BOUNDS.cap.packFileBytes, timeoutMs).then((r) => [name, r] as const),
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

// Asks the local server for the real-world ATIS of one airport (issue 159) through the
// fetch function it is given (so tests pass a fake). No timers: the page polls. Any
// failure (no server route, a 503, a bad answer) returns { ok: false } and the caller
// keeps its last good result. The text is only used by the pure parser; it is never
// rendered as markup.
import { Oversize, readLimited } from '../net/readLimited';
import { ATIS_MAX_BYTES, ATIS_TIMEOUT_MS, ATIS_URL_BASE } from './config';

export type AtisFetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type AtisFetchResult = { readonly ok: true; readonly atis: string; readonly fetchedAtMs: number } | { readonly ok: false; readonly message: string };

const fail = (message: string): AtisFetchResult => ({ ok: false, message });

export async function fetchAtis(icao: string, options: { readonly fetch: AtisFetchFn; readonly timeoutMs?: number }): Promise<AtisFetchResult> {
  const signal = AbortSignal.timeout(options.timeoutMs ?? ATIS_TIMEOUT_MS);
  try {
    const res = await options.fetch(`${ATIS_URL_BASE}${encodeURIComponent(icao)}`, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal });
    if (!res.ok) return fail(`HTTP ${res.status}`);
    const body = await readLimited(res, ATIS_MAX_BYTES, signal);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return fail('the answer was not JSON');
    }
    if (typeof json !== 'object' || json === null) return fail('the answer was not in the expected form');
    const { atis, fetchedAt } = json as Record<string, unknown>;
    if (typeof atis !== 'string' || atis.trim() === '' || typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return fail('the answer was not in the expected form');
    return { ok: true, atis, fetchedAtMs: fetchedAt };
  } catch (e) {
    if (e instanceof Oversize) return fail('the answer was too large');
    return fail(e instanceof Error ? e.message : 'unknown error');
  }
}

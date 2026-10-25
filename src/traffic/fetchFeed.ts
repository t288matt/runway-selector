// Fetches the VATSIM feed through the fetch function it is given (so tests pass
// a fake) and the clock it is given. No timers: the page polls (UP-2). On any
// failure it returns an error object and the caller keeps its previous data.
import type { AirportPack } from '../refdata';
import { FEED_MAX_BYTES, FEED_TIMEOUT_MS, VATSIM_FEED_URL } from './config';
import { Oversize, readLimited } from '../net/readLimited';
import { parseFeed, type Aircraft, type Prefile } from './parseFeed';

export type FeedFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchFeedOptions {
  readonly fetch: FeedFetch;
  /** The clock, in UTC milliseconds. */
  readonly now: () => number;
  /** Overrides the feed address (for example a proxy). Must be https. */
  readonly url?: string;
  readonly timeoutMs?: number;
}

export type FeedErrorKind = 'insecure' | 'timeout' | 'network' | 'http' | 'oversize' | 'invalid';

export interface FeedError {
  readonly kind: FeedErrorKind;
  readonly message: string;
}

export type FetchFeedResult =
  | {
      readonly ok: true;
      readonly aircraft: readonly Aircraft[];
      readonly prefiles: readonly Prefile[];
      readonly fetchedAtMs: number;
      readonly feedTimestampMs: number | null;
      readonly skippedPilots: number;
    }
  | { readonly ok: false; readonly error: FeedError };

/** 250 -> "250 ms"; 20000 -> "20 seconds"; 1500 -> "1.5 seconds". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 100) / 10;
  return `${s} ${s === 1 ? 'second' : 'seconds'}`;
}

const fail = (kind: FeedErrorKind, message: string): FetchFeedResult => ({ ok: false, error: { kind, message } });

export async function fetchFeed(options: FetchFeedOptions): Promise<FetchFeedResult> {
  const url = options.url ?? VATSIM_FEED_URL;
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return fail('insecure', 'The traffic address is not a valid address');
  }
  if (protocol !== 'https:') return fail('insecure', 'The traffic address must use HTTPS');
  const timeoutMs = options.timeoutMs ?? FEED_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);
  let text: string;
  try {
    const res = await options.fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal });
    if (res.redirected) return fail('network', 'Traffic data came from a redirect, which is refused');
    if (!res.ok) return fail('http', `Traffic data could not be fetched: HTTP ${res.status}`);
    text = await readLimited(res, FEED_MAX_BYTES, signal);
  } catch (e) {
    if (e instanceof Oversize) return fail('oversize', `Traffic data is larger than the ${FEED_MAX_BYTES} byte limit`);
    if (signal.aborted || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'))) {
      return fail('timeout', `Traffic data did not arrive within ${formatDuration(timeoutMs)}`);
    }
    return fail('network', `Traffic data could not be read: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
  const fetchedAtMs = options.now();
  const parsed = parseFeed(text);
  if (!parsed.ok) return fail('invalid', parsed.message);
  return { ok: true, aircraft: parsed.feed.aircraft, prefiles: parsed.feed.prefiles, fetchedAtMs, feedTimestampMs: parsed.feed.feedTimestampMs, skippedPilots: parsed.feed.skippedPilots };
}

/** True when the data is older than the pack's limit (UP-3, UP-5). Exactly at the limit is not stale. */
export function isStale(nowMs: number, fetchedAtMs: number, pack: AirportPack): boolean {
  return nowMs - fetchedAtMs > pack.settings.vatsimStaleMinutes * 60_000;
}

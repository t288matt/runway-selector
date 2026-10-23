// Fetches the VATSIM feed through the fetch function it is given (so tests pass
// a fake) and the clock it is given. No timers: the page polls (UP-2). On any
// failure it returns an error object and the caller keeps its previous data.
import type { AirportPack } from '../refdata';
import { FEED_MAX_BYTES, FEED_TIMEOUT_MS, VATSIM_FEED_URL } from './config';
import { parseFeed, type Aircraft } from './parseFeed';

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
      readonly fetchedAtMs: number;
      readonly feedTimestampMs: number | null;
      readonly skippedPilots: number;
    }
  | { readonly ok: false; readonly error: FeedError };

class Oversize extends Error {}

async function readLimited(res: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  // Reading the body stops at the timeout even if the stream never ends.
  const aborted = new Promise<never>((_resolve, reject) => {
    const stop = (): void => reject(signal.reason ?? new Error('aborted'));
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
  });
  aborted.catch(() => undefined);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Oversize();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), aborted]);
      } catch (e) {
        await reader.cancel().catch(() => undefined);
        throw e;
      }
      const { done, value } = result;
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Oversize();
      }
      chunks.push(value);
    }
  } else {
    const all = new Uint8Array(await Promise.race([res.arrayBuffer(), aborted]));
    if (all.byteLength > maxBytes) throw new Oversize();
    total = all.byteLength;
    chunks.push(all);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

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
    const res = await options.fetch(url, { cache: 'no-store', credentials: 'omit', signal });
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
  return { ok: true, aircraft: parsed.feed.aircraft, fetchedAtMs, feedTimestampMs: parsed.feed.feedTimestampMs, skippedPilots: parsed.feed.skippedPilots };
}

/** True when the data is older than the pack's limit (UP-3, UP-5). Exactly at the limit is not stale. */
export function isStale(nowMs: number, fetchedAtMs: number, pack: AirportPack): boolean {
  return nowMs - fetchedAtMs > pack.settings.vatsimStaleMinutes * 60_000;
}

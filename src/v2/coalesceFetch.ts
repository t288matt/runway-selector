// One request shared by many callers. The summary screen runs one controller per
// airport and each polls the same VATSIM feed URL; this wrapper lets them share
// a single request. Only the injected clock is used (no timers, no wall clock).
//
// Rules:
// - Only GETs (init.method undefined or 'GET') are shared; anything else passes through.
// - A GET to a URL fetched, or still in flight, within ttlMs of when it started
//   gets a clone() of the same response, so each caller has its own readable body.
// - A rejected fetch or a non-ok response is not kept: the next call fetches afresh.
// - Abort: the first caller's request (and its AbortSignal) is the one that runs.
//   Later callers' signals are ignored while they share it. If the first caller's
//   signal aborts, the shared promise rejects, nothing is cached, and each caller
//   waiting on it sees that rejection; their next poll then fetches afresh.
import type { FetchLike } from '../refdata';
import type { Clock } from './clock';

interface Entry {
  readonly startedAt: number;
  readonly response: Promise<Response>;
}

export function coalesceFetch(fetch: FetchLike, now: Clock, ttlMs: number): FetchLike {
  const entries = new Map<string, Entry>();

  return (input, init) => {
    const method = init?.method;
    if (method !== undefined && method.toUpperCase() !== 'GET') return fetch(input, init);

    const existing = entries.get(input);
    if (existing !== undefined && now() - existing.startedAt < ttlMs) {
      // The stored response is never read, only cloned, so it can be cloned again.
      return existing.response.then((r) => r.clone());
    }

    const response = fetch(input, init);
    const entry: Entry = { startedAt: now(), response };
    entries.set(input, entry);
    const forget = (): void => {
      if (entries.get(input) === entry) entries.delete(input);
    };
    response.then((r) => { if (!r.ok) forget(); }, forget);
    return response.then((r) => r.clone());
  };
}

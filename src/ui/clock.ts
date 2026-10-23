// The only place in the application that reads the wall clock. Everything else
// receives `nowMs` as an argument, so the engine stays pure (DESIGN section 4).
// UTC milliseconds since the epoch.
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

/** A short token for the pack cache-bust query, from a clock reading (DESIGN section 4c, "No stale packs"). */
export function cacheBustToken(nowMs: number): string {
  return Math.floor(nowMs / 1000).toString(36);
}

// v2's own copy of the clock helpers (v2 imports nothing from src/ui). The
// wall clock is read only here and in main.tsx; everything else is handed the
// time as an argument, so the view model stays pure.
// UTC milliseconds since the epoch.
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

/** A short token for the pack cache-bust query, from a clock reading (DESIGN section 4c, "No stale packs"). */
export function cacheBustToken(nowMs: number): string {
  return Math.floor(nowMs / 1000).toString(36);
}

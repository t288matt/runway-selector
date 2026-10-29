// Which of the pack's modes is the real-world runway use (issue 159). Pure: an enabled
// mode matches when its arrival set and its departure set equal the parsed ones, in any
// order. No match (a non-standard combination) returns null and the caller shows the raw runways.
import type { ParsedRunways } from './parseAtis';

export interface MatchableMode {
  readonly id: string;
  readonly enabled: boolean;
  readonly arrivals: readonly string[];
  readonly departures: readonly string[];
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};

export function matchMode(parsed: ParsedRunways, modes: readonly MatchableMode[]): string | null {
  const hit = modes.find((m) => m.enabled && sameSet(m.arrivals, parsed.arrivals) && sameSet(m.departures, parsed.departures));
  return hit?.id ?? null;
}

/** "34L arr, 16R dep" for the chip when no mode matches; several runways of one kind are joined with " / ". */
export function rawRunwayText(parsed: ParsedRunways): string {
  return `${parsed.arrivals.join(' / ')} arr, ${parsed.departures.join(' / ')} dep`;
}

// The approach type for a mode (issue 99): which row of the mode's approach ladder the current cloud base and visibility
// select. Pure. Every limit and every word comes from the pack; nothing here names an airport, a mode or a procedure.
import type { AirportPack, ApproachBound, ApproachRow } from '../refdata/types';

type Verdict = 'yes' | 'no' | 'unknown';

/**
 * Does a value fall inside a bound? `value` uses the weather encoding: a number is known, null is "known: none" (no cloud, so
 * above every lower limit and never under an upper one), undefined is unknown.
 */
function against(bound: ApproachBound | null, value: number | null | undefined): Verdict {
  if (bound === null) return 'yes';
  if (value === undefined) {
    return 'unknown';
  }
  const lowerOk = (bound.above === null || value === null || value > bound.above) && (bound.atLeast === null || value === null || value >= bound.atLeast);
  const upperOk = (bound.below === null || (value !== null && value < bound.below)) && (bound.atMost === null || (value !== null && value <= bound.atMost));
  return lowerOk && upperOk ? 'yes' : 'no';
}

/**
 * The row of `ladder` for this weather, or null when there is none to show. `cloudBaseFt` is the approach cloud base (number
 * known, null known none, undefined unknown); `visibilityMetres` is a number or undefined. Rows are checked top-down. A row
 * that fails on a known value is skipped, even when the other value is unknown (visibility under the limit decides it
 * whatever the cloud). The first row that is not ruled out must be certain: if it depends on an unknown value, nothing is
 * returned, because it might match and the rows after it cannot be told apart from it.
 */
export function approachRowFor(ladder: readonly ApproachRow[], cloudBaseFt: number | null | undefined, visibilityMetres: number | undefined): ApproachRow | null {
  for (const row of ladder) {
    const a = against(row.cloudBase, cloudBaseFt);
    const b = against(row.visibility, visibilityMetres);
    if (a === 'no' || b === 'no') continue;
    return a === 'yes' && b === 'yes' ? row : null;
  }
  return null;
}

/** The row for a mode: null for a mode with no ladder (or one the pack does not hold), and whenever approachRowFor returns null. */
export function approachTypeFor(pack: AirportPack, modeId: string, cloudBaseFt: number | null | undefined, visibilityMetres: number | undefined): ApproachRow | null {
  const ladderId = pack.modes.find((m) => m.id === modeId)?.approachLadder ?? null;
  if (ladderId === null) return null;
  const ladder = pack.approachLadders.find((l) => l.id === ladderId);
  return ladder === undefined ? null : approachRowFor(ladder.rows, cloudBaseFt, visibilityMetres);
}

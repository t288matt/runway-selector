// The conditional-operation check (issue 58): do the weather and the runway state of one slot meet the conditions of a
// mode's conditional operation? A note only: the answer never changes a cell, a status or the plan. Pure.
import type { ConditionalOperation } from '../refdata/types';
import type { SlotWeather, WeatherSlot } from './inputs';
import { ceilingAgainst, visibilityAgainst } from './eligibility';
import type { RunwayState } from './types';

/** MET only when every stated condition is known and holds. UNKNOWN and NOT_MET both mean nothing is shown. */
export type ConditionalCheck = 'MET' | 'NOT_MET' | 'UNKNOWN';

type Against = 'OK' | 'BELOW' | 'UNKNOWN';

function weatherAgainst(op: ConditionalOperation, ceilingFt: number | null | undefined, visibilityMetres: number | undefined): Against[] {
  const out: Against[] = [];
  if (op.ceilingFt !== null) out.push(ceilingAgainst(op.ceilingFt, ceilingFt));
  if (op.visibilityMetres !== null) out.push(visibilityAgainst(op.visibilityMetres, visibilityMetres));
  return out;
}

/**
 * The check for one slot. The slot's own weather is used whoever governs it (a METAR-governed slot never consults the
 * TAF's view, as in rule MIN). A TEMPO, INTER or PROB group that would break a stated condition makes it NOT_MET; a
 * group that says nothing about a condition does not (it cannot be shown to break it). Precipitation in a group wets
 * the runway if the group happens. A runway that may be wet is not dry.
 */
export function conditionalOperationCheck(op: ConditionalOperation, slot: WeatherSlot, runwayState: RunwayState): ConditionalCheck {
  if (slot.governedBy === 'NONE') return 'UNKNOWN';
  const sw: SlotWeather = slot.weather;
  const own = weatherAgainst(op, sw.ceilingFt, sw.visibilityMetres);
  const surfaceFails = op.requiresDrySurface && runwayState !== 'DRY';
  const overlayBreaks = sw.overlays.some((o) => weatherAgainst(op, o.ceilingFt, o.visibilityMetres).includes('BELOW') || (op.requiresDrySurface && o.precipitation));
  if (own.includes('BELOW') || surfaceFails || overlayBreaks) return 'NOT_MET';
  return own.includes('UNKNOWN') ? 'UNKNOWN' : 'MET';
}

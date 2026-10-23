// Runway state per slot: DRY, WET or WET_POSSIBLE (REQUIREMENTS WC-9, WC-10,
// WC-12; DESIGN section 6, "Forecast runway state per slot"). Derived only
// from the weather slots; thresholds come from the pack.
//
// How the rules are applied here:
//  - Slot 0 (the first slot) is WET only when the latest METAR governs it and
//    reports precipitation now (prevailing) or recently (recent, an RE group).
//    Otherwise it is DRY, even when a TAF governs it (WC-12).
//  - A later slot: prevailing precipitation is WET; a PROB group (not on a
//    TEMPO/INTER) at or above wetRunwayProbabilityPct is WET; a PROB below it,
//    or any TEMPO/INTER precipitation, is WET_POSSIBLE; otherwise DRY.
//  - Drying: after a genuinely WET slot the runway stays WET until
//    dryingTimeMinutes after that slot's END. A slot is held WET while its
//    START is before that instant. WET_POSSIBLE slots never start the clock.
//    A slot that is WET only because of drying does not restart the clock.
//    A WET_POSSIBLE slot inside the drying time is WET.
//  - METAR-governed slots after slot 0 carry the METAR's own flags and are
//    treated uniformly with TAF-governed ones. The METAR's "recent" flag has
//    meaning only in slot 0; for later slots the drying time after slot 0
//    covers it.
//  - tafView (the TAF's own view of a METAR-governed slot) is classified with
//    the later-slot rules, even in slot 0, then combined with the drying
//    state of the real chain: if the runway is held WET by drying it is WET
//    whichever report is read. It never changes the chain itself.
import type { AirportPack } from '../refdata/types';
import type { SlotWeather, WeatherSlot } from './inputs';
import type { RunwayState, RunwayStateCause } from './types';

export interface SlotRunwayCondition {
  readonly state: RunwayState;
  readonly cause: RunwayStateCause;
  /** The state the TAF's view of the slot implies, or null when the slot has no tafView. */
  readonly tafState: RunwayState | null;
}

interface Classified {
  readonly state: RunwayState;
  readonly cause: RunwayStateCause;
}

function classifyForecast(weather: SlotWeather, wetProbabilityPct: number): Classified {
  const p = weather.precipitation;
  if (p.prevailing) return { state: 'WET', cause: 'FORECAST' };
  if (p.probable !== null && p.probable >= wetProbabilityPct) return { state: 'WET', cause: 'PROBABLE' };
  if (p.temporary) return { state: 'WET_POSSIBLE', cause: 'POSSIBLE_TEMPORARY' };
  if (p.probable !== null) return { state: 'WET_POSSIBLE', cause: 'POSSIBLE_PROBABLE' };
  return { state: 'DRY', cause: 'NONE' };
}

export function runwayConditions(pack: AirportPack, weather: readonly WeatherSlot[]): SlotRunwayCondition[] {
  const wetProbabilityPct = pack.settings.wetRunwayProbabilityPct;
  const dryingMs = pack.settings.dryingTimeMinutes * 60_000;
  const out: SlotRunwayCondition[] = [];
  let lastWetEndMs = Number.NEGATIVE_INFINITY;
  weather.forEach((slot, index) => {
    let own: Classified;
    if (index === 0) {
      const p = slot.weather.precipitation;
      if (slot.governedBy === 'METAR' && p.prevailing) own = { state: 'WET', cause: 'METAR_NOW' };
      else if (slot.governedBy === 'METAR' && p.recent) own = { state: 'WET', cause: 'METAR_RECENT' };
      else own = { state: 'DRY', cause: 'NONE' };
    } else {
      own = classifyForecast(slot.weather, wetProbabilityPct);
    }
    const heldByDrying = own.state !== 'WET' && slot.startMs < lastWetEndMs + dryingMs;
    const final: Classified = heldByDrying ? { state: 'WET', cause: 'DRYING' } : own;
    if (own.state === 'WET') lastWetEndMs = slot.endMs;
    let tafState: RunwayState | null = null;
    if (slot.tafView !== null) {
      const view = classifyForecast(slot.tafView, wetProbabilityPct);
      tafState = heldByDrying ? 'WET' : view.state;
    }
    out.push({ state: final.state, cause: final.cause, tafState });
  });
  return out;
}

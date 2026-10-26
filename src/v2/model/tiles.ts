// The four tiles of the answer screen: traffic (with its trend), ceiling and
// visibility, runway state, and the METAR line. Pure view models: plain strings
// and numbers from one view. Every threshold comes from the pack's settings
// (the traffic bands, through the engine's own classifier); none is written here.
import { trafficLevelsFor, type SlotCondition, type TrafficLevel } from '../../engine';
import { ceilingOf, visibilityMetresOf, type DecodedConditions } from '../../weather';
import { hhmmZ, hhmmZRel, thousands } from '../format';
import { SLOT_MS, type FeedState, type ViewData } from './dashboard';

const MS_MINUTE = 60_000;
/** The trend looks this far ahead of now. */
export const TREND_HORIZON_MS = 120 * MS_MINUTE;

export type Tone = 'ok' | 'warn' | 'bad' | 'unk';

// ----------------------------------------------------------------- traffic
/** Display mapping only (TR-4): light, medium, busy are shown as LOW, MEDIUM, HIGH. */
export function levelWord(level: TrafficLevel | null): string {
  return level === null ? 'UNKNOWN' : level === 'light' ? 'LOW' : level === 'medium' ? 'MEDIUM' : 'HIGH';
}

const RANK: Readonly<Record<TrafficLevel, number>> = { light: 0, medium: 1, busy: 2 };

export type TrendDirection = 'steady' | 'increasing' | 'decreasing' | 'none';

export interface Trend {
  readonly direction: TrendDirection;
  /** The trend in words, for the hover and the accessible name: "steady to 22:30Z, unknown after". */
  readonly text: string;
}

/**
 * The traffic trend over the next two hours. `levels[0]` is the level now; the
 * later slots are compared with it, using the airport's own bands (the levels
 * are already classified from the pack). Slots that start within two hours of
 * `nowMs` count; a slot with an unknown level is ignored.
 *   a later slot at a higher level  -> increasing
 *   a later slot at a lower level   -> decreasing
 *   every known later slot the same -> steady
 *   nothing known to compare with   -> none (no arrow)
 * When later slots differ in both directions, the first one that differs from
 * now decides, because that is the change that arrives first.
 */
export function trafficTrend(levels: readonly (TrafficLevel | null)[], startsMs: readonly number[], nowMs: number): Trend {
  const now = levels[0] ?? null;
  if (now === null) return { direction: 'none', text: 'traffic level now is unknown' };
  const later: { level: TrafficLevel | null; startMs: number }[] = [];
  for (let i = 1; i < levels.length; i += 1) {
    const startMs = startsMs[i];
    if (startMs === undefined || startMs >= nowMs + TREND_HORIZON_MS) break;
    later.push({ level: levels[i] ?? null, startMs });
  }
  const known = later.filter((s): s is { level: TrafficLevel; startMs: number } => s.level !== null);
  if (known.length === 0) return { direction: 'none', text: 'later traffic is unknown' };
  const changed = known.find((s) => RANK[s.level] !== RANK[now]);
  if (changed !== undefined) {
    const up = RANK[changed.level] > RANK[now];
    return { direction: up ? 'increasing' : 'decreasing', text: `${up ? 'increasing' : 'decreasing'} to ${levelWord(changed.level)} from ${hhmmZ(changed.startMs)}` };
  }
  const lastKnown = known[known.length - 1];
  const unknownAfter = lastKnown !== undefined && later.some((s) => s.level === null && s.startMs > lastKnown.startMs);
  return { direction: 'steady', text: `steady to ${hhmmZ((lastKnown?.startMs ?? nowMs) + SLOT_MS)}${unknownAfter ? ', unknown after' : ''}` };
}

export interface TrafficTile {
  readonly state: 'none' | 'ok';
  readonly level: TrafficLevel | null;
  readonly word: string;
  /** How many of the three bars are lit: 0 (unknown) to 3. */
  readonly bars: 0 | 1 | 2 | 3;
  readonly trend: Trend;
  /** "Traffic · 1 in · 0 out". */
  readonly sub: string;
  /** The hover text. */
  readonly popover: string;
  /** The accessible name. */
  readonly aria: string;
  /** The pack gives no airport elevation, so the departure count may include slow aircraft overhead. */
  readonly elevationMissing: boolean;
}

export const NO_TRAFFIC_TEXT = 'No traffic data.';
export const ELEVATION_TEXT = 'The pack gives no airport elevation, so aircraft are judged on the ground by distance and speed only. The departure count may include slow aircraft overhead.';

export function trafficTile(view: ViewData, feed: FeedState): TrafficTile {
  const demand = view.liveDemand;
  if (demand === null) {
    const popover = feed.error === null ? NO_TRAFFIC_TEXT : `${NO_TRAFFIC_TEXT} VATSIM traffic could not be fetched: ${feed.error}`;
    return { state: 'none', level: null, word: 'NO DATA', bars: 0, trend: { direction: 'none', text: 'no traffic data' }, sub: 'Traffic', popover, aria: `Traffic: no data. ${popover}`, elevationMissing: false };
  }
  const starts = view.weather.slots.map((s) => s.startMs);
  const levels = trafficLevelsFor(view.pack, starts, demand.slots);
  const level = levels[0] ?? null;
  const trend = trafficTrend(levels, starts, view.calcNowMs);
  const s = demand.summary;
  const connected = `Connected now: ${s.connectedArrivals} inbound, ${s.groundElsewhere} of them on the ground elsewhere, and ${s.connectedDepartures} on the ground here.`;
  const word = levelWord(level);
  const sub = `Traffic · ${s.connectedArrivals} in · ${s.connectedDepartures} out`;
  return {
    state: 'ok',
    level,
    word,
    bars: level === null ? 0 : level === 'light' ? 1 : level === 'medium' ? 2 : 3,
    trend,
    sub,
    popover: `Trend: ${trend.text}. ${connected}${s.elevationMissing ? ` ${ELEVATION_TEXT}` : ''}`,
    aria: `Traffic ${word}, ${trend.text}. ${s.connectedArrivals} inbound, ${s.groundElsewhere} of them on the ground elsewhere, ${s.connectedDepartures} on the ground here.${s.elevationMissing ? ` ${ELEVATION_TEXT}` : ''}`,
    elevationMissing: s.elevationMissing,
  };
}

// ----------------------------------------------------------------- ceiling
/**
 * The decoded conditions of whichever report governs the current slot: the
 * METAR, or the TAF's prevailing period at this time when the METAR does not
 * govern. Mirrors the period choice in weather/slots.ts, so it names the same
 * period that decides the slot's weather.
 */
export function currentConditions(view: ViewData): DecodedConditions | null {
  const governedBy = view.weather.slots[0]?.governedBy;
  if (governedBy === 'METAR') return view.metar;
  if (governedBy === 'TAF' && view.taf !== null) {
    const endMs = view.weather.slots[0]?.endMs ?? view.calcNowMs;
    let period = view.taf.periods[0];
    for (const p of view.taf.periods) if (p.startMs < endMs) period = p;
    return period ?? null;
  }
  return null;
}

export interface CeilingTile {
  /** "3,200 ft", "No ceiling", "CAVOK (no ceiling)" or "Unknown". */
  readonly value: string;
  /** "vis 9000 m", "vis 10 km or more" or "vis unknown". */
  readonly visibility: string;
  readonly aria: string;
}

export function ceilingTile(view: ViewData): CeilingTile {
  const c = currentConditions(view);
  let value = 'Unknown';
  let visibility = 'vis unknown';
  if (c !== null) {
    if (c.cavok) value = 'CAVOK (no ceiling)';
    else {
      const ft = ceilingOf(c);
      value = ft === null || ft === undefined ? 'No ceiling' : `${thousands(ft)} ft`;
    }
    const m = visibilityMetresOf(c);
    if (m !== undefined) visibility = m >= 10_000 ? 'vis 10 km or more' : `vis ${m} m`;
  }
  const ceilingWords = value.endsWith(' ft') ? `${value.slice(0, -3).replace(',', '')} feet` : value;
  const visWords = visibility.replace(/^vis /, '').replace(/ m$/, ' metres');
  return { value, visibility, aria: `Ceiling ${ceilingWords}, visibility ${visWords}` };
}

// ------------------------------------------------------------ runway state
export const RUNWAY_STATE_WORDS = { DRY: 'DRY', WET: 'WET', WET_POSSIBLE: 'WET POSSIBLE' } as const;

export type SlotWetness = 'dry' | 'wet' | 'possible';

export interface RunwayTile {
  readonly known: boolean;
  /** The weather line, for example "Showers in 30 min", "Heavy rain now" or "No precipitation next hour" (issue 123). */
  readonly headline: string;
  readonly word: string;
  /** The wet-from or wet-until time, in words: "wet from 20:00Z", "now, until 22:30Z". */
  readonly detail: string;
  /** One entry per slot of the window, for the small bar. */
  readonly segments: readonly SlotWetness[];
  readonly aria: string;
}

/** Precipitation worded for the tile: "heavy rain", "showers", "light drizzle", "thunderstorm". Display only. */
export function conditionWords(c: SlotCondition): string {
  const has = (code: string): boolean => c.phenomena.includes(code);
  const kind = c.descriptor === 'TS' ? 'thunderstorm' : has('RA') ? (c.descriptor === 'SH' ? 'showers' : c.descriptor === 'FZ' ? 'freezing rain' : 'rain') : has('DZ') ? (c.descriptor === 'FZ' ? 'freezing drizzle' : 'drizzle') : has('SN') ? (c.descriptor === 'SH' ? 'snow showers' : 'snow') : has('GR') ? 'hail' : has('GS') ? 'small hail' : has('SG') ? 'snow grains' : has('PL') ? 'ice pellets' : c.descriptor === 'SH' ? 'showers' : 'precipitation';
  return c.intensity === '+' ? `heavy ${kind}` : c.intensity === '-' ? `light ${kind}` : kind;
}

/** Minutes to the nearest five, as "30 min" or "1 h" or "1 h 30 min". */
function inMinutes(ms: number): string {
  const m = Math.max(5, Math.round(ms / MS_MINUTE / 5) * 5);
  return m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Beyond this the weather line gives a clock time instead of "in N min" (issue 123). A display rule. */
const RELATIVE_LIMIT_MS = 120 * MS_MINUTE;

/** The runway state now and when it changes, over the window the plan covers. */
export function runwayTile(view: ViewData): RunwayTile {
  const slots = view.result.evaluation.slots;
  const first = slots[0];
  if (first === undefined || view.weather.slots[0]?.governedBy === 'NONE') {
    return { known: false, headline: 'Weather unknown', word: 'UNKNOWN', detail: 'no weather for the runway condition', segments: [], aria: 'Runway condition unknown' };
  }
  const wetness = (state: string): SlotWetness => (state === 'WET' ? 'wet' : state === 'WET_POSSIBLE' ? 'possible' : 'dry');
  const segments = slots.map((s) => wetness(s.runwayState));
  const word = RUNWAY_STATE_WORDS[first.runwayState];
  const startOf = (i: number): string => hhmmZRel(slots[i]?.startMs ?? 0, view.calcNowMs);
  const endZ = hhmmZRel(slots[slots.length - 1]?.endMs ?? 0, view.calcNowMs);
  let detail: string;
  if (first.runwayState === 'DRY') {
    const next = slots.findIndex((s, i) => i > 0 && s.runwayState !== 'DRY');
    detail = next < 0 ? `no wet runway forecast to ${endZ}` : `${RUNWAY_STATE_WORDS[slots[next]?.runwayState ?? 'WET'].toLowerCase()} from ${startOf(next)}`;
  } else {
    const dry = slots.findIndex((s, i) => i > 0 && s.runwayState === 'DRY');
    detail = dry < 0 ? `now, with no dry period to ${endZ}` : `now, until ${startOf(dry)}`;
  }
  // The weather line: the first slot of the whole window that has precipitation, worded from the report (issue 123).
  const ahead = slots.findIndex((_s, i) => i < view.weather.slots.length && (view.weather.slots[i]?.weather.present?.length ?? 0) > 0);
  let headline = 'No precipitation forecast';
  if (ahead >= 0) {
    const found = view.weather.slots[ahead]?.weather.present ?? [];
    const words = [...new Set(found.map(conditionWords))].slice(0, 2).join(' and ');
    const text = words.charAt(0).toUpperCase() + words.slice(1);
    headline = ahead === 0 || (slots[ahead]?.startMs ?? 0) <= view.calcNowMs ? `${text} now` : (slots[ahead]?.startMs ?? 0) - view.calcNowMs <= RELATIVE_LIMIT_MS ? `${text} in ${inMinutes((slots[ahead]?.startMs ?? 0) - view.calcNowMs)}` : `${text} from ${startOf(ahead)}`;
  }
  return { known: true, headline, word, detail, segments, aria: `${headline}. Runway ${word.toLowerCase()}, ${detail}` };
}

// ------------------------------------------------------------------- METAR
export interface MetarTile {
  /** The METAR with the station code dropped, or null with no METAR. */
  readonly text: string | null;
}

/** The raw METAR for the METAR line; the airport is already chosen at the top, so the station code is dropped. */
export function metarTile(view: ViewData): MetarTile {
  const raw = view.metar?.raw;
  if (raw === undefined) return { text: null };
  return { text: raw.replace(/^(\s*(?:METAR|SPECI)\s+)?(?:COR\s+)?[A-Z]{4}\s+/i, '$1').trim() };
}

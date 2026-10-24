// One calculation for the whole screen (DESIGN section 4, 8): weather slots,
// traffic slots and the engine's plan, from plain inputs. Pure: the clock is an
// argument. Nothing here knows an airport; everything comes from the pack.
import { plan, type PlanResult, type TrafficLevel } from '../../engine';
import type { AirportPack } from '../../refdata';
import { buildTrafficSlots } from '../../traffic/demand';
import type { FetchFeedResult } from '../../traffic/fetchFeed';
import type { Aircraft } from '../../traffic/parseFeed';
import { buildWeatherSlots, SLOT_MINUTES, type BuildWeatherSlotsResult, type DecodedMetar, type DecodedTaf } from '../../weather';
import { ageText, hhmmssZ, hhmmZ, utcAndLocal } from '../format';

const MS_MINUTE = 60_000;
export const SLOT_MS = SLOT_MINUTES * MS_MINUTE;

// ------------------------------------------------------------------ window
export type WindowChoice = '4h' | '6h' | 'full';

export interface WindowOption {
  readonly id: WindowChoice;
  readonly label: string;
  /** Minutes from the start of slot 0, or null for the full TAF validity. */
  readonly minutes: number | null;
}

/** OD-31: 4 hours, 6 hours and the full TAF; the full TAF is the default. */
export const WINDOW_OPTIONS: readonly WindowOption[] = [
  { id: '4h', label: '4 hours', minutes: 240 },
  { id: '6h', label: '6 hours', minutes: 360 },
  { id: 'full', label: 'Full TAF', minutes: null },
];
export const DEFAULT_WINDOW: WindowChoice = 'full';

/** The window shown at first: the pack's forecastWindowMinutes when it is one of the on-screen options, else the full TAF (OD-31). */
export function defaultWindowFor(pack: AirportPack): WindowChoice {
  const minutes = pack.settings.forecastWindowMinutes;
  return WINDOW_OPTIONS.find((o) => o.minutes !== null && o.minutes === minutes)?.id ?? DEFAULT_WINDOW;
}

export function windowMinutes(choice: WindowChoice): number | null {
  return WINDOW_OPTIONS.find((o) => o.id === choice)?.minutes ?? null;
}

export function isWindowChoice(value: string): value is WindowChoice {
  return WINDOW_OPTIONS.some((o) => o.id === value);
}

// ------------------------------------------------------------------- feed
/** The traffic feed as the page holds it. Previous data is kept when a fetch fails (UP-3). */
export interface FeedState {
  readonly aircraft: readonly Aircraft[] | null;
  readonly fetchedAtMs: number | null;
  /** The last fetch failed with this message, or null. */
  readonly error: string | null;
  readonly errorAtMs: number | null;
}
export const EMPTY_FEED: FeedState = { aircraft: null, fetchedAtMs: null, error: null, errorAtMs: null };

/** Fold one fetch result into the feed state. On failure the previous aircraft are kept and the failure is flagged (UP-3). */
export function applyFeedResult(previous: FeedState, result: FetchFeedResult, nowMs: number): FeedState {
  if (result.ok) return { aircraft: result.aircraft, fetchedAtMs: result.fetchedAtMs, error: null, errorAtMs: null };
  return { ...previous, error: result.error.message, errorAtMs: nowMs };
}

// ------------------------------------------------------------ calculation
export interface CalcInput {
  readonly pack: AirportPack;
  readonly nowMs: number;
  readonly metar: DecodedMetar | null;
  readonly taf: DecodedTaf | null;
  readonly windowChoice: WindowChoice;
  readonly currentMode: string | null;
  readonly feed: FeedState;
}

export interface ViewData {
  readonly pack: AirportPack;
  /** The instant of this calculation. */
  readonly calcNowMs: number;
  readonly metar: DecodedMetar | null;
  readonly taf: DecodedTaf | null;
  readonly weather: BuildWeatherSlotsResult;
  /** The traffic the plan was calculated with. */
  readonly demand: ReturnType<typeof buildTrafficSlots> | null;
  /** The latest traffic, for Panel D. Moves with every poll; the plan does not (UP-1). */
  readonly liveDemand: ReturnType<typeof buildTrafficSlots> | null;
  readonly result: PlanResult;
  /** The operator's current mode if it is an enabled mode of the pack, else null. */
  readonly currentMode: string | null;
  readonly windowChoice: WindowChoice;
}

export function calculate(input: CalcInput): ViewData {
  const { pack, nowMs } = input;
  const weather = buildWeatherSlots({ pack, nowMs, metar: input.metar, taf: input.taf, windowMinutes: windowMinutes(input.windowChoice) });
  const starts = weather.slots.map((s) => s.startMs);
  const demand = input.feed.aircraft === null ? null : buildTrafficSlots({ pack, nowMs, aircraft: input.feed.aircraft, slotStartsMs: starts });
  const currentMode = pack.modes.some((m) => m.enabled && m.id === input.currentMode) ? input.currentMode : null;
  const result = plan(pack, { nowMs, weather: weather.slots, traffic: demand?.slots ?? [], currentMode });
  return { pack, calcNowMs: nowMs, metar: input.metar, taf: input.taf, weather, demand, liveDemand: demand, result, currentMode, windowChoice: input.windowChoice };
}

/** The latest traffic on the slots the plan was calculated over (Panel D). Does not touch the plan. */
export function liveDemandFor(view: ViewData, feed: FeedState, nowMs: number): ViewData['liveDemand'] {
  if (feed.aircraft === null) return null;
  return buildTrafficSlots({ pack: view.pack, nowMs, aircraft: feed.aircraft, slotStartsMs: view.weather.slots.map((s) => s.startMs) });
}

/** Full recalculation every 30 minutes, aligned to the clock half-hour (UP-1, OP-9). */
export function needsRecalculation(calcNowMs: number, nowMs: number): boolean {
  return Math.floor(nowMs / SLOT_MS) !== Math.floor(calcNowMs / SLOT_MS) || nowMs - calcNowMs >= SLOT_MS;
}

export function nextPlanMs(calcNowMs: number): number {
  return (Math.floor(calcNowMs / SLOT_MS) + 1) * SLOT_MS;
}

// -------------------------------------------------------------- freshness
export interface Freshness {
  readonly ageMinutes: number;
  readonly stale: boolean;
}

/** Age from the source's own time. Exactly at the limit is not stale (matches the traffic module). */
export function freshness(nowMs: number, atMs: number, staleMinutes: number): Freshness {
  return { ageMinutes: Math.max(0, Math.floor((nowMs - atMs) / MS_MINUTE)), stale: nowMs - atMs > staleMinutes * MS_MINUTE };
}

export type Tone = 'ok' | 'warn' | 'bad' | 'unk';

export interface Chip {
  readonly id: 'metar' | 'taf' | 'vatsim' | 'plan';
  readonly label: string;
  readonly detail: string;
  readonly tone: Tone;
  /** A word beside the chip: Stale, Failed, Not entered. */
  readonly flag: string | null;
}

export const RUNWAY_STATE_WORDS = { DRY: 'DRY', WET: 'WET', WET_POSSIBLE: 'WET POSSIBLE' } as const;

export function freshnessChips(view: ViewData, feed: FeedState, nowMs: number): Chip[] {
  const { pack } = view;
  const tz = pack.airport.timeZone;
  const s = pack.settings;
  const chips: Chip[] = [];

  if (view.metar === null) {
    chips.push({ id: 'metar', label: 'METAR', detail: 'No weather entered', tone: 'unk', flag: 'Not entered' });
  } else {
    const f = freshness(nowMs, view.metar.observedAtMs, s.metarStaleMinutes);
    chips.push({ id: 'metar', label: 'METAR', detail: `${utcAndLocal(view.metar.observedAtMs, tz)}, ${ageText(f.ageMinutes)} old`, tone: f.stale ? 'warn' : 'ok', flag: f.stale ? 'Stale' : null });
  }

  if (view.taf === null) {
    chips.push({ id: 'taf', label: 'TAF', detail: 'No weather entered', tone: 'unk', flag: 'Not entered' });
  } else {
    const f = freshness(nowMs, view.taf.issuedAtMs, s.tafStaleMinutes);
    chips.push({ id: 'taf', label: 'TAF', detail: `${hhmmZ(view.taf.issuedAtMs)} valid to ${utcAndLocal(view.taf.validToMs, tz)}, ${ageText(f.ageMinutes)} old`, tone: f.stale ? 'warn' : 'ok', flag: f.stale ? 'Stale' : null });
  }

  if (feed.error !== null) {
    const last = feed.fetchedAtMs === null ? 'no earlier data' : `last good data ${hhmmssZ(feed.fetchedAtMs)}`;
    chips.push({ id: 'vatsim', label: 'VATSIM traffic', detail: last, tone: 'bad', flag: 'Failed' });
  } else if (feed.fetchedAtMs === null) {
    chips.push({ id: 'vatsim', label: 'VATSIM traffic', detail: 'Loading', tone: 'unk', flag: null });
  } else {
    const f = freshness(nowMs, feed.fetchedAtMs, s.vatsimStaleMinutes);
    const seconds = Math.max(0, Math.floor((nowMs - feed.fetchedAtMs) / 1000));
    chips.push({ id: 'vatsim', label: 'VATSIM traffic', detail: `${hhmmssZ(feed.fetchedAtMs)}, ${seconds < 120 ? `${seconds} s` : ageText(f.ageMinutes)} old`, tone: f.stale ? 'warn' : 'ok', flag: f.stale ? 'Stale' : null });
  }

  // Runway state is not repeated here: it is one line below in Panel A, and every
  // timeline cell carries its own slot-by-slot runway-state detail on hover.
  chips.push({ id: 'plan', label: 'Recalculated at', detail: `${hhmmZ(view.calcNowMs)}, next ${hhmmZ(nextPlanMs(view.calcNowMs))}`, tone: 'ok', flag: null });
  return chips;
}

// ---------------------------------------------------------------- notices
export interface Notice {
  readonly id: string;
  readonly tone: 'warn' | 'bad' | 'info';
  readonly text: string;
}

/** Missing-report and stale-data banners (WX-9, UI_DESIGN section 7). */
export function dataNotices(view: ViewData, feed: FeedState, nowMs: number): Notice[] {
  const out: Notice[] = [];
  const s = view.pack.settings;
  for (const b of view.weather.banners) {
    // The weather module words its stale banners at calculation time; the screen words its own from the live clock.
    if (b.code === 'metar-stale' || b.code === 'taf-stale') continue;
    out.push({ id: b.code, tone: 'warn', text: b.message });
  }
  if (view.metar !== null) {
    const f = freshness(nowMs, view.metar.observedAtMs, s.metarStaleMinutes);
    if (f.stale) out.push({ id: 'metar-stale', tone: 'warn', text: `METAR is ${ageText(f.ageMinutes)} old, over the ${s.metarStaleMinutes} min limit. Advice may be out of date.` });
  }
  if (view.taf !== null) {
    const f = freshness(nowMs, view.taf.issuedAtMs, s.tafStaleMinutes);
    if (f.stale) out.push({ id: 'taf-stale', tone: 'warn', text: `TAF was issued ${ageText(f.ageMinutes)} ago, over the ${s.tafStaleMinutes} min limit. Advice may be out of date.` });
  }
  if (feed.error !== null) {
    const last = feed.fetchedAtMs === null ? 'There is no earlier traffic data.' : `The last good traffic data is from ${hhmmssZ(feed.fetchedAtMs)}.`;
    out.push({ id: 'vatsim-failed', tone: 'bad', text: `VATSIM traffic could not be fetched: ${feed.error} ${last} Fields that depend on traffic may read Unknown.` });
  } else if (feed.fetchedAtMs !== null) {
    const f = freshness(nowMs, feed.fetchedAtMs, s.vatsimStaleMinutes);
    if (f.stale) out.push({ id: 'vatsim-stale', tone: 'warn', text: `VATSIM traffic is ${ageText(f.ageMinutes)} old, over the ${s.vatsimStaleMinutes} min limit.` });
  }
  return out;
}

// ---------------------------------------------------------- traffic words
/** Display mapping only (TR-4): light, medium, busy are shown as LOW, MEDIUM, HIGH. */
export function levelWord(level: TrafficLevel | null): string {
  return level === null ? 'UNKNOWN' : level === 'light' ? 'LOW' : level === 'medium' ? 'MEDIUM' : 'HIGH';
}
/** The short word shown in the timeline's narrow traffic column, where levelWord's MEDIUM does not fit as well. */
export function levelShortWord(level: TrafficLevel | null): string {
  return level === null ? '?' : level === 'light' ? 'LOW' : level === 'medium' ? 'MED' : 'HIGH';
}
export function levelTone(level: TrafficLevel | null): Tone {
  return level === null ? 'unk' : level === 'light' ? 'ok' : 'warn';
}

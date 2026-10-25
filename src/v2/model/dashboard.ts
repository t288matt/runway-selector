// One calculation for the whole screen (DESIGN section 4, 8): weather slots,
// traffic slots and the engine's plan, from plain inputs. Pure: the clock is an
// argument. This is v2's own copy of the v1 data flow (v2 imports nothing from
// src/ui). Nothing here knows an airport; everything comes from the pack.
import { plan, type PlanResult } from '../../engine';
import type { AirportPack } from '../../refdata';
import { buildTrafficSlots } from '../../traffic/demand';
import type { FetchFeedResult } from '../../traffic/fetchFeed';
import type { Aircraft, Prefile } from '../../traffic/parseFeed';
import { buildWeatherSlots, SLOT_MINUTES, type BuildWeatherSlotsResult, type DecodedMetar, type DecodedTaf } from '../../weather';

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

/** The window shown at first: the pack's forecastWindowMinutes when it is one of the options, else the full TAF (OD-31). */
export function defaultWindowFor(pack: AirportPack): WindowChoice {
  const minutes = pack.settings.forecastWindowMinutes;
  return WINDOW_OPTIONS.find((o) => o.minutes !== null && o.minutes === minutes)?.id ?? DEFAULT_WINDOW;
}

export function windowMinutes(choice: WindowChoice): number | null {
  return WINDOW_OPTIONS.find((o) => o.id === choice)?.minutes ?? null;
}

// ------------------------------------------------------------------- feed
/** The traffic feed as the page holds it. Previous data is kept when a fetch fails (UP-3). */
export interface FeedState {
  readonly aircraft: readonly Aircraft[] | null;
  readonly prefiles: readonly Prefile[];
  readonly fetchedAtMs: number | null;
  /** The last fetch failed with this message, or null. */
  readonly error: string | null;
  readonly errorAtMs: number | null;
}
export const EMPTY_FEED: FeedState = { aircraft: null, prefiles: [], fetchedAtMs: null, error: null, errorAtMs: null };

/** Fold one fetch result into the feed state. On failure the previous aircraft are kept and the failure is flagged (UP-3). */
export function applyFeedResult(previous: FeedState, result: FetchFeedResult, nowMs: number): FeedState {
  if (result.ok) return { aircraft: result.aircraft, prefiles: result.prefiles, fetchedAtMs: result.fetchedAtMs, error: null, errorAtMs: null };
  // A failed fetch keeps the last aircraft (UP-3) but not the prefiles: a prefile has no date, so an old one would
  // count again at the same time of day. Without prefiles the next slot's departures are unknown, not zero.
  return { ...previous, prefiles: [], error: result.error.message, errorAtMs: nowMs };
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
  /** The latest traffic, for the traffic tile. Moves with every poll; the plan does not (UP-1). */
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
  const demand = input.feed.aircraft === null ? null : buildTrafficSlots({ pack, nowMs, aircraft: input.feed.aircraft, prefiles: input.feed.prefiles, slotStartsMs: starts });
  const currentMode = pack.modes.some((m) => m.enabled && m.id === input.currentMode) ? input.currentMode : null;
  const result = plan(pack, { nowMs, weather: weather.slots, traffic: demand?.slots ?? [], currentMode });
  return { pack, calcNowMs: nowMs, metar: input.metar, taf: input.taf, weather, demand, liveDemand: demand, result, currentMode, windowChoice: input.windowChoice };
}

/** The latest traffic on the slots the plan was calculated over. Does not touch the plan. */
export function liveDemandFor(view: ViewData, feed: FeedState, nowMs: number): ViewData['liveDemand'] {
  if (feed.aircraft === null) return null;
  return buildTrafficSlots({ pack: view.pack, nowMs, aircraft: feed.aircraft, prefiles: feed.prefiles, slotStartsMs: view.weather.slots.map((s) => s.startMs) });
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

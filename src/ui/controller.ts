// The page's state and scheduling with no React in it (DESIGN section 4a,
// "Scheduler"). The clock, the timer functions and the network arrive as
// arguments, so every rule is testable with fakes.
//
// UP-1: the plan is recalculated ONLY on the 30-minute boundary, on a new
// METAR or TAF, on a current-mode change, on a window change and on Refresh.
// A VATSIM poll updates the traffic shown (Panel D) and the freshness chip but
// never the plan: the plan keeps the traffic it was calculated with.
import type { AirportPack, FetchLike } from '../refdata';
import { fetchFeed } from '../traffic/fetchFeed';
import type { DecodedMetar, DecodedTaf } from '../weather';
import type { Clock } from './clock';
import type { ApplyOutcome } from './components/WeatherEntry';
import { applyMetarText, applyTafText } from './model/apply';
import { applyFeedResult, calculate, defaultWindowFor, EMPTY_FEED, liveDemandFor, needsRecalculation, type FeedState, type ViewData, type WindowChoice } from './model/dashboard';

/** The timer functions, injected. The handle is opaque. */
export interface Timers {
  readonly setInterval: (fn: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
}

export interface ControllerDeps {
  readonly pack: AirportPack;
  readonly fetch: FetchLike;
  readonly now: Clock;
  readonly timers: Timers;
}

/** Tick for ages and the now marker, and the check for the 30-minute boundary. */
export const TICK_MS = 60_000;

export interface ControllerState {
  readonly view: ViewData;
  readonly feed: FeedState;
  readonly displayNowMs: number;
}

export interface Controller {
  readonly getState: () => ControllerState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Starts the first poll and both timers. Safe to call again after stop. */
  readonly start: () => void;
  /** Cancels both timers; a poll still in flight is ignored when it ends. */
  readonly stop: () => void;
  /** Resolves when the poll in flight (if any) has finished; for tests. */
  readonly settled: () => Promise<void>;
  readonly refresh: () => void;
  readonly setWindowChoice: (choice: WindowChoice) => void;
  readonly setCurrentMode: (id: string | null) => void;
  readonly applyMetar: (text: string) => ApplyOutcome;
  readonly applyTaf: (text: string) => ApplyOutcome;
}

export function createController(deps: ControllerDeps): Controller {
  const { pack } = deps;
  let metar: DecodedMetar | null = null;
  let taf: DecodedTaf | null = null;
  let windowChoice: WindowChoice = defaultWindowFor(pack);
  let currentMode: string | null = null;
  let feed: FeedState = EMPTY_FEED;
  let running = false;
  let pollInFlight: Promise<void> | null = null;
  let pollTimer: unknown = null;
  let tickTimer: unknown = null;
  const listeners = new Set<() => void>();

  const first = deps.now();
  let state: ControllerState = { view: calculate({ pack, nowMs: first, metar, taf, windowChoice, currentMode, feed }), feed, displayNowMs: first };

  const publish = (next: ControllerState): void => {
    state = next;
    for (const l of [...listeners]) l();
  };

  /** A full recalculation with everything held now, including the latest traffic. */
  const recalculate = (nowMs: number): void => {
    publish({ view: calculate({ pack, nowMs, metar, taf, windowChoice, currentMode, feed }), feed, displayNowMs: nowMs });
  };

  const runPoll = async (): Promise<void> => {
    try {
      const result = await fetchFeed({ fetch: deps.fetch, now: deps.now });
      if (!running) return;
      const now = deps.now();
      feed = applyFeedResult(feed, result, now);
      // The traffic shown moves on; the plan inside the view is left exactly as calculated.
      publish({ view: { ...state.view, liveDemand: liveDemandFor(state.view, feed, now) }, feed, displayNowMs: now });
    } finally {
      pollInFlight = null;
    }
  };

  const poll = (): void => {
    if (pollInFlight !== null) return;
    pollInFlight = runPoll();
  };

  const tick = (): void => {
    const now = deps.now();
    if (needsRecalculation(state.view.calcNowMs, now)) recalculate(now);
    else publish({ ...state, displayNowMs: now });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      if (running) return;
      running = true;
      poll();
      pollTimer = deps.timers.setInterval(poll, pack.settings.vatsimPollSeconds * 1000);
      tickTimer = deps.timers.setInterval(tick, TICK_MS);
    },
    stop: () => {
      running = false;
      if (pollTimer !== null) deps.timers.clearInterval(pollTimer);
      if (tickTimer !== null) deps.timers.clearInterval(tickTimer);
      pollTimer = null;
      tickTimer = null;
    },
    settled: async () => {
      await pollInFlight;
    },
    refresh: () => {
      recalculate(deps.now());
      poll();
    },
    setWindowChoice: (choice) => {
      windowChoice = choice;
      recalculate(deps.now());
    },
    setCurrentMode: (id) => {
      currentMode = id;
      recalculate(deps.now());
    },
    applyMetar: (text) => {
      const now = deps.now();
      const applied = applyMetarText(text, pack, now);
      if (applied.report !== null) {
        metar = applied.report;
        recalculate(now);
      }
      return applied.outcome;
    },
    applyTaf: (text) => {
      const now = deps.now();
      const applied = applyTafText(text, pack, now);
      if (applied.report !== null) {
        taf = applied.report;
        recalculate(now);
      }
      return applied.outcome;
    },
  };
}

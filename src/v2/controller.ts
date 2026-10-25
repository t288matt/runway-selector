// The page's state and scheduling with no React in it (DESIGN section 4a,
// "Scheduler"). The clock, the timer functions and the network arrive as
// arguments, so every rule is testable with fakes. This is v2's own copy of the
// v1 data flow (v2 imports nothing from src/ui), cut down to what the answer
// screen needs: weather and VATSIM fetched on the pack's own intervals, the
// engine run, and the "I am on" mode.
//
// UP-1: the plan is recalculated ONLY on the 30-minute boundary, on a new
// METAR or TAF, on a current-mode change and on Refresh. A VATSIM poll updates
// the traffic shown and the freshness chip but never the plan: the plan keeps
// the traffic it was calculated with.
import type { AirportPack, FetchLike } from '../refdata';
import { loadCurrentMode, loadWindowChoice, recordCurrentMode, type CurrentModeRecord, type Store } from '../store';
import { fetchFeed } from '../traffic/fetchFeed';
import type { DecodedMetar, DecodedTaf } from '../weather';
import { fetchMetarText, fetchTafText, type WeatherFetchResult } from '../weather/fetchWeather';
import type { Clock } from './clock';
import { applyMetarText, applyTafText } from './model/apply';
import { applyFeedResult, calculate, defaultWindowFor, EMPTY_FEED, liveDemandFor, needsRecalculation, WINDOW_OPTIONS, type FeedState, type ViewData, type WindowChoice } from './model/dashboard';

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
  /** Where the current mode and the window are kept (per airport, AG-8). */
  readonly store: Store;
}

/** The two reports the page fetches by itself (OD-37). */
export type WeatherKind = 'metar' | 'taf';

/** How the last automatic fetch of one report went. */
export interface AutoReportState {
  /** Why the last automatic fetch failed or was refused, or null. The report in use is unchanged. */
  readonly error: string | null;
  /** True once a fetched report has been accepted. */
  readonly fetched: boolean;
}

export const NO_AUTO_REPORT: AutoReportState = { error: null, fetched: false };
export const NO_AUTO_WEATHER: Readonly<Record<WeatherKind, AutoReportState>> = { metar: NO_AUTO_REPORT, taf: NO_AUTO_REPORT };

/** Tick for ages and the now marker, and the check for the 30-minute boundary. */
export const TICK_MS = 60_000;

export interface ControllerState {
  readonly view: ViewData;
  readonly feed: FeedState;
  readonly displayNowMs: number;
  /** The stored current mode (with its set time), or null. */
  readonly currentModeRecord: CurrentModeRecord | null;
  /** Messages about stored values that were cleared or discarded; each is shown until dismissed. */
  readonly notices: readonly string[];
  readonly autoWeather: Readonly<Record<WeatherKind, AutoReportState>>;
}

export interface Controller {
  readonly getState: () => ControllerState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Starts the first poll and the timers. Safe to call again after stop. */
  readonly start: () => void;
  /** Cancels the timers; a poll still in flight is ignored when it ends. */
  readonly stop: () => void;
  /** Resolves when the poll in flight (if any) has finished; for tests. */
  readonly settled: () => Promise<void>;
  readonly refresh: () => void;
  readonly setCurrentMode: (id: string | null) => void;
  readonly dismissNotice: (index: number) => void;
}

export function createController(deps: ControllerDeps): Controller {
  const { pack, store } = deps;
  const windowIds = WINDOW_OPTIONS.map((o) => o.id);
  let metar: DecodedMetar | null = null;
  let taf: DecodedTaf | null = null;
  let feed: FeedState = EMPTY_FEED;
  let running = false;
  let pollInFlight: Promise<void> | null = null;
  let weatherInFlight: Promise<void> | null = null;
  let auto: Record<WeatherKind, AutoReportState> = { ...NO_AUTO_WEATHER };
  let pollTimer: unknown = null;
  let weatherTimer: unknown = null;
  let tickTimer: unknown = null;
  let notices: string[] = [];
  const listeners = new Set<() => void>();

  const notify = (message: string | null): void => {
    if (message !== null && !notices.includes(message)) notices = [...notices, message];
  };

  // Stored state is read once, here (OD-30). A value that was cleared or discarded is reported once (SEC-3).
  const storedMode = loadCurrentMode(store, pack);
  notify(storedMode.message);
  let record: CurrentModeRecord | null = storedMode.record;
  const storedWindow = loadWindowChoice(store, pack.airport.icao, windowIds);
  notify(storedWindow.message);
  const windowChoice: WindowChoice = (storedWindow.choice as WindowChoice | null) ?? defaultWindowFor(pack);

  const currentModeId = (): string | null => record?.modeId ?? null;

  const first = deps.now();
  const build = (view: ViewData, displayNowMs: number): ControllerState => ({ view, feed, displayNowMs, currentModeRecord: record, notices, autoWeather: auto });
  let state: ControllerState = build(calculate({ pack, nowMs: first, metar, taf, windowChoice, currentMode: currentModeId(), feed }), first);

  const publish = (next: ControllerState): void => {
    state = next;
    for (const l of [...listeners]) l();
  };

  /** Publish the held view again with the current stored state (no recalculation). */
  const republish = (): void => publish(build(state.view, deps.now()));

  /** A full recalculation with everything held now, including the latest traffic. */
  const recalculate = (nowMs: number): void => {
    publish(build(calculate({ pack, nowMs, metar, taf, windowChoice, currentMode: currentModeId(), feed }), nowMs));
  };

  const runPoll = async (): Promise<void> => {
    try {
      const result = await fetchFeed({ fetch: deps.fetch, now: deps.now });
      if (!running) return;
      const now = deps.now();
      // The plan has no usable traffic when none had arrived or the last good fetch had expired (vatsimStaleMinutes):
      // the first good fetch after that recalculates once, so the plan does not wait for the half-hour. Later polls do not (UP-1).
      const hadUsable = feed.fetchedAtMs !== null && now - feed.fetchedAtMs <= pack.settings.vatsimStaleMinutes * 60_000;
      feed = applyFeedResult(feed, result, now);
      if (result.ok && !hadUsable) {
        recalculate(now);
        return;
      }
      // The traffic shown moves on; the plan inside the view is left exactly as calculated.
      publish(build({ ...state.view, liveDemand: liveDemandFor(state.view, feed, now) }, now));
    } catch (e) {
      // A failure while handling the answer is shown as a failed fetch, like any other (UP-3): the last traffic is kept.
      if (running) {
        const now = deps.now();
        feed = applyFeedResult(feed, { ok: false, error: { kind: 'invalid', message: e instanceof Error ? e.message : 'unknown error' } }, now);
        publish(build(state.view, now));
      }
    }
  };

  const poll = (): void => {
    if (pollInFlight !== null) return;
    // Cleared when it ends, even if it ended before this line ran (a synchronous throw), so polling never sticks.
    const p: Promise<void> = runPoll().finally(() => {
      if (pollInFlight === p) pollInFlight = null;
    });
    pollInFlight = p;
  };

  const setAuto = (kind: WeatherKind, change: Partial<AutoReportState>): void => {
    auto = { ...auto, [kind]: { ...auto[kind], ...change } };
  };

  /**
   * One automatic fetch of one report. The text goes through the same checks as
   * pasted text (applyMetarText, applyTafText). A failure or a refusal keeps the
   * report in use and records why. Returns true when the report in use changed.
   */
  const fetchOneUnguarded = async (kind: WeatherKind): Promise<boolean> => {
    const station = pack.airport.weatherStation;
    const fetched: WeatherFetchResult = await (kind === 'metar' ? fetchMetarText : fetchTafText)(station, { fetch: deps.fetch });
    if (!running) return false;
    const label = kind === 'metar' ? 'METAR' : 'TAF';
    if (!fetched.ok) {
      setAuto(kind, { error: fetched.message });
      return false;
    }
    const now = deps.now();
    const applied = kind === 'metar' ? applyMetarText(fetched.text, pack, now) : applyTafText(fetched.text, pack, now);
    if (applied.report === null) {
      setAuto(kind, { error: `The fetched ${label} was refused. ${applied.outcome.message ?? ''}`.trim() });
      return false;
    }
    const unchanged = (kind === 'metar' ? metar?.raw : taf?.raw) === applied.report.raw && auto[kind].fetched;
    if (kind === 'metar') metar = applied.report as DecodedMetar;
    else taf = applied.report as DecodedTaf;
    setAuto(kind, { error: null, fetched: true });
    return !unchanged;
  };

  /** A throw while handling one report is that report's failure; the other report is not lost. */
  const fetchOne = async (kind: WeatherKind): Promise<boolean> => {
    try {
      return await fetchOneUnguarded(kind);
    } catch (e) {
      if (running) setAuto(kind, { error: e instanceof Error ? e.message : 'unknown error' });
      return false;
    }
  };

  const runWeatherPoll = async (): Promise<void> => {
    try {
      const changed = await Promise.all((['metar', 'taf'] as const).map(fetchOne));
      if (!running) return;
      // A new METAR or TAF recalculates the plan (UP-1); an unchanged one, or a failure, only updates what is shown about the fetch.
      if (changed.some(Boolean)) recalculate(deps.now());
      else republish();
    } catch (e) {
      // A failure while handling a report is shown as a failed fetch of that report; the report in use is unchanged.
      if (running) {
        const message = e instanceof Error ? e.message : 'unknown error';
        for (const kind of ['metar', 'taf'] as const) if (auto[kind].error === null) setAuto(kind, { error: message });
        republish();
      }
    }
  };

  const pollWeather = (): void => {
    if (weatherInFlight !== null) return;
    const p: Promise<void> = runWeatherPoll().finally(() => {
      if (weatherInFlight === p) weatherInFlight = null;
    });
    weatherInFlight = p;
  };

  const tick = (): void => {
    const now = deps.now();
    if (needsRecalculation(state.view.calcNowMs, now)) recalculate(now);
    else publish(build(state.view, now));
  };

  const startTimers = (): void => {
    pollTimer = deps.timers.setInterval(poll, pack.settings.vatsimPollSeconds * 1000);
    weatherTimer = deps.timers.setInterval(pollWeather, pack.settings.weatherPollMinutes * 60_000);
    tickTimer = deps.timers.setInterval(tick, TICK_MS);
  };
  const stopTimers = (): void => {
    if (pollTimer !== null) deps.timers.clearInterval(pollTimer);
    if (weatherTimer !== null) deps.timers.clearInterval(weatherTimer);
    if (tickTimer !== null) deps.timers.clearInterval(tickTimer);
    pollTimer = null;
    weatherTimer = null;
    tickTimer = null;
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
      pollWeather();
      startTimers();
    },
    stop: () => {
      running = false;
      stopTimers();
    },
    settled: async () => {
      await pollInFlight;
      await weatherInFlight;
    },
    refresh: () => {
      recalculate(deps.now());
      poll();
      pollWeather();
    },
    setCurrentMode: (id) => {
      const now = deps.now();
      const change = recordCurrentMode(store, pack, now, id);
      notify(change.message);
      record = change.record;
      if (change.changed) recalculate(now);
      else republish();
    },
    dismissNotice: (index) => {
      notices = notices.filter((_n, i) => i !== index);
      republish();
    },
  };
}

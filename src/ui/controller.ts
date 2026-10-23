// The page's state and scheduling with no React in it (DESIGN section 4a,
// "Scheduler"). The clock, the timer functions and the network arrive as
// arguments, so every rule is testable with fakes.
//
// UP-1: the plan is recalculated ONLY on the 30-minute boundary, on a new
// METAR or TAF, on a current-mode change, on a window change and on Refresh.
// A VATSIM poll updates the traffic shown (Panel D) and the freshness chip but
// never the plan: the plan keeps the traffic it was calculated with.
import { reloadPack, type AirportPack, type FetchLike } from '../refdata';
import { clearAudit, confirmCurrentMode, exportAudit, loadAudit, loadCurrentMode, loadWindowChoice, recordCurrentMode, recordForecastWindow, type AuditEntry, type AuditExport, type CurrentModeRecord, type Store } from '../store';
import { fetchFeed } from '../traffic/fetchFeed';
import type { DecodedMetar, DecodedTaf } from '../weather';
import { cacheBustToken, type Clock } from './clock';
import type { ApplyOutcome } from './components/WeatherEntry';
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
  /** Where the current mode, the window and the audit trail are kept (per airport, AG-8). */
  readonly store: Store;
  /** Where the pack is served from, for Reload data; defaults to ./refdata. */
  readonly baseUrl?: string;
}

/** What Reload data last did (DESIGN section 4c, "Editing a pack while the app is open"). */
export interface ReloadState {
  readonly status: 'idle' | 'busy' | 'changed' | 'unchanged' | 'refused';
  /** The precise message when refused, else a short result line; plain text. */
  readonly message: string | null;
}

/** Tick for ages and the now marker, and the check for the 30-minute boundary. */
export const TICK_MS = 60_000;

export interface ControllerState {
  readonly view: ViewData;
  readonly feed: FeedState;
  readonly displayNowMs: number;
  /** The stored current mode (with its set time), or null. */
  readonly currentModeRecord: CurrentModeRecord | null;
  /** The audit trail, oldest first, as stored. */
  readonly audit: readonly AuditEntry[];
  /** Messages about stored values that were cleared or discarded; each is shown until dismissed. */
  readonly notices: readonly string[];
  readonly reload: ReloadState;
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
  /** The mode is still current: renew its set time. No audit entry, no recalculation. */
  readonly confirmCurrentMode: () => void;
  /** Re-read and re-validate the pack. A refused pack leaves the previous one in use. */
  readonly reloadPack: () => Promise<void>;
  readonly clearAudit: () => void;
  /** The audit file text and name; the screen turns it into a download after a click. */
  readonly exportAudit: () => AuditExport;
  readonly dismissNotice: (index: number) => void;
  readonly applyMetar: (text: string) => ApplyOutcome;
  readonly applyTaf: (text: string) => ApplyOutcome;
}

export function createController(deps: ControllerDeps): Controller {
  let pack = deps.pack;
  const { store } = deps;
  const windowIds = WINDOW_OPTIONS.map((o) => o.id);
  let metar: DecodedMetar | null = null;
  let taf: DecodedTaf | null = null;
  let feed: FeedState = EMPTY_FEED;
  let running = false;
  let generation = 0;
  let pollInFlight: Promise<void> | null = null;
  let pollTimer: unknown = null;
  let tickTimer: unknown = null;
  let notices: string[] = [];
  let reload: ReloadState = { status: 'idle', message: null };
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
  let windowChoice: WindowChoice = (storedWindow.choice as WindowChoice | null) ?? defaultWindowFor(pack);
  const storedAudit = loadAudit(store, pack.airport.icao, pack.settings.auditMaxEntries);
  notify(storedAudit.message);
  let audit: readonly AuditEntry[] = storedAudit.entries;

  const currentModeId = (): string | null => record?.modeId ?? null;

  const first = deps.now();
  const build = (view: ViewData, displayNowMs: number): ControllerState => ({ view, feed, displayNowMs, currentModeRecord: record, audit, notices, reload });
  let state: ControllerState = build(calculate({ pack, nowMs: first, metar, taf, windowChoice, currentMode: currentModeId(), feed }), first);

  const publish = (next: ControllerState): void => {
    state = next;
    for (const l of [...listeners]) l();
  };

  /** Publish the held view again with the current stored state (no recalculation). */
  const republish = (): void => publish(build(state.view, state.displayNowMs));

  /** A full recalculation with everything held now, including the latest traffic. */
  const recalculate = (nowMs: number): void => {
    publish(build(calculate({ pack, nowMs, metar, taf, windowChoice, currentMode: currentModeId(), feed }), nowMs));
  };

  const refreshAudit = (): void => {
    const loaded = loadAudit(store, pack.airport.icao, pack.settings.auditMaxEntries);
    audit = loaded.entries;
    notify(loaded.message);
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
    else publish(build(state.view, now));
  };

  const startTimers = (): void => {
    pollTimer = deps.timers.setInterval(poll, pack.settings.vatsimPollSeconds * 1000);
    tickTimer = deps.timers.setInterval(tick, TICK_MS);
  };
  const stopTimers = (): void => {
    if (pollTimer !== null) deps.timers.clearInterval(pollTimer);
    if (tickTimer !== null) deps.timers.clearInterval(tickTimer);
    pollTimer = null;
    tickTimer = null;
  };

  const setReload = (next: ReloadState): void => {
    reload = next;
    republish();
  };

  const doReload = async (): Promise<void> => {
    if (reload.status === 'busy') return;
    const started = generation;
    setReload({ status: 'busy', message: null });
    const result = await reloadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()) }, pack);
    if (started !== generation) return;
    if (!result.ok) {
      // The previous valid pack stays in use, with the precise message on screen.
      setReload({ status: 'refused', message: result.message });
      return;
    }
    if (JSON.stringify(result.pack) === JSON.stringify(pack)) {
      setReload({ status: 'unchanged', message: 'The airport data was re-read and has not changed.' });
      return;
    }
    const pollChanged = result.pack.settings.vatsimPollSeconds !== pack.settings.vatsimPollSeconds;
    pack = result.pack;
    // A stored current mode that the new pack no longer enables is cleared, with a message (DESIGN section 4c).
    const reread = loadCurrentMode(store, pack);
    record = reread.record;
    notify(reread.message);
    refreshAudit();
    if (running && pollChanged) {
      stopTimers();
      startTimers();
    }
    reload = { status: 'changed', message: 'The airport data was re-read and has changed. The plan was recalculated.' };
    recalculate(deps.now());
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
      startTimers();
    },
    stop: () => {
      running = false;
      generation += 1;
      stopTimers();
    },
    settled: async () => {
      await pollInFlight;
    },
    refresh: () => {
      recalculate(deps.now());
      poll();
    },
    setWindowChoice: (choice) => {
      const now = deps.now();
      const change = recordForecastWindow(store, pack, now, choice, windowIds, defaultWindowFor(pack));
      notify(change.message);
      windowChoice = change.choice as WindowChoice;
      refreshAudit();
      recalculate(now);
    },
    setCurrentMode: (id) => {
      const now = deps.now();
      const change = recordCurrentMode(store, pack, now, id);
      notify(change.message);
      record = change.record;
      refreshAudit();
      if (change.changed) recalculate(now);
      else republish();
    },
    confirmCurrentMode: () => {
      const change = confirmCurrentMode(store, pack, deps.now());
      notify(change.message);
      record = change.record;
      republish();
    },
    reloadPack: doReload,
    clearAudit: () => {
      clearAudit(store, pack.airport.icao);
      audit = [];
      republish();
    },
    exportAudit: () => exportAudit(audit, pack.airport.icao, deps.now()),
    dismissNotice: (index) => {
      notices = notices.filter((_n, i) => i !== index);
      republish();
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

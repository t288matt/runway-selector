// The page's state and timers (DESIGN section 4a, "Scheduler"): the pasted
// reports, the current mode and window (React state only for now), the VATSIM
// poll, and the recalculation rule. The clock and the network arrive through
// `deps`, so nothing here reads a global.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AirportPack, FetchLike } from '../refdata';
import { fetchFeed } from '../traffic/fetchFeed';
import type { DecodedMetar, DecodedTaf } from '../weather';
import type { Clock } from './clock';
import type { ApplyOutcome } from './components/WeatherEntry';
import { applyMetarText, applyTafText } from './model/apply';
import { applyFeedResult, calculate, defaultWindowFor, EMPTY_FEED, needsRecalculation, type FeedState, type ViewData, type WindowChoice } from './model/dashboard';

export interface AppDeps {
  readonly fetch: FetchLike;
  readonly now: Clock;
  /** Where the pack is served from; defaults to ./refdata. */
  readonly baseUrl?: string;
}

/** Tick for ages and the now marker. Recalculation is by rule (needsRecalculation), not by this period. */
export const TICK_MS = 60_000;

export interface DashboardState {
  readonly view: ViewData;
  readonly feed: FeedState;
  readonly displayNowMs: number;
  readonly drawerOpen: boolean;
  readonly setDrawerOpen: (open: boolean) => void;
  readonly refresh: () => void;
  readonly setWindowChoice: (choice: WindowChoice) => void;
  readonly setCurrentMode: (id: string | null) => void;
  readonly applyMetar: (text: string) => ApplyOutcome;
  readonly applyTaf: (text: string) => ApplyOutcome;
}

export function useDashboard(pack: AirportPack, deps: AppDeps): DashboardState {
  const [metar, setMetar] = useState<DecodedMetar | null>(null);
  const [taf, setTaf] = useState<DecodedTaf | null>(null);
  const [windowChoice, setWindowChoiceState] = useState<WindowChoice>(() => defaultWindowFor(pack));
  const [currentMode, setCurrentModeState] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>(EMPTY_FEED);
  const [calcNow, setCalcNow] = useState<number>(() => deps.now());
  const [tick, setTick] = useState<number>(() => deps.now());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);

  // A minute tick for the ages and the now marker; the plan is recalculated every 30 minutes on the clock half-hour.
  useEffect(() => {
    const id = setInterval(() => {
      const now = deps.now();
      setTick(now);
      setCalcNow((previous) => (needsRecalculation(previous, now) ? now : previous));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [deps]);

  const poll = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await fetchFeed({ fetch: deps.fetch, now: deps.now });
      if (!alive.current) return;
      const now = deps.now();
      setFeed((previous) => applyFeedResult(previous, result, now));
      if (result.ok) setCalcNow(now);
    } finally {
      inFlight.current = false;
    }
  }, [deps]);

  useEffect(() => {
    alive.current = true;
    void poll();
    const id = setInterval(() => void poll(), pack.settings.vatsimPollSeconds * 1000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [poll, pack.settings.vatsimPollSeconds]);

  const view = useMemo(() => calculate({ pack, nowMs: calcNow, metar, taf, windowChoice, currentMode, feed }), [pack, calcNow, metar, taf, windowChoice, currentMode, feed]);

  const applyMetar = useCallback(
    (text: string): ApplyOutcome => {
      const now = deps.now();
      const applied = applyMetarText(text, pack, now);
      if (applied.report !== null) {
        setMetar(applied.report);
        setCalcNow(now);
        setTick(now);
      }
      return applied.outcome;
    },
    [deps, pack],
  );

  const applyTaf = useCallback(
    (text: string): ApplyOutcome => {
      const now = deps.now();
      const applied = applyTafText(text, pack, now);
      if (applied.report !== null) {
        setTaf(applied.report);
        setCalcNow(now);
        setTick(now);
      }
      return applied.outcome;
    },
    [deps, pack],
  );

  return {
    view,
    feed,
    displayNowMs: tick,
    drawerOpen,
    setDrawerOpen,
    refresh: () => {
      const now = deps.now();
      setTick(now);
      setCalcNow(now);
      void poll();
    },
    setWindowChoice: (choice) => {
      setWindowChoiceState(choice);
      setCalcNow(deps.now());
    },
    setCurrentMode: (id) => {
      setCurrentModeState(id);
      setCalcNow(deps.now());
    },
    applyMetar,
    applyTaf,
  };
}

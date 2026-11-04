// The v2 shell: load the pack from static JSON, then show the screen. An
// invalid pack gives a full-screen error and nothing else is drawn (DESIGN
// section 4c, "First load"). This is v2's own copy of the v1 shell logic; v2
// imports nothing from src/ui.
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadPack, type AirportPack, type AppGroup } from '../refdata';
import { clearSelectedAirport, loadSelectedAirportId, saveSavedPack, saveSelectedAirport } from '../store';
import { cacheBustToken } from './clock';
import { Dashboard } from './components/Dashboard';
import { Drawer } from './components/Drawer';
import { DrawerContent } from './components/DrawerContent';
import { APP_TITLE, Header } from './components/Header';
import { Notice } from './components/Notice';
import { SummaryScreen } from './components/SummaryScreen';
import type { AppDeps } from './deps';
import { screenModel } from './model/screen';
import { afterSwitch, hashToShow, parseRoute } from './route';
import { sameAsShown, savedPackFor, type SavedPack } from './savedPack';
import { useController } from './useController';

export type { AppDeps } from './deps';

export type PackState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  /** `airports` is the list in app.json and `groups` its optional summary groups; a refused airport switch leaves the pack in use and sets `airportError`. */
  | {
      readonly status: 'ready';
      readonly pack: AirportPack;
      readonly airports: readonly string[];
      readonly groups?: readonly AppGroup[] | undefined;
      readonly airportError: string | null;
    };

export function PackError({ message }: { message: string }) {
  return (
    <main className="fatal" role="alert">
      <h1>The airport data could not be loaded</h1>
      <p>The planner cannot run without a valid airport pack, so nothing else is shown.</p>
      <pre>{message}</pre>
    </main>
  );
}

export function Loading() {
  return (
    <div className="app">
      <header className="bar">
        <h1>{APP_TITLE}</h1>
      </header>
      <p role="status" className="loading">
        Loading the airport pack and the VATSIM feed
      </p>
      <footer className="trust">
        <Notice pack={null} />
      </footer>
    </div>
  );
}

interface AirportSwitch {
  readonly airports: readonly string[];
  readonly airportError: string | null;
  /** The airport chosen in the selector whose pack is still being fetched, or null. */
  readonly pending: string | null;
  readonly onSwitch: (icao: string) => void;
}

function Screen({
  pack,
  deps,
  airport,
  detailOpen,
  onToggleDetail,
}: {
  pack: AirportPack;
  deps: AppDeps;
  airport: AirportSwitch;
  detailOpen: boolean;
  onToggleDetail: (open: boolean) => void;
}) {
  const screen = useController(pack, deps);
  const model = screenModel(screen);
  // Reload data can replace the pack the controller holds, so the screen reads it from the calculation, not from the prop.
  const livePack = screen.view.pack;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="app" inert={moreOpen}>
        <Header
          icao={livePack.airport.icao}
          airports={airport.airports}
          pending={airport.pending}
          airportError={airport.airportError}
          onSwitch={airport.onSwitch}
          now={deps.now}
          moreOpen={moreOpen}
          onMore={() => setMoreOpen(true)}
          moreRef={moreRef}
        />
        <Dashboard model={model} pack={livePack} onDismissNotice={screen.dismissNotice} detailOpen={detailOpen} onToggleDetail={onToggleDetail} />
      </div>
      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} returnFocusTo={moreRef}>
        <DrawerContent
          bridge={{
            view: screen.view,
            displayNowMs: screen.displayNowMs,
            auto: screen.autoWeather,
            reload: screen.reload,
            audit: screen.audit,
            onApplyMetar: screen.applyMetar,
            onApplyTaf: screen.applyTaf,
            onResume: screen.resumeAutomatic,
            onReload: () => void screen.reloadPack(),
            onClearAudit: screen.clearAudit,
            onExportAudit: screen.exportAudit,
          }}
        />
      </Drawer>
    </>
  );
}

/** Keeps a calculation failure from blanking the page without a word. */
class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : 'unknown error' };
  }
  render(): ReactNode {
    if (this.state.error !== null) return <PackError message={`The screen could not be calculated: ${this.state.error}`} />;
    return this.props.children;
  }
}

/** What the page shows for each load state. An invalid pack gives the error and nothing else. */
export function AppBody({
  state,
  deps,
  onSwitchAirport = () => undefined,
  pendingAirport = null,
  detailOpen = false,
  onToggleDetail = () => undefined,
}: {
  state: PackState;
  deps: AppDeps;
  onSwitchAirport?: (icao: string) => void;
  pendingAirport?: string | null;
  detailOpen?: boolean;
  onToggleDetail?: (open: boolean) => void;
}) {
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <PackError message={state.message} />;
  return (
    <Boundary key={state.pack.airport.icao}>
      <Screen
        pack={state.pack}
        deps={deps}
        airport={{
          airports: state.airports,
          airportError: state.airportError,
          pending: pendingAirport,
          onSwitch: onSwitchAirport,
        }}
        detailOpen={detailOpen}
        onToggleDetail={onToggleDetail}
      />
    </Boundary>
  );
}

/** True when app.json lists at least one group with an airport, so the summary has something to show. */
export function hasGroups(groups: readonly AppGroup[] | undefined): groups is readonly AppGroup[] {
  return groups !== undefined && groups.some((g) => g.airports.length > 0);
}

type ReadyState = Extract<PackState, { status: 'ready' }>;

/**
 * What choosing an airport changes, or null when nothing does. Only airports with a reviewed pack listed in app.json
 * can be shown: any other code is refused here and nothing is generated or fetched for it (OD-5, RD-2).
 */
export async function switchAirportTo(current: ReadyState, icao: string, deps: AppDeps): Promise<Partial<ReadyState> | null> {
  if (icao === current.pack.airport.icao) return current.airportError === null ? null : { airportError: null };
  if (!current.airports.includes(icao)) return { airportError: `No data pack for ${icao} yet. Available: ${current.airports.join(', ')}.` };
  const r = await loadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()), airportId: icao });
  if (!r.ok) return { airportError: `The airport could not be changed; the current one stays in use. ${r.message}` };
  saveSavedPack(deps.store, r.raw, deps.now());
  return { pack: r.pack, airports: r.app.airports, groups: r.app.groups, airportError: null };
}

/**
 * Loads the pack for `airportId` (the default when undefined). If that specific airport fails to load (its pack was
 * withdrawn, or its files are invalid) while the default was not what was asked for, the stored choice is forgotten
 * and the default is tried instead, so a stale or removed stored airport cannot turn into a blank error screen.
 */
export async function loadInitialPack(deps: AppDeps, airportId: string | undefined): Promise<Awaited<ReturnType<typeof loadPack>>> {
  const r = await loadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()), airportId });
  if (r.ok) {
    saveSavedPack(deps.store, r.raw, deps.now(), airportId === undefined);
    return r;
  }
  if (airportId === undefined) return r;
  clearSelectedAirport(deps.store);
  const fallback = await loadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()) });
  if (fallback.ok) saveSavedPack(deps.store, fallback.raw, deps.now(), true);
  return fallback;
}

const readyFrom = (r: { readonly pack: AirportPack; readonly app: { readonly airports: readonly string[]; readonly groups?: readonly AppGroup[] | undefined } }): ReadyState => ({
  status: 'ready',
  pack: r.pack,
  airports: r.app.airports,
  groups: r.app.groups,
  airportError: null,
});

/** The state the page starts in: the saved pack when there is a valid one, else loading (issue 183). */
export function initialPackState(saved: SavedPack | null): PackState {
  return saved === null ? { status: 'loading' } : readyFrom(saved);
}

/**
 * What the screen becomes when the first fresh load settles. With a saved copy on screen, a failed fresh load changes
 * nothing (no error), the operator's own switch of airport since the start stands, and an unchanged pack keeps the
 * same state object so nothing redraws. Without one, today's behaviour: the pack, or the full-screen error.
 */
export function afterFreshInitial(prev: PackState, startedOn: SavedPack | null, r: Awaited<ReturnType<typeof loadPack>>): PackState {
  if (!r.ok) return startedOn === null ? { status: 'error', message: r.message } : prev;
  if (prev.status === 'ready' && startedOn !== null && prev.pack.airport.icao !== startedOn.pack.airport.icao) return prev;
  const next = readyFrom(r);
  return prev.status === 'ready' && sameAsShown(prev, next) ? prev : next;
}

/** The change for choosing `icao` when a valid saved copy of it exists (shown at once, the fresh fetch still follows), or null. */
export function switchFromSaved(current: ReadyState, icao: string, deps: AppDeps): Partial<ReadyState> | null {
  if (icao === current.pack.airport.icao || !current.airports.includes(icao)) return null;
  const saved = savedPackFor(deps, icao);
  return saved === null ? null : readyFrom(saved);
}

/** The state once the fresh pack for a switch that was shown from a saved copy arrives. A failure, a switch away since, or the same pack changes nothing. */
export function afterFreshSwitch(prev: PackState, icao: string, change: Partial<ReadyState> | null): PackState {
  if (change?.pack === undefined || prev.status !== 'ready' || prev.pack.airport.icao !== icao) return prev;
  const next = { ...prev, ...change };
  return sameAsShown(prev, next) ? prev : next;
}

export function App({ deps }: { deps: AppDeps }) {
  // A deep link (#/ICAO or #/ICAO/detail, owner, 29-10-2026) takes the airport straight to the one it names; failing
  // that a refresh opens on the airport last chosen in the selector, not back at the default (OD-82). Either id is
  // shape-checked only, so loadInitialPack above falls back if it is no longer offered.
  const [initialRoute] = useState(() => parseRoute(window.location.hash));
  // A valid saved copy under 24 hours old is shown at once (issue 183); the fresh fetch below still always runs.
  const [savedAtStart] = useState(() => savedPackFor(deps, initialRoute.icao ?? loadSelectedAirportId(deps.store) ?? undefined));
  const [state, setState] = useState<PackState>(() => initialPackState(savedAtStart));
  const [detailOpen, setDetailOpen] = useState(initialRoute.detail);
  useEffect(() => {
    let live = true;
    void loadInitialPack(deps, initialRoute.icao ?? loadSelectedAirportId(deps.store) ?? undefined).then((r) => {
      if (live) setState((prev) => afterFreshInitial(prev, savedAtStart, r));
    });
    return () => {
      live = false;
    };
  }, [deps, initialRoute, savedAtStart]);
  // Switching airport builds a new screen with its own controller: nothing of the old airport is carried over, and its
  // stored state stays under its own code (AG-8). A refused switch keeps the current airport. While the new pack is
  // fetched the selector shows the choice and says it is loading.
  const [pendingAirport, setPendingAirport] = useState<string | null>(null);
  const switchAirportRef = useRef<(icao: string) => Promise<boolean>>(() => Promise.resolve(false));
  /** Resolves true when the airport changed or was already the one shown; false when the switch failed, was refused or was skipped because another is pending. */
  const switchAirport = (icao: string): Promise<boolean> => {
    if (state.status !== 'ready' || pendingAirport !== null) return Promise.resolve(false);
    // A valid saved copy of the airport asked for is shown at once; the fresh fetch still runs and is swapped in silently (issue 183).
    const saved = switchFromSaved(state, icao, deps);
    if (saved !== null) {
      saveSelectedAirport(deps.store, icao);
      setState((prev) => (prev.status === 'ready' ? { ...prev, ...saved } : prev));
      void switchAirportTo(state, icao, deps).then((change) => setState((prev) => afterFreshSwitch(prev, icao, change)));
      return Promise.resolve(true);
    }
    if (icao !== state.pack.airport.icao && state.airports.includes(icao)) setPendingAirport(icao);
    const alreadyShown = icao === state.pack.airport.icao;
    return switchAirportTo(state, icao, deps)
      .then((change) => {
        if (change === null) return true;
        if (change.pack !== undefined) saveSelectedAirport(deps.store, icao);
        setState((prev) => (prev.status === 'ready' ? { ...prev, ...change } : prev));
        return alreadyShown || change.pack !== undefined;
      })
      .finally(() => setPendingAirport(null));
  };
  // The latest values for the popstate listener, which is registered once.
  const stateRef = useRef(state);
  const detailRef = useRef(detailOpen);
  useEffect(() => {
    switchAirportRef.current = switchAirport;
    stateRef.current = state;
    detailRef.current = detailOpen;
  });

  // Keeps the hash in step with what is on screen, so the address bar is always a working link back to this view
  // (owner, 29-10-2026). The very first run, and a run caused by the browser's own Back/Forward, must not push a
  // new history entry: skipNextPush covers both.
  const icao = state.status === 'ready' ? state.pack.airport.icao : null;
  // The summary (#/summary) is a view of its own: while it shows, the hash is left alone. It needs groups in app.json;
  // without them #/summary opens the airport screen like any other hash.
  const [wantSummary, setWantSummary] = useState(initialRoute.summary);
  // #/summary2 is the same screen with larger boxes: only this size changes between the two, so the summary stays mounted.
  const [summarySize, setSummarySize] = useState<'compact' | 'large'>(initialRoute.large ? 'large' : 'compact');
  const summaryShown = wantSummary && state.status === 'ready' && hasGroups(state.groups);
  const skipNextPush = useRef(true);
  useEffect(() => {
    if (icao === null || summaryShown) return;
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    const target = hashToShow(window.location.hash, icao, detailOpen);
    if (target !== null) window.history.pushState(null, '', target);
  }, [icao, detailOpen, summaryShown]);

  // #/summary without groups in app.json shows the airport screen: the address bar must say so too.
  const noGroups = state.status === 'ready' && !hasGroups(state.groups);
  useEffect(() => {
    if (!wantSummary || !noGroups || icao === null) return;
    const target = hashToShow(window.location.hash, icao, detailOpen);
    if (target !== null) window.history.replaceState(null, '', target);
  }, [wantSummary, noGroups, icao, detailOpen]);

  useEffect(() => {
    const onPopState = (): void => {
      const route = parseRoute(window.location.hash);
      if (route.summary) {
        setSummarySize(route.large ? 'large' : 'compact');
        setWantSummary(true);
        return;
      }
      skipNextPush.current = true;
      setDetailOpen(route.detail);
      // Leave the summary once the airport asked for is ready, so the airport last shown does not flash first. The hash
      // is read again when the switch settles: the user may have gone back to the summary meanwhile.
      if (route.icao === null) setWantSummary(false);
      else {
        void switchAirportRef.current(route.icao).then((switched) => {
          const shown = stateRef.current;
          const next = afterSwitch(window.location.hash, switched, { icao: shown.status === 'ready' ? shown.pack.airport.icao : (route.icao as string), detail: detailRef.current });
          if (next.leaveSummary) setWantSummary(false);
          if (next.replaceHash !== null) window.history.replaceState(null, '', next.replaceHash);
        });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (summaryShown && state.status === 'ready' && hasGroups(state.groups)) return <SummaryScreen groups={state.groups} deps={deps} size={summarySize} />;
  return <AppBody state={state} deps={deps} onSwitchAirport={(icao) => void switchAirport(icao)} pendingAirport={pendingAirport} detailOpen={detailOpen} onToggleDetail={setDetailOpen} />;
}

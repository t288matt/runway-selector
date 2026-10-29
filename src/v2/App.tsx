// The v2 shell: load the pack from static JSON, then show the screen. An
// invalid pack gives a full-screen error and nothing else is drawn (DESIGN
// section 4c, "First load"). This is v2's own copy of the v1 shell logic; v2
// imports nothing from src/ui.
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadPack, type AirportPack } from '../refdata';
import { clearSelectedAirport, loadSelectedAirportId, saveSelectedAirport } from '../store';
import { cacheBustToken } from './clock';
import { Dashboard } from './components/Dashboard';
import { Drawer } from './components/Drawer';
import { DrawerContent } from './components/DrawerContent';
import { APP_TITLE, Header } from './components/Header';
import { Notice } from './components/Notice';
import type { AppDeps } from './deps';
import { screenModel } from './model/screen';
import { buildRoute, parseRoute } from './route';
import { useController } from './useController';

export type { AppDeps } from './deps';

export type PackState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  /** `airports` is the list in app.json; a refused airport switch leaves the pack in use and sets `airportError`. */
  | { readonly status: 'ready'; readonly pack: AirportPack; readonly airports: readonly string[]; readonly airportError: string | null };

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
        airport={{ airports: state.airports, airportError: state.airportError, pending: pendingAirport, onSwitch: onSwitchAirport }}
        detailOpen={detailOpen}
        onToggleDetail={onToggleDetail}
      />
    </Boundary>
  );
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
  return { pack: r.pack, airports: r.app.airports, airportError: null };
}

/**
 * Loads the pack for `airportId` (the default when undefined). If that specific airport fails to load (its pack was
 * withdrawn, or its files are invalid) while the default was not what was asked for, the stored choice is forgotten
 * and the default is tried instead, so a stale or removed stored airport cannot turn into a blank error screen.
 */
export async function loadInitialPack(deps: AppDeps, airportId: string | undefined): Promise<Awaited<ReturnType<typeof loadPack>>> {
  const r = await loadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()), airportId });
  if (r.ok || airportId === undefined) return r;
  clearSelectedAirport(deps.store);
  return loadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()) });
}

export function App({ deps }: { deps: AppDeps }) {
  const [state, setState] = useState<PackState>({ status: 'loading' });
  // A deep link (#/ICAO or #/ICAO/detail, owner, 29-10-2026) takes the airport straight to the one it names; failing
  // that a refresh opens on the airport last chosen in the selector, not back at the default (OD-82). Either id is
  // shape-checked only, so loadInitialPack above falls back if it is no longer offered.
  const [initialRoute] = useState(() => parseRoute(window.location.hash));
  const [detailOpen, setDetailOpen] = useState(initialRoute.detail);
  useEffect(() => {
    let live = true;
    void loadInitialPack(deps, initialRoute.icao ?? loadSelectedAirportId(deps.store) ?? undefined).then((r) => {
      if (live) setState(r.ok ? { status: 'ready', pack: r.pack, airports: r.app.airports, airportError: null } : { status: 'error', message: r.message });
    });
    return () => {
      live = false;
    };
  }, [deps, initialRoute]);
  // Switching airport builds a new screen with its own controller: nothing of the old airport is carried over, and its
  // stored state stays under its own code (AG-8). A refused switch keeps the current airport. While the new pack is
  // fetched the selector shows the choice and says it is loading.
  const [pendingAirport, setPendingAirport] = useState<string | null>(null);
  const switchAirportRef = useRef<(icao: string) => void>(() => undefined);
  const switchAirport = (icao: string): void => {
    if (state.status !== 'ready' || pendingAirport !== null) return;
    if (icao !== state.pack.airport.icao && state.airports.includes(icao)) setPendingAirport(icao);
    void switchAirportTo(state, icao, deps)
      .then((change) => {
        if (change === null) return;
        if (change.pack !== undefined) saveSelectedAirport(deps.store, icao);
        setState((prev) => (prev.status === 'ready' ? { ...prev, ...change } : prev));
      })
      .finally(() => setPendingAirport(null));
  };
  useEffect(() => {
    switchAirportRef.current = switchAirport;
  });

  // Keeps the hash in step with what is on screen, so the address bar is always a working link back to this view
  // (owner, 29-10-2026). The very first run, and a run caused by the browser's own Back/Forward, must not push a
  // new history entry: skipNextPush covers both.
  const icao = state.status === 'ready' ? state.pack.airport.icao : null;
  const skipNextPush = useRef(true);
  useEffect(() => {
    if (icao === null) return;
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    window.history.pushState(null, '', buildRoute(icao, detailOpen));
  }, [icao, detailOpen]);

  useEffect(() => {
    const onPopState = (): void => {
      const route = parseRoute(window.location.hash);
      skipNextPush.current = true;
      setDetailOpen(route.detail);
      if (route.icao !== null) switchAirportRef.current(route.icao);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return <AppBody state={state} deps={deps} onSwitchAirport={switchAirport} pendingAirport={pendingAirport} detailOpen={detailOpen} onToggleDetail={setDetailOpen} />;
}

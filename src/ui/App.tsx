// The application shell: load the pack from static JSON, then show the
// dashboard. An invalid pack gives a full-screen error and nothing else is
// drawn (DESIGN section 4c, "First load").
import { Component, useEffect, useState, type ReactNode } from 'react';
import { loadPack, type AirportPack } from '../refdata';
import { cacheBustToken } from './clock';
import { Dashboard } from './components/Dashboard';
import { NoticeBar } from './components/Frame';
import { useDashboard, type AppDeps } from './useDashboard';

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
    <div className="wrap">
      <header className="top">
        <h1>Runway Mode Planner</h1>
      </header>
      <p role="status" className="loading">Loading the airport pack and the VATSIM feed</p>
      <NoticeBar pack={null} />
    </div>
  );
}

interface AirportSwitch {
  readonly airports: readonly string[];
  readonly airportError: string | null;
  readonly onSwitch: (icao: string) => void;
}

function Screen({ pack, deps, airport }: { pack: AirportPack; deps: AppDeps; airport: AirportSwitch }) {
  const s = useDashboard(pack, deps);
  return (
    <Dashboard
      view={s.view}
      feed={s.feed}
      displayNowMs={s.displayNowMs}
      busy={false}
      drawerOpen={s.drawerOpen}
      onRefresh={s.refresh}
      onToggleDrawer={s.setDrawerOpen}
      onWindowChange={s.setWindowChoice}
      onCurrentMode={s.setCurrentMode}
      onApplyMetar={s.applyMetar}
      onApplyTaf={s.applyTaf}
      autoWeather={s.autoWeather}
      onResumeAutomatic={s.resumeAutomatic}
      settings={{
        currentModeRecord: s.currentModeRecord,
        audit: s.audit,
        reload: s.reload,
        airports: airport.airports,
        airportError: airport.airportError,
        notices: s.notices,
        onConfirmCurrent: s.confirmCurrentMode,
        onReload: s.reloadPack,
        onSwitchAirport: airport.onSwitch,
        onClearAudit: s.clearAudit,
        onExportAudit: s.exportAudit,
        onDismissNotice: s.dismissNotice,
      }}
    />
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
export function AppBody({ state, deps, onSwitchAirport = () => undefined }: { state: PackState; deps: AppDeps; onSwitchAirport?: (icao: string) => void }) {
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <PackError message={state.message} />;
  return (
    <Boundary key={state.pack.airport.icao}>
      <Screen pack={state.pack} deps={deps} airport={{ airports: state.airports, airportError: state.airportError, onSwitch: onSwitchAirport }} />
    </Boundary>
  );
}

type ReadyState = Extract<PackState, { status: 'ready' }>;

/**
 * What typing an airport code changes (OD-37), or null when nothing does. Only airports with a reviewed pack listed
 * in app.json can be shown: any other code is refused here and nothing is generated or fetched for it (OD-5, RD-2).
 */
export async function switchAirportTo(current: ReadyState, icao: string, deps: AppDeps): Promise<Partial<ReadyState> | null> {
  if (icao === current.pack.airport.icao) return current.airportError === null ? null : { airportError: null };
  if (!current.airports.includes(icao)) return { airportError: `No data pack for ${icao} yet. Available: ${current.airports.join(', ')}.` };
  const r = await loadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()), airportId: icao });
  if (!r.ok) return { airportError: `The airport could not be changed; the current one stays in use. ${r.message}` };
  return { pack: r.pack, airports: r.app.airports, airportError: null };
}

export function App({ deps }: { deps: AppDeps }) {
  const [state, setState] = useState<PackState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    void loadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()) }).then((r) => {
      if (live) setState(r.ok ? { status: 'ready', pack: r.pack, airports: r.app.airports, airportError: null } : { status: 'error', message: r.message });
    });
    return () => {
      live = false;
    };
  }, [deps]);
  // Switching airport builds a new screen with its own controller: nothing of the old airport (weather, traffic,
  // current mode) is carried over, and its stored state stays under its own code (AG-8). A refused switch keeps the current airport.
  const switchAirport = (icao: string): void => {
    if (state.status !== 'ready') return;
    void switchAirportTo(state, icao, deps).then((change) => {
      if (change !== null) setState((prev) => (prev.status === 'ready' ? { ...prev, ...change } : prev));
    });
  };
  return <AppBody state={state} deps={deps} onSwitchAirport={switchAirport} />;
}

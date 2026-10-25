// The v2 shell: load the pack from static JSON, then show the screen. An
// invalid pack gives a full-screen error and nothing else is drawn (DESIGN
// section 4c, "First load"). This is v2's own copy of the v1 shell logic; v2
// imports nothing from src/ui.
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadPack, type AirportPack } from '../refdata';
import { cacheBustToken } from './clock';
import { Drawer } from './components/Drawer';
import { APP_TITLE, Header } from './components/Header';
import { Notice } from './components/Notice';
import type { AppDeps } from './deps';

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

function Screen({ pack, deps, airport }: { pack: AirportPack; deps: AppDeps; airport: AirportSwitch }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="app" inert={moreOpen}>
        <Header
          icao={pack.airport.icao}
          airports={airport.airports}
          pending={airport.pending}
          airportError={airport.airportError}
          onSwitch={airport.onSwitch}
          now={deps.now}
          moreOpen={moreOpen}
          onMore={() => setMoreOpen(true)}
          moreRef={moreRef}
        />
        <main className="hero" aria-label="Runway mode recommendation" />
        <footer className="trust">
          <Notice pack={pack} />
        </footer>
      </div>
      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} returnFocusTo={moreRef} />
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
export function AppBody({ state, deps, onSwitchAirport = () => undefined, pendingAirport = null }: { state: PackState; deps: AppDeps; onSwitchAirport?: (icao: string) => void; pendingAirport?: string | null }) {
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <PackError message={state.message} />;
  return (
    <Boundary key={state.pack.airport.icao}>
      <Screen pack={state.pack} deps={deps} airport={{ airports: state.airports, airportError: state.airportError, pending: pendingAirport, onSwitch: onSwitchAirport }} />
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
  // Switching airport builds a new screen with its own controller: nothing of the old airport is carried over, and its
  // stored state stays under its own code (AG-8). A refused switch keeps the current airport. While the new pack is
  // fetched the selector shows the choice and says it is loading.
  const [pendingAirport, setPendingAirport] = useState<string | null>(null);
  const switchAirport = (icao: string): void => {
    if (state.status !== 'ready' || pendingAirport !== null) return;
    if (icao !== state.pack.airport.icao && state.airports.includes(icao)) setPendingAirport(icao);
    void switchAirportTo(state, icao, deps)
      .then((change) => {
        if (change !== null) setState((prev) => (prev.status === 'ready' ? { ...prev, ...change } : prev));
      })
      .finally(() => setPendingAirport(null));
  };
  return <AppBody state={state} deps={deps} onSwitchAirport={switchAirport} pendingAirport={pendingAirport} />;
}

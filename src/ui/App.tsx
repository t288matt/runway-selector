// The application shell: load the pack from static JSON, then show the
// dashboard. An invalid pack gives a full-screen error and nothing else is
// drawn (DESIGN section 4c, "First load").
import { Component, useEffect, useState, type ReactNode } from 'react';
import { loadPack, type AirportPack } from '../refdata';
import { cacheBustToken } from './clock';
import { Dashboard } from './components/Dashboard';
import { NoticeBar } from './components/Frame';
import { useDashboard, type AppDeps } from './useDashboard';

export type PackState = { readonly status: 'loading' } | { readonly status: 'error'; readonly message: string } | { readonly status: 'ready'; readonly pack: AirportPack };

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
      <NoticeBar pack={null} />
      <p role="status" className="loading">Loading the airport pack and the VATSIM feed</p>
    </div>
  );
}

function Screen({ pack, deps }: { pack: AirportPack; deps: AppDeps }) {
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
export function AppBody({ state, deps }: { state: PackState; deps: AppDeps }) {
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <PackError message={state.message} />;
  return (
    <Boundary>
      <Screen pack={state.pack} deps={deps} />
    </Boundary>
  );
}

export function App({ deps }: { deps: AppDeps }) {
  const [state, setState] = useState<PackState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    void loadPack(deps.fetch, { baseUrl: deps.baseUrl ?? './refdata', cacheBust: cacheBustToken(deps.now()) }).then((r) => {
      if (live) setState(r.ok ? { status: 'ready', pack: r.pack } : { status: 'error', message: r.message });
    });
    return () => {
      live = false;
    };
  }, [deps]);
  return <AppBody state={state} deps={deps} />;
}

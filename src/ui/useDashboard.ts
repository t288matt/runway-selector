// The React side of the page's state: a thin wrapper over the controller
// (src/ui/controller.ts), which holds every rule and timer. The clock, the
// network and the timer functions arrive through `deps`.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AirportPack, FetchLike } from '../refdata';
import type { AuditExport, Store } from '../store';
import type { Clock } from './clock';
import type { ApplyOutcome } from './components/WeatherEntry';
import { createController, type Controller, type ControllerState, type WeatherKind } from './controller';
import type { WindowChoice } from './model/dashboard';

export { TICK_MS } from './controller';

export interface AppDeps {
  readonly fetch: FetchLike;
  readonly now: Clock;
  /** Where the pack is served from; defaults to ./refdata. */
  readonly baseUrl?: string;
  /** Where the current mode, the window and the audit trail are kept. */
  readonly store: Store;
}

export interface DashboardState extends ControllerState {
  readonly drawerOpen: boolean;
  readonly setDrawerOpen: (open: boolean) => void;
  readonly setWindowChoice: (choice: WindowChoice) => void;
  readonly setCurrentMode: (id: string | null) => void;
  readonly confirmCurrentMode: () => void;
  readonly reloadPack: () => void;
  readonly clearAudit: () => void;
  readonly exportAudit: () => AuditExport;
  readonly dismissNotice: (index: number) => void;
  readonly applyMetar: (text: string) => ApplyOutcome;
  readonly applyTaf: (text: string) => ApplyOutcome;
  readonly resumeAutomatic: (kind: WeatherKind) => void;
}

export function useDashboard(pack: AirportPack, deps: AppDeps): DashboardState {
  const [controller] = useState<Controller>(() =>
    createController({
      pack,
      fetch: deps.fetch,
      now: deps.now,
      store: deps.store,
      baseUrl: deps.baseUrl,
      timers: { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
    }),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  return {
    ...state,
    drawerOpen,
    setDrawerOpen,
    setWindowChoice: controller.setWindowChoice,
    setCurrentMode: controller.setCurrentMode,
    confirmCurrentMode: controller.confirmCurrentMode,
    reloadPack: () => void controller.reloadPack(),
    clearAudit: controller.clearAudit,
    exportAudit: controller.exportAudit,
    dismissNotice: controller.dismissNotice,
    applyMetar: controller.applyMetar,
    applyTaf: controller.applyTaf,
    resumeAutomatic: controller.resumeAutomatic,
  };
}

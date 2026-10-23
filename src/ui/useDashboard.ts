// The React side of the page's state: a thin wrapper over the controller
// (src/ui/controller.ts), which holds every rule and timer. The clock, the
// network and the timer functions arrive through `deps`.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AirportPack, FetchLike } from '../refdata';
import type { Clock } from './clock';
import type { ApplyOutcome } from './components/WeatherEntry';
import { createController, type Controller, type ControllerState } from './controller';
import type { WindowChoice } from './model/dashboard';

export { TICK_MS } from './controller';

export interface AppDeps {
  readonly fetch: FetchLike;
  readonly now: Clock;
  /** Where the pack is served from; defaults to ./refdata. */
  readonly baseUrl?: string;
}

export interface DashboardState extends ControllerState {
  readonly drawerOpen: boolean;
  readonly setDrawerOpen: (open: boolean) => void;
  readonly refresh: () => void;
  readonly setWindowChoice: (choice: WindowChoice) => void;
  readonly setCurrentMode: (id: string | null) => void;
  readonly applyMetar: (text: string) => ApplyOutcome;
  readonly applyTaf: (text: string) => ApplyOutcome;
}

export function useDashboard(pack: AirportPack, deps: AppDeps): DashboardState {
  const [controller] = useState<Controller>(() =>
    createController({
      pack,
      fetch: deps.fetch,
      now: deps.now,
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
    refresh: controller.refresh,
    setWindowChoice: controller.setWindowChoice,
    setCurrentMode: controller.setCurrentMode,
    applyMetar: controller.applyMetar,
    applyTaf: controller.applyTaf,
  };
}

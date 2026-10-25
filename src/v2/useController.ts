// The React side of the page's state: a thin wrapper over the controller
// (src/v2/controller.ts), which holds every rule and timer. The clock, the
// network and the timer functions arrive through `deps`.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AirportPack } from '../refdata';
import type { AppDeps } from './deps';
import { createController, type Controller, type ControllerState } from './controller';

export interface ScreenState extends ControllerState {
  readonly setCurrentMode: (id: string | null) => void;
  readonly dismissNotice: (index: number) => void;
}

export function useController(pack: AirportPack, deps: AppDeps): ScreenState {
  const [controller] = useState<Controller>(() =>
    createController({
      pack,
      fetch: deps.fetch,
      now: deps.now,
      store: deps.store,
      timers: { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
    }),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  return { ...state, setCurrentMode: controller.setCurrentMode, dismissNotice: controller.dismissNotice };
}

// The summary screen's state: one controller per airport, one card each. Group
// membership and order come only from `deps.airports`.
//
// Timing: the ten packs load at different speeds, but the VATSIM requests only
// coalesce (src/v2/coalesceFetch.ts) when they happen together. So nothing
// starts until every pack load has settled; then all controllers are created and
// started in the same tick, which lines up their first polls and interval timers.
// Packs load through the plain fetch; only the controllers get the coalescing one.
//
// Errors are per card: a pack that fails to load, or a controller that throws,
// gives that airport an `error` entry and the others carry on.
//
// start() after stop() starts afresh (entries go back to loading); a load still
// in flight from before the stop is ignored.
import { cacheBustToken, type Clock } from './clock';
import { loadPack, type AirportPack, type FetchLike } from '../refdata';
import type { Store } from '../store';
import { coalesceFetch } from './coalesceFetch';
import { createController, type Controller, type Timers } from './controller';
import { summaryCard, type SummaryCard } from './model/summaryCard';

export type SummaryEntry =
  | { readonly icao: string; readonly status: 'loading' }
  | { readonly icao: string; readonly status: 'error'; readonly message: string }
  | { readonly icao: string; readonly status: 'ready'; readonly card: SummaryCard };

export interface SummaryDeps {
  readonly airports: readonly string[];
  readonly fetch: FetchLike;
  readonly now: Clock;
  readonly store: Store;
  readonly baseUrl?: string;
  readonly timers: Timers;
}

export interface Summary {
  readonly getState: () => readonly SummaryEntry[];
  readonly subscribe: (listener: () => void) => () => void;
  readonly start: () => void;
  readonly stop: () => void;
}

/** Shares VATSIM requests made within this window by the controllers. */
const COALESCE_MS = 10_000;

type Loaded = { readonly ok: true; readonly pack: AirportPack } | { readonly ok: false; readonly message: string };

export function createSummary(deps: SummaryDeps): Summary {
  const loading = (): SummaryEntry[] => deps.airports.map((icao) => ({ icao, status: 'loading' }));
  let entries: readonly SummaryEntry[] = loading();
  let controllers: Controller[] = [];
  let unsubscribes: (() => void)[] = [];
  let generation = 0;
  let running = false;
  const listeners = new Set<() => void>();

  const publish = (next: readonly SummaryEntry[]): void => {
    entries = next;
    for (const l of [...listeners]) l();
  };
  const setEntry = (index: number, entry: SummaryEntry): void => {
    publish(entries.map((e, i) => (i === index ? entry : e)));
  };
  const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'unknown error');

  const load = async (icao: string): Promise<Loaded> => {
    try {
      const r = await loadPack(deps.fetch, {
        cacheBust: cacheBustToken(deps.now()),
        airportId: icao,
        ...(deps.baseUrl === undefined ? {} : { baseUrl: deps.baseUrl }),
      });
      return r.ok ? { ok: true, pack: r.pack } : { ok: false, message: r.message };
    } catch (e) {
      return { ok: false, message: errorMessage(e) };
    }
  };

  const teardown = (): void => {
    for (const off of unsubscribes) off();
    for (const c of controllers) c.stop();
    unsubscribes = [];
    controllers = [];
  };

  const run = async (mine: number): Promise<void> => {
    const loaded = await Promise.all(deps.airports.map(load));
    if (mine !== generation) return;
    const fetch = coalesceFetch(deps.fetch, deps.now, COALESCE_MS);
    const next: SummaryEntry[] = [];
    const toStart: Controller[] = [];
    loaded.forEach((r, index) => {
      const icao = deps.airports[index] as string;
      if (!r.ok) {
        next.push({ icao, status: 'error', message: r.message });
        return;
      }
      try {
        const controller = createController({
          pack: r.pack,
          fetch,
          now: deps.now,
          store: deps.store,
          ...(deps.baseUrl === undefined ? {} : { baseUrl: deps.baseUrl }),
          timers: deps.timers,
        });
        const refresh = (): void => {
          if (mine !== generation) return;
          try {
            setEntry(index, { icao, status: 'ready', card: summaryCard(controller.getState()) });
          } catch (e) {
            setEntry(index, { icao, status: 'error', message: errorMessage(e) });
          }
        };
        next.push({ icao, status: 'ready', card: summaryCard(controller.getState()) });
        controllers.push(controller);
        unsubscribes.push(controller.subscribe(refresh));
        toStart.push(controller);
      } catch (e) {
        next.push({ icao, status: 'error', message: errorMessage(e) });
      }
    });
    publish(next);
    // All together, in this tick, so the first polls and timers line up.
    for (const c of toStart) {
      try {
        c.start();
      } catch {
        // One controller failing to start must not stop the others.
      }
    }
  };

  return {
    getState: () => entries,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      if (running) return;
      running = true;
      generation += 1;
      entries = loading();
      void run(generation);
    },
    stop: () => {
      if (!running) return;
      running = false;
      generation += 1;
      teardown();
    },
  };
}

// The React side of the summary screen: a thin wrapper over createSummary
// (src/v2/summary.ts), which holds every rule and timer. One summary is created
// per mount; it starts in an effect and stops on cleanup, so it also behaves
// under StrictMode's start, stop, start in development.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AppDeps } from './deps';
import { createSummary, type Summary, type SummaryEntry } from './summary';

export function useSummary(airports: readonly string[], deps: AppDeps): readonly SummaryEntry[] {
  const [summary] = useState<Summary>(() =>
    createSummary({
      airports,
      fetch: deps.fetch,
      now: deps.now,
      store: deps.store,
      ...(deps.baseUrl === undefined ? {} : { baseUrl: deps.baseUrl }),
      timers: { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
    }),
  );
  const entries = useSyncExternalStore(summary.subscribe, summary.getState, summary.getState);
  useEffect(() => {
    summary.start();
    return () => summary.stop();
  }, [summary]);
  return entries;
}

// What the app is handed from outside: the network, the clock and the store. The
// browser's own versions are named only in main.tsx; tests pass fakes.
import type { FetchLike } from '../refdata';
import type { Store } from '../store';
import type { Clock } from './clock';

export interface AppDeps {
  readonly fetch: FetchLike;
  readonly now: Clock;
  /** Where the pack is served from; defaults to ./refdata. */
  readonly baseUrl?: string;
  /** Where the current mode, the window and the audit trail are kept. */
  readonly store: Store;
}

// The operator's forecast window choice, kept per airport (OD-27). The options
// belong to the screen, so the caller passes them in; this module stores only
// the id of the choice.
import * as v from 'valibot';
import { storageKey, type Store } from './store';
import { readValidated, writeJson } from './stored';

export const WINDOW_SCHEMA_VERSION = 1;
export const WINDOW_AUDIT_PATH = 'forecastWindow';

const windowSchema = v.strictObject({
  schemaVersion: v.literal(WINDOW_SCHEMA_VERSION),
  choice: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]+$/), v.maxLength(32)),
});

export interface WindowLoad {
  /** The stored choice, or null when none is stored or it was discarded. */
  readonly choice: string | null;
  readonly message: string | null;
}

export function loadWindowChoice(store: Store, icao: string, options: readonly string[]): WindowLoad {
  const key = storageKey(icao, 'forecastWindow');
  const read = readValidated(store, key, windowSchema, 256, 'forecast window');
  if (read.kind === 'none') return { choice: null, message: null };
  if (read.kind === 'discarded') return { choice: null, message: read.message };
  if (!options.includes(read.value.choice)) {
    clearWindowChoice(store, icao);
    return { choice: null, message: `The stored forecast window ${read.value.choice} is no longer offered and was cleared` };
  }
  return { choice: read.value.choice, message: null };
}

export function saveWindowChoice(store: Store, icao: string, choice: string): void {
  writeJson(store, storageKey(icao, 'forecastWindow'), { schemaVersion: WINDOW_SCHEMA_VERSION, choice });
}

export function clearWindowChoice(store: Store, icao: string): void {
  try {
    store.removeItem(storageKey(icao, 'forecastWindow'));
  } catch {
    // Unavailable storage: nothing to clear.
  }
}

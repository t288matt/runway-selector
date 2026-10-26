// The last airport chosen in the selector (app-level, not per-airport: it is read before any
// pack is loaded, so it cannot use storageKey, which needs an icao). A refresh of the page then
// opens on the airport the operator was looking at, not back at the default.
import * as v from 'valibot';
import { KEY_PREFIX } from './store';
import { readValidated, writeJson } from './stored';
import type { Store } from './store';

export const SELECTED_AIRPORT_SCHEMA_VERSION = 1;
const KEY = `${KEY_PREFIX}:selectedAirport`;
const ICAO_PATTERN = /^[A-Za-z0-9]{2,8}$/;

const selectedAirportSchema = v.strictObject({
  schemaVersion: v.literal(SELECTED_AIRPORT_SCHEMA_VERSION),
  icao: v.pipe(v.string(), v.regex(ICAO_PATTERN)),
});

/**
 * The stored airport id, shape-checked only (2 to 8 letters or digits); null when none is stored or it was
 * discarded. Whether it is still one of the airports on offer is for the caller to check once that list is known
 * (the app has no app.json yet at this point), clearing it with `clearSelectedAirport` if it is not.
 */
export function loadSelectedAirportId(store: Store): string | null {
  const read = readValidated(store, KEY, selectedAirportSchema, 256, 'selected airport');
  return read.kind === 'ok' ? read.value.icao : null;
}

export function saveSelectedAirport(store: Store, icao: string): void {
  writeJson(store, KEY, { schemaVersion: SELECTED_AIRPORT_SCHEMA_VERSION, icao });
}

export function clearSelectedAirport(store: Store): void {
  try {
    store.removeItem(KEY);
  } catch {
    // Nothing more can be done; the value is still not used.
  }
}

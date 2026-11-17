// The saved copy of an airport pack (issue 183): the raw text of app.json and the five pack files, with the time it
// was saved, so a repeat visit can show the pack at once while a fresh copy is fetched. Keyed by airport (AG-8): one
// airport never reads another's copy. Only text that has already passed loadPack's checks is saved, and a copy is
// checked again, in full, every time it is read; this module only keeps text and the time, and never decides validity.
import * as v from 'valibot';
import type { SavedPackText } from '../refdata';
import { KEY_PREFIX } from './store';
import { readValidated, writeJson } from './stored';
import type { Store } from './store';

export const PACK_CACHE_SCHEMA_VERSION = 1;
/** How long a saved copy may be shown before it is ignored: ONE value. A copy exactly this old is already expired. */
export const PACK_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** App file cap plus five pack file caps (src/refdata/schema.ts), with room for JSON escaping. Larger saved text is discarded unread. */
export const PACK_CACHE_MAX_CHARS = 2_000_000;

const ICAO_PATTERN = /^[A-Za-z0-9]{2,8}$/;
const keyFor = (icao: string): string => `${KEY_PREFIX}:packCache:${icao.toUpperCase()}`;
const DEFAULT_KEY = `${KEY_PREFIX}:packCacheDefault`;

const text = v.string();
const packCacheSchema = v.strictObject({
  schemaVersion: v.literal(PACK_CACHE_SCHEMA_VERSION),
  savedAt: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  app: text,
  files: v.strictObject({
    'airport.json': text,
    'runways.json': text,
    'modes.json': text,
    'operating_plan.json': text,
    'settings.json': text,
  }),
});

const defaultSchema = v.strictObject({
  schemaVersion: v.literal(PACK_CACHE_SCHEMA_VERSION),
  icao: v.pipe(v.string(), v.regex(ICAO_PATTERN)),
});

/**
 * The airport whose pack was last loaded as the app.json default (the airport shown when nothing was chosen), or null.
 * Lets the first screen use a saved copy before app.json has been fetched.
 */
export function loadSavedDefaultId(store: Store): string | null {
  const read = readValidated(store, DEFAULT_KEY, defaultSchema, 256, 'saved default airport');
  return read.kind === 'ok' ? read.value.icao : null;
}

/**
 * The saved text for one airport, or null when there is none, it is corrupt, of another version, oversize, from the
 * future, or 24 hours old or older. Whether the text is a valid pack is for the caller (packFromSavedText).
 */
export function loadSavedPack(store: Store, icao: string, nowMs: number): (SavedPackText & { readonly savedAt: number }) | null {
  if (!ICAO_PATTERN.test(icao)) return null;
  const read = readValidated(store, keyFor(icao), packCacheSchema, PACK_CACHE_MAX_CHARS, 'saved airport pack');
  if (read.kind !== 'ok') return null;
  const age = nowMs - read.value.savedAt;
  if (age < 0 || age >= PACK_CACHE_MAX_AGE_MS) {
    clearSavedPack(store, icao);
    return null;
  }
  return { airportId: icao, app: read.value.app, files: read.value.files, savedAt: read.value.savedAt };
}

/** Save text that has already passed validation. `asDefault` also records it as the airport to open when none was chosen. Storage failures are swallowed. */
export function saveSavedPack(store: Store, saved: SavedPackText, nowMs: number, asDefault = false): void {
  if (!ICAO_PATTERN.test(saved.airportId)) return;
  const record = { schemaVersion: PACK_CACHE_SCHEMA_VERSION, savedAt: nowMs, app: saved.app, files: saved.files };
  // A record that would be discarded unread for its size is not written, so an old, good copy is not replaced by it.
  if (JSON.stringify(record).length > PACK_CACHE_MAX_CHARS) return;
  writeJson(store, keyFor(saved.airportId), record);
  if (asDefault) writeJson(store, DEFAULT_KEY, { schemaVersion: PACK_CACHE_SCHEMA_VERSION, icao: saved.airportId });
}

export function clearSavedPack(store: Store, icao: string): void {
  if (!ICAO_PATTERN.test(icao)) return;
  try {
    store.removeItem(keyFor(icao));
  } catch {
    // Nothing more can be done; the copy is still not used.
  }
}

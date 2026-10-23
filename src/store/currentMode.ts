// The operator's current mode, kept per airport with the time it was set
// (OD-21, OD-30, UP-4). The app never changes it by itself.
import * as v from 'valibot';
import type { AirportPack } from '../refdata';
import { storageKey, type Store } from './store';
import { readValidated, writeJson } from './stored';

export const CURRENT_MODE_SCHEMA_VERSION = 1;
const MAX_CHARS = 512;
export const MAX_MODE_ID_LENGTH = 64;
export const MAX_TIME_MS = 8_640_000_000_000_000; // the largest time a JavaScript Date holds

const currentModeSchema = v.strictObject({
  schemaVersion: v.literal(CURRENT_MODE_SCHEMA_VERSION),
  modeId: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_MODE_ID_LENGTH))),
  setAtMs: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_TIME_MS)),
});

export interface CurrentModeRecord {
  readonly schemaVersion: 1;
  /** null = Not set. */
  readonly modeId: string | null;
  /** UTC milliseconds when the operator set it. */
  readonly setAtMs: number;
}

export interface CurrentModeLoad {
  /** null when nothing usable is stored. */
  readonly record: CurrentModeRecord | null;
  /** Shown to the operator when a stored value was discarded or cleared. */
  readonly message: string | null;
}

export function loadCurrentMode(store: Store, pack: AirportPack): CurrentModeLoad {
  const key = storageKey(pack.airport.icao, 'currentMode');
  const read = readValidated(store, key, currentModeSchema, MAX_CHARS, 'current mode');
  if (read.kind === 'none') return { record: null, message: null };
  if (read.kind === 'discarded') return { record: null, message: read.message };
  const record: CurrentModeRecord = { schemaVersion: 1, modeId: read.value.modeId, setAtMs: read.value.setAtMs };
  if (record.modeId !== null && !pack.modes.some((m) => m.enabled && m.id === record.modeId)) {
    clearCurrentMode(store, pack.airport.icao);
    return { record: null, message: `The stored current mode ${record.modeId} is no longer enabled and was cleared` };
  }
  return { record, message: null };
}

export function saveCurrentMode(store: Store, icao: string, modeId: string | null, nowMs: number): CurrentModeRecord {
  const record: CurrentModeRecord = { schemaVersion: 1, modeId, setAtMs: nowMs };
  writeJson(store, storageKey(icao, 'currentMode'), record);
  return record;
}

export function clearCurrentMode(store: Store, icao: string): void {
  try {
    store.removeItem(storageKey(icao, 'currentMode'));
  } catch {
    // Unavailable storage: nothing to clear.
  }
}

/** Set more than currentModeStaleMinutes ago (strictly older). Not set, or no record, is never stale. */
export function isCurrentModeStale(record: CurrentModeRecord | null, nowMs: number, pack: AirportPack): boolean {
  if (record === null || record.modeId === null) return false;
  return nowMs - record.setAtMs > pack.settings.currentModeStaleMinutes * 60_000;
}

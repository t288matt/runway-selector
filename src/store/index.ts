// What the screens call. Only a change of value writes and produces an audit
// entry; setting the same value again does neither (RD-6).
import type { AirportPack } from '../refdata';
import { appendAudit, type AuditEntry } from './audit';
import { loadCurrentMode, saveCurrentMode, type CurrentModeRecord } from './currentMode';
import { WINDOW_AUDIT_PATH, loadWindowChoice, saveWindowChoice } from './forecastWindow';
import type { Store } from './store';

export type { Store, StorageLike, StorageAccessor, BrowserStore } from './store';
export { createBrowserStore, createMemoryStore, storageKey } from './store';
export { loadCurrentMode, saveCurrentMode, clearCurrentMode, isCurrentModeStale } from './currentMode';
export type { CurrentModeRecord, CurrentModeLoad } from './currentMode';
export { loadAudit, appendAudit, clearAudit, exportAudit, AUDIT_NOTICE } from './audit';
export type { AuditEntry, AuditExport, AuditLoad, AuditValue } from './audit';
export { loadWindowChoice, saveWindowChoice, clearWindowChoice } from './forecastWindow';

export interface CurrentModeChange {
  readonly changed: boolean;
  /** The record now stored (null if none is). */
  readonly record: CurrentModeRecord | null;
  readonly entry: AuditEntry | null;
  /** A message for the operator, or null. */
  readonly message: string | null;
}

/** Set (or clear, with null) the current mode. A mode that is not enabled in the pack is refused and nothing is written. */
export function recordCurrentMode(store: Store, pack: AirportPack, nowMs: number, newModeId: string | null): CurrentModeChange {
  const icao = pack.airport.icao;
  const before = loadCurrentMode(store, pack);
  if (newModeId !== null && !pack.modes.some((m) => m.enabled && m.id === newModeId)) {
    return { changed: false, record: before.record, entry: null, message: `Mode ${newModeId} is not enabled and was not stored` };
  }
  const oldId = before.record?.modeId ?? null;
  if (oldId === newModeId) return { changed: false, record: before.record, entry: null, message: before.message };
  const record = saveCurrentMode(store, icao, newModeId, nowMs);
  const log = appendAudit(store, icao, { timeMs: nowMs, path: 'currentMode', old: oldId, new: newModeId }, pack.settings.auditMaxEntries);
  const entry = log.entries[log.entries.length - 1] ?? null;
  return { changed: true, record, entry, message: before.message ?? log.message };
}

export interface WindowChange {
  readonly changed: boolean;
  /** The choice now in force. */
  readonly choice: string;
  readonly entry: AuditEntry | null;
  readonly message: string | null;
}

/**
 * Set the forecast window choice. `options` are the ids the screen offers and
 * `defaultChoice` is what applies when nothing is stored; both come from the caller.
 */
export function recordForecastWindow(
  store: Store,
  pack: AirportPack,
  nowMs: number,
  newChoice: string,
  options: readonly string[],
  defaultChoice: string,
): WindowChange {
  const icao = pack.airport.icao;
  const before = loadWindowChoice(store, icao, options);
  const oldChoice = before.choice ?? defaultChoice;
  if (!options.includes(newChoice)) {
    return { changed: false, choice: oldChoice, entry: null, message: `Forecast window ${newChoice} is not offered and was not stored` };
  }
  if (oldChoice === newChoice) return { changed: false, choice: oldChoice, entry: null, message: before.message };
  saveWindowChoice(store, icao, newChoice);
  const log = appendAudit(store, icao, { timeMs: nowMs, path: WINDOW_AUDIT_PATH, old: oldChoice, new: newChoice }, pack.settings.auditMaxEntries);
  const entry = log.entries[log.entries.length - 1] ?? null;
  return { changed: true, choice: newChoice, entry, message: before.message ?? log.message };
}

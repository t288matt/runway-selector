// The audit trail (RD-6, OD-23): a local record of current-mode and on-screen
// setting changes. It is a convenience, not evidence: the user can clear or edit
// it, so it carries no hash chain (SEC-7 not adopted) and says so on export.
import * as v from 'valibot';
import { BOUNDS } from '../refdata';
import { MAX_TIME_MS } from './currentMode';
import { storageKey, type Store } from './store';
import { readValidated, writeJson } from './stored';

export const AUDIT_SCHEMA_VERSION = 1;
export const AUDIT_NOTICE =
  'This is a local record, not tamper-proof. It is kept in this browser, can be cleared or edited by the user, and is not evidence. Changes to the reference data files are not recorded here; the repository history is the record of those.';

const MAX_PATH = 64;
const MAX_VALUE_CHARS = 200;
/** An entry as JSON is well under 600 characters; the log is capped at the largest allowed entry count. */
const MAX_LOG_CHARS = BOUNDS.range.auditMaxEntries.max * 600;

const valueSchema = v.union([v.null(), v.pipe(v.string(), v.maxLength(MAX_VALUE_CHARS)), v.pipe(v.number(), v.finite())]);

const entrySchema = v.strictObject({
  schemaVersion: v.literal(AUDIT_SCHEMA_VERSION),
  timeMs: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_TIME_MS)),
  airport: v.pipe(v.string(), v.regex(/^[A-Za-z0-9]{2,8}$/)),
  path: v.pipe(v.string(), v.regex(/^[A-Za-z][A-Za-z0-9]*$/), v.maxLength(MAX_PATH)),
  old: valueSchema,
  new: valueSchema,
});

const logSchema = v.strictObject({
  schemaVersion: v.literal(AUDIT_SCHEMA_VERSION),
  entries: v.pipe(v.array(entrySchema), v.maxLength(BOUNDS.range.auditMaxEntries.max)),
});

export type AuditValue = string | number | null;

export interface AuditEntry {
  readonly schemaVersion: 1;
  /** UTC milliseconds. */
  readonly timeMs: number;
  readonly airport: string;
  /** 'currentMode' or the name of the setting. */
  readonly path: string;
  readonly old: AuditValue;
  readonly new: AuditValue;
}

export interface AuditLoad {
  readonly entries: readonly AuditEntry[];
  readonly message: string | null;
}

function cap(entries: readonly AuditEntry[], maxEntries: number): readonly AuditEntry[] {
  return entries.length > maxEntries ? entries.slice(entries.length - maxEntries) : entries;
}

/** The whole log is validated; one bad entry, or an entry from another airport, discards the log. */
export function loadAudit(store: Store, icao: string, maxEntries: number): AuditLoad {
  const key = storageKey(icao, 'audit');
  const read = readValidated(store, key, logSchema, MAX_LOG_CHARS, 'audit trail');
  if (read.kind === 'none') return { entries: [], message: null };
  if (read.kind === 'discarded') return { entries: [], message: read.message };
  const wanted = icao.toUpperCase();
  if (read.value.entries.some((e) => e.airport.toUpperCase() !== wanted)) {
    clearAudit(store, icao);
    return { entries: [], message: "The stored audit trail could not be used (it holds another airport's entries) and was discarded" };
  }
  const entries: AuditEntry[] = read.value.entries.map((e) => ({
    schemaVersion: 1,
    timeMs: e.timeMs,
    airport: e.airport,
    path: e.path,
    old: e.old,
    new: e.new,
  }));
  return { entries: cap(entries, maxEntries), message: null };
}

/** Append one entry; the oldest drop first once there are more than maxEntries. */
export function appendAudit(
  store: Store,
  icao: string,
  entry: Omit<AuditEntry, 'schemaVersion' | 'airport'>,
  maxEntries: number,
): AuditLoad {
  const loaded = loadAudit(store, icao, maxEntries);
  const full: AuditEntry = { schemaVersion: 1, airport: icao.toUpperCase(), ...entry };
  const entries = cap([...loaded.entries, full], maxEntries);
  writeJson(store, storageKey(icao, 'audit'), { schemaVersion: AUDIT_SCHEMA_VERSION, entries });
  return { entries, message: loaded.message };
}

export function clearAudit(store: Store, icao: string): void {
  try {
    store.removeItem(storageKey(icao, 'audit'));
  } catch {
    // Unavailable storage: nothing to clear.
  }
}

export interface AuditExport {
  /** A file name the screen can offer for the download. */
  readonly filename: string;
  readonly text: string;
}

function ddmmyyyy(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCFullYear(), 4)}`;
}

/** Pure: the file name and the JSON text. The notice is inside the file (S-05). */
export function exportAudit(entries: readonly AuditEntry[], icao: string, nowMs: number): AuditExport {
  const airport = icao.toUpperCase();
  const body = {
    notice: AUDIT_NOTICE,
    schemaVersion: AUDIT_SCHEMA_VERSION,
    airport,
    exportedAtMs: nowMs,
    entries,
  };
  return { filename: `audit-trail-${airport}-${ddmmyyyy(nowMs)}.json`, text: JSON.stringify(body, null, 2) };
}

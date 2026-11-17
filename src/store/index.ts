// What the screens call. The store keeps three things per airport or per browser:
// the saved pack copy, the airport last chosen, and (read only, pending the
// owner's decision) the audit trail an older version left behind.
export type { Store, StorageLike, StorageAccessor, BrowserStore } from './store';
export { createBrowserStore, createMemoryStore, KEY_PREFIX, storageKey } from './store';
export { loadAudit, clearAudit, exportAudit, AUDIT_NOTICE } from './audit';
export type { AuditEntry, AuditExport, AuditLoad, AuditValue } from './audit';
export { loadSelectedAirportId, saveSelectedAirport, clearSelectedAirport } from './selectedAirport';
export { loadSavedPack, saveSavedPack, clearSavedPack, loadSavedDefaultId, PACK_CACHE_MAX_AGE_MS } from './packCache';

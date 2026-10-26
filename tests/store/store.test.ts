// Storage layer (step 8): the stored current mode, the audit trail and the
// forecast window, run over every pack. Storage is a fake object, so nothing
// touches a browser.
import { describe, expect, it } from 'vitest';
import type { AirportPack } from '../../src/refdata';
import {
  AUDIT_NOTICE,
  appendAudit,
  clearAudit,
  clearCurrentMode,
  clearSelectedAirport,
  confirmCurrentMode,
  createBrowserStore,
  createMemoryStore,
  exportAudit,
  isCurrentModeStale,
  KEY_PREFIX,
  loadAudit,
  loadCurrentMode,
  loadSelectedAirportId,
  loadWindowChoice,
  recordCurrentMode,
  recordForecastWindow,
  saveCurrentMode,
  saveSelectedAirport,
  storageKey,
  type CurrentModeRecord,
  type StorageLike,
  type Store,
} from '../../src/store';
import { describeForEachPack } from '../helpers/packs';

const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);
const WINDOWS = ['4h', '6h', 'full'] as const;

function enabledIds(pack: AirportPack): string[] {
  return pack.modes.filter((m) => m.enabled).map((m) => m.id);
}
/** Two different enabled modes (every pack has at least two). */
function twoModes(pack: AirportPack): [string, string] {
  const ids = enabledIds(pack);
  return [ids[0] as string, ids[1] as string];
}
function otherIcao(pack: AirportPack): string {
  return pack.airport.icao === 'ZZZZ' ? 'ZZZY' : 'ZZZZ';
}
function fakeStorage(opts: { throwGet?: boolean; throwSet?: boolean } = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(k) {
      if (opts.throwGet) throw new Error('blocked');
      return data.get(k) ?? null;
    },
    setItem(k, val) {
      if (opts.throwSet) throw new Error('quota');
      data.set(k, val);
    },
    removeItem(k) {
      data.delete(k);
    },
  };
}
function put(store: Store, pack: AirportPack, name: 'currentMode' | 'audit' | 'forecastWindow', text: string): void {
  store.setItem(storageKey(pack.airport.icao, name), text);
}
function modeRecord(modeId: string | null, setAtMs = NOW): string {
  return JSON.stringify({ schemaVersion: 1, modeId, setAtMs });
}

describeForEachPack('current mode storage', (pack) => {
  const icao = pack.airport.icao;
  const [modeA] = twoModes(pack);

  it('round trips the mode and the time it was set', () => {
    const store = createMemoryStore();
    saveCurrentMode(store, icao, modeA, NOW);
    expect(loadCurrentMode(store, pack)).toEqual({ record: { schemaVersion: 1, modeId: modeA, setAtMs: NOW }, message: null });
  });

  it('keeps Not set as a record with a time', () => {
    const store = createMemoryStore();
    saveCurrentMode(store, icao, null, NOW);
    expect(loadCurrentMode(store, pack).record).toEqual({ schemaVersion: 1, modeId: null, setAtMs: NOW });
  });

  it('is isolated per airport', () => {
    const store = createMemoryStore();
    saveCurrentMode(store, icao, modeA, NOW);
    const other = { ...pack, airport: { ...pack.airport, icao: otherIcao(pack) } } as AirportPack;
    expect(loadCurrentMode(store, other)).toEqual({ record: null, message: null });
    expect(storageKey(icao, 'currentMode')).not.toBe(storageKey(otherIcao(pack), 'currentMode'));
  });

  it('clear removes it', () => {
    const store = createMemoryStore();
    saveCurrentMode(store, icao, modeA, NOW);
    clearCurrentMode(store, icao);
    expect(loadCurrentMode(store, pack).record).toBeNull();
  });

  describe('a stored value that cannot be trusted is discarded with a message, never partly used', () => {
    const bad: [string, string][] = [
      ['corrupt JSON', '{not json'],
      ['wrong version', JSON.stringify({ schemaVersion: 2, modeId: null, setAtMs: 1 })],
      ['unknown key', JSON.stringify({ schemaVersion: 1, modeId: null, setAtMs: 1, extra: true })],
      ['wrong type', JSON.stringify({ schemaVersion: 1, modeId: 5, setAtMs: 1 })],
      ['negative time', JSON.stringify({ schemaVersion: 1, modeId: null, setAtMs: -1 })],
      ['fractional time', JSON.stringify({ schemaVersion: 1, modeId: null, setAtMs: 1.5 })],
      ['oversize', JSON.stringify({ schemaVersion: 1, modeId: 'X'.repeat(5000), setAtMs: 1 })],
      ['__proto__ key', '{"schemaVersion":1,"modeId":null,"setAtMs":1,"__proto__":{"a":1}}'],
      ['constructor key', '{"schemaVersion":1,"modeId":null,"setAtMs":1,"constructor":1}'],
      ['not an object', '[]'],
    ];
    it.each(bad)('%s', (_name, text) => {
      const store = createMemoryStore();
      put(store, pack, 'currentMode', text);
      const loaded = loadCurrentMode(store, pack);
      expect(loaded.record).toBeNull();
      expect(loaded.message).toMatch(/was discarded/);
      expect(store.getItem(storageKey(icao, 'currentMode'))).toBeNull();
    });
  });

  it('clears a mode that is no longer enabled, with the message', () => {
    const store = createMemoryStore();
    put(store, pack, 'currentMode', modeRecord('NOT_A_MODE'));
    const loaded = loadCurrentMode(store, pack);
    expect(loaded.record).toBeNull();
    expect(loaded.message).toBe('The stored current mode NOT_A_MODE is no longer enabled and was cleared');
    expect(store.getItem(storageKey(icao, 'currentMode'))).toBeNull();
  });

  it('treats a disabled mode as no longer enabled', () => {
    const disabled = pack.modes.find((m) => !m.enabled);
    if (disabled === undefined) return;
    const store = createMemoryStore();
    put(store, pack, 'currentMode', modeRecord(disabled.id));
    expect(loadCurrentMode(store, pack).message).toContain('no longer enabled');
  });

  describe('stale flag', () => {
    const limitMs = pack.settings.currentModeStaleMinutes * 60_000;
    const rec = (setAtMs: number, modeId: string | null = modeA): CurrentModeRecord => ({ schemaVersion: 1, modeId, setAtMs });
    it('exactly at the limit is not stale', () => {
      expect(isCurrentModeStale(rec(NOW - limitMs), NOW, pack)).toBe(false);
    });
    it('one millisecond over the limit is stale', () => {
      expect(isCurrentModeStale(rec(NOW - limitMs - 1), NOW, pack)).toBe(true);
    });
    it('Not set, no record, and a time in the future are never stale', () => {
      expect(isCurrentModeStale(rec(0, null), NOW, pack)).toBe(false);
      expect(isCurrentModeStale(null, NOW, pack)).toBe(false);
      expect(isCurrentModeStale(rec(NOW + 1), NOW, pack)).toBe(false);
    });
  });
});

describeForEachPack('audit trail', (pack) => {
  const icao = pack.airport.icao;
  const cap = pack.settings.auditMaxEntries;
  const entry = (i: number) => ({ timeMs: NOW + i, path: 'forecastWindow', old: '4h', new: `v${i}` });

  it('round trips entries with schema version, UTC time, airport, path, old and new', () => {
    const store = createMemoryStore();
    appendAudit(store, icao, entry(1), cap);
    const loaded = loadAudit(store, icao, cap);
    expect(loaded.message).toBeNull();
    expect(loaded.entries).toEqual([{ schemaVersion: 1, timeMs: NOW + 1, airport: icao, path: 'forecastWindow', old: '4h', new: 'v1' }]);
  });

  it('drops the oldest first at the cap', () => {
    const store = createMemoryStore();
    for (let i = 0; i < cap + 3; i += 1) appendAudit(store, icao, entry(i), cap);
    const loaded = loadAudit(store, icao, cap);
    expect(loaded.entries).toHaveLength(cap);
    expect(loaded.entries[0]?.new).toBe('v3');
    expect(loaded.entries[cap - 1]?.new).toBe(`v${cap + 2}`);
  });

  it('trims a stored log to a lowered cap on load', () => {
    const store = createMemoryStore();
    for (let i = 0; i < 12; i += 1) appendAudit(store, icao, entry(i), cap);
    const loaded = loadAudit(store, icao, 10);
    expect(loaded.entries).toHaveLength(10);
    expect(loaded.entries[0]?.new).toBe('v2');
  });

  it('is isolated per airport', () => {
    const store = createMemoryStore();
    appendAudit(store, icao, entry(1), cap);
    expect(loadAudit(store, otherIcao(pack), cap)).toEqual({ entries: [], message: null });
  });

  it('discards a log holding another airport\'s entry', () => {
    const store = createMemoryStore();
    const foreign = { schemaVersion: 1, timeMs: NOW, airport: otherIcao(pack), path: 'currentMode', old: null, new: 'x' };
    put(store, pack, 'audit', JSON.stringify({ schemaVersion: 1, entries: [foreign] }));
    const loaded = loadAudit(store, icao, cap);
    expect(loaded.entries).toEqual([]);
    expect(loaded.message).toMatch(/discarded/);
  });

  describe('a corrupt log is discarded whole, with a message', () => {
    const good = { schemaVersion: 1, timeMs: NOW, airport: icao, path: 'currentMode', old: null, new: 'x' };
    const log = (entries: unknown[], extra: object = {}) => JSON.stringify({ schemaVersion: 1, entries, ...extra });
    const bad: [string, string][] = [
      ['corrupt JSON', '{"entries":['],
      ['wrong log version', JSON.stringify({ schemaVersion: 9, entries: [] })],
      ['wrong entry version', log([{ ...good, schemaVersion: 2 }])],
      ['unknown key in log', log([], { extra: 1 })],
      ['unknown key in entry', log([{ ...good, extra: 1 }])],
      ['one bad entry among good ones', log([good, { ...good, timeMs: 'now' }, good])],
      ['over-long value', log([{ ...good, new: 'X'.repeat(201) }])],
      ['object value', log([{ ...good, new: { a: 1 } }])],
      ['bad path', log([{ ...good, path: 'a b' }])],
      ['__proto__ key', '{"schemaVersion":1,"entries":[],"__proto__":{"a":1}}'],
      ['__proto__ in an entry', `{"schemaVersion":1,"entries":[{"schemaVersion":1,"timeMs":1,"airport":"${icao}","path":"p","old":null,"new":null,"__proto__":{}}]}`],
      ['oversize', 'x'.repeat(4_000_000)],
    ];
    it.each(bad)('%s', (_name, text) => {
      const store = createMemoryStore();
      put(store, pack, 'audit', text);
      const loaded = loadAudit(store, icao, cap);
      expect(loaded.entries).toEqual([]);
      expect(loaded.message).toMatch(/audit trail could not be used.*discarded/);
      expect(store.getItem(storageKey(icao, 'audit'))).toBeNull();
    });
  });

  it('exports the notice, the entries, a DD-MM-YYYY file name, and is pure', () => {
    const store = createMemoryStore();
    appendAudit(store, icao, entry(1), cap);
    const { entries } = loadAudit(store, icao, cap);
    const out = exportAudit(entries, icao, NOW);
    expect(out.filename).toBe(`audit-trail-${icao.toUpperCase()}-23-10-2026.json`);
    const parsed = JSON.parse(out.text);
    expect(parsed.notice).toBe(AUDIT_NOTICE);
    expect(parsed.notice.toLowerCase()).toContain('local record, not tamper-proof');
    expect(parsed.entries).toEqual(entries);
    expect(parsed.airport).toBe(icao.toUpperCase());
    expect(exportAudit(entries, icao, NOW)).toEqual(out);
  });

  it('exports the notice even when the log is empty', () => {
    expect(JSON.parse(exportAudit([], icao, NOW).text).notice).toBe(AUDIT_NOTICE);
  });

  it('clear works and leaves another airport\'s log alone', () => {
    const store = createMemoryStore();
    appendAudit(store, icao, entry(1), cap);
    appendAudit(store, otherIcao(pack), entry(2), cap);
    clearAudit(store, icao);
    expect(loadAudit(store, icao, cap).entries).toEqual([]);
    expect(loadAudit(store, otherIcao(pack), cap).entries).toHaveLength(1);
  });
});

describeForEachPack('facade: recording changes', (pack) => {
  const icao = pack.airport.icao;
  const cap = pack.settings.auditMaxEntries;
  const [modeA, modeB] = twoModes(pack);

  it('a changed mode is stored and audited once, with old and new', () => {
    const store = createMemoryStore();
    const first = recordCurrentMode(store, pack, NOW, modeA);
    expect(first.changed).toBe(true);
    expect(first.record).toEqual({ schemaVersion: 1, modeId: modeA, setAtMs: NOW });
    expect(first.entry).toEqual({ schemaVersion: 1, timeMs: NOW, airport: icao, path: 'currentMode', old: null, new: modeA });
    const second = recordCurrentMode(store, pack, NOW + 1000, modeB);
    expect(second.entry).toMatchObject({ old: modeA, new: modeB, timeMs: NOW + 1000 });
    expect(loadAudit(store, icao, cap).entries).toHaveLength(2);
  });

  it('setting the same value writes nothing and adds no entry', () => {
    const store = createMemoryStore();
    recordCurrentMode(store, pack, NOW, modeA);
    const again = recordCurrentMode(store, pack, NOW + 5000, modeA);
    expect(again.changed).toBe(false);
    expect(again.entry).toBeNull();
    expect(loadAudit(store, icao, cap).entries).toHaveLength(1);
    expect(loadCurrentMode(store, pack).record?.setAtMs).toBe(NOW);
  });

  it('Not set when already not set is no change; setting Not set after a mode is', () => {
    const store = createMemoryStore();
    expect(recordCurrentMode(store, pack, NOW, null).changed).toBe(false);
    recordCurrentMode(store, pack, NOW, modeA);
    const cleared = recordCurrentMode(store, pack, NOW + 1, null);
    expect(cleared.changed).toBe(true);
    expect(cleared.entry).toMatchObject({ old: modeA, new: null });
  });

  it('refuses a mode that is not enabled and writes nothing', () => {
    const store = createMemoryStore();
    const r = recordCurrentMode(store, pack, NOW, 'NOT_A_MODE');
    expect(r.changed).toBe(false);
    expect(r.message).toBe('Mode NOT_A_MODE is not enabled and was not stored');
    expect(loadAudit(store, icao, cap).entries).toEqual([]);
    expect(loadCurrentMode(store, pack).record).toBeNull();
  });

  it('the forecast window records only changes, against the default when nothing is stored', () => {
    const store = createMemoryStore();
    const same = recordForecastWindow(store, pack, NOW, 'full', WINDOWS, 'full');
    expect(same).toMatchObject({ changed: false, choice: 'full', entry: null });
    const changed = recordForecastWindow(store, pack, NOW + 1, '4h', WINDOWS, 'full');
    expect(changed.entry).toMatchObject({ path: 'forecastWindow', old: 'full', new: '4h' });
    expect(loadWindowChoice(store, icao, WINDOWS).choice).toBe('4h');
    expect(recordForecastWindow(store, pack, NOW + 2, '4h', WINDOWS, 'full').changed).toBe(false);
    expect(loadAudit(store, icao, cap).entries).toHaveLength(1);
  });

  it('refuses a window choice that is not offered', () => {
    const store = createMemoryStore();
    const r = recordForecastWindow(store, pack, NOW, '99h', WINDOWS, 'full');
    expect(r.changed).toBe(false);
    expect(loadWindowChoice(store, icao, WINDOWS).choice).toBeNull();
  });

  it('discards a stored window choice that is no longer offered', () => {
    const store = createMemoryStore();
    recordForecastWindow(store, pack, NOW, '4h', WINDOWS, 'full');
    const loaded = loadWindowChoice(store, icao, ['6h', 'full']);
    expect(loaded.choice).toBeNull();
    expect(loaded.message).toMatch(/no longer offered/);
  });

  it('the stored mode survives other work, and an unrelated airport is untouched', () => {
    const store = createMemoryStore();
    const other = { ...pack, airport: { ...pack.airport, icao: otherIcao(pack) } } as AirportPack;
    recordCurrentMode(store, pack, NOW, modeA);
    recordCurrentMode(store, other, NOW, modeB);
    recordForecastWindow(store, pack, NOW + 1, '6h', WINDOWS, 'full');
    clearAudit(store, icao);
    clearCurrentMode(store, otherIcao(pack));
    expect(loadCurrentMode(store, pack).record?.modeId).toBe(modeA);
    expect(loadCurrentMode(store, other).record).toBeNull();
    expect(loadWindowChoice(store, icao, WINDOWS).choice).toBe('6h');
  });
});

describeForEachPack('confirming the current mode', (pack) => {
  const icao = pack.airport.icao;
  const [modeA] = twoModes(pack);
  const limitMs = pack.settings.currentModeStaleMinutes * 60_000;
  const later = NOW + limitMs + 1;

  it('renews the time so a stale mode is no longer stale, with the mode and the audit trail unchanged', () => {
    const store = createMemoryStore();
    recordCurrentMode(store, pack, NOW, modeA);
    expect(isCurrentModeStale(loadCurrentMode(store, pack).record, later, pack)).toBe(true);
    const r = confirmCurrentMode(store, pack, later);
    expect(r).toMatchObject({ changed: false, entry: null, record: { modeId: modeA, setAtMs: later } });
    const stored = loadCurrentMode(store, pack).record;
    expect(stored).toEqual({ schemaVersion: 1, modeId: modeA, setAtMs: later });
    expect(isCurrentModeStale(stored, later, pack)).toBe(false);
    expect(loadAudit(store, icao, pack.settings.auditMaxEntries).entries).toHaveLength(1);
  });

  it('writes nothing when no mode is stored or it is Not set', () => {
    const store = createMemoryStore();
    expect(confirmCurrentMode(store, pack, NOW).record).toBeNull();
    expect(store.getItem(storageKey(icao, 'currentMode'))).toBeNull();
    saveCurrentMode(store, icao, null, NOW);
    expect(confirmCurrentMode(store, pack, later).record?.setAtMs).toBe(NOW);
  });

  it('touches only its own airport', () => {
    const store = createMemoryStore();
    const other = { ...pack, airport: { ...pack.airport, icao: otherIcao(pack) } } as AirportPack;
    recordCurrentMode(store, pack, NOW, modeA);
    recordCurrentMode(store, other, NOW, modeA);
    confirmCurrentMode(store, pack, later);
    expect(loadCurrentMode(store, other).record?.setAtMs).toBe(NOW);
  });
});

describeForEachPack('browser store with failing storage', (pack) => {
  const [modeA, modeB] = twoModes(pack);

  it('falls back to memory when every call throws, with no crash', () => {
    const store = createBrowserStore(() => fakeStorage({ throwGet: true, throwSet: true }));
    expect(recordCurrentMode(store, pack, NOW, modeA).changed).toBe(true);
    expect(loadCurrentMode(store, pack).record?.modeId).toBe(modeA);
    expect(recordCurrentMode(store, pack, NOW + 1, modeB).entry).toMatchObject({ old: modeA, new: modeB });
    expect(loadAudit(store, pack.airport.icao, pack.settings.auditMaxEntries).entries).toHaveLength(2);
    expect(store.usingMemoryFallback()).toBe(true);
  });

  it('falls back when the accessor throws or returns nothing', () => {
    for (const accessor of [
      () => {
        throw new Error('SecurityError');
      },
      () => undefined,
    ]) {
      const store = createBrowserStore(accessor);
      expect(recordCurrentMode(store, pack, NOW, modeA).changed).toBe(true);
      expect(loadCurrentMode(store, pack).record?.modeId).toBe(modeA);
    }
  });

  it('reads through when only writes fail, and writes through when only reads fail', () => {
    const readOnlyBroken = fakeStorage({ throwSet: true });
    readOnlyBroken.data.set(storageKey(pack.airport.icao, 'currentMode'), modeRecord(modeA));
    expect(loadCurrentMode(createBrowserStore(() => readOnlyBroken), pack).record?.modeId).toBe(modeA);
    const real = fakeStorage({ throwGet: true });
    const store = createBrowserStore(() => real);
    saveCurrentMode(store, pack.airport.icao, modeB, NOW);
    expect(real.data.size).toBe(1);
  });

  it('uses working storage normally and does not report a fallback', () => {
    const real = fakeStorage();
    const store = createBrowserStore(() => real);
    recordCurrentMode(store, pack, NOW, modeA);
    expect(real.data.has(storageKey(pack.airport.icao, 'currentMode'))).toBe(true);
    expect(store.usingMemoryFallback()).toBe(false);
  });

  it('a Store whose methods throw does not crash the loaders', () => {
    const angry: Store = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(loadCurrentMode(angry, pack)).toEqual({ record: null, message: null });
    expect(() => recordCurrentMode(angry, pack, NOW, modeA)).not.toThrow();
    expect(loadAudit(angry, pack.airport.icao, 10).entries).toEqual([]);
  });
});

describe('storage keys', () => {
  it('are namespaced by airport and refuse odd codes', () => {
    expect(storageKey('abcd', 'audit')).toBe(storageKey('ABCD', 'audit'));
    expect(storageKey('ABCD', 'audit')).not.toBe(storageKey('ABCE', 'audit'));
    expect(() => storageKey('A:B', 'audit')).toThrow();
    expect(() => storageKey('', 'audit')).toThrow();
  });
});

// The last airport chosen (app-level: read before any pack exists, so it has no airport of its own to be
// namespaced under). Format-checked only here; whether it is still one of the airports on offer is for the
// caller to check once app.json is read (App.tsx's loadInitialPack, proved in tests/ui and tests/v2).
describe('selected-airport storage', () => {
  it('round-trips a saved choice', () => {
    const store = createMemoryStore();
    expect(loadSelectedAirportId(store)).toBeNull();
    saveSelectedAirport(store, 'YSSY');
    expect(loadSelectedAirportId(store)).toBe('YSSY');
    saveSelectedAirport(store, 'YMML');
    expect(loadSelectedAirportId(store)).toBe('YMML');
  });

  it('clear removes it', () => {
    const store = createMemoryStore();
    saveSelectedAirport(store, 'YSSY');
    clearSelectedAirport(store);
    expect(loadSelectedAirportId(store)).toBeNull();
  });

  it('is kept apart from every per-airport key', () => {
    const store = createMemoryStore();
    saveSelectedAirport(store, 'YSSY');
    expect(store.getItem(storageKey('YSSY', 'currentMode'))).toBeNull();
  });

  describe('a stored value that cannot be trusted is discarded, never used', () => {
    const cases: [string, string][] = [
      ['wrong version', JSON.stringify({ schemaVersion: 2, icao: 'YSSY' })],
      ['unknown key', JSON.stringify({ schemaVersion: 1, icao: 'YSSY', extra: true })],
      ['wrong type', JSON.stringify({ schemaVersion: 1, icao: 5 })],
      ['too short', JSON.stringify({ schemaVersion: 1, icao: 'Y' })],
      ['not letters or digits', JSON.stringify({ schemaVersion: 1, icao: 'Y:SY' })],
      ['oversize', JSON.stringify({ schemaVersion: 1, icao: 'Y'.repeat(5000) })],
      ['__proto__ key', '{"schemaVersion":1,"icao":"YSSY","__proto__":{"a":1}}'],
      ['not JSON', 'not json'],
    ];
    it.each(cases)('%s', (_label, raw) => {
      const store = createMemoryStore();
      store.setItem(`${KEY_PREFIX}:selectedAirport`, raw);
      expect(loadSelectedAirportId(store)).toBeNull();
    });
  });

  it('a Store whose methods throw does not crash the loaders', () => {
    const angry: Store = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(loadSelectedAirportId(angry)).toBeNull();
    expect(() => saveSelectedAirport(angry, 'YSSY')).not.toThrow();
    expect(() => clearSelectedAirport(angry)).not.toThrow();
  });
});

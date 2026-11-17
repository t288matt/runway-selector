// Storage layer: the audit trail an older version left behind (read, export and clear only: nothing writes
// one now), the browser store's fallbacks, the storage keys and the airport last chosen, run over every pack.
// Storage is a fake object, so nothing touches a browser.
import { describe, expect, it } from 'vitest';
import type { AirportPack } from '../../src/refdata';
import {
  AUDIT_NOTICE,
  clearAudit,
  clearSelectedAirport,
  createBrowserStore,
  createMemoryStore,
  exportAudit,
  KEY_PREFIX,
  loadAudit,
  loadSelectedAirportId,
  saveSelectedAirport,
  storageKey,
  type StorageLike,
  type Store,
} from '../../src/store';
import { describeForEachPack } from '../helpers/packs';

const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);

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

function put(store: Store, pack: AirportPack, text: string): void {
  store.setItem(storageKey(pack.airport.icao, 'audit'), text);
}
/** Write a log the way an older version did (nothing in the app writes one now). */
function writeLog(store: Store, icao: string, entries: readonly object[]): void {
  store.setItem(storageKey(icao, 'audit'), JSON.stringify({ schemaVersion: 1, entries }));
}

describeForEachPack('audit trail', (pack) => {
  const icao = pack.airport.icao;
  const cap = pack.settings.auditMaxEntries;
  const entry = (i: number, airport: string = icao) => ({ schemaVersion: 1, timeMs: NOW + i, airport, path: 'forecastWindow', old: '4h', new: `v${i}` });

  it('reads entries with schema version, UTC time, airport, path, old and new', () => {
    const store = createMemoryStore();
    writeLog(store, icao, [entry(1)]);
    const loaded = loadAudit(store, icao, cap);
    expect(loaded.message).toBeNull();
    expect(loaded.entries).toEqual([{ schemaVersion: 1, timeMs: NOW + 1, airport: icao, path: 'forecastWindow', old: '4h', new: 'v1' }]);
  });

  it('reads a log within the pack cap whole, and trims a stored log to a lowered cap on load', () => {
    const store = createMemoryStore();
    writeLog(store, icao, Array.from({ length: 12 }, (_, i) => entry(i)));
    expect(loadAudit(store, icao, cap).entries).toHaveLength(12);
    const loaded = loadAudit(store, icao, 10);
    expect(loaded.entries).toHaveLength(10);
    expect(loaded.entries[0]?.new).toBe('v2');
  });

  it('is isolated per airport', () => {
    const store = createMemoryStore();
    writeLog(store, icao, [entry(1)]);
    expect(loadAudit(store, otherIcao(pack), cap)).toEqual({ entries: [], message: null });
  });

  it("discards a log holding another airport's entry", () => {
    const store = createMemoryStore();
    writeLog(store, icao, [entry(0, otherIcao(pack))]);
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
      put(store, pack, text);
      const loaded = loadAudit(store, icao, cap);
      expect(loaded.entries).toEqual([]);
      expect(loaded.message).toMatch(/audit trail could not be used.*discarded/);
      expect(store.getItem(storageKey(icao, 'audit'))).toBeNull();
    });
  });

  it('exports the notice, the entries, a DD-MM-YYYY file name, and is pure', () => {
    const store = createMemoryStore();
    writeLog(store, icao, [entry(1)]);
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

  it("clear works and leaves another airport's log alone", () => {
    const store = createMemoryStore();
    writeLog(store, icao, [entry(1)]);
    writeLog(store, otherIcao(pack), [entry(2, otherIcao(pack))]);
    clearAudit(store, icao);
    expect(loadAudit(store, icao, cap).entries).toEqual([]);
    expect(loadAudit(store, otherIcao(pack), cap).entries).toHaveLength(1);
  });
});

describeForEachPack('browser store with failing storage', (pack) => {
  const icao = pack.airport.icao;
  const cap = pack.settings.auditMaxEntries;
  const entry = { schemaVersion: 1, timeMs: NOW, airport: icao, path: 'forecastWindow', old: '4h', new: '6h' };

  it('falls back to memory when every call throws, with no crash', () => {
    const store = createBrowserStore(() => fakeStorage({ throwGet: true, throwSet: true }));
    writeLog(store, icao, [entry]);
    expect(loadAudit(store, icao, cap).entries).toHaveLength(1);
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
      writeLog(store, icao, [entry]);
      expect(loadAudit(store, icao, cap).entries).toHaveLength(1);
    }
  });

  it('reads through when only writes fail, and writes through when only reads fail', () => {
    const readOnlyBroken = fakeStorage({ throwSet: true });
    readOnlyBroken.data.set(storageKey(icao, 'audit'), JSON.stringify({ schemaVersion: 1, entries: [entry] }));
    expect(loadAudit(createBrowserStore(() => readOnlyBroken), icao, cap).entries).toHaveLength(1);
    const real = fakeStorage({ throwGet: true });
    const store = createBrowserStore(() => real);
    writeLog(store, icao, [entry]);
    expect(real.data.size).toBe(1);
  });

  it('uses working storage normally and does not report a fallback', () => {
    const real = fakeStorage();
    const store = createBrowserStore(() => real);
    writeLog(store, icao, [entry]);
    expect(real.data.has(storageKey(icao, 'audit'))).toBe(true);
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
    expect(loadAudit(angry, icao, 10).entries).toEqual([]);
    expect(() => clearAudit(angry, icao)).not.toThrow();
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
// caller to check once app.json is read (App.tsx's loadInitialPack, proved in tests/v2).
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
    expect(store.getItem(storageKey('YSSY', 'audit'))).toBeNull();
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

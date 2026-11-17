// Storage layer: the browser store's fallbacks and the airport last chosen. (The saved pack copy has its own
// tests in tests/v2/packCache*.) Storage is a fake object, so nothing touches a browser.
import { describe, expect, it } from 'vitest';
import {
  clearSelectedAirport,
  createBrowserStore,
  createMemoryStore,
  KEY_PREFIX,
  loadSelectedAirportId,
  saveSelectedAirport,
  type StorageLike,
  type Store,
} from '../../src/store';

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

describe('browser store with failing storage', () => {
  it('falls back to memory when every call throws, with no crash', () => {
    const store = createBrowserStore(() => fakeStorage({ throwGet: true, throwSet: true }));
    saveSelectedAirport(store, 'YSSY');
    expect(loadSelectedAirportId(store)).toBe('YSSY');
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
      saveSelectedAirport(store, 'YSSY');
      expect(loadSelectedAirportId(store)).toBe('YSSY');
    }
  });

  it('reads through when only writes fail, and writes through when only reads fail', () => {
    const readOnlyBroken = fakeStorage({ throwSet: true });
    readOnlyBroken.data.set(`${KEY_PREFIX}:selectedAirport`, JSON.stringify({ schemaVersion: 1, icao: 'YMML' }));
    expect(loadSelectedAirportId(createBrowserStore(() => readOnlyBroken))).toBe('YMML');
    const real = fakeStorage({ throwGet: true });
    saveSelectedAirport(createBrowserStore(() => real), 'YSSY');
    expect(real.data.size).toBe(1);
  });

  it('uses working storage normally and does not report a fallback', () => {
    const real = fakeStorage();
    const store = createBrowserStore(() => real);
    saveSelectedAirport(store, 'YSSY');
    expect(real.data.has(`${KEY_PREFIX}:selectedAirport`)).toBe(true);
    expect(store.usingMemoryFallback()).toBe(false);
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

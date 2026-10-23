// Storage seam (DESIGN section 4a). Everything stored is a JSON string under a
// key. The interface has the shape of the browser's Storage, so localStorage
// fits; a future server store can implement the same three methods.
//
// Browser globals are reached only through an injected accessor, so every test
// runs under Node with a fake. Storage can be missing or can throw (private
// window, blocked site data, quota): this module never lets that escape, and
// keeps the values in memory so the page still works for the visit.

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What a browser Storage object offers, and nothing more. */
export type StorageLike = Store;

/** Returns the storage object, or undefined when there is none. May itself throw (blocked data). */
export type StorageAccessor = () => StorageLike | undefined;

export const KEY_PREFIX = 'runway-planner:v1';

const ICAO_PATTERN = /^[A-Za-z0-9]{2,8}$/;

export type StoredName = 'currentMode' | 'audit' | 'forecastWindow';

/** The key for one record of one airport (AG-8): switching airport never reads another airport's key. */
export function storageKey(icao: string, name: StoredName): string {
  if (!ICAO_PATTERN.test(icao)) throw new RangeError('Airport code must be 2 to 8 letters or digits');
  return `${KEY_PREFIX}:${icao.toUpperCase()}:${name}`;
}

export interface BrowserStore extends Store {
  /** True once any read or write fell back to memory, so the screen can say that nothing will persist. */
  usingMemoryFallback(): boolean;
}

const defaultAccessor: StorageAccessor = () => globalThis.localStorage;

/**
 * A Store over the injected storage with an in-memory fallback. A key whose
 * write failed is served from memory until a later write to storage succeeds.
 */
export function createBrowserStore(accessor: StorageAccessor = defaultAccessor): BrowserStore {
  const memory = new Map<string, string>();
  let fellBack = false;

  const storage = (): StorageLike | undefined => {
    try {
      return accessor();
    } catch {
      return undefined;
    }
  };

  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key) ?? null;
      const s = storage();
      if (s === undefined) {
        fellBack = true;
        return null;
      }
      try {
        return s.getItem(key);
      } catch {
        fellBack = true;
        return null;
      }
    },
    setItem(key, value) {
      const s = storage();
      try {
        if (s === undefined) throw new Error('no storage');
        s.setItem(key, value);
        memory.delete(key);
      } catch {
        fellBack = true;
        memory.set(key, value);
      }
    },
    removeItem(key) {
      memory.delete(key);
      const s = storage();
      try {
        s?.removeItem(key);
      } catch {
        fellBack = true;
      }
    },
    usingMemoryFallback: () => fellBack,
  };
}

/** A plain in-memory Store, for tests and for a page with no storage at all. */
export function createMemoryStore(): Store {
  const memory = new Map<string, string>();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  };
}

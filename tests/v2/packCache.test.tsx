// The saved copy of a pack (issue 183): a repeat visit within 24 hours shows the pack at once, a fresh fetch always
// follows and is swapped in silently, and anything wrong with the saved copy means "load exactly as before".
// Static markup and plain functions, like tests/v2/airportEntry.test.tsx: the page's decisions live in exported
// functions of src/v2/App.tsx, so no browser is needed.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadPack, packFromSavedText, type SavedPackText } from '../../src/refdata';
import { KEY_PREFIX, PACK_CACHE_MAX_AGE_MS, createMemoryStore, loadSavedPack, saveSavedPack, saveSelectedAirport, type Store } from '../../src/store';
import { PACK_CACHE_MAX_CHARS } from '../../src/store/packCache';
import { AppBody, afterFreshInitial, afterFreshSwitch, initialPackState, loadInitialPack, switchAirportTo, switchFromSaved, type PackState } from '../../src/v2/App';
import { createController } from '../../src/v2/controller';
import { savedPackFor } from '../../src/v2/savedPack';
import { TEST_PACK, YSSY_PACK, readJson, toRaw, type JsonFiles, type PackRef } from '../helpers/packs';

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const AIRPORTS = ['YSSY', 'TEST'];
const TIMERS = { setInterval: () => 0, clearInterval: () => undefined };

type Ready = Extract<PackState, { status: 'ready' }>;

/** The files of an airport, optionally changed (a different airport name makes a different, still valid, pack). */
function filesOf(ref: PackRef, name?: string): JsonFiles {
  const files = readJson(ref);
  if (name !== undefined) files['airport.json'].name = name;
  return files;
}
const appText = (def: string): string => JSON.stringify({ schemaVersion: 1, airports: AIRPORTS, default: def });
function textOf(ref: PackRef, files: JsonFiles = readJson(ref)): SavedPackText {
  const icao = files['airport.json'].icao as string;
  return { airportId: icao, app: appText(icao), files: toRaw(files) };
}
function packOf(ref: PackRef, files?: JsonFiles) {
  const r = packFromSavedText(textOf(ref, files));
  if (r === null) throw new Error('setup: the pack should be valid');
  return r.pack;
}

/** A fake server: answers with `state.packs[icao]`; `state.down` makes every request fail; `calls` records every address. */
function server(packs: Record<string, JsonFiles>, def: string) {
  const calls: string[] = [];
  const state = { down: false, packs };
  const fetch = async (url: string): Promise<Response> => {
    calls.push(url);
    if (state.down) return new Response('down', { status: 503 });
    const path = url.split('?')[0] ?? '';
    if (path.endsWith('/app.json')) return new Response(appText(def));
    const icao = /\/airports\/([^/]+)\//.exec(path)?.[1] ?? '';
    const files = state.packs[icao];
    const name = path.split('/').pop() as keyof ReturnType<typeof toRaw>;
    return files !== undefined && files[name] !== undefined ? new Response(toRaw(files)[name]) : new Response('missing', { status: 404 });
  };
  return { fetch, calls, state };
}

const depsOf = (fetch: (url: string) => Promise<Response>, store: Store = createMemoryStore(), now: () => number = () => NOW) => ({ fetch, now, store });
const NEVER = (): Promise<Response> => new Promise(() => undefined);
const nameOf = (state: PackState): string | null => (state.status === 'ready' ? state.pack.airport.name : null);

describe('the saved copy: expiry (one named constant, 24 hours)', () => {
  it('is 24 hours', () => {
    expect(PACK_CACHE_MAX_AGE_MS).toBe(24 * HOUR);
  });

  it('is used 1 ms before 24 hours; expired exactly at 24 hours (the boundary is expired) and after', () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK), NOW);
    expect(loadSavedPack(store, 'TEST', NOW + PACK_CACHE_MAX_AGE_MS - 1)).not.toBeNull();
    expect(loadSavedPack(store, 'TEST', NOW + PACK_CACHE_MAX_AGE_MS)).toBeNull();
    saveSavedPack(store, textOf(TEST_PACK), NOW);
    expect(loadSavedPack(store, 'TEST', NOW + PACK_CACHE_MAX_AGE_MS + 1)).toBeNull();
  });

  it('is ignored through the page too: the page starts on the loading screen, as today', () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), NOW, true);
    const later = () => NOW + PACK_CACHE_MAX_AGE_MS + 1;
    expect(savedPackFor(depsOf(NEVER, store, later), undefined)).toBeNull();
    expect(initialPackState(savedPackFor(depsOf(NEVER, store, later), undefined))).toEqual({ status: 'loading' });
  });

  it('a copy dated in the future (a clock set back) is ignored', () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK), NOW + 1);
    expect(loadSavedPack(store, 'TEST', NOW)).toBeNull();
  });
});

describe('the saved copy: shown at once', () => {
  it('renders from the saved pack while a fetch that never resolves is still outstanding', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK), NOW, true);
    const deps = depsOf(NEVER, store);
    const pending = loadInitialPack(deps, undefined); // the fresh fetch: it never completes
    const saved = savedPackFor(deps, undefined);
    expect(saved?.pack.airport.icao).toBe('TEST');
    const state = initialPackState(saved);
    expect(state.status).toBe('ready');
    const html = renderToStaticMarkup(<AppBody state={state} deps={deps} />);
    expect(html).not.toContain('Loading the airport pack');
    expect(html).toContain('<option value="TEST" selected="">');
    const settled = await Promise.race([pending.then(() => 'done'), Promise.resolve('still waiting')]);
    expect(settled).toBe('still waiting');
  });

  it('with an airport chosen earlier, that airport own copy is used', () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(YSSY_PACK), NOW);
    saveSelectedAirport(store, 'YSSY');
    expect(savedPackFor(depsOf(NEVER, store), 'YSSY')?.pack.airport.icao).toBe('YSSY');
  });
});

describe('the saved copy: anything wrong means no saved copy', () => {
  const key = `${KEY_PREFIX}:packCache:TEST`;
  const good = (): Record<string, unknown> => ({ schemaVersion: 1, savedAt: NOW, app: appText('TEST'), files: toRaw(readJson(TEST_PACK)) });
  const put = (value: unknown, text?: string): Store => {
    const store = createMemoryStore();
    store.setItem(key, text ?? JSON.stringify(value));
    return store;
  };

  it('a good record is used (control)', () => {
    expect(savedPackFor(depsOf(NEVER, put(good())), 'TEST')?.pack.airport.icao).toBe('TEST');
  });

  it('corrupt text is ignored and discarded', () => {
    const store = put(null, '{not json');
    expect(savedPackFor(depsOf(NEVER, store), 'TEST')).toBeNull();
    expect(store.getItem(key)).toBeNull();
  });

  it('an unsupported schemaVersion is ignored', () => {
    expect(savedPackFor(depsOf(NEVER, put({ ...good(), schemaVersion: 2 })), 'TEST')).toBeNull();
  });

  it('an unknown extra field is ignored', () => {
    expect(savedPackFor(depsOf(NEVER, put({ ...good(), extra: 1 })), 'TEST')).toBeNull();
  });

  it('an oversize record is ignored and discarded', () => {
    const store = put({ ...good(), app: 'x'.repeat(PACK_CACHE_MAX_CHARS + 1) });
    expect(savedPackFor(depsOf(NEVER, store), 'TEST')).toBeNull();
    expect(store.getItem(key)).toBeNull();
  });

  it('a record that is well formed but holds an invalid pack is ignored and discarded', () => {
    const files = toRaw(readJson(TEST_PACK));
    const store = put({ ...good(), files: { ...files, 'modes.json': '{"schemaVersion":1,"modes":"nonsense"}' } });
    expect(savedPackFor(depsOf(NEVER, store), 'TEST')).toBeNull();
    expect(store.getItem(key)).toBeNull();
  });

  it('a pack file with a forbidden key is ignored', () => {
    const files = toRaw(readJson(TEST_PACK));
    const sneaky = { ...good(), files: { ...files, 'settings.json': files['settings.json'].replace('{', '{"__proto__":{},') } };
    expect(savedPackFor(depsOf(NEVER, put(sneaky)), 'TEST')).toBeNull();
  });

  it('text saved for one airport that is another airport pack is refused', () => {
    const wrong = { ...good(), files: toRaw(readJson(YSSY_PACK)) };
    expect(savedPackFor(depsOf(NEVER, put(wrong)), 'TEST')).toBeNull();
    expect(packFromSavedText({ airportId: 'TEST', app: appText('TEST'), files: toRaw(readJson(YSSY_PACK)) })).toBeNull();
  });

  it('an airport no longer listed in the saved app.json is refused', () => {
    expect(packFromSavedText({ ...textOf(TEST_PACK), app: JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'YSSY' }) })).toBeNull();
  });
});

describe('storage that is missing or throws', () => {
  const broken: Store = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };

  it('gives no saved copy and never throws', () => {
    expect(savedPackFor(depsOf(NEVER, broken), undefined)).toBeNull();
    expect(savedPackFor(depsOf(NEVER, broken), 'TEST')).toBeNull();
  });

  it('saving does not throw and the first load falls back to today (fresh fetch, pack shown)', async () => {
    const srv = server({ TEST: filesOf(TEST_PACK) }, 'TEST');
    const r = await loadInitialPack(depsOf(srv.fetch, broken), undefined);
    expect(r.ok && r.pack.airport.icao).toBe('TEST');
  });

  it('a switch with broken storage loads fresh and shows the result', async () => {
    const srv = server({ YSSY: filesOf(YSSY_PACK), TEST: filesOf(TEST_PACK) }, 'YSSY');
    const first = await loadPack(srv.fetch, { cacheBust: 'a' });
    if (!first.ok) throw new Error('setup');
    const current: Ready = { status: 'ready', pack: first.pack, airports: AIRPORTS, airportError: null };
    expect(switchFromSaved(current, 'TEST', depsOf(srv.fetch, broken))).toBeNull();
    const change = await switchAirportTo(current, 'TEST', depsOf(srv.fetch, broken));
    expect(change?.pack?.airport.icao).toBe('TEST');
  });
});

describe('the fresh fetch always follows and is swapped in silently', () => {
  it('a fresh pack that differs replaces the one on screen and the saved copy', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), NOW, true);
    const srv = server({ TEST: filesOf(TEST_PACK, 'New name') }, 'TEST');
    const deps = depsOf(srv.fetch, store);
    const saved = savedPackFor(deps, undefined);
    const shown = initialPackState(saved);
    expect(nameOf(shown)).toBe('Old name');
    const r = await loadInitialPack(deps, undefined);
    expect(srv.calls.length).toBe(6);
    expect(srv.calls.every((u) => /\?v=[A-Za-z0-9._-]+$/.test(u))).toBe(true);
    expect(nameOf(afterFreshInitial(shown, saved, r))).toBe('New name');
    expect(savedPackFor(deps, 'TEST')?.pack.airport.name).toBe('New name');
  });

  it('an unchanged fresh pack leaves the state object as it was (no redraw)', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK), NOW, true);
    const srv = server({ TEST: filesOf(TEST_PACK) }, 'TEST');
    const deps = depsOf(srv.fetch, store);
    const saved = savedPackFor(deps, undefined);
    const shown = initialPackState(saved);
    expect(afterFreshInitial(shown, saved, await loadInitialPack(deps, undefined))).toBe(shown);
  });

  it('an invalid fresh pack keeps the saved copy on screen, shows no error, and leaves the stored copy as it was', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), NOW, true);
    const keyOf = `${KEY_PREFIX}:packCache:TEST`;
    const before = store.getItem(keyOf);
    const bad = filesOf(TEST_PACK, 'Bad name');
    bad['modes.json'] = { schemaVersion: 1, modes: 'nonsense' };
    const srv = server({ TEST: bad }, 'TEST');
    const deps = depsOf(srv.fetch, store);
    const saved = savedPackFor(deps, undefined);
    const shown = initialPackState(saved);
    const r = await loadInitialPack(deps, undefined);
    expect(r.ok).toBe(false);
    // the saved copy stays on screen with no error screen (the quiet line is covered in packCacheNotice.test.tsx)
    const after = afterFreshInitial(shown, saved, r);
    expect(after.status).toBe('ready');
    expect(nameOf(after)).toBe('Old name');
    expect(store.getItem(keyOf)).toBe(before);
    expect(savedPackFor(deps, 'TEST')?.pack.airport.name).toBe('Old name');
  });

  it('a network failure with a saved copy on screen shows no error; with none, the error screen as today', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK), NOW, true);
    const srv = server({ TEST: filesOf(TEST_PACK) }, 'TEST');
    srv.state.down = true;
    const deps = depsOf(srv.fetch, store);
    const saved = savedPackFor(deps, undefined);
    const shown = initialPackState(saved);
    const r = await loadInitialPack(deps, undefined);
    expect(afterFreshInitial(shown, saved, r)).toBe(shown);
    expect(afterFreshInitial({ status: 'loading' }, null, r).status).toBe('error');
  });

  it('the operator switching airport before the fresh copy arrives is not overridden', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK), NOW, true);
    const srv = server({ TEST: filesOf(TEST_PACK, 'New name') }, 'TEST');
    const deps = depsOf(srv.fetch, store);
    const saved = savedPackFor(deps, undefined);
    const elsewhere: Ready = { status: 'ready', pack: packOf(YSSY_PACK), airports: AIRPORTS, airportError: null };
    expect(afterFreshInitial(elsewhere, saved, await loadInitialPack(deps, undefined))).toBe(elsewhere);
  });
});

describe('Reload data ignores the saved copy', () => {
  it('fetches fresh with a bust token, uses the fresh pack, and stores it', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), NOW, true);
    const srv = server({ TEST: filesOf(TEST_PACK, 'New name') }, 'TEST');
    const controller = createController({ pack: packOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), fetch: srv.fetch, now: () => NOW, store, timers: TIMERS });
    await controller.reloadPack();
    expect(srv.calls.some((u) => /\/app\.json\?v=[a-z0-9]+$/.test(u))).toBe(true);
    expect(srv.calls.filter((u) => u.includes('/airports/TEST/')).length).toBe(5);
    expect(controller.getState().view.pack.airport.name).toBe('New name');
    expect(controller.getState().reload.status).toBe('changed');
    expect(savedPackFor(depsOf(NEVER, store), 'TEST')?.pack.airport.name).toBe('New name');
  });

  it('a recent saved copy is not used instead of the network: a failure is shown and the pack in use stays', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK, filesOf(TEST_PACK, 'Saved name')), NOW - HOUR, true);
    const srv = server({ TEST: filesOf(TEST_PACK) }, 'TEST');
    srv.state.down = true;
    const controller = createController({ pack: packOf(TEST_PACK), fetch: srv.fetch, now: () => NOW, store, timers: TIMERS });
    await controller.reloadPack();
    expect(controller.getState().reload.status).toBe('refused');
    expect(controller.getState().view.pack.airport.name).toBe('Testfield');
  });

  it('replacePack (the silent swap) uses a changed pack and ignores the same one', () => {
    const controller = createController({ pack: packOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), fetch: NEVER, now: () => NOW, store: createMemoryStore(), timers: TIMERS });
    const before = controller.getState();
    controller.replacePack(packOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')));
    expect(controller.getState()).toBe(before);
    controller.replacePack(packOf(TEST_PACK, filesOf(TEST_PACK, 'New name')));
    expect(controller.getState().view.pack.airport.name).toBe('New name');
    expect(controller.getState().reload.status).toBe('idle');
  });
});

describe('an airport switch uses that airport own saved copy only (AG-8)', () => {
  const current: Ready = { status: 'ready', pack: packOf(YSSY_PACK), airports: AIRPORTS, airportError: null };

  it('shows the saved copy of the airport chosen, then swaps the fresh one in', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(YSSY_PACK), NOW);
    saveSavedPack(store, textOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), NOW);
    const srv = server({ YSSY: filesOf(YSSY_PACK), TEST: filesOf(TEST_PACK, 'New name') }, 'YSSY');
    const deps = depsOf(srv.fetch, store);
    const quick = switchFromSaved(current, 'TEST', deps);
    expect(quick?.pack?.airport.icao).toBe('TEST');
    expect(quick?.pack?.airport.name).toBe('Old name');
    const shown: PackState = { ...current, ...quick };
    const change = await switchAirportTo(current, 'TEST', deps);
    expect(srv.calls.every((u) => !u.includes('/airports/YSSY/'))).toBe(true);
    expect(nameOf(afterFreshSwitch(shown, 'TEST', change))).toBe('New name');
    // a failed fresh fetch, or one that lands after the operator moved on, changes nothing
    expect(afterFreshSwitch(shown, 'TEST', { airportError: 'x' })).toBe(shown);
    expect(afterFreshSwitch(current, 'TEST', change)).toBe(current);
  });

  it('never uses another airport copy: with only YSSY saved, switching to TEST has no saved copy', () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(YSSY_PACK), NOW);
    expect(switchFromSaved(current, 'TEST', depsOf(NEVER, store))).toBeNull();
  });

  it('YSSY text filed under the TEST key is refused rather than shown as TEST', () => {
    const store = createMemoryStore();
    saveSavedPack(store, { ...textOf(YSSY_PACK), airportId: 'TEST' }, NOW);
    expect(switchFromSaved(current, 'TEST', depsOf(NEVER, store))).toBeNull();
  });

  it('an airport not listed in app.json is refused even if a copy exists', () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK), NOW);
    expect(switchFromSaved({ ...current, airports: ['YSSY'] }, 'TEST', depsOf(NEVER, store))).toBeNull();
  });
});

// The quiet line shown when a saved pack is on screen and the latest pack is refused by validation (issue 183, scope
// change of 04-11-2026), and review findings 3 and 4. Helpers are small copies of those in packCache.test.tsx.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { packFromSavedText, type SavedPackText } from '../../src/refdata';
import { createMemoryStore, loadSavedPack, saveSavedPack, type Store } from '../../src/store';
import { AppBody, afterFreshInitial, afterFreshSwitch, initialPackState, loadInitialPack, switchAirportTo, switchFromSaved, type PackState } from '../../src/v2/App';
import { createController } from '../../src/v2/controller';
import { savedDataNotice, savedNoticeFor } from '../../src/v2/model/notice';
import { savedPackFor } from '../../src/v2/savedPack';
import { TEST_PACK, YSSY_PACK, readJson, toRaw, type JsonFiles, type PackRef } from '../helpers/packs';

const SAVED_AT = Date.UTC(2026, 10, 4, 9, 15, 0);
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const AIRPORTS = ['YSSY', 'TEST'];
const TIMERS = { setInterval: () => 0, clearInterval: () => undefined };
type Ready = Extract<PackState, { status: 'ready' }>;

function filesOf(ref: PackRef, name?: string): JsonFiles {
  const files = readJson(ref);
  if (name !== undefined) files['airport.json'].name = name;
  return files;
}
const brokenFiles = (): JsonFiles => {
  const bad = filesOf(TEST_PACK, 'Bad name');
  bad['modes.json'] = { schemaVersion: 1, modes: 'nonsense' };
  return bad;
};
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
function server(packs: Record<string, JsonFiles>, def: string) {
  const state = { down: false };
  const fetch = async (url: string): Promise<Response> => {
    if (state.down) return new Response('down', { status: 503 });
    const path = url.split('?')[0] ?? '';
    if (path.endsWith('/app.json')) return new Response(appText(def));
    const files = packs[/\/airports\/([^/]+)\//.exec(path)?.[1] ?? ''];
    const name = path.split('/').pop() as keyof ReturnType<typeof toRaw>;
    return files !== undefined && files[name] !== undefined ? new Response(toRaw(files)[name]) : new Response('missing', { status: 404 });
  };
  return { fetch, state };
}
const depsOf = (fetch: (url: string) => Promise<Response>, store: Store = createMemoryStore(), now: () => number = () => NOW) => ({ fetch, now, store });
const NEVER = (): Promise<Response> => new Promise(() => undefined);
const nameOf = (state: PackState): string | null => (state.status === 'ready' ? state.pack.airport.name : null);
const refusalOf = (state: PackState): string | null | undefined => (state.status === 'ready' ? state.refusal : undefined);

/** The saved TEST copy is on screen (saved at 09:15 UTC) and the fresh load then runs against `fresh`. */
async function startWithSaved(fresh: (url: string) => Promise<Response>) {
  const store = createMemoryStore();
  saveSavedPack(store, textOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), SAVED_AT, true);
  const deps = depsOf(fresh, store);
  const saved = savedPackFor(deps, undefined);
  const shown = initialPackState(saved);
  const r = await loadInitialPack(deps, undefined);
  return { deps, saved, shown, after: afterFreshInitial(shown, saved, r) };
}

describe('the quiet line when the latest pack is refused', () => {
  it('NOTICE (fails if the notice is removed): a refused fresh pack with a saved copy on screen says so, with the saved time and the loader text', async () => {
    const { after, deps } = await startWithSaved(server({ TEST: brokenFiles() }, 'TEST').fetch);
    expect(refusalOf(after)).toMatch(/^modes\.json: /);
    const html = renderToStaticMarkup(<AppBody state={after} deps={deps} />);
    expect(html).toContain('class="saved-note"');
    expect(html).toMatch(/Showing saved data from 09:15 UTC\. The latest data was refused: modes\.json: /);
    expect(html).toContain('<option value="TEST" selected="">'); // the saved pack still drives the screen
    expect(nameOf(after)).toBe('Old name');
  });

  it('nothing is drawn when there is no refusal', async () => {
    const { shown, deps } = await startWithSaved(server({ TEST: filesOf(TEST_PACK) }, 'TEST').fetch);
    expect(renderToStaticMarkup(<AppBody state={shown} deps={deps} />)).not.toContain('saved-note');
  });

  it('the date is added only when the saved copy is not from today', () => {
    expect(savedDataNotice(SAVED_AT, 'x', NOW)).toBe('Showing saved data from 09:15 UTC. The latest data was refused: x');
    expect(savedDataNotice(SAVED_AT, 'x', NOW + 24 * HOUR)).toBe('Showing saved data from 04-11-2026 09:15 UTC. The latest data was refused: x');
  });

  it('a long loader message is shortened, not reworded', () => {
    const line = savedDataNotice(SAVED_AT, `modes.json: ${'a'.repeat(400)}`, NOW);
    expect(line.length).toBeLessThan(260);
    expect(line.endsWith('...')).toBe(true);
  });

  it('an HTTP error shows no line', async () => {
    const srv = server({ TEST: filesOf(TEST_PACK) }, 'TEST');
    srv.state.down = true;
    const { after, shown } = await startWithSaved(srv.fetch);
    expect(after).toBe(shown);
  });

  it('a timeout and a thrown network error show no line', async () => {
    for (const make of [() => new DOMException('timed out', 'TimeoutError'), () => new TypeError('Failed to fetch')]) {
      const { after, shown } = await startWithSaved(async () => {
        throw make();
      });
      expect(after).toBe(shown);
    }
  });

  it('a body over its size cap counts as refused and is shown', async () => {
    const good = server({ TEST: filesOf(TEST_PACK) }, 'TEST');
    const { after } = await startWithSaved(async (url) => (url.includes('/modes.json') ? new Response('x'.repeat(300 * 1024)) : good.fetch(url)));
    expect(refusalOf(after)).toMatch(/larger than/);
  });

  it('no saved copy: the normal error screen applies, no line', async () => {
    const r = await loadInitialPack(depsOf(server({ TEST: brokenFiles() }, 'TEST').fetch), undefined);
    expect(afterFreshInitial({ status: 'loading' }, null, r).status).toBe('error');
  });

  it('clears when a later load succeeds, whether the pack changed or not', async () => {
    const { after, saved, deps } = await startWithSaved(server({ TEST: brokenFiles() }, 'TEST').fetch);
    const changed = await loadInitialPack({ ...deps, fetch: server({ TEST: filesOf(TEST_PACK, 'Fixed name') }, 'TEST').fetch }, undefined);
    const next = afterFreshInitial(after, saved, changed);
    expect(refusalOf(next)).toBeNull();
    expect(nameOf(next)).toBe('Fixed name');
    const same = await loadInitialPack({ ...deps, fetch: server({ TEST: filesOf(TEST_PACK, 'Old name') }, 'TEST').fetch }, undefined);
    expect(refusalOf(afterFreshInitial(after, saved, same))).toBeNull();
  });

  it('Reload data succeeding hides the line; a refused reload leaves it', () => {
    const refusal = { savedAt: SAVED_AT, text: 'x' };
    expect(savedNoticeFor(refusal, 'changed', NOW)).toBeNull();
    expect(savedNoticeFor(refusal, 'unchanged', NOW)).toBeNull();
    expect(savedNoticeFor(refusal, 'refused', NOW)).not.toBeNull();
    expect(savedNoticeFor(refusal, 'idle', NOW)).not.toBeNull();
    expect(savedNoticeFor(null, 'idle', NOW)).toBeNull();
  });

  it('an airport switch clears it, with or without a saved copy of the new airport', async () => {
    const { after } = await startWithSaved(server({ TEST: brokenFiles() }, 'TEST').fetch);
    if (after.status !== 'ready') throw new Error('setup');
    const current: Ready = { ...after, airports: AIRPORTS };
    const store = createMemoryStore();
    saveSavedPack(store, textOf(YSSY_PACK), NOW);
    expect({ ...current, ...switchFromSaved(current, 'YSSY', depsOf(NEVER, store)) }.refusal).toBeNull();
    const fresh = server({ YSSY: filesOf(YSSY_PACK) }, 'YSSY');
    expect({ ...current, ...(await switchAirportTo(current, 'YSSY', depsOf(fresh.fetch))) }.refusal).toBeNull();
  });

  it('a switch shown from a saved copy says so when its fresh pack is refused, and is silent on a network failure', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK, filesOf(TEST_PACK, 'Old name')), SAVED_AT);
    const current: Ready = { status: 'ready', pack: packOf(YSSY_PACK), airports: AIRPORTS, airportError: null };
    const shown: PackState = { ...current, ...switchFromSaved(current, 'TEST', depsOf(NEVER, store)) };
    expect(shown.status === 'ready' && shown.savedAt).toBe(SAVED_AT);
    const refused = await switchAirportTo(current, 'TEST', depsOf(server({ TEST: brokenFiles() }, 'YSSY').fetch, store));
    expect(refusalOf(afterFreshSwitch(shown, 'TEST', refused))).toMatch(/^modes\.json: /);
    const down = server({ TEST: filesOf(TEST_PACK) }, 'YSSY');
    down.state.down = true;
    expect(afterFreshSwitch(shown, 'TEST', await switchAirportTo(current, 'TEST', depsOf(down.fetch, store)))).toBe(shown);
  });
});

describe('review findings 3 and 4', () => {
  it('3: when a chosen airport cannot be loaded and the default can, its saved copy is cleared', async () => {
    const store = createMemoryStore();
    saveSavedPack(store, textOf(TEST_PACK), NOW);
    const r = await loadInitialPack(depsOf(server({ YSSY: filesOf(YSSY_PACK) }, 'YSSY').fetch, store), 'TEST');
    expect(r.ok && r.pack.airport.icao).toBe('YSSY');
    expect(loadSavedPack(store, 'TEST', NOW)).toBeNull();
  });

  it('3: a chosen airport that is also the default, failing once and then loading on the retry, keeps its saved copy', async () => {
    const store = createMemoryStore();
    const good = server({ TEST: filesOf(TEST_PACK) }, 'TEST');
    let calls = 0;
    const flaky = async (url: string): Promise<Response> => (++calls === 1 ? new Response('down', { status: 503 }) : good.fetch(url));
    const r = await loadInitialPack(depsOf(flaky, store), 'TEST');
    expect(r.ok && r.pack.airport.icao).toBe('TEST');
    expect(loadSavedPack(store, 'TEST', NOW)).not.toBeNull();
  });

  it('4: a background pack arriving after Reload data succeeded does not replace the reloaded one', async () => {
    const srv = server({ TEST: filesOf(TEST_PACK, 'Reloaded name') }, 'TEST');
    const controller = createController({ pack: packOf(TEST_PACK, filesOf(TEST_PACK, 'Saved name')), fetch: srv.fetch, now: () => NOW, store: createMemoryStore(), timers: TIMERS });
    await controller.reloadPack();
    controller.replacePack(packOf(TEST_PACK, filesOf(TEST_PACK, 'Older initial name')));
    expect(controller.getState().view.pack.airport.name).toBe('Reloaded name');
  });
});

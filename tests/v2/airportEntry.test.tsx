// The v2 airport switch (v2's own copy of src/ui/App.tsx's logic): what choosing an option does
// (switchAirportTo), and what a page refresh opens on (loadInitialPack, OD-82). See
// tests/ui/airportEntry.test.tsx for the same behaviour on v1; kept separate because v2 imports
// nothing from src/ui.
import { describe, expect, it } from 'vitest';
import { parsePack } from '../../src/refdata';
import { createMemoryStore, loadSelectedAirportId, saveSelectedAirport } from '../../src/store';
import { loadInitialPack, switchAirportTo, type PackState } from '../../src/v2/App';
import { TEST_PACK, YSSY_PACK, readJson, toRaw, type PackRef } from '../helpers/packs';

const NOW = Date.UTC(2026, 9, 24, 3, 0, 0);
const yssy = parsePack(toRaw(readJson(YSSY_PACK)));

/** A fake server for one pack's files, answering for whichever airport folder is asked for. */
function serve(ref: PackRef, airports: string[]): (url: string) => Promise<Response> {
  const files = readJson(ref);
  const raw = toRaw(files);
  const icao = files['airport.json'].icao as string;
  return async (url: string) => {
    const path = url.split('?')[0] ?? '';
    if (path.endsWith('/app.json')) return new Response(JSON.stringify({ schemaVersion: 1, airports, default: icao }));
    const name = path.split('/').pop() as keyof typeof raw;
    return name in raw ? new Response(raw[name]) : new Response('missing', { status: 404 });
  };
}

/** A fake server over two real packs, routing by the airport id in the URL, so a switch to the other pack is genuine. */
function serveTwo(defaultRef: PackRef, otherRef: PackRef, listed: string[]): (url: string) => Promise<Response> {
  const defaultFiles = readJson(defaultRef);
  const otherFiles = readJson(otherRef);
  const defaultRaw = toRaw(defaultFiles);
  const otherRaw = toRaw(otherFiles);
  const defaultIcao = defaultFiles['airport.json'].icao as string;
  const otherIcao = otherFiles['airport.json'].icao as string;
  return async (url: string) => {
    const path = url.split('?')[0] ?? '';
    if (path.endsWith('/app.json')) return new Response(JSON.stringify({ schemaVersion: 1, airports: listed, default: defaultIcao }));
    const requested = /\/airports\/([^/]+)\//.exec(path)?.[1];
    const raw = requested === otherIcao ? otherRaw : defaultRaw;
    const name = path.split('/').pop() as keyof typeof raw;
    return name in raw ? new Response(raw[name]) : new Response('missing', { status: 404 });
  };
}

describe('switchAirportTo', () => {
  const base: Extract<PackState, { status: 'ready' }> = { status: 'ready', pack: yssy, airports: ['YSSY', 'TEST'], airportError: null };
  const deps = { fetch: serve(TEST_PACK, ['YSSY', 'TEST']), now: () => NOW, store: createMemoryStore() };

  it('switches to a listed airport and clears any earlier refusal', async () => {
    const change = await switchAirportTo({ ...base, airportError: 'No data pack for ABCD yet.' }, 'TEST', deps);
    expect(change).not.toBeNull();
    expect(change?.pack?.airport.icao).toBe('TEST');
    expect(change?.airportError).toBeNull();
  });

  it('says there is no pack for an unlisted code and changes nothing else', async () => {
    const asked: string[] = [];
    const watching = { ...deps, fetch: (url: string) => (asked.push(url), deps.fetch(url)) };
    const change = await switchAirportTo(base, 'EGLL', watching);
    expect(change).toEqual({ airportError: 'No data pack for EGLL yet. Available: YSSY, TEST.' });
    expect(asked).toEqual([]);
  });

  it('does nothing for the airport already shown', async () => {
    expect(await switchAirportTo(base, 'YSSY', deps)).toBeNull();
  });
});

// A refresh opens on the airport last chosen, not back at app.json's default (OD-82). loadInitialPack is what
// App's mount effect calls with loadSelectedAirportId(deps.store) ?? undefined.
describe('loadInitialPack (a refresh keeps the chosen airport)', () => {
  const deps = { fetch: serveTwo(YSSY_PACK, TEST_PACK, ['YSSY', 'TEST']), now: () => NOW, store: createMemoryStore() };

  it('with nothing stored, loads the default, exactly as before this change', async () => {
    const r = await loadInitialPack(deps, undefined);
    expect(r.ok && r.pack.airport.icao).toBe('YSSY');
  });

  it('with a stored, still-listed airport, loads that one instead of the default', async () => {
    const r = await loadInitialPack(deps, 'TEST');
    expect(r.ok && r.pack.airport.icao).toBe('TEST');
  });

  it('with a stored airport no longer listed in app.json, forgets it and loads the default', async () => {
    const store = createMemoryStore();
    saveSelectedAirport(store, 'WITHDRAWN');
    const r = await loadInitialPack({ ...deps, store }, loadSelectedAirportId(store) ?? undefined);
    expect(r.ok && r.pack.airport.icao).toBe('YSSY');
    expect(loadSelectedAirportId(store)).toBeNull();
  });

  it('with a stored airport whose pack fails its checks, forgets it and loads the default', async () => {
    const store = createMemoryStore();
    saveSelectedAirport(store, 'BAD1');
    const broken = { fetch: serveTwo(YSSY_PACK, TEST_PACK, ['YSSY', 'TEST', 'BAD1']), now: () => NOW, store };
    const r = await loadInitialPack(broken, loadSelectedAirportId(store) ?? undefined);
    expect(r.ok && r.pack.airport.icao).toBe('YSSY');
    expect(loadSelectedAirportId(store)).toBeNull();
  });

  it('a genuinely unreachable default still fails (nothing to fall back to further)', async () => {
    const dead = { fetch: async () => new Response('down', { status: 500 }), now: () => NOW, store: createMemoryStore() };
    const r = await loadInitialPack(dead, undefined);
    expect(r.ok).toBe(false);
  });
});

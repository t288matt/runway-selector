// The drawer's behaviour in the v2 controller: "Use my own weather" (paste, the
// input limits and refusals, pause and Resume automatic), the audit trail export
// and clear through the store, and Reload data. v2's own copy of v1's behaviour,
// proved on the same fixtures. Fake clock, timers and network (tests/v2/rig.ts).
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore, loadAudit, loadCurrentMode } from '../../src/store';
import { MAX_REPORT_CHARS } from '../../src/weather/decode';
import { YSSY_PACK } from '../helpers/packs';
import { fixture, nowOf, packWith } from '../weather/helpers';
import { datamaskBody, rig } from './rig';

const flags = vi.hoisted(() => ({ applyThrows: false }));
vi.mock('../../src/v2/model/apply', async (original) => {
  const real = await original<typeof import('../../src/v2/model/apply')>();
  return {
    ...real,
    applyTafText: (...a: Parameters<typeof real.applyTafText>) => {
      if (flags.applyThrows) throw new Error('decoder blew up');
      return real.applyTafText(...a);
    },
  };
});

const METAR = fixture('metar-yssy-auto-nodata');
const TAF = fixture('taf-yssy-multiline-fm-tempo');
const NOW = nowOf(TAF);
const pack = packWith(YSSY_PACK, { weatherStation: METAR.station });
const weatherPollMs = pack.settings.weatherPollMinutes * 60_000;

function weatherUp(r: ReturnType<typeof rig>): void {
  r.wx.metar = METAR.raw;
  r.wx.datamask = datamaskBody(pack, `TAF ${TAF.raw}`);
}
const asksOf = (r: ReturnType<typeof rig>, prefix: string): number => r.wx.urls.filter((u) => u.startsWith(prefix)).length;
const PASTED = METAR.raw.replace('02010KT', '09015KT');

describe('Use my own weather: pasted text', () => {
  it('replaces the report in use, recalculates, and marks it pasted with automatic updates paused', async () => {
    const r = rig(pack, NOW);
    weatherUp(r);
    r.ctrl.start();
    await r.advance(0);
    const before = r.ctrl.getState().view.result;
    const outcome = r.ctrl.applyMetar(PASTED);
    expect(outcome.ok).toBe(true);
    const s = r.ctrl.getState();
    expect(s.view.metar?.raw).toBe(PASTED);
    expect(s.view.result).not.toBe(before);
    expect(s.autoWeather.metar).toMatchObject({ source: 'pasted', paused: true, error: null });
    expect(s.autoWeather.taf).toMatchObject({ source: 'automatic', paused: false });
    r.ctrl.stop();
  });

  it('pauses automatic updates for that report only, until Resume automatic fetches it again', async () => {
    const r = rig(pack, NOW);
    weatherUp(r);
    r.ctrl.start();
    await r.advance(0);
    expect(r.ctrl.applyMetar(PASTED).ok).toBe(true);
    const [m0, t0] = [asksOf(r, 'https://metar.vatsim.net/'), asksOf(r, 'https://datamask.org/')];
    await r.advance(weatherPollMs * 2);
    expect(asksOf(r, 'https://metar.vatsim.net/')).toBe(m0);
    expect(asksOf(r, 'https://datamask.org/')).toBeGreaterThan(t0);
    expect(r.ctrl.getState().view.metar?.raw).toBe(PASTED);
    r.ctrl.resumeAutomatic('metar');
    await r.advance(0);
    expect(r.ctrl.getState().view.metar?.raw).toBe(METAR.raw);
    expect(r.ctrl.getState().autoWeather.metar).toMatchObject({ source: 'automatic', paused: false });
    r.ctrl.stop();
  });

  it('drops a fetch still in flight when the user pastes over it', async () => {
    const r = rig(pack, NOW);
    r.wx.metar = METAR.raw;
    r.ctrl.start();
    expect(r.ctrl.applyMetar(PASTED).ok).toBe(true);
    await r.advance(0);
    expect(r.ctrl.getState().view.metar?.raw).toBe(PASTED);
    r.ctrl.stop();
  });

  it.each([
    ['text that is not a report', 'metar', 'not a report at all'],
    ['a METAR for another station', 'metar', METAR.raw.replace(METAR.station, 'EGLL')],
    ['a TAF for another station', 'taf', TAF.raw.replace(TAF.station, 'EGLL')],
  ] as const)('refuses %s with a message and leaves the report in use and its automatic updates alone', async (_name, kind, text) => {
    const r = rig(pack, NOW);
    weatherUp(r);
    r.ctrl.start();
    await r.advance(0);
    const before = r.ctrl.getState();
    const outcome = kind === 'metar' ? r.ctrl.applyMetar(text) : r.ctrl.applyTaf(text);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).not.toBeNull();
    const after = r.ctrl.getState();
    expect(after.view).toBe(before.view);
    expect(after.autoWeather[kind]).toEqual(before.autoWeather[kind]);
    expect(after.autoWeather[kind].paused).toBe(false);
    r.ctrl.stop();
  });

  describe('input limits (SEC): the same limits and refusals as v1', () => {
    it('refuses a report longer than the limit, says so, and reads nothing', async () => {
      const r = rig(pack, NOW);
      weatherUp(r);
      r.ctrl.start();
      await r.advance(0);
      const before = r.ctrl.getState().view;
      const huge = `${METAR.raw} ${'X'.repeat(MAX_REPORT_CHARS)}`;
      const outcome = r.ctrl.applyMetar(huge);
      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain(`the limit is ${MAX_REPORT_CHARS}`);
      expect(outcome.message).toContain('Nothing was read');
      expect(r.ctrl.getState().view).toBe(before);
      const tafOutcome = r.ctrl.applyTaf(`${TAF.raw} ${'X'.repeat(MAX_REPORT_CHARS)}`);
      expect(tafOutcome.ok).toBe(false);
      expect(tafOutcome.message).toContain('Nothing was read');
      r.ctrl.stop();
    });

    it('refuses a group that is far too long to be real', async () => {
      const r = rig(pack, NOW);
      weatherUp(r);
      r.ctrl.start();
      await r.advance(0);
      const outcome = r.ctrl.applyMetar(`${METAR.raw} ${'A'.repeat(200)}`);
      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain('far too long to be real');
      r.ctrl.stop();
    });

    it('refuses a report that says there is none (NIL or cancelled) and keeps the previous report', async () => {
      const r = rig(pack, NOW);
      weatherUp(r);
      r.ctrl.start();
      await r.advance(0);
      const before = r.ctrl.getState().view;
      const nil = r.ctrl.applyMetar(`METAR ${METAR.station} 231100Z NIL`);
      expect(nil.ok).toBe(false);
      expect(nil.message).toContain('stays in use');
      expect(r.ctrl.getState().view).toBe(before);
      r.ctrl.stop();
    });

    it('an empty paste is refused, not read as no weather', async () => {
      const r = rig(pack, NOW);
      weatherUp(r);
      r.ctrl.start();
      await r.advance(0);
      const before = r.ctrl.getState().view;
      expect(r.ctrl.applyMetar('   ').ok).toBe(false);
      expect(r.ctrl.applyTaf('').ok).toBe(false);
      expect(r.ctrl.getState().view).toBe(before);
      r.ctrl.stop();
    });
  });

  it('a throw while reading pasted text is a refusal, not an exception out of the button', async () => {
    const r = rig(pack, NOW);
    weatherUp(r);
    r.ctrl.start();
    await r.advance(0);
    const before = r.ctrl.getState();
    flags.applyThrows = true;
    let outcome;
    try {
      outcome = r.ctrl.applyTaf(`TAF ${TAF.raw}`);
    } finally {
      flags.applyThrows = false;
    }
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('decoder blew up');
    expect(r.ctrl.getState().view).toBe(before.view);
    r.ctrl.stop();
  });

  it('a stopped controller takes no more weather answers (the safety from phase 1 still holds)', async () => {
    const r = rig(pack, NOW);
    weatherUp(r);
    r.ctrl.start();
    r.ctrl.stop();
    await r.advance(0);
    expect(r.ctrl.getState().view.metar).toBeNull();
  });
});

describe('the audit trail through the store', () => {
  it('records a change of the current mode, exports it as a file, and Clear empties the store as well as the screen', () => {
    const store = createMemoryStore();
    const r = rig(pack, NOW, store);
    const first = pack.modes.filter((m) => m.enabled)[0]?.id ?? 'missing';
    expect(r.ctrl.getState().audit).toEqual([]);
    r.ctrl.setCurrentMode(first);
    const s = r.ctrl.getState();
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ path: 'currentMode', old: null, new: first });
    expect(loadAudit(store, pack.airport.icao, pack.settings.auditMaxEntries).entries).toHaveLength(1);

    const file = r.ctrl.exportAudit();
    expect(file.filename).toContain(pack.airport.icao);
    expect(file.text).toContain(first);
    expect(() => JSON.parse(file.text)).not.toThrow();

    r.ctrl.clearAudit();
    expect(r.ctrl.getState().audit).toEqual([]);
    expect(loadAudit(store, pack.airport.icao, pack.settings.auditMaxEntries).entries).toEqual([]);
    // clearing the trail does not clear the current mode
    expect(loadCurrentMode(store, pack).record?.modeId).toBe(first);
  });

  it('setting the same mode again adds no entry; a second change adds one', () => {
    const r = rig(pack, NOW);
    const [a, b] = pack.modes.filter((m) => m.enabled).map((m) => m.id);
    r.ctrl.setCurrentMode(a ?? null);
    r.ctrl.setCurrentMode(a ?? null);
    expect(r.ctrl.getState().audit).toHaveLength(1);
    r.ctrl.setCurrentMode(b ?? null);
    expect(r.ctrl.getState().audit).toHaveLength(2);
  });

  it('the trail is read from the store at start, so it survives a reload of the page', () => {
    const store = createMemoryStore();
    const first = pack.modes.filter((m) => m.enabled)[0]?.id ?? 'missing';
    rig(pack, NOW, store).ctrl.setCurrentMode(first);
    expect(rig(pack, NOW + 1000, store).ctrl.getState().audit).toHaveLength(1);
  });
});

describe('Reload data', () => {
  it('a refused reload keeps the pack in use, says why, and a second press while busy does nothing', async () => {
    // The rig serves no refdata files, so the reload fails and is refused.
    const r = rig(pack, NOW);
    const first = r.ctrl.reloadPack();
    expect(r.ctrl.getState().reload.status).toBe('busy');
    void r.ctrl.reloadPack();
    await first;
    const s = r.ctrl.getState();
    expect(s.reload.status).toBe('refused');
    expect(s.reload.message).not.toBeNull();
    expect(s.view.pack).toBe(pack);
  });

  it('a reload that finishes after stop is ignored', async () => {
    const r = rig(pack, NOW);
    const pending = r.ctrl.reloadPack();
    r.ctrl.stop();
    await pending;
    expect(r.ctrl.getState().reload.status).toBe('busy');
  });
});

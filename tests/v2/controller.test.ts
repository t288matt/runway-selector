// The v2 controller: weather fetched on the pack's own interval, VATSIM on its
// own, the plan recalculated only when UP-1 allows, and no current mode at all
// (issue 104). Fake clock, timers and network (tests/v2/rig.ts).
import { describe, expect, it } from 'vitest';
import { createMemoryStore, KEY_PREFIX } from '../../src/store';
import { answerModel } from '../../src/v2/model/answer';
import { TICK_MS } from '../../src/v2/controller';
import { chipModels } from '../../src/v2/model/chips';
import { YSSY_PACK } from '../helpers/packs';
import { fixture, nowOf, packWith } from '../weather/helpers';
import { datamaskBody, rig } from './rig';

const METAR = fixture('metar-yssy-auto-nodata');
const TAF = fixture('taf-yssy-multiline-fm-tempo');
/** 14:05Z: five minutes into a slot, so a poll interval does not cross the 30-minute boundary. */
const EARLY = Date.UTC(2026, 9, 23, 14, 5, 0);
const pack = packWith(YSSY_PACK, { weatherStation: METAR.station });
const POLL_MS = pack.settings.vatsimPollSeconds * 1000;
const WEATHER_MS = pack.settings.weatherPollMinutes * 60_000;

function weatherUp(r: ReturnType<typeof rig>): void {
  r.wx.metar = METAR.raw;
  r.wx.datamask = datamaskBody(pack, `TAF ${TAF.raw}`);
}

describe('v2 polling cadence comes from the pack', () => {
  it('asks VATSIM at start and then every vatsimPollSeconds, no sooner', async () => {
    const r = rig(pack, EARLY);
    r.ctrl.start();
    await r.advance(0);
    expect(r.calls.n).toBe(1);
    await r.advance(POLL_MS - 1000);
    expect(r.calls.n).toBe(1);
    await r.advance(1000);
    expect(r.calls.n).toBe(2);
    r.ctrl.stop();
  });

  it('asks the weather services at start and then every weatherPollMinutes, no sooner', async () => {
    const r = rig(pack, EARLY);
    weatherUp(r);
    r.ctrl.start();
    await r.advance(0);
    const asked = r.wx.urls.length;
    expect(asked).toBeGreaterThan(0);
    await r.advance(WEATHER_MS - 1000);
    expect(r.wx.urls.length).toBe(asked);
    await r.advance(1000);
    expect(r.wx.urls.length).toBeGreaterThan(asked);
    r.ctrl.stop();
  });

  it('puts both reports into the plan, through the same checks as pasted text', async () => {
    const r = rig(pack, nowOf(TAF));
    weatherUp(r);
    const before = r.ctrl.getState().view;
    r.ctrl.start();
    await r.advance(0);
    const s = r.ctrl.getState();
    expect(s.view.metar?.raw).toBe(METAR.raw);
    expect(s.view.taf?.raw.startsWith('TAF TAF')).toBe(false);
    expect(s.view.result).not.toBe(before.result);
    expect(s.autoWeather).toEqual({ metar: { source: 'automatic', paused: false, error: null, warnings: expect.any(Array) }, taf: { source: 'automatic', paused: false, error: null, warnings: expect.any(Array) } });
    r.ctrl.stop();
  });

  it('starts three timers and stops all of them', () => {
    const r = rig(pack, EARLY);
    r.ctrl.start();
    expect(r.timerCount()).toBe(3);
    r.ctrl.stop();
    expect(r.timerCount()).toBe(0);
  });
});

describe('v2 recalculation (UP-1)', () => {
  it('does not recalculate the plan on a later VATSIM poll, but moves the traffic shown', async () => {
    const r = rig(pack, EARLY);
    r.ctrl.start();
    await r.advance(0);
    const first = r.ctrl.getState();
    expect(first.view.liveDemand?.summary.connectedDepartures).toBe(1);
    r.feed.parked = 3;
    await r.advance(POLL_MS);
    const next = r.ctrl.getState();
    expect(next.view.result).toBe(first.view.result);
    expect(next.view.liveDemand?.summary.connectedDepartures).toBe(3);
    r.ctrl.stop();
  });

  it('recalculates on the 30-minute boundary', async () => {
    const r = rig(pack, EARLY);
    r.ctrl.start();
    await r.advance(0);
    const first = r.ctrl.getState().view;
    await r.advance(TICK_MS * 30);
    expect(r.ctrl.getState().view.result).not.toBe(first.result);
    r.ctrl.stop();
  });
});

describe('v2 failure states show through the chips', () => {
  it('a failed VATSIM poll keeps the last traffic and the VATSIM chip becomes a cross', async () => {
    const r = rig(pack, EARLY);
    r.ctrl.start();
    await r.advance(0);
    const before = r.ctrl.getState();
    r.feed.fail = true;
    await r.advance(POLL_MS);
    const s = r.ctrl.getState();
    expect(s.feed.error).toContain('network down');
    expect(s.feed.aircraft).toBe(before.feed.aircraft);
    const chip = chipModels(s.view, s.feed, r.clock.now, s.autoWeather).find((c) => c.id === 'vatsim');
    expect(chip).toMatchObject({ shape: 'cross', flag: 'Failed' });
    r.ctrl.stop();
  });

  it('weather that cannot be fetched leaves the chips as crosses with the reason, and the plan unchanged', async () => {
    const r = rig(pack, EARLY);
    r.ctrl.start();
    await r.advance(0);
    const s = r.ctrl.getState();
    expect(s.autoWeather.metar.error).not.toBeNull();
    expect(s.autoWeather.taf.error).not.toBeNull();
    const chips = chipModels(s.view, s.feed, r.clock.now, s.autoWeather);
    expect(chips.find((c) => c.id === 'metar')).toMatchObject({ shape: 'cross', flag: 'Failed' });
    expect(chips.find((c) => c.id === 'taf')?.tip).toContain(s.autoWeather.taf.error ?? 'missing');
    r.ctrl.stop();
  });

  it('a METAR fetched once and then failing keeps the report in use and flags the failure', async () => {
    const r = rig(pack, nowOf(TAF));
    weatherUp(r);
    r.ctrl.start();
    await r.advance(0);
    r.wx.metar = null;
    await r.advance(WEATHER_MS);
    const s = r.ctrl.getState();
    expect(s.view.metar?.raw).toBe(METAR.raw);
    const chip = chipModels(s.view, s.feed, r.clock.now, s.autoWeather).find((c) => c.id === 'metar');
    expect(chip).toMatchObject({ shape: 'cross', flag: 'Failed' });
    expect(chip?.value).not.toBeNull();
    r.ctrl.stop();
  });
});

describe('v2 has no current mode and no saved forecast window (OD-86, OD-87)', () => {
  const icao = pack.airport.icao;
  /** What an older version left in the browser for this airport. */
  const OLD_KEYS = {
    currentMode: JSON.stringify({ schemaVersion: 1, modeId: pack.modes.find((m) => m.enabled)?.id ?? 'missing', setAtMs: EARLY - 60_000 }),
    forecastWindow: JSON.stringify({ schemaVersion: 1, choice: '4h' }),
    audit: JSON.stringify({ schemaVersion: 1, entries: [{ schemaVersion: 1, timeMs: EARLY - 60_000, airport: icao, path: 'currentMode', old: null, new: 'x' }] }),
  };
  const seed = (store: ReturnType<typeof createMemoryStore>): void => {
    for (const [name, value] of Object.entries(OLD_KEYS)) store.setItem(`${KEY_PREFIX}:${icao}:${name}`, value);
  };

  it('offers no way to set a mode or a window', () => {
    const r = rig(pack, EARLY);
    expect('setCurrentMode' in r.ctrl).toBe(false);
    expect('setWindow' in r.ctrl).toBe(false);
  });

  it('ignores a mode, a window and an audit log saved earlier by an older version: the plan and the window are the pack default, with no notice', () => {
    const store = createMemoryStore();
    seed(store);
    const s = rig(pack, EARLY, store).ctrl.getState();
    const clean = rig(pack, EARLY).ctrl.getState();
    expect(s.view.windowChoice).toBe(clean.view.windowChoice);
    expect(s.view.result).toEqual(clean.view.result);
    expect(s.view.weather.slots).toHaveLength(clean.view.weather.slots.length);
    expect(s.notices).toEqual([]);
  });

  it('writes nothing for them, and leaves what an older version saved as it was', async () => {
    const store = createMemoryStore();
    seed(store);
    const r = rig(pack, EARLY, store);
    r.ctrl.start();
    await r.advance(WEATHER_MS * 2);
    r.ctrl.stop();
    for (const [name, value] of Object.entries(OLD_KEYS)) expect(store.getItem(`${KEY_PREFIX}:${icao}:${name}`)).toBe(value);
  });

  it('the next change and the plan still work with no current mode', async () => {
    const r = rig(pack, EARLY);
    weatherUp(r);
    r.ctrl.start();
    await r.advance(0);
    const a = answerModel(r.ctrl.getState().view);
    expect(a.modeId).not.toBeNull();
    expect(a.next).toMatch(/^(No change planned|Forecasting: \S+ at \d{4}Z)$/);
    expect(['HOLD', 'CHANGE_SOON']).toContain(a.band.id);
    r.ctrl.stop();
  });
});

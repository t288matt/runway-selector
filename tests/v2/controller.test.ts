// The v2 controller: weather fetched on the pack's own interval, VATSIM on its
// own, the plan recalculated only when UP-1 allows, and the "I am on" mode
// stored. Fake clock, timers and network (tests/v2/rig.ts).
import { describe, expect, it } from 'vitest';
import { createMemoryStore, loadCurrentMode } from '../../src/store';
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
    expect(s.autoWeather).toEqual({ metar: { error: null, fetched: true }, taf: { error: null, fetched: true } });
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

describe('v2 "I am on"', () => {
  const enabled = pack.modes.filter((m) => m.enabled).map((m) => m.id);

  it('stores the mode per airport, recalculates and sets view.currentMode', async () => {
    const store = createMemoryStore();
    const r = rig(pack, EARLY, store);
    const id = enabled[0] ?? 'missing';
    const before = r.ctrl.getState().view;
    r.ctrl.setCurrentMode(id);
    const s = r.ctrl.getState();
    expect(s.view.currentMode).toBe(id);
    expect(s.view.result).not.toBe(before.result);
    expect(loadCurrentMode(store, pack).record?.modeId).toBe(id);
  });

  it('clears with Not set, and refuses a mode the pack does not enable', () => {
    const r = rig(pack, EARLY);
    const id = enabled[0] ?? 'missing';
    r.ctrl.setCurrentMode(id);
    r.ctrl.setCurrentMode('NOT-A-MODE');
    expect(r.ctrl.getState().view.currentMode).toBe(id);
    expect(r.ctrl.getState().notices.join(' ')).toContain('not enabled');
    r.ctrl.setCurrentMode(null);
    expect(r.ctrl.getState().view.currentMode).toBeNull();
  });
});

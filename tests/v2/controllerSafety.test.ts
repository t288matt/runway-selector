// Failure and stale-response safety of the v2 controller: an exception while
// handling an answer becomes a failed fetch (not an unhandled rejection), an
// answer that arrives after stop() is ignored, and a late answer for the old
// airport never touches the new airport's state.
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/store';
import { createController, type Timers } from '../../src/v2/controller';
import { chipModels } from '../../src/v2/model/chips';
import { TEST_PACK, YSSY_PACK } from '../helpers/packs';
import { fixture, nowOf, packWith } from '../weather/helpers';
import { datamaskBody, feedBody, rig } from './rig';

const flags = vi.hoisted(() => ({ applyThrows: false, feedThrows: false }));

vi.mock('../../src/v2/model/apply', async (original) => {
  const real = await original<typeof import('../../src/v2/model/apply')>();
  return {
    ...real,
    applyMetarText: (...a: Parameters<typeof real.applyMetarText>) => {
      if (flags.applyThrows) throw new Error('decoder blew up');
      return real.applyMetarText(...a);
    },
  };
});

vi.mock('../../src/traffic/fetchFeed', async (original) => {
  const real = await original<typeof import('../../src/traffic/fetchFeed')>();
  return {
    ...real,
    fetchFeed: (...a: Parameters<typeof real.fetchFeed>) => {
      if (flags.feedThrows) throw new Error('feed handler blew up');
      return real.fetchFeed(...a);
    },
  };
});

const METAR = fixture('metar-yssy-auto-nodata');
const TAF = fixture('taf-yssy-multiline-fm-tempo');
const NOW = nowOf(TAF);
const pack = packWith(YSSY_PACK, { weatherStation: METAR.station });

describe('an exception while handling an answer is a failed fetch, not an unhandled rejection', () => {
  it('weather: a throw while applying a fetched METAR flags that report and keeps the plan running', async () => {
    const r = rig(pack, NOW);
    r.wx.metar = METAR.raw;
    r.wx.datamask = datamaskBody(pack, `TAF ${TAF.raw}`);
    flags.applyThrows = true;
    try {
      r.ctrl.start();
      await r.advance(0);
    } finally {
      flags.applyThrows = false;
    }
    const s = r.ctrl.getState();
    expect(s.autoWeather.metar.error).toBe('decoder blew up');
    expect(s.autoWeather.taf.error).toBeNull();
    expect(s.view.taf).not.toBeNull();
    const chip = chipModels(s.view, s.feed, r.clock.now, s.autoWeather).find((c) => c.id === 'metar');
    expect(chip).toMatchObject({ shape: 'cross', flag: 'Failed' });
    r.ctrl.stop();
  });

  it('VATSIM: a throw while handling the feed shows as a failed VATSIM fetch, and polling goes on', async () => {
    const r = rig(pack, NOW);
    flags.feedThrows = true;
    try {
      r.ctrl.start();
      await r.advance(0);
      expect(r.ctrl.getState().feed.error).toBe('feed handler blew up');
    } finally {
      flags.feedThrows = false;
    }
    await r.advance(pack.settings.vatsimPollSeconds * 1000);
    expect(r.ctrl.getState().feed.error).toBeNull();
    r.ctrl.stop();
  });
});

/** A fetch whose answers are held until the test releases them. */
function heldNetwork(p: typeof pack) {
  const held: { url: string; release: () => void }[] = [];
  const answerFor = (url: string): Response => {
    if (url.startsWith('https://metar.vatsim.net/')) return new Response(METAR.raw);
    if (url.startsWith('https://datamask.org/')) return new Response(datamaskBody(p, `TAF ${TAF.raw}`));
    return new Response(feedBody(p, 4));
  };
  const fetch = (url: string): Promise<Response> =>
    new Promise((resolve) => {
      held.push({ url, release: () => resolve(answerFor(url)) });
    });
  const releaseAll = async (): Promise<void> => {
    for (const h of held.splice(0)) h.release();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  };
  return { fetch, releaseAll, count: () => held.length };
}

const noTimers: Timers = { setInterval: () => 0, clearInterval: () => undefined };

describe('answers that arrive after stop() are ignored', () => {
  it('a weather answer and a VATSIM answer in flight at stop() change nothing', async () => {
    const net = heldNetwork(pack);
    const ctrl = createController({ pack, fetch: net.fetch, now: () => NOW, timers: noTimers, store: createMemoryStore() });
    ctrl.start();
    expect(net.count()).toBeGreaterThanOrEqual(3);
    const before = ctrl.getState();
    ctrl.stop();
    await net.releaseAll();
    await ctrl.settled();
    const after = ctrl.getState();
    expect(after).toBe(before);
    expect(after.feed.aircraft).toBeNull();
    expect(after.view.metar).toBeNull();
    expect(after.view.taf).toBeNull();
    expect(after.autoWeather.metar.source).toBeNull();
  });
});

describe('switching airport', () => {
  it('stops the old controller, and a late answer from the old airport never updates the new airport', async () => {
    const oldPack = pack;
    const newPack = packWith(TEST_PACK, { weatherStation: METAR.station });
    const oldNet = heldNetwork(oldPack);
    const oldCtrl = createController({ pack: oldPack, fetch: oldNet.fetch, now: () => NOW, timers: noTimers, store: createMemoryStore() });
    oldCtrl.start();
    // the screen is replaced: the old controller is stopped (useController's cleanup) and the new one starts with its own pack
    oldCtrl.stop();
    const newNet = heldNetwork(newPack);
    const newCtrl = createController({ pack: newPack, fetch: newNet.fetch, now: () => NOW, timers: noTimers, store: createMemoryStore() });
    newCtrl.start();
    const newBefore = newCtrl.getState();
    const oldBefore = oldCtrl.getState();
    // the old airport's answers arrive late, after the new airport has started
    await oldNet.releaseAll();
    await oldCtrl.settled();
    expect(newCtrl.getState()).toBe(newBefore);
    expect(oldCtrl.getState()).toBe(oldBefore);
    expect(newCtrl.getState().view.pack.airport.icao).toBe(newPack.airport.icao);
    expect(newCtrl.getState().feed.aircraft).toBeNull();
    // and the new airport's own answers still land
    await newNet.releaseAll();
    await newCtrl.settled();
    expect(newCtrl.getState().feed.aircraft).toHaveLength(4);
    newCtrl.stop();
  });
});

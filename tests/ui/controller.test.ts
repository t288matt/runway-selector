// The scheduling rules (UP-1, UP-2, UP-3) with a fake clock, fake timers and a
// fake fetch: no React, no real time, no network.
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/store';
import { createController, TICK_MS, type Controller, type Timers } from '../../src/ui/controller';
import { freshness, freshnessChips } from '../../src/ui/model/dashboard';
import { YSSY_PACK } from '../helpers/packs';
import { fixture, nowOf, packWith } from '../weather/helpers';

const METAR = fixture('metar-yssy-auto-nodata');
const TAF = fixture('taf-yssy-multiline-fm-tempo');
const NOW0 = nowOf(TAF); // 23-10-2026 14:25Z
const pack = packWith(YSSY_PACK, { weatherStation: METAR.station });
/** 14:05Z: five minutes into a slot, so a poll interval does not cross the 30-minute boundary. */
const EARLY = Date.UTC(2026, 9, 23, 14, 5, 0);
const POLL_MS = pack.settings.vatsimPollSeconds * 1000;

function feedBody(parked: number): string {
  const pilots = Array.from({ length: parked }, (_v, i) => ({
    cid: 1000 + i,
    callsign: `TST${i}`,
    latitude: pack.airport.latitude,
    longitude: pack.airport.longitude,
    altitude: pack.airport.elevationFt ?? 0,
    groundspeed: 0,
    flight_plan: { departure: pack.airport.icao, arrival: 'ZZZB' },
  }));
  return JSON.stringify({ general: { update_timestamp: '2026-10-23T14:00:00Z' }, pilots });
}

interface Rig {
  readonly ctrl: Controller;
  readonly clock: { now: number };
  readonly calls: { n: number };
  readonly feed: { parked: number; fail: boolean };
  readonly live: () => number;
  advance: (ms: number) => Promise<void>;
}

function rig(start: number = NOW0): Rig {
  const clock = { now: start };
  const calls = { n: 0 };
  const feed = { parked: 1, fail: false };
  const timers: { id: number; every: number; due: number; fn: () => void }[] = [];
  let nextId = 1;
  const fake: Timers = {
    setInterval: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, every: ms, due: clock.now + ms, fn });
      return id;
    },
    clearInterval: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  const ctrl = createController({
    pack,
    now: () => clock.now,
    timers: fake,
    store: createMemoryStore(),
    fetch: async () => {
      calls.n += 1;
      if (feed.fail) throw new Error('network down');
      return new Response(feedBody(feed.parked));
    },
  });
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) {
      await ctrl.settled();
      await Promise.resolve();
    }
  };
  const advance = async (ms: number): Promise<void> => {
    const target = clock.now + ms;
    for (;;) {
      const due = timers.filter((t) => t.due <= target).sort((a, b) => a.due - b.due)[0];
      if (due === undefined) break;
      clock.now = Math.max(clock.now, due.due);
      due.due += due.every;
      due.fn();
      await settle();
    }
    clock.now = target;
    await settle();
  };
  return { ctrl, clock, calls, feed, advance, live: () => timers.length };
}

const parkedNow = (c: Controller): number | undefined => c.getState().view.liveDemand?.summary.connectedDepartures;

describe('polling (UP-2, UP-3)', () => {
  it('polls at start and then every vatsimPollSeconds, no sooner', async () => {
    const r = rig();
    r.ctrl.start();
    await r.advance(0);
    expect(r.calls.n).toBe(1);
    await r.advance(POLL_MS - 1000);
    expect(r.calls.n).toBe(1);
    await r.advance(1000);
    expect(r.calls.n).toBe(2);
    await r.advance(POLL_MS);
    expect(r.calls.n).toBe(3);
    r.ctrl.stop();
  });

  it('keeps the previous traffic and flags the failure when a poll fails, then recovers', async () => {
    const r = rig(EARLY);
    r.ctrl.start();
    await r.advance(0);
    const before = r.ctrl.getState();
    expect(before.feed.error).toBeNull();
    expect(before.feed.aircraft).toHaveLength(1);
    r.feed.fail = true;
    await r.advance(POLL_MS);
    const after = r.ctrl.getState();
    expect(after.feed.error).toContain('network down');
    expect(after.feed.aircraft).toBe(before.feed.aircraft);
    expect(after.feed.fetchedAtMs).toBe(before.feed.fetchedAtMs);
    expect(parkedNow(r.ctrl)).toBe(1);
    const chip = freshnessChips(after.view, after.feed, r.clock.now).find((c) => c.id === 'vatsim');
    expect(chip?.flag).toBe('Failed');
    r.feed.fail = false;
    r.feed.parked = 2;
    await r.advance(POLL_MS);
    expect(r.ctrl.getState().feed.error).toBeNull();
    expect(parkedNow(r.ctrl)).toBe(2);
    r.ctrl.stop();
  });

  it('shows the new traffic in Panel D data but does not recalculate the plan (UP-1)', async () => {
    const r = rig(EARLY);
    r.ctrl.start();
    await r.advance(0);
    const planned = r.ctrl.getState().view;
    r.feed.parked = 3;
    await r.advance(POLL_MS);
    const now = r.ctrl.getState();
    expect(parkedNow(r.ctrl)).toBe(3);
    expect(now.view.result).toBe(planned.result);
    expect(now.view.demand).toBe(planned.demand);
    expect(now.view.calcNowMs).toBe(planned.calcNowMs);
    r.ctrl.stop();
  });

  it('flags traffic stale from its own fetch time and vatsimStaleMinutes', async () => {
    const r = rig();
    r.ctrl.start();
    await r.advance(0);
    const s = r.ctrl.getState();
    const limit = pack.settings.vatsimStaleMinutes * 60_000;
    expect(freshnessChips(s.view, s.feed, r.clock.now + limit).find((c) => c.id === 'vatsim')?.flag).toBeNull();
    expect(freshnessChips(s.view, s.feed, r.clock.now + limit + 60_000).find((c) => c.id === 'vatsim')?.flag).toBe('Stale');
    r.ctrl.stop();
  });
});

describe('recalculation (UP-1)', () => {
  it('recalculates on the 30-minute boundary and not before', async () => {
    const r = rig(Date.UTC(2026, 9, 23, 14, 5, 0));
    r.ctrl.start();
    await r.advance(0);
    const first = r.ctrl.getState().view.calcNowMs;
    await r.advance(24 * 60_000); // 14:29
    expect(r.ctrl.getState().view.calcNowMs).toBe(first);
    await r.advance(2 * 60_000); // 14:31
    expect(r.ctrl.getState().view.calcNowMs).toBeGreaterThan(first);
    expect(Math.floor(r.ctrl.getState().view.calcNowMs / 1_800_000)).toBe(Math.floor(Date.UTC(2026, 9, 23, 14, 30) / 1_800_000));
    r.ctrl.stop();
  });

  it('ticks once a minute so ages move without recalculating', async () => {
    const r = rig(Date.UTC(2026, 9, 23, 14, 5, 0));
    r.ctrl.start();
    await r.advance(0);
    const calc = r.ctrl.getState().view.calcNowMs;
    await r.advance(TICK_MS * 3);
    expect(r.ctrl.getState().displayNowMs).toBe(calc + TICK_MS * 3);
    expect(r.ctrl.getState().view.calcNowMs).toBe(calc);
    r.ctrl.stop();
  });

  const triggers: [string, (r: Rig) => void][] = [
    ['a new METAR', (r) => expect(r.ctrl.applyMetar(METAR.raw).ok).toBe(true)],
    ['a new TAF', (r) => expect(r.ctrl.applyTaf(TAF.raw).ok).toBe(true)],
    ['a current-mode change', (r) => r.ctrl.setCurrentMode(pack.modes.find((m) => m.enabled)?.id ?? null)],
    ['a window change', (r) => r.ctrl.setWindowChoice('4h')],
    ['Refresh', (r) => r.ctrl.refresh()],
  ];
  it.each(triggers)('recalculates at once on %s', async (_name, act) => {
    const r = rig();
    r.ctrl.start();
    await r.advance(0);
    const calc = r.ctrl.getState().view.calcNowMs;
    r.clock.now += 5000;
    act(r);
    expect(r.ctrl.getState().view.calcNowMs).toBe(calc + 5000);
    r.ctrl.stop();
  });

  it('Refresh also polls the traffic again', async () => {
    const r = rig();
    r.ctrl.start();
    await r.advance(0);
    r.ctrl.refresh();
    await r.advance(0);
    expect(r.calls.n).toBe(2);
    r.ctrl.stop();
  });

  it('a refused report does not recalculate and keeps the previous report', async () => {
    const r = rig();
    r.ctrl.start();
    await r.advance(0);
    expect(r.ctrl.applyMetar(METAR.raw).ok).toBe(true);
    const kept = r.ctrl.getState().view;
    r.clock.now += 5000;
    const refused = r.ctrl.applyMetar(METAR.raw.replace(METAR.station, 'ZZZZ'));
    expect(refused.ok).toBe(false);
    expect(r.ctrl.getState().view).toBe(kept);
    expect(r.ctrl.getState().view.metar?.station).toBe(METAR.station);
    r.ctrl.stop();
  });

  it('the window chosen decides how far the plan looks (OD-18)', async () => {
    const r = rig();
    r.ctrl.applyTaf(TAF.raw);
    r.ctrl.applyMetar(METAR.raw);
    r.ctrl.setWindowChoice('4h');
    const short = r.ctrl.getState().view.result.plan.slots.length;
    r.ctrl.setWindowChoice('full');
    const full = r.ctrl.getState().view.result.plan.slots.length;
    expect(short).toBeLessThan(full);
    expect(short).toBeLessThanOrEqual(8);
  });
});

describe('stopping and the clock', () => {
  it('cancels both timers on stop and ignores a poll still in flight', async () => {
    const r = rig();
    r.ctrl.start();
    expect(r.live()).toBe(2);
    const before = r.ctrl.getState();
    r.ctrl.stop();
    expect(r.live()).toBe(0);
    await r.advance(POLL_MS * 3);
    await r.ctrl.settled();
    expect(r.calls.n).toBe(1);
    expect(r.ctrl.getState()).toBe(before);
  });

  it('can start again after stop (a development double mount)', async () => {
    const r = rig();
    r.ctrl.start();
    r.ctrl.stop();
    r.ctrl.start();
    expect(r.live()).toBe(2);
    await r.advance(0);
    expect(r.ctrl.getState().feed.aircraft).not.toBeNull();
    r.ctrl.stop();
  });

  it('a clock that jumps backwards never gives a negative age', async () => {
    const r = rig();
    r.ctrl.applyMetar(METAR.raw);
    r.ctrl.applyTaf(TAF.raw);
    r.ctrl.start();
    await r.advance(0);
    r.clock.now -= 3 * 3_600_000;
    await r.advance(TICK_MS);
    const s = r.ctrl.getState();
    const chips = freshnessChips(s.view, s.feed, r.clock.now);
    for (const c of chips) expect(c.detail).not.toMatch(/(^|[ ,(])-\d|NaN/);
    expect(freshness(1000, 5 * 60_000, 30).ageMinutes).toBe(0);
    r.ctrl.stop();
  });
});

describe('traffic arriving for a plan that has none', () => {
  it('recalculates once on the first good poll after start, and not on the second', async () => {
    const r = rig(EARLY);
    const planned = r.ctrl.getState().view;
    expect(planned.demand).toBeNull();
    r.ctrl.start();
    await r.advance(0);
    const afterFirst = r.ctrl.getState().view;
    expect(afterFirst.result).not.toBe(planned.result);
    expect(afterFirst.demand).not.toBeNull();
    await r.advance(POLL_MS);
    expect(r.ctrl.getState().view.result).toBe(afterFirst.result);
    r.ctrl.stop();
  });

  it('does not recalculate on a failed poll', async () => {
    const r = rig(EARLY);
    r.feed.fail = true;
    const planned = r.ctrl.getState().view;
    r.ctrl.start();
    await r.advance(POLL_MS);
    expect(r.ctrl.getState().view.result).toBe(planned.result);
    r.ctrl.stop();
  });

  it('recalculates once on the first good poll after an outage longer than vatsimStaleMinutes', async () => {
    const r = rig(EARLY);
    r.ctrl.start();
    await r.advance(0);
    r.feed.fail = true;
    await r.advance((pack.settings.vatsimStaleMinutes + 1) * 60_000);
    const during = r.ctrl.getState().view;
    r.feed.fail = false;
    r.clock.now += 1000;
    await r.advance(POLL_MS);
    const back = r.ctrl.getState().view;
    expect(back.result).not.toBe(during.result);
    await r.advance(POLL_MS);
    expect(r.ctrl.getState().view.result).toBe(back.result);
    r.ctrl.stop();
  });
});

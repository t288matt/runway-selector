// The demand model against every pack. Positions are built relative to each
// pack's own airport, and expected slots are worked from that pack's values.
// One hand-worked table at the end uses the YSSY pack's literal numbers.
import { describe, expect, it } from 'vitest';
import { buildTrafficSlots } from '../../src/traffic/demand';
import type { Aircraft } from '../../src/traffic/parseFeed';
import type { AirportPack } from '../../src/refdata';
import { YSSY_PACK, describeForEachPack, loadPackFrom, PACKS } from '../helpers/packs';
import { MIN, NOW, SLOT_STARTS, aircraft, counts, inbound, parked, slotOf, waiting } from './helpers';

const build = (pack: AirportPack, list: readonly Aircraft[]) => buildTrafficSlots({ pack, nowMs: NOW, aircraft: list, slotStartsMs: SLOT_STARTS });
const total = (r: ReturnType<typeof build>) => r.slots.reduce((n, s) => n + (s.arrivals ?? 0), 0);

describeForEachPack('demand model', (pack) => {
  const a = pack.airport;
  const s = pack.settings;

  describe('shape', () => {
    it('one TrafficSlot per slot start, same order, with the engine contract fields only', () => {
      const r = build(pack, []);
      expect(r.slots.map((x) => x.startMs)).toEqual(SLOT_STARTS);
      for (const slot of r.slots) expect(Object.keys(slot).sort()).toEqual(['arrivals', 'departures', 'startMs']);
    });

    it('no aircraft: known slots are zero, not unknown', () => {
      const r = build(pack, []);
      expect(counts(r.slots).slice(0, 8)).toEqual(Array(8).fill(0));
      expect(r.slots[0]?.departures).toBe(0);
      expect(r.summary).toMatchObject({ connectedArrivals: 0, connectedDepartures: 0, trend: 'steady' });
    });

    it('no slots: no output', () => {
      expect(buildTrafficSlots({ pack, nowMs: NOW, aircraft: [parked(pack)], slotStartsMs: [] }).slots).toEqual([]);
    });
  });

  describe('departures (on the ground at the airport, origin here)', () => {
    it('count in slot 0 only; later slots are null', () => {
      const r = build(pack, [parked(pack), parked(pack, { nm: 1 }), parked(pack, { nm: 2 })]);
      expect(r.slots[0]?.departures).toBe(3);
      for (const slot of r.slots.slice(1)) expect(slot.departures).toBeNull();
      expect(r.summary.connectedDepartures).toBe(3);
      expect(total(r)).toBe(0);
    });

    it('groundspeed: just under the ground limit counts, at the limit does not', () => {
      expect(build(pack, [parked(pack, { groundspeed: a.groundMaxSpeedKt - 0.1 })]).slots[0]?.departures).toBe(1);
      expect(build(pack, [parked(pack, { groundspeed: a.groundMaxSpeedKt })]).slots[0]?.departures).toBe(0);
    });

    it('distance: inside the traffic area counts, outside does not', () => {
      expect(build(pack, [parked(pack, { nm: a.trafficAreaNm - 0.01 })]).slots[0]?.departures).toBe(1);
      expect(build(pack, [parked(pack, { nm: a.trafficAreaNm + 0.01 })]).slots[0]?.departures).toBe(0);
    });

    it('altitude: within the margin of the elevation counts, beyond it does not (when the pack has an elevation)', () => {
      if (a.elevationFt === null || a.elevationFt === undefined) return;
      expect(build(pack, [parked(pack, { altitude: a.elevationFt + a.groundAltitudeMarginFt })]).slots[0]?.departures).toBe(1);
      expect(build(pack, [parked(pack, { altitude: a.elevationFt - a.groundAltitudeMarginFt })]).slots[0]?.departures).toBe(1);
      expect(build(pack, [parked(pack, { altitude: a.elevationFt + a.groundAltitudeMarginFt + 1 })]).slots[0]?.departures).toBe(0);
      expect(build(pack, [parked(pack, { altitude: a.elevationFt - a.groundAltitudeMarginFt - 1 })]).slots[0]?.departures).toBe(0);
    });

    it('an airborne departure is not demand', () => {
      const airborne = aircraft(pack, { nm: 3, altitude: 8000, groundspeed: 250, from: 'here', to: 'elsewhere' });
      const r = build(pack, [airborne]);
      expect(r.slots[0]?.departures).toBe(0);
      expect(total(r)).toBe(0);
    });

    it('a departure on the ground that is bound elsewhere and one bound here are both departures', () => {
      expect(build(pack, [parked(pack, { to: 'here' }), parked(pack)]).slots[0]?.departures).toBe(2);
    });
  });

  describe('missing elevation', () => {
    it('is reported, and the altitude test is skipped', () => {
      const hasElevation = a.elevationFt !== null && a.elevationFt !== undefined;
      const r = build(pack, [parked(pack, { altitude: 25000 })]);
      expect(r.summary.elevationMissing).toBe(!hasElevation);
      expect(r.slots[0]?.departures).toBe(hasElevation ? 0 : 1);
    });
  });

  describe('no double counting', () => {
    it('on the ground here, origin and destination both here: one departure, no arrival', () => {
      const r = build(pack, [parked(pack, { to: 'here' })]);
      expect(r.slots[0]?.departures).toBe(1);
      expect(total(r)).toBe(0);
      expect(r.summary.connectedArrivals).toBe(0);
    });

    it('on the ground here, bound here from elsewhere: it has arrived, so it is nothing', () => {
      const landed = aircraft(pack, { nm: 0.5, altitude: a.elevationFt ?? 0, groundspeed: 0, from: 'elsewhere', to: 'here' });
      const r = build(pack, [landed]);
      expect(r.slots[0]?.departures).toBe(0);
      expect(total(r)).toBe(0);
      expect(r.summary.connectedArrivals).toBe(0);
    });

    it('airborne, origin and destination both here: one arrival, no departure', () => {
      const circuit = aircraft(pack, { nm: 100, groundspeed: 300, from: 'here', to: 'here' });
      const r = build(pack, [circuit]);
      expect(total(r)).toBe(1);
      expect(r.slots[0]?.departures).toBe(0);
    });

    it('a mixed feed: each aircraft lands in exactly one count', () => {
      const list = [parked(pack), parked(pack, { to: 'here' }), inbound(pack, 100), inbound(pack, 200), waiting(pack, 150), aircraft(pack, { nm: 100, groundspeed: 300, from: 'elsewhere', to: 'elsewhere' })];
      const r = build(pack, list);
      expect(r.slots[0]?.departures).toBe(2);
      expect(total(r) + r.summary.arrivalsBeyondHorizon).toBe(3);
      expect(r.summary.connectedArrivals).toBe(3);
      expect(r.summary.connectedDepartures).toBe(2);
    });
  });

  describe('airborne arrivals', () => {
    it('are timed from distance and groundspeed', () => {
      // 500 nm at 300 kt is 100 minutes: now + 100 minutes = T0 + 110, the fourth slot.
      const r = build(pack, [inbound(pack, 500, 300)]);
      expect(slotOf(NOW + 100 * MIN)).toBe(3);
      expect(counts(r.slots)).toEqual([0, 0, 0, 1, 0, 0, 0, 0, null, null]);
    });

    it('an aircraft already at the airport (distance 0) arrives in slot 0', () => {
      expect(build(pack, [inbound(pack, 0, 200)]).slots[0]?.arrivals).toBe(1);
    });

    it('a slow airborne aircraft inside the area but off the ground is an arrival, not a departure or nothing', () => {
      const high = aircraft(pack, { nm: 1, altitude: (a.elevationFt ?? 0) + 3000, groundspeed: a.groundMaxSpeedKt - 5, from: 'elsewhere', to: 'here' });
      expect(build(pack, [high]).summary.connectedArrivals).toBe(a.elevationFt === null || a.elevationFt === undefined ? 0 : 1);
    });

    it('groundspeed below the arrival floor is raised to the floor', () => {
      // A speed between the ground limit and the floor.
      const slowGs = (a.groundMaxSpeedKt + a.arrivalSpeedFloorKt) / 2;
      const nm = 150;
      const viaFloor = NOW + (nm / a.arrivalSpeedFloorKt) * 60 * MIN;
      const viaRaw = NOW + (nm / slowGs) * 60 * MIN;
      expect(slotOf(viaFloor)).not.toBe(slotOf(viaRaw)); // the case separates the two readings
      const r = build(pack, [inbound(pack, nm, slowGs)]);
      expect(r.slots[slotOf(viaFloor)]?.arrivals).toBe(1);
      expect(r.slots[slotOf(viaRaw)]?.arrivals).toBe(0);
    });

    it('a speed above the floor is used as it is', () => {
      const gs = a.arrivalSpeedFloorKt * 2;
      const nm = 400;
      const t = NOW + (nm / gs) * 60 * MIN;
      expect(build(pack, [inbound(pack, nm, gs)]).slots[slotOf(t)]?.arrivals).toBe(1);
    });
  });

  describe('aircraft on the ground elsewhere, bound here', () => {
    // Reference: the k-th of N (k from 1), nearest first, leaves at now + window * k / N and flies distance / assumed speed.
    const expectedArrival = (sortedNm: readonly number[], k: number): number =>
      NOW + (s.assumedDepartureWindowMinutes * MIN * k) / sortedNm.length + (sortedNm[k - 1]! / s.assumedGroundSpeedKt) * 60 * MIN;

    for (const dists of [[200], [220, 100], [400, 100, 220]]) {
      it(`N=${dists.length}: spread over the window, nearest first, whatever the feed order`, () => {
        const sorted = [...dists].sort((x, y) => x - y);
        const r = build(pack, dists.map((d) => waiting(pack, d)));
        const want = Array(SLOT_STARTS.length).fill(0) as number[];
        sorted.forEach((_d, i) => {
          const at = slotOf(expectedArrival(sorted, i + 1));
          want[at] = (want[at] ?? 0) + 1;
        });
        expect(counts(r.slots).slice(0, 8)).toEqual(want.slice(0, 8));
        expect(r.summary.groundElsewhere).toBe(dists.length);
        expect(r.summary.connectedArrivals).toBe(dists.length);
      });
    }

    it('are counted wherever they are, and the horizon decides which fall inside', () => {
      const far = waiting(pack, 6000); // 15+ hours at the assumed speed
      const r = build(pack, [far]);
      expect(total(r)).toBe(0);
      expect(r.summary.arrivalsBeyondHorizon).toBe(1);
      expect(r.summary.connectedArrivals).toBe(1);
    });

    it('one that is moving faster than the ground limit is airborne and is not spread', () => {
      const rolling = aircraft(pack, { nm: 100, altitude: 10, groundspeed: a.groundMaxSpeedKt, from: 'elsewhere', to: 'here' });
      const r = build(pack, [rolling]);
      expect(r.summary.groundElsewhere).toBe(0);
      const t = NOW + (100 / Math.max(a.groundMaxSpeedKt, a.arrivalSpeedFloorKt)) * 60 * MIN;
      expect(r.slots[slotOf(t)]?.arrivals).toBe(1);
    });

    it('ground elsewhere but bound elsewhere is nothing', () => {
      const other = aircraft(pack, { nm: 100, altitude: 10, groundspeed: 0, from: 'elsewhere', to: 'elsewhere' });
      expect(total(build(pack, [other])) + build(pack, [other]).summary.arrivalsBeyondHorizon).toBe(0);
    });

    it('the departure window comes from the pack', () => {
      const wide = { ...pack, settings: { ...pack.settings, assumedDepartureWindowMinutes: 180 } };
      const near = waiting(pack, 10);
      const slotNarrow = build(pack, [near]).slots.findIndex((x) => x.arrivals === 1);
      const slotWide = build(wide, [near]).slots.findIndex((x) => x.arrivals === 1);
      expect(slotWide).toBeGreaterThan(slotNarrow);
    });
  });

  describe('demand horizon (TR-7)', () => {
    const horizonMs = s.demandHorizonMinutes * MIN;

    it('slots wholly inside the horizon are known; the rest are null', () => {
      const r = build(pack, []);
      r.slots.forEach((slot, i) => {
        const inside = slot.startMs + 30 * MIN <= NOW + horizonMs;
        expect(slot.arrivals === null, `slot ${i}`).toBe(!inside);
      });
      expect(r.slots.filter((x) => x.arrivals !== null).length).toBeGreaterThan(0);
      expect(r.slots.filter((x) => x.arrivals === null).length).toBeGreaterThan(0);
    });

    it('an arrival just inside the last known slot counts; one in the first null slot is not invented into it', () => {
      const lastKnown = build(pack, []).slots.filter((x) => x.arrivals !== null).length - 1;
      const toMs = (slot: number, into: number) => SLOT_STARTS[slot]! + into * MIN;
      const nmFor = (t: number) => ((t - NOW) / (60 * MIN)) * 300;
      const inside = build(pack, [inbound(pack, nmFor(toMs(lastKnown, 25)))]);
      expect(inside.slots[lastKnown]?.arrivals).toBe(1);
      const outside = build(pack, [inbound(pack, nmFor(toMs(lastKnown + 1, 5)))]);
      expect(counts(outside.slots).every((c) => c === null || c === 0)).toBe(true);
      expect(outside.slots[lastKnown + 1]?.arrivals).toBeNull();
      expect(outside.summary.arrivalsBeyondHorizon).toBe(1);
    });

    it('a shorter horizon in the pack makes more slots unknown', () => {
      const short = { ...pack, settings: { ...pack.settings, demandHorizonMinutes: 60 } };
      const known = build(short, []).slots.filter((x) => x.arrivals !== null).length;
      expect(known).toBe(2); // slots 0 and 1 end by T0+60, inside now + 60 = T0+70; slot 2 ends at T0+90
    });

    it('slot 0 is known even for the shortest horizon', () => {
      const shortest = { ...pack, settings: { ...pack.settings, demandHorizonMinutes: 30 } };
      expect(build(shortest, []).slots[0]?.arrivals).toBe(0);
    });
  });

  describe('summary', () => {
    it('movements per slot are arrivals plus departures; unknown where arrivals are unknown', () => {
      const r = build(pack, [parked(pack), parked(pack), inbound(pack, 50, 300)]);
      expect(r.summary.movementsPerSlot[0]).toBe(2 + (r.slots[0]?.arrivals ?? 0));
      expect(r.summary.movementsPerSlot[1]).toBe(r.slots[1]?.arrivals);
      expect(r.summary.movementsPerSlot[9]).toBeNull();
    });

    it('levels use the higher of arrivals and departures for each slot, null beyond the horizon', () => {
      const many = Array.from({ length: pack.settings.trafficBands.busy[0]! }, () => parked(pack));
      const r = build(pack, many);
      expect(r.summary.levels[0]).toBe('busy');
      expect(r.summary.levels[1]).toBe('light');
      expect(r.summary.levels[9]).toBeNull();
    });

    it('trend: rising when the second half of the known slots has more arrivals', () => {
      const late = Array.from({ length: 3 }, () => inbound(pack, 1000, 300)); // 200 minutes out: slot 6
      const r = build(pack, late);
      expect(r.summary.trend).toBe('rising');
    });

    it('trend: falling when the first half has more', () => {
      const early = Array.from({ length: 3 }, () => inbound(pack, 100, 300)); // 20 minutes out: slot 0
      expect(build(pack, early).summary.trend).toBe('falling');
    });

    it('trend: steady when the halves match, and unknown with fewer than two known slots', () => {
      expect(build(pack, [inbound(pack, 100, 300), inbound(pack, 1000, 300)]).summary.trend).toBe('steady');
      const shortest = { ...pack, settings: { ...pack.settings, demandHorizonMinutes: 30 } };
      expect(build(shortest, [inbound(pack, 10, 300)]).summary.trend).toBeNull();
    });
  });

  it('is pure: the same input gives the same output and the input is untouched', () => {
    const list = [parked(pack), inbound(pack, 100), waiting(pack, 80), waiting(pack, 40)];
    const copy = JSON.stringify(list);
    expect(build(pack, list)).toEqual(build(pack, list));
    expect(JSON.stringify(list)).toBe(copy);
  });

  it('does not depend on the airport: moving the feed to another pack changes nothing about relative results', () => {
    const r = build(pack, [inbound(pack, 500, 300)]);
    expect(counts(r.slots)[3]).toBe(1);
  });
});

describe('hand-worked cases with the YSSY pack values (30 minute window, 400 kt assumed speed, 150 kt floor)', () => {
  const pack = loadPackFrom(YSSY_PACK);
  const slotsFor = (list: Aircraft[]) => counts(build(pack, list).slots).slice(0, 5);
  // now = T0 + 10 minutes. Slot k starts at T0 + 30k minutes.

  it('N=1: 200 nm away leaves at +30 (T0+40), flies 30 min at 400 kt, arrives T0+70: slot 2', () => {
    expect(slotsFor([waiting(pack, 200)])).toEqual([0, 0, 1, 0, 0]);
  });

  it('N=2: 100 nm leaves +15 (T0+25), arrives T0+40 (slot 1); 220 nm leaves +30 (T0+40), flies 33 min, arrives T0+73 (slot 2). Feed order does not matter', () => {
    expect(slotsFor([waiting(pack, 100), waiting(pack, 220)])).toEqual([0, 1, 1, 0, 0]);
    expect(slotsFor([waiting(pack, 220), waiting(pack, 100)])).toEqual([0, 1, 1, 0, 0]);
  });

  it('N=3: 100 nm leaves +10 (T0+20), arrives T0+35 (slot 1); 220 nm leaves +20 (T0+30), arrives T0+63 (slot 2); 400 nm leaves +30 (T0+40), flies 60 min, arrives T0+100 (slot 3)', () => {
    expect(slotsFor([waiting(pack, 400), waiting(pack, 100), waiting(pack, 220)])).toEqual([0, 1, 1, 1, 0]);
  });

  it('speed floor: 300 nm at 100 kt would take 180 min (slot 6); at the 150 kt floor it takes 120 min, arriving T0+130 (slot 4)', () => {
    expect(slotsFor([inbound(pack, 300, 100)])).toEqual([0, 0, 0, 0, 1]);
  });

  it('horizon: 225 minutes out (T0+235) is slot 7 and counts; 235 minutes out (T0+245) is slot 8 and does not', () => {
    const at = (minutes: number) => inbound(pack, (minutes / 60) * 300);
    expect(build(pack, [at(225)]).slots[7]?.arrivals).toBe(1);
    const late = build(pack, [at(235)]);
    expect(late.slots[8]?.arrivals).toBeNull();
    expect(late.slots.slice(0, 8).every((x) => x.arrivals === 0)).toBe(true);
  });
});

describe('all packs together', () => {
  it('have different values, so the tests above would catch a hard-coded one', () => {
    const packs = PACKS.map(loadPackFrom);
    expect(new Set(packs.map((p) => p.settings.assumedGroundSpeedKt)).size).toBeGreaterThan(1);
    expect(new Set(packs.map((p) => p.airport.arrivalSpeedFloorKt)).size).toBeGreaterThan(1);
    expect(packs.some((p) => p.airport.elevationFt === null || p.airport.elevationFt === undefined)).toBe(true);
  });
});

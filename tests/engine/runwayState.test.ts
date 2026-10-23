import { expect, it } from 'vitest';
import { evaluate } from '../../src/engine';
import { DAY_START_MS, describeEachPack, inputFor, packWith, type Spec } from './helpers';
import { PACKS } from '../helpers/packs';

function states(pack: Parameters<typeof evaluate>[0], specs: readonly Spec[]) {
  return evaluate(pack, inputFor(DAY_START_MS, specs)).slots.map((s) => s.runwayState);
}

describeEachPack('runway state', (pack) => {
  const wetPct = pack.settings.wetRunwayProbabilityPct;
  const dryingMin = pack.settings.dryingTimeMinutes;

  it('slot 0 is WET when the METAR reports precipitation now', () => {
    expect(states(pack, [{ gov: 'METAR', precip: { prevailing: true } }])).toEqual(['WET']);
  });

  it('slot 0 is WET when the METAR reports recent precipitation (RE)', () => {
    const r = evaluate(pack, inputFor(DAY_START_MS, [{ gov: 'METAR', precip: { recent: true } }]));
    expect(r.slots[0]?.runwayState).toBe('WET');
    expect(r.slots[0]?.runwayStateCause).toBe('METAR_RECENT');
  });

  it('slot 0 is DRY when the METAR reports none', () => {
    expect(states(pack, [{ gov: 'METAR' }])).toEqual(['DRY']);
  });

  it('slot 0 is DRY even when a TAF with rain governs it', () => {
    expect(states(pack, [{ gov: 'TAF', precip: { prevailing: true, recent: true } }])).toEqual(['DRY']);
  });

  it('slot 0 ignores forecast-style flags: probable and temporary leave it DRY', () => {
    expect(states(pack, [{ gov: 'METAR', precip: { probable: 90, temporary: true } }])).toEqual(['DRY']);
  });

  it('a later slot with prevailing precipitation is WET, with the METAR flag ignored', () => {
    expect(states(pack, [{}, { precip: { prevailing: true } }])).toEqual(['DRY', 'WET']);
    expect(states(pack, [{}, { precip: { recent: true } }])).toEqual(['DRY', 'DRY']);
  });

  it('a PROB group at or above the pack threshold is WET; below it is WET_POSSIBLE', () => {
    expect(states(pack, [{}, { precip: { probable: wetPct } }])[1]).toBe('WET');
    expect(states(pack, [{}, { precip: { probable: wetPct + 1 } }])[1]).toBe('WET');
    expect(states(pack, [{}, { precip: { probable: wetPct - 1 } }])[1]).toBe('WET_POSSIBLE');
  });

  it('a TEMPO or INTER shower (even PROB40 on TEMPO) is WET_POSSIBLE, never WET', () => {
    const r = evaluate(pack, inputFor(DAY_START_MS, [{}, { precip: { temporary: true } }]));
    expect(r.slots[1]?.runwayState).toBe('WET_POSSIBLE');
    expect(r.slots[1]?.runwayStateCause).toBe('POSSIBLE_TEMPORARY');
    expect(r.slots[1]?.uncertain).toBe(true);
  });

  it('the runway stays WET for the drying time after rain ends, counted from the end of the last wet slot', () => {
    const count = Math.ceil(dryingMin / 30) + 4;
    const specs: Spec[] = [{ gov: 'METAR', precip: { prevailing: true } }, ...Array.from({ length: count }, () => ({}) as Spec)];
    const got = states(pack, specs);
    const wetEnd = 30; // minutes: slot 0 ends 30 minutes after the start
    got.forEach((state, i) => {
      const startMin = i * 30;
      const expected = i === 0 || startMin < wetEnd + dryingMin ? 'WET' : 'DRY';
      expect(state, `slot ${i}`).toBe(expected);
    });
    expect(got[got.length - 1]).toBe('DRY');
    expect(evaluate(pack, inputFor(DAY_START_MS, specs)).slots[1]?.runwayStateCause).toBe(dryingMin > 0 ? 'DRYING' : 'NONE');
  });

  it('WET_POSSIBLE slots do not start the drying clock', () => {
    const got = states(pack, [{}, { precip: { temporary: true } }, {}, {}, {}, {}, {}, {}]);
    expect(got.slice(0, 3)).toEqual(['DRY', 'WET_POSSIBLE', 'DRY']);
    expect(got.every((s) => s !== 'WET')).toBe(true);
  });

  it('a WET_POSSIBLE slot inside the drying time is WET', () => {
    if (dryingMin < 30) return;
    expect(states(pack, [{ gov: 'METAR', precip: { prevailing: true } }, { precip: { temporary: true } }])[1]).toBe('WET');
  });

  it('a later wet slot restarts the clock from its own end', () => {
    const specs: Spec[] = [{}, {}, { precip: { prevailing: true } }, ...Array.from({ length: Math.ceil(dryingMin / 30) + 3 }, () => ({}) as Spec)];
    const got = states(pack, specs);
    got.forEach((state, i) => {
      if (i < 2) return expect(state).toBe('DRY');
      const expected = i === 2 || i * 30 < 3 * 30 + dryingMin ? 'WET' : 'DRY';
      expect(state, `slot ${i}`).toBe(expected);
    });
  });

  it('does not use a clock, only the slots given', () => {
    const a = evaluate(pack, inputFor(DAY_START_MS, [{ gov: 'METAR', precip: { prevailing: true } }, {}]));
    const b = evaluate(pack, { ...inputFor(DAY_START_MS, [{ gov: 'METAR', precip: { prevailing: true } }, {}]), nowMs: 0 });
    expect(a).toEqual(b);
  });
});

it('a longer drying time in the pack data keeps the runway wet for longer, with no code change', () => {
  for (const ref of PACKS) {
    const short = packWith(ref, (f) => {
      f['settings.json'].dryingTimeMinutes.value = 30;
    });
    const long = packWith(ref, (f) => {
      f['settings.json'].dryingTimeMinutes.value = 120;
    });
    const specs: Spec[] = [{ gov: 'METAR', precip: { prevailing: true } }, {}, {}, {}, {}, {}];
    expect(states(short, specs)).toEqual(['WET', 'WET', 'DRY', 'DRY', 'DRY', 'DRY']);
    expect(states(long, specs)).toEqual(['WET', 'WET', 'WET', 'WET', 'WET', 'DRY']);
  }
});

it('a lower wet-probability threshold in the pack data makes the same PROB group WET', () => {
  for (const ref of PACKS) {
    const high = packWith(ref, (f) => {
      f['settings.json'].wetRunwayProbabilityPct.value = 90;
    });
    const low = packWith(ref, (f) => {
      f['settings.json'].wetRunwayProbabilityPct.value = 20;
    });
    const specs: Spec[] = [{}, { precip: { probable: 40 } }];
    expect(states(high, specs)[1]).toBe('WET_POSSIBLE');
    expect(states(low, specs)[1]).toBe('WET');
  }
});

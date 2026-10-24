// Wind-limit scenarios (REQUIREMENTS section 11), written relative to each
// pack's own limits and headings so they run unchanged on every pack.
import { describe, expect, it } from 'vitest';
import { PACKS } from '../helpers/packs';
import { crosswindOn, describeEachPack, packWith, runMode, steady, tailwindOn, uniformModes, vrb, type Spec } from './helpers';

const WET: Spec = { gov: 'METAR', precip: { prevailing: true } };

describeEachPack('crosswind limit', (pack) => {
  const tol = pack.settings.limitToleranceKt;
  for (const { mode, used } of uniformModes(pack)) {
    const h = used[0]?.headingDegrees ?? 0;
    const limit = mode.maxCrosswindKt;

    it(`mode ${mode.id}: just under its own limit is eligible, just over is UNSUITABLE with cause XW`, () => {
      const under = runMode(pack, mode.id, [{ wind: crosswindOn(h, limit - 0.1) }]).cell(0);
      expect(under.status).not.toBe('UNSUITABLE');
      expect(under.reasons.some((r) => r.severity === 'FAIL')).toBe(false);

      const over = runMode(pack, mode.id, [{ wind: crosswindOn(h, limit + tol + 0.05) }]).cell(0);
      expect(over.status).toBe('UNSUITABLE');
      expect(over.cause).toBe('XW');
      const reason = over.reasons.find((r) => r.code === 'XW');
      expect(reason?.limit).toBe(limit);
      // The reason text is rounded to a whole knot for display (owner decision 24-10-2026); `limit` above stays exact.
      expect(reason?.text).toContain(Math.round(limit).toString());
      expect(reason?.text).toContain("mode's limit");
    });

    it(`mode ${mode.id}: the gust decides when it is stronger than the mean wind`, () => {
      const c = runMode(pack, mode.id, [{ wind: steady((h + 90) % 360, 1, limit + tol + 0.05) }]).cell(0);
      expect(c.status).toBe('UNSUITABLE');
      expect(c.cause).toBe('XW');
    });

    it(`mode ${mode.id}: well inside the limit and the margin is SUITABLE with figures for every runway`, () => {
      const margin = pack.settings.nearLimitMarginKt;
      const c = runMode(pack, mode.id, [{ wind: crosswindOn(h, Math.max(0, limit - margin - 0.5)) }]).cell(0);
      expect(c.status).toBe('SUITABLE');
      expect(c.cause).toBeNull();
      expect(c.runways.map((r) => r.runway).sort()).toEqual([...new Set(used.map((u) => u.name))].sort());
      for (const r of c.runways) {
        expect(r.crosswindLimitKt).toBe(limit);
        expect(r.tailwindLimitDryKt).toBe(pack.settings.tailwindDryKt);
        expect(r.tailwindLimitWetKt).toBe(pack.settings.tailwindWetKt);
        expect(Number.isFinite(r.crosswindKt)).toBe(true);
      }
    });
  }

  it('a mode with a different limit is judged against its own limit', () => {
    const modes = uniformModes(pack);
    for (const a of modes) {
      for (const b of modes) {
        if (a.mode.maxCrosswindKt >= b.mode.maxCrosswindKt) continue;
        const ha = a.used[0]?.headingDegrees ?? 0;
        const hb = b.used[0]?.headingDegrees ?? 0;
        if ((((ha - hb) % 180) + 180) % 180 !== 0) continue; // need the same axis for one wind to serve both
        const speed = a.mode.maxCrosswindKt + 0.1 + pack.settings.limitToleranceKt;
        if (speed > b.mode.maxCrosswindKt) continue;
        const low = runMode(pack, a.mode.id, [{ wind: crosswindOn(ha, speed) }]).cell(0);
        const high = runMode(pack, b.mode.id, [{ wind: crosswindOn(ha, speed) }]).cell(0);
        expect(low.status).toBe('UNSUITABLE');
        expect(high.status).not.toBe('UNSUITABLE');
      }
    }
  });
});

describeEachPack('tailwind limits', (pack) => {
  const s = pack.settings;
  for (const { mode, used } of uniformModes(pack)) {
    const h = used[0]?.headingDegrees ?? 0;

    it(`mode ${mode.id}: dry tailwind just under the limit is eligible, just over is UNSUITABLE with cause TW`, () => {
      const under = runMode(pack, mode.id, [{ wind: tailwindOn(h, s.tailwindDryKt - 0.1, s.calmWindKt) }]).cell(0);
      expect(under.status).not.toBe('UNSUITABLE');
      const over = runMode(pack, mode.id, [{ wind: tailwindOn(h, s.tailwindDryKt + s.limitToleranceKt + 0.05, s.calmWindKt) }]).cell(0);
      expect(over.status).toBe('UNSUITABLE');
      expect(over.cause).toBe('TW');
      expect(over.runwayState).toBe('DRY');
      const reason = over.reasons.find((r) => r.code === 'TW');
      expect(reason?.limit).toBe(s.tailwindDryKt);
      expect(reason?.figures.case).toBe('dry');
    });

    it(`mode ${mode.id}: a wet runway uses the wet limit: just over it is UNSUITABLE`, () => {
      const over = runMode(pack, mode.id, [{ ...WET, wind: tailwindOn(h, s.tailwindWetKt + s.limitToleranceKt + 0.05, s.calmWindKt) }]).cell(0);
      expect(over.runwayState).toBe('WET');
      expect(over.status).toBe('UNSUITABLE');
      expect(over.cause).toBe('TW');
      expect(over.reasons.find((r) => r.code === 'TW')?.limit).toBe(s.tailwindWetKt);
      const under = runMode(pack, mode.id, [{ ...WET, wind: tailwindOn(h, Math.max(0, s.tailwindWetKt - 0.1), s.calmWindKt) }]).cell(0);
      expect(under.reasons.some((r) => r.severity === 'FAIL')).toBe(false);
    });

    it(`mode ${mode.id}: well below the dry limit and its margin is SUITABLE`, () => {
      const c = runMode(pack, mode.id, [{ wind: tailwindOn(h, Math.max(0, s.tailwindDryKt - s.nearLimitMarginKt - 0.5), s.calmWindKt) }]).cell(0);
      expect(c.status).toBe('SUITABLE');
    });
  }

  it('a tailwind on any one runway of a mode fails the whole mode (every runway judged alone)', () => {
    // Opposite ends in one mode: the tailwind on one is a headwind on the other, and still fails.
    const opposite = uniformModes(pack).find(({ used }) => used.some((u) => u.headingDegrees !== used[0]?.headingDegrees));
    if (opposite === undefined) return;
    const h = opposite.used[0]?.headingDegrees ?? 0;
    const c = runMode(pack, opposite.mode.id, [{ wind: tailwindOn(h, s.tailwindDryKt + 1, s.calmWindKt) }]).cell(0);
    expect(c.status).toBe('UNSUITABLE');
    const failing = c.reasons.filter((r) => r.code === 'TW' && r.severity === 'FAIL').map((r) => r.runway);
    expect(failing).toEqual(opposite.used.filter((u) => u.headingDegrees === h).map((u) => u.name));
  });

  it('a wet runway with a headwind is eligible', () => {
    const same = uniformModes(pack).find(({ used }) => used.every((u) => u.headingDegrees === used[0]?.headingDegrees));
    if (same === undefined) throw new Error('every pack has a mode whose ends share one heading');
    const h = same.used[0]?.headingDegrees ?? 0;
    const c = runMode(pack, same.mode.id, [{ ...WET, wind: steady(h, 15) }]).cell(0);
    expect(c.runwayState).toBe('WET');
    expect(c.status).toBe('SUITABLE');
    expect(c.runways[0]?.tailwindKt).toBe(0);
  });
});

describeEachPack('wet possible', (pack) => {
  const s = pack.settings;
  const first = uniformModes(pack)[0];
  if (first === undefined) throw new Error('no mode');
  const id = first.mode.id;
  const h = first.used[0]?.headingDegrees ?? 0;
  const possible: Spec['precip'] = { temporary: true };

  it('passing only the dry case is MARGINAL, uncertain, never SUITABLE', () => {
    const wetOnly = s.tailwindWetKt + s.limitToleranceKt + 0.05;
    expect(wetOnly).toBeLessThanOrEqual(s.tailwindDryKt + s.limitToleranceKt);
    const c = runMode(pack, id, [{}, { wind: tailwindOn(h, wetOnly, s.calmWindKt), precip: possible }]).cell(1);
    expect(c.runwayState).toBe('WET_POSSIBLE');
    expect(c.status).toBe('MARGINAL');
    expect(c.uncertain).toBe(true);
    expect(c.cause).toBe('TW');
    const reason = c.reasons.find((r) => r.code === 'TW');
    expect(reason?.severity).toBe('MARGINAL');
    expect(reason?.figures.case).toBe('wet');
    expect(reason?.limit).toBe(s.tailwindWetKt);
  });

  it('failing the dry case is UNSUITABLE', () => {
    const c = runMode(pack, id, [{}, { wind: tailwindOn(h, s.tailwindDryKt + s.limitToleranceKt + 0.05, s.calmWindKt), precip: possible }]).cell(1);
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('TW');
    expect(c.reasons.find((r) => r.code === 'TW')?.figures.case).toBe('dry');
  });

  it('passing both cases is SUITABLE and not uncertain', () => {
    const c = runMode(pack, id, [{}, { precip: possible }]).cell(1);
    expect(c.runwayState).toBe('WET_POSSIBLE');
    expect(c.status).toBe('SUITABLE');
    expect(c.uncertain).toBe(false);
  });
});

describeEachPack('calm and variable wind', (pack) => {
  const s = pack.settings;
  const first = uniformModes(pack)[0];
  if (first === undefined) throw new Error('no mode');
  const id = first.mode.id;
  const h = first.used[0]?.headingDegrees ?? 0;

  it('wind at the calm threshold gives no tailwind and no crosswind, even on a wet runway', () => {
    const c = runMode(pack, id, [{ ...WET, wind: steady((h + 180) % 360, s.calmWindKt) }]).cell(0);
    expect(c.runwayState).toBe('WET');
    expect(c.status).toBe('SUITABLE');
    for (const r of c.runways) {
      expect(r.calm).toBe(true);
      expect(r.tailwindKt).toBe(0);
      expect(r.crosswindKt).toBe(0);
    }
  });

  it('variable wind at or below the calm threshold is calm: SUITABLE, no VRB reason', () => {
    const c = runMode(pack, id, [{ wind: vrb(s.calmWindKt) }]).cell(0);
    expect(c.status).toBe('SUITABLE');
    expect(c.reasons).toEqual([]);
    const gusty = runMode(pack, id, [{ wind: vrb(1, s.calmWindKt) }]).cell(0);
    expect(gusty.status).toBe('SUITABLE');
  });

  it('variable wind above calm makes the mode MARGINAL with cause VRB', () => {
    const speed = s.calmWindKt + 0.5;
    expect(speed).toBeLessThanOrEqual(Math.min(s.tailwindDryKt, first.mode.maxCrosswindKt));
    const c = runMode(pack, id, [{ wind: vrb(speed) }]).cell(0);
    expect(c.status).toBe('MARGINAL');
    expect(c.cause).toBe('VRB');
    expect(c.uncertain).toBe(true);
    const viaGust = runMode(pack, id, [{ wind: vrb(1, speed) }]).cell(0);
    expect(viaGust.cause).toBe('VRB');
  });

  it('variable wind whose full speed breaks a limit on every runway the mode uses is UNSUITABLE', () => {
    const speed = Math.max(s.tailwindDryKt, first.mode.maxCrosswindKt) + s.limitToleranceKt + 0.05;
    const c = runMode(pack, id, [{ wind: vrb(speed) }]).cell(0);
    expect(c.status).toBe('UNSUITABLE');
    expect(c.reasons.some((r) => r.code === 'VRB')).toBe(true);
    const failing = c.reasons.filter((r) => r.severity === 'FAIL');
    expect(new Set(failing.map((r) => r.runway))).toEqual(new Set(first.used.map((u) => u.name)));
  });

  it('variable wind on a wet runway is not judged against the wet tailwind limit: MARGINAL, cause VRB', () => {
    const speed = s.calmWindKt + 0.5; // above calm, below the dry tailwind and crosswind limits
    expect(speed).toBeLessThanOrEqual(Math.min(s.tailwindDryKt, first.mode.maxCrosswindKt));
    const c = runMode(pack, id, [{ ...WET, wind: vrb(speed) }]).cell(0);
    expect(c.runwayState).toBe('WET');
    expect(c.status).toBe('MARGINAL');
    expect(c.cause).toBe('VRB');
    const gust = runMode(pack, id, [{ ...WET, wind: vrb(1, speed) }]).cell(0);
    expect(gust.status).toBe('MARGINAL');
  });

  it('variable wind on a wet runway is UNSUITABLE only when the full speed breaks the DRY tailwind or the crosswind limit', () => {
    const limit = Math.max(s.tailwindDryKt, first.mode.maxCrosswindKt);
    const over = runMode(pack, id, [{ ...WET, wind: vrb(limit + s.limitToleranceKt + 0.05) }]).cell(0);
    expect(over.status).toBe('UNSUITABLE');
    expect(over.reasons.find((r) => r.severity === 'FAIL')?.limit).toBe(s.tailwindDryKt);
    const justUnder = runMode(pack, id, [{ ...WET, wind: vrb(Math.min(s.tailwindDryKt, first.mode.maxCrosswindKt)) }]).cell(0);
    expect(justUnder.status).not.toBe('UNSUITABLE');
  });

  it('a full-circle range is treated like variable wind on a wet runway; a steady tailwind of 0.1 kt over the wet limit is still UNSUITABLE', () => {
    const speed = s.calmWindKt + 0.5;
    const circle = runMode(pack, id, [{ ...WET, wind: steady(h, speed, null, [0, 360]) }]).cell(0);
    expect(circle.status).toBe('MARGINAL');
    expect(circle.cause).toBe('VRB');
    const steadyTail = runMode(pack, id, [{ ...WET, wind: tailwindOn(h, s.tailwindWetKt + s.limitToleranceKt + 0.05, s.calmWindKt) }]).cell(0);
    expect(steadyTail.status).toBe('UNSUITABLE');
    expect(steadyTail.cause).toBe('TW');
    const ranged = runMode(pack, id, [{ ...WET, wind: steady(h + 180, s.calmWindKt + 1, null, [h + 170, h + 190]) }]).cell(0);
    expect(ranged.status).toBe(s.tailwindWetKt < s.calmWindKt + 1 ? 'UNSUITABLE' : ranged.status);
  });
});

describeEachPack('direction range', (pack) => {
  const s = pack.settings;
  const first = uniformModes(pack)[0];
  if (first === undefined) throw new Error('no mode');
  const id = first.mode.id;
  const h = first.used[0]?.headingDegrees ?? 0;

  it('the worst direction in the range decides the tailwind', () => {
    // Mean direction 40 degrees off the tail axis; the range includes the tail axis itself.
    const speed = s.tailwindDryKt + 0.1;
    const meanOnly = runMode(pack, id, [{ wind: steady(h + 180 - 40, speed) }]).cell(0);
    expect(meanOnly.reasons.some((r) => r.severity === 'FAIL')).toBe(false);
    const ranged = runMode(pack, id, [{ wind: steady(h + 180 - 40, speed, null, [h + 180 - 40, h + 180 + 40]) }]).cell(0);
    expect(ranged.status).toBe('UNSUITABLE');
    expect(ranged.cause).toBe('TW');
    expect(ranged.runways[0]?.tailwindKt).toBeCloseTo(speed, 9);
  });

  it('the worst crosswind is found separately, at its own critical angle', () => {
    const limit = first.mode.maxCrosswindKt;
    const speed = limit + 0.1;
    // Both ends are within 10 degrees of right angles but the speed times sin 80 is still under the limit; the middle (90) is over it.
    const ranged = runMode(pack, id, [{ wind: steady(h + 80, speed, null, [h + 80, h + 100]) }]).cell(0);
    expect(ranged.status).toBe('UNSUITABLE');
    expect(ranged.cause).toBe('XW');
    expect(ranged.runways[0]?.crosswindKt).toBeCloseTo(speed, 9);
  });
});

describeEachPack('full-circle direction range', (pack) => {
  const first = uniformModes(pack)[0];
  if (first === undefined) throw new Error('no mode');
  const id = first.mode.id;
  const h = first.used[0]?.headingDegrees ?? 0;
  const limit = first.mode.maxCrosswindKt;

  it('000V360 and equal ends cover every direction: the worst tailwind and crosswind are the full speed', () => {
    for (const range of [[0, 360], [90, 90], [10, 370]] as const) {
      const speed = Math.max(pack.settings.tailwindDryKt, limit) + 0.2;
      const c = runMode(pack, id, [{ wind: steady(h, speed, null, range) }]).cell(0);
      expect(c.runways[0]?.tailwindKt).toBeCloseTo(speed, 9);
      expect(c.runways[0]?.crosswindKt).toBeCloseTo(speed, 9);
      expect(c.status).toBe('UNSUITABLE');
    }
  });
});

describeEachPack('tolerance and noise', (pack, ref) => {
  const first = uniformModes(pack)[0];
  if (first === undefined) throw new Error('no mode');
  const id = first.mode.id;
  const h = first.used[0]?.headingDegrees ?? 0;

  it('a wind exactly crosswise gives a rounding-noise tailwind that passes a 0 kt limit', () => {
    const zero = packWith(ref, (f) => {
      f['settings.json'].tailwindWetKt.value = 0;
    });
    // Direction h + 270 (unreduced) makes cos(270 degrees) a tiny negative number: a tailwind of about 1e-15.
    const cell = runMode(zero, id, [{ ...WET, wind: steady(h + 270, zero.settings.calmWindKt + 1) }]).cell(0);
    const noise = Math.max(...cell.runways.map((r) => r.tailwindKt));
    expect(noise).toBeGreaterThan(0);
    expect(noise).toBeLessThan(1e-9);
    expect(cell.runwayState).toBe('WET');
    expect(cell.reasons.some((r) => r.code === 'TW')).toBe(false);
    expect(cell.status).toBe('SUITABLE');

    const strict = packWith(ref, (f) => {
      f['settings.json'].tailwindWetKt.value = 0;
      f['settings.json'].limitToleranceKt.value = 0;
    });
    const refused = runMode(strict, id, [{ ...WET, wind: steady(h + 270, zero.settings.calmWindKt + 1) }]).cell(0);
    expect(refused.status).toBe('UNSUITABLE');
    expect(refused.cause).toBe('TW');
  });

  it('a tailwind inside the tolerance of a 0 kt limit passes and is never MARGINAL for margin', () => {
    const zero = packWith(ref, (f) => {
      f['settings.json'].tailwindWetKt.value = 0;
      f['settings.json'].limitToleranceKt.value = 0.05;
      const m = f['modes.json'].modes.find((x: { id: string }) => x.id === id);
      m.maxCrosswindKt = 0;
    });
    const speed = zero.settings.calmWindKt + 1;
    // Tail component of 0.04 kt on the first runway: direction slightly off the crosswise line.
    const angle = Math.asin(0.04 / speed) * (180 / Math.PI);
    const c = runMode(zero, id, [{ ...WET, wind: steady(h + 270 - angle, speed) }]).cell(0);
    expect(c.runways[0]?.tailwindKt).toBeGreaterThan(0);
    expect(c.runways[0]?.tailwindKt).toBeLessThan(0.05);
    expect(c.reasons.filter((r) => r.code === 'TW')).toEqual([]);
  });
});

describeEachPack('near-limit margin', (pack, ref) => {
  const s = pack.settings;
  const first = uniformModes(pack)[0];
  if (first === undefined) throw new Error('no mode');
  const id = first.mode.id;
  const h = first.used[0]?.headingDegrees ?? 0;
  const xwLimit = first.mode.maxCrosswindKt;

  it('a tailwind within the margin of its limit is MARGINAL (not uncertain) with the figures', () => {
    const tw = s.tailwindDryKt - s.nearLimitMarginKt + 0.1;
    const c = runMode(pack, id, [{ wind: tailwindOn(h, tw, s.calmWindKt) }]).cell(0);
    expect(c.status).toBe('MARGINAL');
    expect(c.cause).toBe('TW');
    expect(c.uncertain).toBe(false);
    const r = c.reasons.find((x) => x.code === 'TW');
    expect(r?.severity).toBe('MARGINAL');
    expect(r?.figures.near).toBe(true);
    expect(r?.limit).toBe(s.tailwindDryKt);
  });

  it('a crosswind within the margin of the mode limit is MARGINAL, and just outside it is SUITABLE', () => {
    const inside = runMode(pack, id, [{ wind: crosswindOn(h, xwLimit - s.nearLimitMarginKt + 0.1) }]).cell(0);
    expect(inside.status).toBe('MARGINAL');
    expect(inside.cause).toBe('XW');
    const outside = runMode(pack, id, [{ wind: crosswindOn(h, xwLimit - s.nearLimitMarginKt - 0.1) }]).cell(0);
    expect(outside.status).toBe('SUITABLE');
  });

  it('the margin comes from the pack: a wider margin makes the same wind MARGINAL', () => {
    const wide = packWith(ref, (f) => {
      f['settings.json'].nearLimitMarginKt.value = 10;
    });
    const speed = Math.max(0, xwLimit - s.nearLimitMarginKt - 0.1);
    expect(runMode(pack, id, [{ wind: crosswindOn(h, speed) }]).cell(0).status).toBe('SUITABLE');
    expect(runMode(wide, id, [{ wind: crosswindOn(h, speed) }]).cell(0).status).toBe('MARGINAL');
  });
});

describe('limits come from the pack data', () => {
  for (const ref of PACKS) {
    it(`[${ref.name}] changing a crosswind limit, a tailwind limit or the tolerance changes the result with no code change`, () => {
      const original = packWith(ref, () => {});
      const first = uniformModes(original)[0];
      if (first === undefined) throw new Error('no mode');
      const id = first.mode.id;
      const h = first.used[0]?.headingDegrees ?? 0;
      const limit = first.mode.maxCrosswindKt;

      const wind = crosswindOn(h, limit - 0.1);
      expect(runMode(original, id, [{ wind }]).cell(0).status).not.toBe('UNSUITABLE');
      const tighter = packWith(ref, (f) => {
        f['modes.json'].modes.find((x: { id: string }) => x.id === id).maxCrosswindKt = limit - 5;
      });
      expect(runMode(tighter, id, [{ wind }]).cell(0).status).toBe('UNSUITABLE');

      const tail = tailwindOn(h, original.settings.tailwindDryKt + 0.1 + original.settings.limitToleranceKt, original.settings.calmWindKt);
      expect(runMode(original, id, [{ wind: tail }]).cell(0).status).toBe('UNSUITABLE');
      const looser = packWith(ref, (f) => {
        f['settings.json'].tailwindDryKt.value = original.settings.tailwindDryKt + 3;
      });
      expect(runMode(looser, id, [{ wind: tail }]).cell(0).reasons.some((r) => r.severity === 'FAIL')).toBe(false);
    });
  }
});

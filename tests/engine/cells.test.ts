// Cell-level behaviour that is not a single wind limit: reasons, plan bands,
// capacity, disabled modes, METAR/TAF disagreement, overlays, missing data.
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/engine';
import type { WeatherOverlay } from '../../src/engine';
import { PACKS, TEST_PACK } from '../helpers/packs';
import {
  DAY_START_MS,
  SLOT_MS,
  crosswindOn,
  describeEachPack,
  inputFor,
  packFrom,
  packWith,
  runAt,
  runMode,
  steady,
  tailwindOn,
  uniformModes,
  type Spec,
} from './helpers';

function firstMode(pack: Parameters<typeof uniformModes>[0]) {
  const m = uniformModes(pack)[0];
  if (m === undefined) throw new Error('no mode');
  return { id: m.mode.id, h: m.used[0]?.headingDegrees ?? 0, mode: m.mode, used: m.used };
}

describeEachPack('all reasons are kept', (pack, ref) => {
  const { id, h, mode } = firstMode(pack);
  const s = pack.settings;

  it('a cell failing both tailwind and crosswind keeps both reasons, with tailwind as the primary cause', () => {
    // 45 degrees off the tail axis: both components are speed x 0.707.
    const limit = Math.max(s.tailwindDryKt, mode.maxCrosswindKt);
    const speed = (limit + 2) / Math.SQRT1_2;
    const c = runMode(pack, id, [{ wind: steady(h + 180 - 45, speed) }]).cell(0);
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('TW');
    const codes = c.reasons.filter((r) => r.severity === 'FAIL').map((r) => r.code);
    expect(codes).toContain('TW');
    expect(codes).toContain('XW');
    expect(codes.indexOf('TW')).toBeLessThan(codes.indexOf('XW'));
    for (const r of c.reasons) {
      expect(typeof r.text).toBe('string');
      expect(r.limit === null || typeof r.limit === 'number').toBe(true);
    }
  });

  it('plan, tailwind, crosswind and capacity all keep their reasons, in the fixed order, with the plan as primary cause', () => {
    const bad = packWith(ref, (f) => {
      const band = f['operating_plan.json'].bands[0];
      band.rows = band.rows.filter((r: { mode: string }) => r.mode !== id);
      band.rows.push({ mode: id, allowed: false, penalty: 0 });
      f['modes.json'].modes.find((m: { id: string }) => m.id === id).capacity = 10;
    });
    const bandId = bad.plan[0]?.id;
    // Find a start inside band 0.
    let base = -1;
    for (let i = 0; i < 96 && base < 0; i += 1) {
      const t = DAY_START_MS + i * SLOT_MS;
      if (evaluate(bad, inputFor(t, [{}])).slots[0]?.bandId === bandId) base = t;
    }
    expect(base).toBeGreaterThan(0);
    const limit = Math.max(s.tailwindDryKt, mode.maxCrosswindKt);
    const c = runAt(bad, id, base, [{ wind: steady(h + 180 - 45, (limit + 2) / Math.SQRT1_2) }], [{ startMs: base, arrivals: 50, departures: 0 }]).cell(0);
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('PLAN');
    expect(c.reasons.filter((r) => r.severity === 'FAIL').map((r) => r.code).filter((code, i, all) => all.indexOf(code) === i)).toEqual(['PLAN', 'TW', 'XW', 'CAP']);
  });
});

describeEachPack('disabled mode', (pack, ref) => {
  const { id, h } = firstMode(pack);
  it('is UNSUITABLE with cause MODE and no wind calculation', () => {
    const off = packWith(ref, (f) => {
      f['modes.json'].modes.find((m: { id: string }) => m.id === id).enabled = false;
    });
    const c = runMode(off, id, [{ wind: tailwindOn(h, 50, 0) }]).cell(0);
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('MODE');
    expect(c.reasons.map((r) => r.code)).toEqual(['MODE']);
    expect(c.runways).toEqual([]);
  });

  it('stays UNSUITABLE with unknown weather', () => {
    const off = packWith(ref, (f) => {
      f['modes.json'].modes.find((m: { id: string }) => m.id === id).enabled = false;
    });
    expect(runMode(off, id, [{ wind: null, gov: 'NONE' }]).cell(0).status).toBe('UNSUITABLE');
  });

  it('the same mode enabled in the pack data is evaluated normally (no code change)', () => {
    expect(runMode(pack, id, [{}]).cell(0).status).toBe('SUITABLE');
  });
});

describeEachPack('operating plan', (pack, ref) => {
  const { id, h } = firstMode(pack);

  function forbidden() {
    return packWith(ref, (f) => {
      const band = f['operating_plan.json'].bands[0];
      band.rows = band.rows.filter((r: { mode: string }) => r.mode !== id);
      band.rows.push({ mode: id, allowed: false, penalty: 0 });
    });
  }

  it('a row with allowed false makes the mode UNSUITABLE with cause PLAN, only inside that band', () => {
    const bad = forbidden();
    const bandId = bad.plan[0]?.id;
    const slots = Array.from({ length: 96 }, () => ({}) as Spec);
    const r = runAt(bad, id, DAY_START_MS, slots);
    let sawInside = false;
    let sawOutside = false;
    for (let i = 0; i < 96; i += 1) {
      const c = r.cell(i);
      if (r.result.slots[i]?.bandId === bandId) {
        sawInside = true;
        expect(c.status).toBe('UNSUITABLE');
        expect(c.cause).toBe('PLAN');
        expect(c.reasons.find((x) => x.code === 'PLAN')?.figures.bandId).toBe(bandId);
      } else {
        sawOutside = true;
        const band = pack.plan.find((b) => b.id === r.result.slots[i]?.bandId);
        const forbiddenByOriginalData = band?.rows.some((row) => row.mode === id && !row.allowed) ?? false;
        expect(c.reasons.some((x) => x.code === 'PLAN')).toBe(forbiddenByOriginalData);
      }
    }
    expect(sawInside).toBe(true);
    if (bad.plan.length > 1) expect(sawOutside).toBe(true);
    void h;
  });

  it('every slot start gets the band holding its local wall time (start inclusive, end exclusive)', () => {
    const zone = pack.airport.timeZone;
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    const slots = Array.from({ length: 96 }, () => ({}) as Spec);
    const result = evaluate(pack, inputFor(DAY_START_MS, slots));
    result.slots.forEach((slot, i) => {
      const [hh, mm] = fmt.format(slot.startMs).split(':').map(Number) as [number, number];
      const minute = hh * 60 + mm;
      const expected = pack.plan.find((b) => (b.allDay ? true : b.startMinute <= b.endMinute ? minute >= b.startMinute && minute < b.endMinute : minute >= b.startMinute || minute < b.endMinute));
      expect(slot.bandId, `slot ${i} local minute ${minute}`).toBe(expected?.id ?? null);
    });
  });
});

describe('plan bands in a zone with a half-hour offset, across midnight', () => {
  // The fixture has an "early" band 06:30-22:30 local and a "late" band 22:30-06:30 (crossing midnight)
  // in a zone 3.5 hours behind UTC in January and 2.5 hours behind in July.
  const pack = packFrom(TEST_PACK);
  const band = (iso: string): string | null => evaluate(pack, inputFor(Date.parse(iso), [{}])).slots[0]?.bandId ?? null;
  const early = pack.plan.find((b) => !b.allDay && b.startMinute < b.endMinute)?.id ?? null;
  const late = pack.plan.find((b) => !b.allDay && b.startMinute > b.endMinute)?.id ?? null;

  it('January (UTC-3:30): 06:30 local is 10:00 UTC', () => {
    expect(band('2026-01-15T09:30:00Z')).toBe(late);
    expect(band('2026-01-15T10:00:00Z')).toBe(early);
    expect(band('2026-01-15T21:30:00Z')).toBe(early); // 18:00 local
    expect(band('2026-01-16T01:30:00Z')).toBe(early); // 22:00 local
    expect(band('2026-01-16T02:00:00Z')).toBe(late); // 22:30 local: end of early is exclusive
  });

  it('across midnight: 00:00 local is in the late band, and so is 06:00', () => {
    expect(band('2026-01-16T03:30:00Z')).toBe(late); // 00:00 local
    expect(band('2026-01-16T09:30:00Z')).toBe(late); // 06:00 local
  });

  it('July (UTC-2:30, daylight saving): 06:30 local is 09:00 UTC', () => {
    expect(band('2026-07-15T08:30:00Z')).toBe(late);
    expect(band('2026-07-15T09:00:00Z')).toBe(early);
  });
});

describeEachPack('capacity', (pack, ref) => {
  const { id } = firstMode(pack);
  const capped = packWith(ref, (f) => {
    f['modes.json'].modes.find((m: { id: string }) => m.id === id).capacity = 10; // 5 movements in a 30-minute slot
  });
  const at = (base: number, arrivals: number | null, departures: number | null) => [{ startMs: base, arrivals, departures }];
  const base = (): number => runMode(capped, id, [{}]).baseMs;

  it('known demand at the scaled capacity passes; above it is UNSUITABLE with cause CAP', () => {
    const b = base();
    const ok = runAt(capped, id, b, [{}], at(b, 5, 0)).cell(0);
    expect(ok.status).toBe('SUITABLE');
    expect(ok.demand.capacityInSlot).toBe(5);
    const over = runAt(capped, id, b, [{}], at(b, 6, 0)).cell(0);
    expect(over.status).toBe('UNSUITABLE');
    expect(over.cause).toBe('CAP');
    const reason = over.reasons.find((r) => r.code === 'CAP');
    expect(reason?.limit).toBe(5);
    expect(reason?.figures.knownDemand).toBe(6);
  });

  it('arrivals plus departures are added', () => {
    const b = base();
    expect(runAt(capped, id, b, [{}], at(b, 3, 3)).cell(0).status).toBe('UNSUITABLE');
    expect(runAt(capped, id, b, [{}], at(b, 3, 2)).cell(0).status).toBe('SUITABLE');
  });

  it('a missing side counts as zero: arrivals alone or departures alone can break the limit', () => {
    const b = base();
    const arrivalsOnly = runAt(capped, id, b, [{}], at(b, 6, null)).cell(0);
    expect(arrivalsOnly.status).toBe('UNSUITABLE');
    expect(arrivalsOnly.demand.knownDemand).toBe(6);
    expect(runAt(capped, id, b, [{}], at(b, null, 6)).cell(0).status).toBe('UNSUITABLE');
    expect(runAt(capped, id, b, [{}], at(b, 4, null)).cell(0).status).toBe('SUITABLE');
  });

  it('with both sides unknown the check is skipped, never UNSUITABLE, and the cell is marked uncertain', () => {
    const b = base();
    const c = runAt(capped, id, b, [{}], at(b, null, null)).cell(0);
    expect(c.status).toBe('SUITABLE');
    expect(c.uncertain).toBe(true);
    expect(c.reasons.map((r) => r.code)).toContain('NO_DEMAND');
    const missing = runAt(capped, id, b, [{}], []).cell(0);
    expect(missing.uncertain).toBe(true);
    expect(missing.status).toBe('SUITABLE');
  });

  it('a mode with no capacity set is never checked, and unknown demand is not uncertain for it', () => {
    const none = packWith(ref, (f) => {
      f['modes.json'].modes.find((m: { id: string }) => m.id === id).capacity = null;
    });
    const b = runMode(none, id, [{}]).baseMs;
    const c = runAt(none, id, b, [{}], at(b, 500, 500)).cell(0);
    expect(c.status).toBe('SUITABLE');
    expect(c.reasons).toEqual([]);
    expect(runAt(none, id, b, [{}], []).cell(0).uncertain).toBe(false);
  });

  it('the capacity is scaled to the slot length from the per-hour figure in the pack', () => {
    const big = packWith(ref, (f) => {
      f['modes.json'].modes.find((m: { id: string }) => m.id === id).capacity = 40;
    });
    const b = runMode(big, id, [{}]).baseMs;
    expect(runAt(big, id, b, [{}], at(b, 20, 0)).cell(0).status).toBe('SUITABLE');
    expect(runAt(big, id, b, [{}], at(b, 21, 0)).cell(0).status).toBe('UNSUITABLE');
  });

  it('traffic is matched to slots by start time', () => {
    const b = base();
    const r = runAt(capped, id, b, [{}, {}], [{ startMs: b + SLOT_MS, arrivals: 9, departures: 0 }, { startMs: b, arrivals: 0, departures: 0 }]);
    expect(r.cell(0).status).toBe('SUITABLE');
    expect(r.cell(1).status).toBe('UNSUITABLE');
  });
});

describeEachPack('METAR window and the TAF', (pack) => {
  const { id, h, mode } = firstMode(pack);
  const s = pack.settings;
  const over = tailwindOn(h, s.tailwindDryKt + s.limitToleranceKt + 0.05, s.calmWindKt);

  it('a TAF that would make the mode worse does not affect the METAR-governed cell: the METAR is not second-guessed while it governs (owner, 24-10-2026, amending WX-7)', () => {
    const c = runMode(pack, id, [{ gov: 'METAR', tafView: { wind: over } }]).cell(0);
    expect(c.status).toBe('SUITABLE');
    expect(c.reasons.some((r) => r.code === 'TAF')).toBe(false);
  });

  it('a TAF that agrees, or is better, changes nothing', () => {
    expect(runMode(pack, id, [{ gov: 'METAR', tafView: {} }]).cell(0).status).toBe('SUITABLE');
    expect(runMode(pack, id, [{ gov: 'METAR', wind: over, tafView: {} }]).cell(0).status).toBe('UNSUITABLE');
    expect(runMode(pack, id, [{ gov: 'METAR', wind: over, tafView: { wind: over } }]).cell(0).status).toBe('UNSUITABLE');
  });

  it('with no TAF view the METAR decides alone', () => {
    expect(runMode(pack, id, [{ gov: 'METAR' }]).cell(0).status).toBe('SUITABLE');
  });

  it('a TAF that would only be MARGINAL for a SUITABLE METAR cell does not affect it either', () => {
    const near = crosswindOn(h, mode.maxCrosswindKt - s.nearLimitMarginKt + 0.1);
    const c = runMode(pack, id, [{ gov: 'METAR', tafView: { wind: near } }]).cell(0);
    expect(c.status).toBe('SUITABLE');
    expect(c.reasons.some((r) => r.code === 'TAF')).toBe(false);
  });

  it("the TAF view's runway state (rain forecast) does not affect a METAR-governed cell either: the real runway state is unchanged and the mode is judged dry", () => {
    const wetOnly = tailwindOn(h, s.tailwindWetKt + s.limitToleranceKt + 0.05, s.calmWindKt);
    const c = runMode(pack, id, [{}, { gov: 'METAR', wind: wetOnly, tafView: { wind: wetOnly, precip: { prevailing: true } } }]).cell(1);
    expect(c.runwayState).toBe('DRY');
    expect(c.reasons.some((r) => r.code === 'TAF')).toBe(false);
    expect(c.status).toBe('SUITABLE');
  });

  it('a TAF slot (not METAR-governed) is judged on its own weather and has no TAF reason', () => {
    const c = runMode(pack, id, [{ gov: 'TAF', wind: over }]).cell(0);
    expect(c.status).toBe('UNSUITABLE');
    expect(c.reasons.some((r) => r.code === 'TAF')).toBe(false);
  });
});

describeEachPack('TEMPO, INTER and PROB overlays', (pack) => {
  const { id, h } = firstMode(pack);
  const s = pack.settings;
  const bad = tailwindOn(h, s.tailwindDryKt + s.limitToleranceKt + 0.05, s.calmWindKt);
  const overlay = (patch: Partial<WeatherOverlay>): WeatherOverlay => ({ kind: 'TEMPO', probabilityPct: null, wind: bad, precipitation: false, text: 'TEMPO 1012 test', ...patch });

  it('an overlay that would fail the mode makes it MARGINAL (never UNSUITABLE) with cause OVERLAY', () => {
    const c = runMode(pack, id, [{ overlays: [overlay({})] }]).cell(0);
    expect(c.status).toBe('MARGINAL');
    expect(c.cause).toBe('OVERLAY');
    expect(c.uncertain).toBe(true);
    const r = c.reasons.find((x) => x.code === 'OVERLAY');
    expect(r?.figures.overlayKind).toBe('TEMPO');
    expect(r?.figures.tailwindKt).toBeGreaterThan(s.tailwindDryKt);
  });

  it('INTER and PROB overlays are judged the same way', () => {
    for (const kind of ['INTER', 'PROB'] as const) {
      const c = runMode(pack, id, [{ overlays: [overlay({ kind, probabilityPct: kind === 'PROB' ? 30 : null })] }]).cell(0);
      expect(c.status).toBe('MARGINAL');
      expect(c.cause).toBe('OVERLAY');
    }
  });

  it('an overlay that passes, or gives no wind, changes nothing', () => {
    expect(runMode(pack, id, [{ overlays: [overlay({ wind: steady(0, 0) })] }]).cell(0).uncertain).toBe(false);
    expect(runMode(pack, id, [{ overlays: [overlay({ wind: steady(0, 0) })] }]).cell(0).status).toBe('SUITABLE');
  });

  it('an overlay never replaces the prevailing state: the prevailing wind that fails stays UNSUITABLE', () => {
    const c = runMode(pack, id, [{ wind: bad, overlays: [overlay({ wind: steady(0, 0) })] }]).cell(0);
    expect(c.status).toBe('UNSUITABLE');
  });

  it('an overlay with no wind or an unusable wind is never silently SUITABLE: an INFO reason and uncertain', () => {
    for (const wind of [null, steady(Number.NaN, 10), steady(90, Number.NaN)]) {
      const c = runMode(pack, id, [{ overlays: [overlay({ wind })] }]).cell(0);
      expect(c.status).toBe('SUITABLE');
      expect(c.uncertain).toBe(true);
      const r = c.reasons.find((x) => x.code === 'OVERLAY');
      expect(r?.severity).toBe('INFO');
      expect(r?.figures.windKnown).toBe(false);
    }
  });

  it('an overlay with rain is judged with a wet runway', () => {
    const wetOnly = tailwindOn(h, s.tailwindWetKt + s.limitToleranceKt + 0.05, s.calmWindKt);
    const dryOverlay = runMode(pack, id, [{ overlays: [overlay({ wind: wetOnly, precipitation: false })] }]).cell(0);
    expect(dryOverlay.reasons.some((r) => r.code === 'OVERLAY')).toBe(false);
    const wetOverlay = runMode(pack, id, [{ overlays: [overlay({ wind: wetOnly, precipitation: true })] }]).cell(0);
    expect(wetOverlay.cause).toBe('OVERLAY');
    expect(wetOverlay.status).toBe('MARGINAL');
  });

  it('TEMPO precipitation shows uncertainty without becoming prevailing', () => {
    const r = evaluate(pack, inputFor(DAY_START_MS, [{}, { precip: { temporary: true } }]));
    expect(r.slots[1]?.runwayState).toBe('WET_POSSIBLE');
    expect(r.slots[1]?.runwayState).not.toBe('WET');
    expect(r.slots[1]?.uncertain).toBe(true);
  });
});

describeEachPack('missing data', (pack, ref) => {
  const { id } = firstMode(pack);

  it('no wind for the slot is UNKNOWN, uncertain, with a reason, not a failure', () => {
    const r = runMode(pack, id, [{ gov: 'NONE', wind: null }]);
    const c = r.cell(0);
    expect(c.status).toBe('UNKNOWN');
    expect(c.uncertain).toBe(true);
    expect(c.cause).toBe('NO_WIND');
    expect(c.runways).toEqual([]);
    expect(r.result.slots[0]?.uncertain).toBe(true);
  });

  it('an unusable wind number is treated as unknown, never as passing', () => {
    expect(runMode(pack, id, [{ wind: steady(Number.NaN, 10) }]).cell(0).status).toBe('UNKNOWN');
    expect(runMode(pack, id, [{ wind: steady(90, Number.NaN) }]).cell(0).status).toBe('UNKNOWN');
  });

  it('a known hard failure still wins over unknown wind', () => {
    const capped = packWith(ref, (f) => {
      f['modes.json'].modes.find((m: { id: string }) => m.id === id).capacity = 10;
    });
    const b = runMode(capped, id, [{}]).baseMs;
    const c = runAt(capped, id, b, [{ gov: 'NONE', wind: null }], [{ startMs: b, arrivals: 9, departures: 0 }]).cell(0);
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('CAP');
  });
});

describe('evaluate', () => {
  it('is deterministic and does not change its input', () => {
    const pack = packFrom(PACKS[0]!);
    const input = inputFor(DAY_START_MS, [{ gov: 'METAR', precip: { recent: true } }, { precip: { temporary: true } }, { wind: null, gov: 'NONE' }]);
    const frozen = structuredClone(input);
    const a = evaluate(pack, input);
    const b = evaluate(pack, input);
    expect(a).toEqual(b);
    expect(input).toEqual(frozen);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('gives one cell per mode and slot, in the pack mode order, and works with no slots', () => {
    for (const ref of PACKS) {
      const pack = packFrom(ref);
      const r = evaluate(pack, inputFor(DAY_START_MS, [{}, {}, {}]));
      expect(r.cells.map((row) => row[0]?.modeId)).toEqual(pack.modes.map((m) => m.id));
      expect(r.cells.every((row) => row.length === 3)).toBe(true);
      expect(r.survival.map((x) => x.modeId)).toEqual(pack.modes.map((m) => m.id));
      const empty = evaluate(pack, inputFor(DAY_START_MS, []));
      expect(empty.slots).toEqual([]);
      expect(empty.survival.every((x) => x.viableSlots === 0 && x.viableUntilMs === null)).toBe(true);
    }
  });
});

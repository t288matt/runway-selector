// The shared ceiling and visibility decision (issue 34, OD-66) and the slot
// builder filling the engine's new fields from it.
import { describe, expect, it } from 'vitest';
import { buildWeatherSlots, ceilingOf, decodeMetar, decodeTaf, visibilityMetresOf } from '../../src/weather';
import type { DecodedCloud, DecodedConditions } from '../../src/weather';
import { TEST_PACK } from '../helpers/packs';
import { packWith } from './helpers';

function conditions(over: Partial<DecodedConditions> = {}): DecodedConditions {
  return { wind: null, visibility: null, cavok: false, clouds: [], verticalVisibilityFt: null, weather: [], ...over };
}
const cloud = (quantity: DecodedCloud['quantity'], baseFt: number | null): DecodedCloud => ({ quantity, baseFt, type: null });

describe('ceilingOf', () => {
  it('is the lowest BKN or OVC base', () => {
    expect(ceilingOf(conditions({ clouds: [cloud('SCT', 1000), cloud('OVC', 6000), cloud('BKN', 4500)] }))).toBe(4500);
  });
  it('is the vertical visibility when it is lower than the cloud', () => {
    expect(ceilingOf(conditions({ clouds: [cloud('BKN', 4500)], verticalVisibilityFt: 200 }))).toBe(200);
  });
  it('is the vertical visibility when there is no cloud base', () => {
    expect(ceilingOf(conditions({ verticalVisibilityFt: 300 }))).toBe(300);
  });
  it('is the cloud when the vertical visibility is higher', () => {
    expect(ceilingOf(conditions({ clouds: [cloud('OVC', 400)], verticalVisibilityFt: 900 }))).toBe(400);
  });
  it('is null (no ceiling) for CAVOK', () => {
    expect(ceilingOf(conditions({ cavok: true }))).toBeNull();
  });
  it.each(['SKC', 'NSC', 'FEW', 'SCT'] as const)('is null (no ceiling) with only %s cloud', (q) => {
    expect(ceilingOf(conditions({ clouds: [cloud(q, q === 'FEW' || q === 'SCT' ? 1500 : null)] }))).toBeNull();
  });
  it('is undefined (unknown) when the group says nothing about cloud', () => {
    expect(ceilingOf(conditions())).toBeUndefined();
  });
  it('is undefined when a covering layer has no base and there is no vertical visibility', () => {
    expect(ceilingOf(conditions({ clouds: [cloud('BKN', null)] }))).toBeUndefined();
  });
});

describe('visibilityMetresOf', () => {
  it('is the stated metres, and "more than" counts as the stated metres', () => {
    expect(visibilityMetresOf(conditions({ visibility: { metres: 6000, moreThan: false, lessThan: false } }))).toBe(6000);
    expect(visibilityMetresOf(conditions({ visibility: { metres: 10000, moreThan: true, lessThan: false } }))).toBe(10000);
  });
  it('is at least 10 km for CAVOK', () => {
    expect(visibilityMetresOf(conditions({ cavok: true }))).toBe(10000);
  });
  it('is undefined when none is stated', () => {
    expect(visibilityMetresOf(conditions())).toBeUndefined();
  });
});

describe('slot builder: ceiling and visibility', () => {
  const pack = packWith(TEST_PACK);
  const st = pack.airport.weatherStation;
  const nowMs = Date.UTC(2026, 0, 15, 2, 10);
  const metarOf = (body: string) => {
    const r = decodeMetar(`METAR ${st} 150150Z ${body}`, { pack, nowMs });
    if (r.kind !== 'ok') throw new Error('metar not decoded');
    return r.report;
  };
  const tafOf = (body: string) => {
    const r = decodeTaf(`TAF ${st} 150000Z ${body}`, { pack, nowMs });
    if (r.kind !== 'ok') throw new Error('taf not decoded');
    return r.report;
  };
  const build = (metar: ReturnType<typeof metarOf> | null, taf: ReturnType<typeof tafOf> | null) => buildWeatherSlots({ pack, nowMs, metar, taf, windowMinutes: 120 });

  it('fills a METAR slot', () => {
    const w = build(metarOf('34010KT 6000 SCT020 BKN030 Q1015'), null).slots[0]!.weather;
    expect(w.ceilingFt).toBe(3000);
    expect(w.visibilityMetres).toBe(6000);
  });
  it('fills a CAVOK METAR slot', () => {
    const w = build(metarOf('27010KT CAVOK Q1015'), null).slots[0]!.weather;
    expect(w.ceilingFt).toBeNull();
    expect(w.visibilityMetres).toBe(10000);
  });
  it('leaves a METAR with no cloud group unknown, never invented', () => {
    const w = build(metarOf('27010KT 9999 Q1015'), null).slots[0]!.weather;
    expect(w.ceilingFt).toBeUndefined();
    expect(w.visibilityMetres).toBe(9999);
  });
  it('fills a TAF slot from its prevailing period', () => {
    const slot = build(null, tafOf('1500/1512 34010KT 8000 BKN045')).slots[0]!;
    expect(slot.governedBy).toBe('TAF');
    expect(slot.weather.ceilingFt).toBe(4500);
    expect(slot.weather.visibilityMetres).toBe(8000);
  });
  it('gives a TEMPO group its own values and lets it inherit what it does not mention', () => {
    const taf = tafOf('1500/1512 34010KT 9999 BKN045 TEMPO 1500/1512 4000 RA');
    const [o] = build(null, taf).slots[0]!.weather.overlays;
    expect(o?.visibilityMetres).toBe(4000);
    expect(o?.ceilingFt).toBe(4500);
  });
  it('lets a group that mentions only cloud inherit the visibility', () => {
    const taf = tafOf('1500/1512 34010KT 9999 BKN045 TEMPO 1500/1512 OVC012');
    const [o] = build(null, taf).slots[0]!.weather.overlays;
    expect(o?.ceilingFt).toBe(1200);
    expect(o?.visibilityMetres).toBe(9999);
  });
  it('carries a PROB group through the same way', () => {
    const taf = tafOf('1500/1512 34010KT 9999 BKN045 PROB30 1500/1512 3000 BKN008');
    const [o] = build(null, taf).slots[0]!.weather.overlays;
    expect(o).toMatchObject({ kind: 'PROB', ceilingFt: 800, visibilityMetres: 3000 });
  });
  it('gives a slot with no report no ceiling or visibility', () => {
    const slot = build(null, null).slots[0]!;
    expect(slot.governedBy).toBe('NONE');
    expect(slot.weather.ceilingFt).toBeUndefined();
    expect(slot.weather.visibilityMetres).toBeUndefined();
  });
});

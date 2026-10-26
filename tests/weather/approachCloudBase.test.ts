// The approach cloud base (issue 99): the lowest base of any layer, whatever the cover. It is NOT the ceiling, and
// ceilingOf must not change. Each test fails if the rule it names is removed.
import { describe, expect, it } from 'vitest';
import { approachCloudBaseOf, ceilingOf, decodeMetar } from '../../src/weather';
import type { DecodedCloud, DecodedConditions } from '../../src/weather';
import { TEST_PACK } from '../helpers/packs';
import { packWith } from './helpers';

function conditions(over: Partial<DecodedConditions> = {}): DecodedConditions {
  return { wind: null, visibility: null, cavok: false, clouds: [], verticalVisibilityFt: null, weather: [], ...over };
}
const cloud = (quantity: DecodedCloud['quantity'], baseFt: number | null): DecodedCloud => ({ quantity, baseFt, type: null });

describe('approachCloudBaseOf', () => {
  it('is the lowest base of any layer, FEW and SCT included', () => {
    expect(approachCloudBaseOf(conditions({ clouds: [cloud('SCT', 2500), cloud('FEW', 1500), cloud('BKN', 4000)] }))).toBe(1500);
  });
  it('counts vertical visibility as a base', () => {
    expect(approachCloudBaseOf(conditions({ verticalVisibilityFt: 200 }))).toBe(200);
    expect(approachCloudBaseOf(conditions({ clouds: [cloud('BKN', 4500)], verticalVisibilityFt: 200 }))).toBe(200);
    expect(approachCloudBaseOf(conditions({ clouds: [cloud('OVC', 400)], verticalVisibilityFt: 900 }))).toBe(400);
  });
  it('is null (none) for CAVOK, SKC and NSC', () => {
    expect(approachCloudBaseOf(conditions({ cavok: true }))).toBeNull();
    expect(approachCloudBaseOf(conditions({ clouds: [cloud('SKC', null)] }))).toBeNull();
    expect(approachCloudBaseOf(conditions({ clouds: [cloud('NSC', null)] }))).toBeNull();
  });
  it('is unknown with no cloud group and not CAVOK', () => {
    expect(approachCloudBaseOf(conditions())).toBeUndefined();
  });
  it('is unknown when a layer has cover but no base height', () => {
    expect(approachCloudBaseOf(conditions({ clouds: [cloud('FEW', null)] }))).toBeUndefined();
    expect(approachCloudBaseOf(conditions({ clouds: [cloud('SCT', 3000), cloud('BKN', null)] }))).toBeUndefined();
  });
  it('differs from the ceiling: FEW015 is a base of 1500 but no ceiling', () => {
    const c = conditions({ clouds: [cloud('FEW', 1500)] });
    expect(approachCloudBaseOf(c)).toBe(1500);
    expect(ceilingOf(c)).toBeNull();
  });
});

describe('approachCloudBaseOf on real decoded METARs', () => {
  const pack = packWith(TEST_PACK);
  const nowMs = Date.UTC(2026, 0, 15, 2, 10);
  const decoded = (body: string) => {
    const r = decodeMetar(`METAR ${pack.airport.weatherStation} 150150Z ${body}`, { pack, nowMs });
    if (r.kind !== 'ok') throw new Error('metar not decoded');
    return r.report;
  };
  // NCD is not here: the decoder drops it (no cloud group is produced), so it reads as unknown, the same as for ceilingOf. Listed in the report.
  it.each([
    ['27010KT 9999 FEW015 Q1015', 1500],
    ['27010KT 9999 SCT025 BKN040 Q1015', 2500],
    ['27010KT 0800 FG VV002 Q1015', 200],
    ['27010KT 9999 NSC Q1015', null],
    ['27010KT 9999 SKC Q1015', null],
    ['27010KT 9999 Q1015', undefined],
    ['27010KT CAVOK Q1015', null],
  ])('%s', (body, expected) => {
    expect(approachCloudBaseOf(decoded(body))).toBe(expected);
  });
});

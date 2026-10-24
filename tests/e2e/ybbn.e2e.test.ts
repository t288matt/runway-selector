// End-to-end scenarios on the Brisbane (YBBN) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/YBBN, provisional 24-10-2026):
//   headings: 01L and 01R 016, 19L and 19R 196 (the reference the weather reports use).
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3, crosswind 20 (default),
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty (owner's strict order 1-3): SODPROPS 0, 19AD 2, 01AD 5.
//   Mode runways: SODPROPS (arrivals 19R, departures 01R), 19AD (19L and 19R both ways), 01AD (01L and 01R both ways).
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
// SODPROPS lands one way and departs the other on the same axis, so one end always has a tailwind of |S cos(D - 196)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const YBBN_PACK: PackRef = { name: 'YBBN', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'YBBN') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR YBBN 230300Z ${wind} 9999 FEW020 20/10 Q1015`;
const taf = (wind: string) => `TAF YBBN 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: YBBN_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });
const MODES = ['SODPROPS', '19AD', '01AD'];

describe('YBBN pack loads with the owner\'s three modes in order', () => {
  const r = go(kt(100, 10));
  it('has the four runway ends and the three modes', () => {
    expect(r.pack.airport.icao).toBe('YBBN');
    expect(r.pack.airport.timeZone).toBe('Australia/Brisbane');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['01L:16', '01R:16', '19L:196', '19R:196']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(MODES);
    expect(r.pack.modes.find((m) => m.id === 'SODPROPS')).toMatchObject({ arrivals: ['19R'], departures: ['01R'] });
    expect(r.pack.modes.find((m) => m.id === '19AD')).toMatchObject({ arrivals: ['19L', '19R'], departures: ['19L', '19R'] });
    expect(r.pack.modes.find((m) => m.id === '01AD')).toMatchObject({ arrivals: ['01L', '01R'], departures: ['01L', '01R'] });
  });
});

describe('B01 wind 100/10, nearly across the runways: all three pass and SODPROPS is first', () => {
  // dir-hdg = 100 - 196 = -96 on 19 (tailwind 10 cos 84 = 1.05, xw 9.95) and 100 - 16 = 84 on 01 (headwind 1.05, xw 9.95).
  // SODPROPS: the arrival on 19R has a 1.05 kt tailwind and the departure on 01R a 1.05 kt headwind; under the 2 kt margin line, xw 9.95 <= 17 -> SUITABLE.
  // 19AD and 01AD: SUITABLE. Penalties 0, 2, 5 -> SODPROPS, no change.
  const r = go(kt(100, 10));
  it('statuses and the recommendation', () => {
    for (const id of MODES) expect(cell(r, id, 0).status, id).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('SODPROPS');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('B02 wind 200/10, into 19: SODPROPS and 01AD fail on tailwind, 19AD is recommended', () => {
  // 19 (hdg 196): dir-hdg = 4 -> headwind 9.98, xw 0.70. 01 (hdg 016): dir-hdg = 184 -> tailwind 9.98 > 5.05 -> UNSUITABLE TW.
  // SODPROPS departs on 01R -> UNSUITABLE TW. 19AD SUITABLE. 01AD UNSUITABLE TW. Only 19AD passes.
  const r = go(kt(200, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, 'SODPROPS', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '19AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '01AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('19AD');
  });
});

describe('B03 wind 020/10, into 01: SODPROPS and 19AD fail on tailwind, 01AD is recommended', () => {
  // 01 (hdg 016): dir-hdg = 4 -> headwind 9.98. 19 (hdg 196): dir-hdg = -176 -> tailwind 9.98 > 5.05 -> UNSUITABLE TW.
  // SODPROPS arrives on 19R -> UNSUITABLE TW. 19AD UNSUITABLE TW. 01AD SUITABLE. Only 01AD passes.
  const r = go(kt(20, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, 'SODPROPS', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '19AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '01AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('01AD');
  });
});

describe('B04 wind 140/8: SODPROPS is marginal and the cheaper 19AD wins', () => {
  // 19 (hdg 196): dir-hdg = -56 -> cos = 0.5592 -> headwind 4.47, xw 8 sin 56 = 6.63. 01 (hdg 016): dir-hdg = 124 -> cos = -0.5592 -> tailwind 4.47.
  // SODPROPS: the departure on 01R has a 4.47 kt tailwind (<= 5.05, above the 2 kt margin line) -> MARGINAL: 0 + 3 = 3 a slot.
  // 19AD: headwind 4.47, SUITABLE: penalty 2 -> 2 a slot. 01AD: tailwind 4.47 -> MARGINAL: 5 + 3 = 8. 19AD is cheapest, no change.
  const r = go(kt(140, 8));
  it('statuses and the recommendation', () => {
    expect(cell(r, 'SODPROPS', 0).status).toBe('MARGINAL');
    expect(cell(r, '19AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '01AD', 0).status).toBe('MARGINAL');
    expect(r.out.plan.recommendedModeId).toBe('19AD');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('B05 wind 110/25: a crosswind on both axes leaves no mode', () => {
  // 19 (hdg 196): dir-hdg = -86 -> xw 25 sin 86 = 24.94 > 20.05 -> UNSUITABLE XW. 01 (hdg 016): dir-hdg = 94 -> xw 24.94 -> XW.
  // Every runway fails, so every mode fails and nothing is recommended.
  const r = go(kt(110, 25));
  it('every mode is UNSUITABLE on crosswind and no mode is recommended', () => {
    for (const id of MODES) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(r.out.plan.recommendedModeId).toBeNull();
    expect(r.out.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
  });
});

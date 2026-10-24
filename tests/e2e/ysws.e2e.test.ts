// End-to-end scenarios on the Western Sydney (YSWS) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/YSWS, provisional 24-10-2026):
//   headings: 05 050, 23 230 (one runway).
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3, crosswind 20 (default),
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty (owner's strict order 1-3): 05A23D 0, 23AD 2, 05AD 5.
//   Mode runways: 05A23D (arrivals 05, departures 23: reciprocal runway operations, head to head), 23AD (23 both ways), 05AD (05 both ways).
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
// 05A23D lands one way and departs the other on the same runway, so one end always has a tailwind of |S cos(D - 50)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const YSWS_PACK: PackRef = { name: 'YSWS', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'YSWS') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR YSWS 230300Z ${wind} 9999 FEW020 20/10 Q1015`;
const taf = (wind: string) => `TAF YSWS 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: YSWS_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });
const MODES = ['05A23D', '23AD', '05AD'];

describe('YSWS pack loads with the owner\'s three modes in order', () => {
  const r = go(kt(330, 10));
  it('has the two runway ends and the three modes', () => {
    expect(r.pack.airport.icao).toBe('YSWS');
    expect(r.pack.airport.timeZone).toBe('Australia/Sydney');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['05:50', '23:230']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(MODES);
    expect(r.pack.modes.find((m) => m.id === '05A23D')).toMatchObject({ arrivals: ['05'], departures: ['23'] });
    expect(r.pack.modes.find((m) => m.id === '23AD')).toMatchObject({ arrivals: ['23'], departures: ['23'] });
    expect(r.pack.modes.find((m) => m.id === '05AD')).toMatchObject({ arrivals: ['05'], departures: ['05'] });
  });
});

describe('W01 wind 330/10, nearly across the runway: all three pass and 05A23D is first', () => {
  // 05 (hdg 050): dir-hdg = 280 -> cos = 0.1736 -> headwind 1.74, xw 9.85. 23 (hdg 230): dir-hdg = 100 -> cos = -0.1736 -> tailwind 1.74.
  // 05A23D: arrival on 05 a 1.74 kt headwind, departure on 23 a 1.74 kt tailwind: under the 2 kt margin line, xw 9.85 <= 17 -> SUITABLE.
  // 23AD: a 1.74 kt tailwind -> SUITABLE. 05AD: a headwind -> SUITABLE. Penalties 0, 2, 5 -> 05A23D, no change.
  const r = go(kt(330, 10));
  it('statuses and the recommendation', () => {
    for (const id of MODES) expect(cell(r, id, 0).status, id).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('05A23D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('W02 wind 050/10, into 05: reciprocal operations and 23AD fail on tailwind', () => {
  // 05 (hdg 050): dir-hdg = 0 -> headwind 10. 23 (hdg 230): dir-hdg = -180 -> tailwind 10 > 5.05 -> UNSUITABLE TW.
  // 05A23D departs on 23 -> UNSUITABLE TW. 23AD UNSUITABLE TW. 05AD SUITABLE. Only 05AD passes.
  const r = go(kt(50, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '05A23D', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '23AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '05AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('05AD');
  });
});

describe('W03 wind 230/10, into 23: 05A23D and 05AD fail on tailwind', () => {
  // 23 (hdg 230): dir-hdg = 0 -> headwind 10. 05 (hdg 050): dir-hdg = 180 -> tailwind 10 -> UNSUITABLE TW.
  // 05A23D lands on 05 -> UNSUITABLE TW. 05AD UNSUITABLE TW. 23AD SUITABLE (penalty 2). Only 23AD passes.
  const r = go(kt(230, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '05A23D', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '05AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '23AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('23AD');
  });
});

describe('W04 wind 110/8: 05A23D is marginal and still the cheapest', () => {
  // 05 (hdg 050): dir-hdg = 60 -> cos = 0.5 -> headwind 4.0, xw 8 sin 60 = 6.93. 23 (hdg 230): dir-hdg = -120 -> cos = -0.5 -> tailwind 4.0.
  // 05A23D: the departure on 23 has a 4.0 kt tailwind (<= 5.05, above the 2 kt margin line) -> MARGINAL: 0 + 3 = 3 a slot.
  // 23AD: tailwind 4.0 -> MARGINAL: 2 + 3 = 5. 05AD: headwind 4.0 -> SUITABLE: 5. The cheapest is 05A23D at 3, no change.
  const r = go(kt(110, 8));
  it('statuses and the recommendation', () => {
    expect(cell(r, '05A23D', 0).status).toBe('MARGINAL');
    expect(cell(r, '23AD', 0).status).toBe('MARGINAL');
    expect(cell(r, '05AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('05A23D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('W05 wind 320/25: a crosswind on the one runway leaves no mode', () => {
  // dir-hdg = 270 on 05 and 90 on 23: xw 25 > 20.05 -> UNSUITABLE XW on both ends, so every mode fails and nothing is recommended.
  const r = go(kt(320, 25));
  it('every mode is UNSUITABLE on crosswind and no mode is recommended', () => {
    for (const id of MODES) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(r.out.plan.recommendedModeId).toBeNull();
    expect(r.out.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
  });
});

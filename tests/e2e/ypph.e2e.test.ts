// End-to-end scenarios on the Perth (YPPH) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/YPPH, provisional 24-10-2026):
//   headings: 03 016, 21 196, 06 061, 24 241 (the reference the weather reports use).
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3, crosswind 20 (default),
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty: 24A21AD 0, 03AD06D 2, then the single-runway fallbacks 21AD, 03AD, 24AD, 06AD all 20 (ties by file order).
//   Mode runways: 24A21AD (arrivals 24 and 21, departures 21), 03AD06D (arrivals 03, departures 03 and 06), and one runway each for the fallbacks.
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const YPPH_PACK: PackRef = { name: 'YPPH', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'YPPH') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR YPPH 230300Z ${wind} 9999 FEW020 20/10 Q1015`;
const taf = (wind: string) => `TAF YPPH 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: YPPH_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });

describe('YPPH pack loads with the owner\'s two preferred modes first', () => {
  const r = go(kt(210, 10));
  it('has the four runway ends and the six modes', () => {
    expect(r.pack.airport.icao).toBe('YPPH');
    expect(r.pack.airport.timeZone).toBe('Australia/Perth');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['03:16', '21:196', '06:61', '24:241']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(['24A21AD', '03AD06D', '21AD', '03AD', '24AD', '06AD']);
    expect(r.pack.modes.find((m) => m.id === '24A21AD')).toMatchObject({ arrivals: ['24', '21'], departures: ['21'] });
    expect(r.pack.modes.find((m) => m.id === '03AD06D')).toMatchObject({ arrivals: ['03'], departures: ['03', '06'] });
  });
});

describe('P01 wind 210/10: 21 and 24 are headwinds, 03 and 06 are not', () => {
  // Runway 21 (hdg 196): dir-hdg = 14 -> headwind 9.7, xw 2.4. Runway 24 (hdg 241): dir-hdg = -31 -> headwind 8.57, xw 5.15.
  // Runway 03 (hdg 016): dir-hdg = 194 -> tailwind 9.7 > 5.05 -> UNSUITABLE TW. Runway 06 (hdg 061): dir-hdg = 149 -> tailwind 8.57 > 5.05 -> TW.
  //   24A21AD: SUITABLE (both arrivals and the departure into the wind).   03AD06D: UNSUITABLE TW.   21AD, 24AD SUITABLE.   03AD, 06AD UNSUITABLE.
  // Plan: 24A21AD costs 0 a slot, the lowest, so no change.
  const r = go(kt(210, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '24A21AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '03AD06D', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '21AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '24AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '03AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '06AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('24A21AD');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('P02 wind 030/10: 03 and 06 are headwinds, 21 and 24 are not', () => {
  // Runway 03 (hdg 016): dir-hdg = 14 -> headwind 9.7, xw 2.4. Runway 06 (hdg 061): dir-hdg = -31 -> headwind 8.57, xw 5.15.
  // Runway 21 (hdg 196): dir-hdg = -166 -> tailwind 9.7 > 5.05 -> UNSUITABLE TW. Runway 24 (hdg 241): dir-hdg = -211 -> tailwind 8.57 -> TW.
  //   03AD06D: SUITABLE (penalty 2).   24A21AD: UNSUITABLE TW.   03AD, 06AD SUITABLE (penalty 20).   21AD, 24AD UNSUITABLE.
  // Plan: 03AD06D costs 2 a slot, the lowest of the modes that pass, so no change.
  const r = go(kt(30, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '03AD06D', 0).status).toBe('SUITABLE');
    expect(cell(r, '24A21AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '03AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '06AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '21AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('03AD06D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('P03 wind 120/25: a strong crosswind on both runways', () => {
  // Runway 03 (hdg 016): dir-hdg = 104 -> tailwind 25 cos 76 = 6.05 > 5.05 -> UNSUITABLE TW. Runway 21 (hdg 196): dir-hdg = -76 -> headwind 6.05,
  // xw 25 sin 76 = 24.26 > 20.05 -> UNSUITABLE XW. Runway 06 (hdg 061): dir-hdg = 59 -> headwind 12.9, xw 25 sin 59 = 21.43 > 20.05 -> XW.
  // Runway 24 (hdg 241): dir-hdg = -121 -> tailwind 12.9 -> TW. Every runway fails, so every mode fails and nothing is recommended.
  const r = go(kt(120, 25));
  it('every mode is UNSUITABLE and no mode is recommended', () => {
    for (const id of ['24A21AD', '03AD06D', '21AD', '03AD', '24AD', '06AD']) expect(cell(r, id, 0).status, id).toBe('UNSUITABLE');
    expect(cell(r, '21AD', 0).cause).toBe('XW');
    expect(cell(r, '06AD', 0).cause).toBe('XW');
    expect(r.out.plan.recommendedModeId).toBeNull();
    expect(r.out.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
  });
});

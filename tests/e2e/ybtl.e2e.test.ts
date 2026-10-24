// End-to-end scenarios on the Townsville (YBTL) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/YBTL, provisional 24-10-2026):
//   headings (magnetic): 01 17, 19 197, 07 67, 25 247.
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3, crosswind 20 (default),
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty (owner's order): 0107AD 0, 1925AD 0 (equal first), 01AD 2, 19AD 2 (equal second), 07AD 5, 25AD 5 (equal third).
//   Mode runways: 0107AD and 1925AD use both ends of both runways as arrival and departure; the other four use one end alone.
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const YBTL_PACK: PackRef = { name: 'YBTL', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'YBTL') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR YBTL 230300Z ${wind} 9999 FEW020 26/21 Q1013`;
const taf = (wind: string) => `TAF YBTL 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: YBTL_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });
const MODES = ['0107AD', '1925AD', '01AD', '19AD', '07AD', '25AD'];

describe('YBTL pack loads with the owner\'s six modes in order', () => {
  const r = go(kt(20, 10));
  it('has the four runway ends and the six modes', () => {
    expect(r.pack.airport.icao).toBe('YBTL');
    expect(r.pack.airport.timeZone).toBe('Australia/Brisbane');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['01:17', '19:197', '07:67', '25:247']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(MODES);
    expect(r.pack.modes.find((m) => m.id === '0107AD')).toMatchObject({ arrivals: ['01', '07'], departures: ['01', '07'] });
  });
});

describe('T01 wind 020/10, down the 01/07 side: 0107AD passes and 1925AD fails on both its runways', () => {
  // 01 (17): headwind, xw 0.52 -> SUITABLE. 07 (67): headwind, xw 7.31 -> SUITABLE. 0107AD: both ends SUITABLE -> SUITABLE.
  // 19 (197): tailwind 9.99 -> UNSUITABLE TW. 25 (247): tailwind 6.82 -> UNSUITABLE TW. 1925AD: UNSUITABLE.
  const r = go(kt(20, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '0107AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '1925AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('0107AD');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('T02 wind 200/10, the other way: 1925AD passes and 0107AD fails', () => {
  const r = go(kt(200, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '1925AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '0107AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('1925AD');
  });
});

describe('T03 wind 070/22: 0107AD is marginal on 01 but still cheaper than the suitable lower-priority modes', () => {
  // 01 (17): xw 17.57, within 3 kt of the 20.05 limit -> MARGINAL XW. 07 (67): near headwind, xw 1.15 -> SUITABLE. 0107AD: worst of the two -> MARGINAL: 0 + 3 = 3.
  // 19 (197): tailwind 13.24 -> UNSUITABLE TW. 25 (247): tailwind 21.97 -> UNSUITABLE TW. 1925AD UNSUITABLE.
  // 01AD alone: MARGINAL: 2 + 3 = 5. 07AD alone: SUITABLE: 5. 0107AD at 3 is the cheapest.
  const r = go(kt(70, 22));
  it('statuses and the recommendation', () => {
    expect(cell(r, '0107AD', 0).status).toBe('MARGINAL');
    expect(cell(r, '01AD', 0).status).toBe('MARGINAL');
    expect(cell(r, '07AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('0107AD');
  });
});

describe('T04 wind 107/22: the crosswind maxes out both 01 and 19, and only the crosswind runway (07AD) is left', () => {
  // 01 and 19 (hdg 17/197, one physical runway): crosswind 22 > 20.05 -> UNSUITABLE XW on both ends, so 0107AD, 1925AD, 01AD and 19AD are all UNSUITABLE.
  // 07 (67): near headwind, xw 14.14 -> SUITABLE. 25 (247): tailwind 16.85 -> UNSUITABLE TW. Only 07AD passes.
  const r = go(kt(107, 22));
  it('statuses and the recommendation', () => {
    for (const id of ['0107AD', '1925AD', '01AD', '19AD', '25AD']) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE' });
    expect(cell(r, '07AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('07AD');
  });
});

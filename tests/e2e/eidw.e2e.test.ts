// End-to-end scenarios on the Dublin (EIDW) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/EIDW, provisional 24-10-2026):
//   headings (magnetic): 10 98, 28 278, 16 159, 34 339. 10/28 is modelled as a single runway (no L/R suffix); Dublin's second,
//   parallel 10/28 runway is not in this pack.
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3, crosswind 20 (default).
//   28AD and 10AD have their own 28 kt crosswind limit (owner, 24-10-2026); 16AD and 34AD use the 20 kt default.
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty (owner's order): 28AD 0, 10AD 0 (equal first), 16AD 2, 34AD 2 (equal second).
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const EIDW_PACK: PackRef = { name: 'EIDW', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'EIDW') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR EIDW 230300Z ${wind} 9999 FEW020 12/08 Q1021`;
const taf = (wind: string) => `TAF EIDW 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: EIDW_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });
const MODES = ['28AD', '10AD', '16AD', '34AD'];

describe('EIDW pack loads with the owner\'s four modes in order', () => {
  const r = go(kt(100, 10));
  it('has the four runway ends and the four modes', () => {
    expect(r.pack.airport.icao).toBe('EIDW');
    expect(r.pack.airport.timeZone).toBe('Europe/Dublin');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['10:98', '28:278', '16:159', '34:339']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(MODES);
  });
});

describe('D01 wind 100/10, into 10: 28AD fails on tailwind and 10AD is recommended', () => {
  const r = go(kt(100, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '10AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '28AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('10AD');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('D02 wind 280/10, the other way: 10AD fails on tailwind and 28AD is recommended', () => {
  const r = go(kt(280, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '28AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '10AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('28AD');
  });
});

describe('D03 wind 010/29: the crosswind maxes out 10/28 (28 kt limit) and the plan falls back to 34AD', () => {
  // 10 and 28 (one physical runway, 28 kt limit): crosswind 28.98 > 28.05 -> UNSUITABLE XW on both ends, so 10AD and 28AD are both UNSUITABLE.
  // 16 (20 kt default limit): tailwind 24.86 -> UNSUITABLE TW. 34: near headwind, xw 14.94 -> SUITABLE. Only 34AD passes.
  const r = go(kt(10, 29));
  it('statuses and the recommendation', () => {
    for (const id of ['10AD', '28AD', '16AD']) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE' });
    expect(cell(r, '34AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('34AD');
  });
});

describe('D04 wind 190/29, the other way: the crosswind maxes out 10/28 (28 kt limit) and the plan falls back to 16AD', () => {
  const r = go(kt(190, 29));
  it('statuses and the recommendation', () => {
    for (const id of ['10AD', '28AD', '34AD']) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE' });
    expect(cell(r, '16AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('16AD');
  });
});

// End-to-end scenarios on the Heathrow (EGLL) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/EGLL, provisional 24-10-2026):
//   headings (magnetic): 09 89, 27 269 (modelled as a single runway, no L/R suffix; Heathrow's second parallel runway is not in this pack).
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3.
//   27AD and 09AD both have a 28 kt crosswind limit (owner, 24-10-2026), not the 20 kt pack default.
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty (owner's order, equal): 27AD 0, 09AD 0.
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const EGLL_PACK: PackRef = { name: 'EGLL', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'EGLL') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR EGLL 230300Z ${wind} 9999 FEW020 14/09 Q1019`;
const taf = (wind: string) => `TAF EGLL 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: EGLL_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });
const MODES = ['27AD', '09AD'];

describe('EGLL pack loads with the owner\'s two equal-priority modes', () => {
  const r = go(kt(90, 10));
  it('has the one runway and the two modes', () => {
    expect(r.pack.airport.icao).toBe('EGLL');
    expect(r.pack.airport.timeZone).toBe('Europe/London');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['09:89', '27:269']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(MODES);
  });
});

describe('L01 wind 090/10, into 09: 27AD fails on tailwind', () => {
  const r = go(kt(90, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '09AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '27AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('09AD');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('L02 wind 270/10, into 27: 09AD fails on tailwind', () => {
  const r = go(kt(270, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '27AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '09AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('27AD');
  });
});

describe('L03 wind 000/10, pure crosswind: both modes are SUITABLE and the tie goes to 27AD, first in the pack', () => {
  const r = go(kt(0, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '27AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '09AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('27AD');
  });
});

describe('L04 wind 000/30: a crosswind across the one runway, above the 28 kt limit, leaves no mode', () => {
  const r = go(kt(0, 30));
  it('every mode is UNSUITABLE on crosswind and no mode is recommended', () => {
    for (const id of MODES) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(r.out.plan.recommendedModeId).toBeNull();
    expect(r.out.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
  });
});

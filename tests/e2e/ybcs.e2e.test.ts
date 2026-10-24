// End-to-end scenarios on the Cairns (YBCS) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/YBCS, provisional 24-10-2026):
//   headings (magnetic): 15 150, 33 330 (one runway).
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3, crosswind 20 (default),
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty (owner's order): 15AD 0, 33AD 2.
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const YBCS_PACK: PackRef = { name: 'YBCS', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'YBCS') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR YBCS 230300Z ${wind} 9999 FEW020 27/22 Q1012`;
const taf = (wind: string) => `TAF YBCS 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: YBCS_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });
const MODES = ['15AD', '33AD'];

describe('YBCS pack loads with the owner\'s two modes in order', () => {
  const r = go(kt(150, 10));
  it('has the one runway and the two modes', () => {
    expect(r.pack.airport.icao).toBe('YBCS');
    expect(r.pack.airport.timeZone).toBe('Australia/Brisbane');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['15:150', '33:330']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(MODES);
  });
});

describe('B01 wind 150/10, into 15: 33AD fails on tailwind', () => {
  const r = go(kt(150, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '15AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '33AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('15AD');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('B02 wind 330/10, into 33: 15AD fails on tailwind and the lower-priority mode is recommended', () => {
  const r = go(kt(330, 10));
  it('statuses and the recommendation', () => {
    expect(cell(r, '15AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '33AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('33AD');
  });
});

describe('B03 wind 330/04: 15AD is marginal (tailwind 4) and 33AD, cheaper once the marginal penalty counts, is recommended', () => {
  // 15: tailwind 4.0, within 3 kt of the 5.05 limit -> MARGINAL: 0 + 3 = 3 a slot. 33: headwind -> SUITABLE: 2. 33AD is cheaper despite its higher preference penalty.
  const r = go(kt(330, 4));
  it('statuses and the recommendation', () => {
    expect(cell(r, '15AD', 0).status).toBe('MARGINAL');
    expect(cell(r, '33AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('33AD');
  });
});

describe('B04 wind 060/25: a crosswind across the one runway leaves no mode', () => {
  const r = go(kt(60, 25));
  it('every mode is UNSUITABLE on crosswind and no mode is recommended', () => {
    for (const id of MODES) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(r.out.plan.recommendedModeId).toBeNull();
    expect(r.out.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
  });
});

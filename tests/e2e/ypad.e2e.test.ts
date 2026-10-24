// End-to-end scenarios on the Adelaide (YPAD) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/YPAD, provisional 24-10-2026):
//   headings: 05 042, 23 222, 12 115, 30 295 (magnetic, the reference the weather reports use).
//   Limits carried over from the Sydney and Melbourne packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3,
//   crosswind 20 (default, no mode sets its own), marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5.
//   Preference penalty (owner's strict order 1-6): 2312A23D 0, 0512A05D 2, 23AD 5, 05AD 12, 12AD 20, 30AD 30. No capacities.
//   Mode runways: 2312A23D (arrivals 23 and 12, departures 23), 0512A05D (arrivals 05 and 12, departures 05), 23AD, 05AD, 12AD, 30AD.
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, chosen, kt, run } from './pipeline';

const YPAD_PACK: PackRef = { name: 'YPAD', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'YPAD') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR YPAD 230300Z ${wind} 9999 FEW020 20/10 Q1015`;
const taf = (wind: string) => `TAF YPAD 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: YPAD_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });

describe('YPAD pack loads with its six modes in the owner\'s order', () => {
  const r = go(kt(230, 10));
  it('has the four runway ends and the six modes', () => {
    expect(r.pack.airport.icao).toBe('YPAD');
    expect(r.pack.airport.timeZone).toBe('Australia/Adelaide');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['05:42', '23:222', '12:115', '30:295']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(['2312A23D', '0512A05D', '23AD', '05AD', '12AD', '30AD']);
    expect(r.pack.modes.every((m) => m.enabled)).toBe(true);
    expect(r.pack.modes.find((m) => m.id === '2312A23D')).toMatchObject({ arrivals: ['23', '12'], departures: ['23'] });
    expect(r.pack.modes.find((m) => m.id === '0512A05D')).toMatchObject({ arrivals: ['05', '12'], departures: ['05'] });
  });
});

describe('Y01 wind 230/10: 23 is a headwind, 12 a light tailwind, 05 a strong tailwind', () => {
  // Runway 23 (hdg 222): dir-hdg = 8 -> headwind 9.9, xw 1.4. Runway 12 (hdg 115): dir-hdg = 115 -> cos = -0.4226 -> tailwind 4.23
  // (<= 5.05, above the 2 kt margin line -> MARGINAL), xw 9.06. Runway 05 (hdg 042): dir-hdg = 188 -> tailwind 9.9 > 5.05 -> UNSUITABLE TW.
  // Runway 30 (hdg 295): dir-hdg = -65 -> headwind 4.23, xw 9.06.
  //   2312A23D: arrivals on 23 (fine) and 12 (tailwind 4.23): MARGINAL.        0512A05D: arrival on 05 -> UNSUITABLE TW.
  //   23AD: SUITABLE.   05AD: UNSUITABLE TW.   12AD: MARGINAL (4.23).   30AD: SUITABLE.
  // Plan (8 slots, no traffic so a change costs 5): 2312A23D costs 0 + 3 (marginal) = 3 a slot; 23AD 5; 30AD 30. So 2312A23D throughout, no change.
  const r = go(kt(230, 10));
  it('statuses', () => {
    expect(cell(r, '2312A23D', 0).status).toBe('MARGINAL');
    expect(cell(r, '0512A05D', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '23AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '05AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '12AD', 0).status).toBe('MARGINAL');
    expect(cell(r, '30AD', 0).status).toBe('SUITABLE');
  });
  it('recommends the owner\'s first mode, marginal on runway 12, with no change', () => {
    expect(r.out.plan.recommendedModeId).toBe('2312A23D');
    expect(new Set(chosen(r))).toEqual(new Set(['2312A23D']));
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('Y02 wind 050/10: 05 is a headwind, 12 a light headwind, 23 a strong tailwind', () => {
  // Runway 05 (hdg 042): dir-hdg = 8 -> headwind 9.9. Runway 12 (hdg 115): dir-hdg = -65 -> headwind 4.23, xw 9.06. Runway 23 (hdg 222):
  // dir-hdg = -172 -> tailwind 9.9 > 5.05 -> UNSUITABLE. Runway 30 (hdg 295): dir-hdg = -245 -> tailwind 4.23 -> MARGINAL.
  //   0512A05D: SUITABLE (05 and 12 headwinds, departures on 05).   2312A23D: UNSUITABLE TW (arrival on 23).   05AD SUITABLE.   12AD SUITABLE.
  //   23AD UNSUITABLE.   30AD MARGINAL.
  // Plan: 0512A05D costs 2 a slot, the cheapest suitable mode, no change.
  const r = go(kt(50, 10));
  it('statuses', () => {
    expect(cell(r, '0512A05D', 0).status).toBe('SUITABLE');
    expect(cell(r, '2312A23D', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '05AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '12AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '23AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '30AD', 0).status).toBe('MARGINAL');
  });
  it('recommends 0512A05D with no change', () => {
    expect(r.out.plan.recommendedModeId).toBe('0512A05D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('Y03 crosswind on the crossing runways', () => {
  // Wind 320/25: runway 30 (hdg 295): dir-hdg = 25 -> headwind 22.7, xw 10.6 -> SUITABLE. Runway 12 (hdg 115): dir-hdg = 205 -> tailwind 22.7 -> fails.
  // Runway 05 (hdg 042): dir-hdg = 278 -> headwind 3.5, xw 24.8 > 20.05 -> UNSUITABLE XW. Runway 23 (hdg 222): dir-hdg = 98 -> tailwind 3.5 (above 2 -> margin), xw 24.8 -> UNSUITABLE XW.
  // Only 30AD passes: recommended.
  const r = go(kt(320, 25));
  it('only 30AD passes and is recommended', () => {
    expect(cell(r, '30AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '12AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '05AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, '23AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(r.out.plan.recommendedModeId).toBe('30AD');
  });
});

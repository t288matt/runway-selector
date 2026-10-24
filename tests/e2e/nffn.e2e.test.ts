// End-to-end scenarios on the Nadi (NFFN) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/NFFN, provisional 24-10-2026):
//   headings (magnetic): 02 25, 20 205, 09 92, 27 272.
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3, crosswind 20 (default),
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty (owner's order): 02A20D 0, 02A2027D 0, 0209A20D 0 (equal first), 02AD 2, 20AD 5.
//   Mode runways: 02A20D (arrivals 02, departures 20), 02A2027D (arrivals 02, departures 20 and 27), 0209A20D (arrivals 02 and 09, departures 20),
//   02AD, 20AD (one runway both ways). A mode is SUITABLE only if every runway end it uses is; the worst end decides its status.
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const NFFN_PACK: PackRef = { name: 'NFFN', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'NFFN') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR NFFN 230300Z ${wind} 9999 FEW020 28/22 Q1010`;
const taf = (wind: string) => `TAF NFFN 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: NFFN_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });
const MODES = ['02A20D', '02A2027D', '0209A20D', '02AD', '20AD'];

describe('NFFN pack loads with the owner\'s five modes in order', () => {
  const r = go(kt(110, 8));
  it('has the four runway ends and the five modes', () => {
    expect(r.pack.airport.icao).toBe('NFFN');
    expect(r.pack.airport.timeZone).toBe('Pacific/Fiji');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['02:25', '20:205', '09:92', '27:272']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(MODES);
    expect(r.pack.modes.find((m) => m.id === '02A2027D')).toMatchObject({ arrivals: ['02'], departures: ['20', '27'] });
    expect(r.pack.modes.find((m) => m.id === '0209A20D')).toMatchObject({ arrivals: ['02', '09'], departures: ['20'] });
  });
});

describe('N01 wind 020/10, down 02/20: the tier-1 modes all fail on the 20 departure and 02AD is recommended', () => {
  // 02 (hdg 25): headwind 9.96 -> SUITABLE. 20 (hdg 205): tailwind 9.96 > 5.05 -> UNSUITABLE TW. 09 (92): headwind, xw 9.51 -> SUITABLE. 27 (272): tailwind 3.09, marginal (> 2.05).
  // 02A20D, 02A2027D and 0209A20D all depart on 20 -> UNSUITABLE TW. 02AD (arrivals and departures 02) is SUITABLE. 20AD is UNSUITABLE TW (tailwind on arrival and departure).
  const r = go(kt(20, 10));
  it('statuses and the recommendation', () => {
    for (const id of ['02A20D', '02A2027D', '0209A20D', '20AD']) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '02AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('02AD');
  });
});

describe('N02 wind 200/10, down 20/02 the other way: everything using 02 fails and 20AD is the only mode left', () => {
  // 02 (hdg 25): tailwind 9.96 -> UNSUITABLE TW. 20 (hdg 205): headwind 9.96 -> SUITABLE. 09 (92): tailwind 3.09, marginal. 27 (272): headwind, xw 9.51 -> SUITABLE.
  // 02A20D, 02A2027D, 0209A20D and 02AD all use 02 as an arrival -> UNSUITABLE TW. 20AD (arrivals and departures 20) is SUITABLE, the lowest-priority mode but the only one that works.
  const r = go(kt(200, 10));
  it('statuses and the recommendation', () => {
    for (const id of ['02A20D', '02A2027D', '0209A20D', '02AD']) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '20AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('20AD');
  });
});

describe('N03 wind 110/08, crosswind-dominant: reciprocal operations on 02/20 pass, 02A2027D fails on 27 and 02A20D wins the tie', () => {
  // 02 (25): xw 7.97, no tailwind -> SUITABLE. 20 (205): tailwind 0.70 (under the 2.05 margin line) -> SUITABLE. 09 (92): xw 2.47, no tailwind -> SUITABLE.
  // 27 (272): tailwind 7.61 > 5.05 -> UNSUITABLE TW. 02A2027D departs on 27 too -> UNSUITABLE TW. 02A20D and 0209A20D are SUITABLE, both penalty 0:
  // the tie goes to 02A20D, first in the pack.
  const r = go(kt(110, 8));
  it('statuses and the recommendation', () => {
    expect(cell(r, '02A20D', 0).status).toBe('SUITABLE');
    expect(cell(r, '0209A20D', 0).status).toBe('SUITABLE');
    expect(cell(r, '02A2027D', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('02A20D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

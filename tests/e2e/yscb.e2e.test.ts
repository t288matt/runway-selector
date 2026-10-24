// End-to-end scenarios on the Canberra (YSCB) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/YSCB, verified by the owner 24-10-2026):
//   headings (magnetic): 17 168, 35 348, 12 117, 30 297.
//   Limits carried over from the other packs: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3, crosswind 20 (default),
//   marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5. No capacities.
//   Preference penalty (owner's strict order 1-7): 3530A35D 0, 1712A17D 2, 17A35D 4, 35AD 6, 17AD 8, 30AD 10, 12AD 12.
//   Mode runways: 3530A35D (arrivals 35 and 30, departures 35), 1712A17D (arrivals 17 and 12, departures 17), 17A35D (arrivals 17, departures 35),
//   35AD, 17AD, 30AD, 12AD (one runway both ways).
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, kt, run } from './pipeline';

const YSCB_PACK: PackRef = { name: 'YSCB', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'YSCB') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR YSCB 230300Z ${wind} 9999 FEW020 20/10 Q1015`;
const taf = (wind: string) => `TAF YSCB 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: YSCB_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });
const MODES = ['3530A35D', '1712A17D', '17A35D', '35AD', '17AD', '30AD', '12AD'];

describe('YSCB pack loads with the owner\'s seven modes in order', () => {
  const r = go(kt(350, 10));
  it('has the four runway ends and the seven modes', () => {
    expect(r.pack.airport.icao).toBe('YSCB');
    expect(r.pack.airport.timeZone).toBe('Australia/Sydney');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['17:168', '35:348', '12:117', '30:297']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(MODES);
    expect(r.pack.modes.find((m) => m.id === '3530A35D')).toMatchObject({ arrivals: ['35', '30'], departures: ['35'] });
    expect(r.pack.modes.find((m) => m.id === '1712A17D')).toMatchObject({ arrivals: ['17', '12'], departures: ['17'] });
    expect(r.pack.modes.find((m) => m.id === '17A35D')).toMatchObject({ arrivals: ['17'], departures: ['35'] });
  });
});

describe('C01 wind 350/10, into 35: the southern runways fail and 3530A35D is first', () => {
  // 35 (hdg 348): dir-hdg = 2 -> headwind 9.99, xw 0.35. 17 (168): tailwind 9.99 -> UNSUITABLE TW.
  // 30 (297): dir-hdg = 53 -> cos 0.602 -> headwind 6.02, xw 7.99. 12 (117): dir-hdg = 233 -> tailwind 6.02 > 5.05 -> UNSUITABLE TW.
  // 3530A35D: arrivals on 35 and 30, departure on 35, all headwinds, xw <= 8 -> SUITABLE. Anything using 17 or 12 fails. 35AD and 30AD SUITABLE.
  const r = go(kt(350, 10));
  it('statuses and the recommendation', () => {
    for (const id of ['3530A35D', '35AD', '30AD']) expect(cell(r, id, 0).status, id).toBe('SUITABLE');
    for (const id of ['1712A17D', '17A35D', '17AD', '12AD']) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('3530A35D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('C02 wind 170/10, into 17: 1712A17D is first and the 35 and 30 modes fail', () => {
  // 17 (hdg 168): dir-hdg = 2 -> headwind 9.99. 35 (348): tailwind 9.99 -> UNSUITABLE TW.
  // 12 (117): dir-hdg = 53 -> headwind 6.02, xw 7.99. 30 (297): dir-hdg = -127 -> cos -0.602 -> tailwind 6.02 -> UNSUITABLE TW.
  // 1712A17D: arrivals 17 and 12, departure 17, all headwinds -> SUITABLE. 17A35D departs on 35 -> UNSUITABLE. 17AD and 12AD SUITABLE.
  const r = go(kt(170, 10));
  it('statuses and the recommendation', () => {
    for (const id of ['1712A17D', '17AD', '12AD']) expect(cell(r, id, 0).status, id).toBe('SUITABLE');
    for (const id of ['3530A35D', '17A35D', '35AD', '30AD']) expect(cell(r, id, 0), id).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBe('1712A17D');
  });
});

describe('C03 wind 170/04: the 35 modes are marginal and 1712A17D stays cheapest', () => {
  // 35 (hdg 348): dir-hdg = -178 -> cos -0.9994 -> tailwind 4.0 (above calm 3, within 3 of 5.05) -> MARGINAL. 17: headwind 4.0.
  // 30 (297): dir-hdg = -127 -> tailwind 2.4, above the 2.05 margin line (limit 5.05 less 3) -> MARGINAL.
  // 3530A35D: 0 + 3 = 3 a slot. 1712A17D: all headwinds -> SUITABLE: 2. 35AD: MARGINAL 6 + 3 = 9. 17AD: SUITABLE 8.
  const r = go(kt(170, 4));
  it('statuses and the recommendation', () => {
    expect(cell(r, '3530A35D', 0).status).toBe('MARGINAL');
    expect(cell(r, '35AD', 0).status).toBe('MARGINAL');
    expect(cell(r, '1712A17D', 0).status).toBe('SUITABLE');
    expect(cell(r, '17AD', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('1712A17D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

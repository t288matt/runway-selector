// End-to-end scenarios on the Darwin (YPDN) pack, expectations worked by hand from the pack files BEFORE the engine was run.
//
// Pack numbers (refdata/airports/YPDN, provisional 24-10-2026):
//   headings: 11 106, 29 286, 18 177, 36 357 (magnetic, the reference the weather reports use). Time zone Australia/Darwin.
//   Limits carried over from the Adelaide pack: tailwind dry 5 / wet 0, tolerance 0.05, calm 3, near-limit margin 3,
//   crosswind 20 (default, no mode sets its own), marginal penalty 3, change penalties light 1 / medium 5 / busy 25 / unknown 5.
//   Preference penalty (owner's strict order 1-5, placeholders): 29AD36A-LAHSO 0, 29AD36A 2, 29AD18A 5, 11AD36A 12, 11AD18A 20. No capacities.
//   29AD36A-LAHSO has the same runways as 29AD36A and minima: ceiling 3000 ft or higher, visibility 8000 m or more, dry surface. No other mode has minima.
//   Mode runways: 29AD36A (arrivals 29 and 36, departures 29), 29AD18A (29 and 18, dep 29), 11AD36A (11 and 36, dep 11), 11AD18A (11 and 18, dep 11).
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { cell, chosen, kt, run, statuses } from './pipeline';

const YPDN_PACK: PackRef = { name: 'YPDN', dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', 'YPDN') };
const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string) => `METAR YPDN 230300Z ${wind} 9999 FEW020 31/24 Q1010`;
const taf = (wind: string) => `TAF YPDN 230200Z 2303/2403 ${wind} 9999 SCT020`;
const go = (wind: string) => run({ ref: YPDN_PACK, nowIso: NOW, windowMinutes: 240, metar: metar(wind), taf: taf(wind) });

describe('YPDN pack loads with its five modes in the owner\'s order', () => {
  const r = go(kt(290, 10));
  it('has the four runway ends and the five modes', () => {
    expect(r.pack.airport.icao).toBe('YPDN');
    expect(r.pack.airport.timeZone).toBe('Australia/Darwin');
    expect(r.pack.runways.map((x) => `${x.name}:${x.headingDegrees}`)).toEqual(['11:106', '29:286', '18:177', '36:357']);
    expect(r.pack.modes.map((m) => m.id)).toEqual(['29AD36A-LAHSO', '29AD36A', '29AD18A', '11AD36A', '11AD18A']);
    expect(r.pack.modes.every((m) => m.enabled)).toBe(true);
    expect(r.pack.modes.find((m) => m.id === '29AD36A-LAHSO')).toMatchObject({ arrivals: ['29', '36'], departures: ['29'], minima: { ceilingFt: 3000, visibilityMetres: 8000, requiresDrySurface: true } });
    expect(r.pack.modes.filter((m) => m.minima !== null).map((m) => m.id)).toEqual(['29AD36A-LAHSO']);
    expect(r.pack.modes.find((m) => m.id === '29AD36A')).toMatchObject({ arrivals: ['29', '36'], departures: ['29'] });
    expect(r.pack.modes.find((m) => m.id === '29AD18A')).toMatchObject({ arrivals: ['29', '18'], departures: ['29'] });
    expect(r.pack.modes.find((m) => m.id === '11AD36A')).toMatchObject({ arrivals: ['11', '36'], departures: ['11'] });
    expect(r.pack.modes.find((m) => m.id === '11AD18A')).toMatchObject({ arrivals: ['11', '18'], departures: ['11'] });
  });
});

describe('D01 wind 290/10: 29 is a headwind, 36 a light headwind, 18 a light tailwind, 11 a strong tailwind', () => {
  // Runway 29 (hdg 286): dir-hdg = 4 -> headwind 9.98, xw 0.7. Runway 36 (hdg 357): dir-hdg = -67 -> headwind 3.91, xw 9.2.
  // Runway 18 (hdg 177): dir-hdg = 113 -> tailwind 3.91 (<= 5.05, above the 2 kt margin line -> MARGINAL), xw 9.2.
  // Runway 11 (hdg 106): dir-hdg = 184 -> tailwind 9.98 > 5.05 -> UNSUITABLE TW.
  //   29AD36A: SUITABLE.   29AD18A: MARGINAL (18).   11AD36A, 11AD18A: UNSUITABLE TW.
  //   29AD36A-LAHSO: SUITABLE too (same runways; FEW020 and SCT020 are not a ceiling, visibility 9999 is 10 km, no rain).
  // Plan: 29AD36A-LAHSO costs 0 a slot, the cheapest (29AD36A costs 2), no change.
  const r = go(kt(290, 10));
  it('statuses', () => {
    expect(cell(r, '29AD36A-LAHSO', 0).status).toBe('SUITABLE');
    expect(cell(r, '29AD36A', 0).status).toBe('SUITABLE');
    expect(cell(r, '29AD18A', 0).status).toBe('MARGINAL');
    expect(cell(r, '11AD36A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '11AD18A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
  it('recommends the owner\'s first mode, the LAHSO one, with no change', () => {
    expect(r.out.plan.recommendedModeId).toBe('29AD36A-LAHSO');
    expect(new Set(chosen(r))).toEqual(new Set(['29AD36A-LAHSO']));
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('D02 wind 110/10: 11 is a headwind, 18 a light headwind, 36 a light tailwind, 29 a strong tailwind', () => {
  // Runway 11 (hdg 106): dir-hdg = 4 -> headwind 9.98. Runway 18 (hdg 177): dir-hdg = -67 -> headwind 3.91.
  // Runway 36 (hdg 357): dir-hdg = -247 -> cos = -0.3907 -> tailwind 3.91 -> MARGINAL. Runway 29 (hdg 286): dir-hdg = -176 -> tailwind 9.98 -> UNSUITABLE TW.
  //   29AD36A, 29AD18A: UNSUITABLE TW.   11AD36A: MARGINAL (36).   11AD18A: SUITABLE.
  //   29AD36A-LAHSO: UNSUITABLE TW (29 tailwind).
  // Plan: 11AD36A costs 12 + 3 (marginal) = 15 a slot; 11AD18A costs 20. So 11AD36A throughout, no change.
  const r = go(kt(110, 10));
  it('statuses', () => {
    expect(cell(r, '29AD36A-LAHSO', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '29AD36A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '29AD18A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '11AD36A', 0).status).toBe('MARGINAL');
    expect(cell(r, '11AD18A', 0).status).toBe('SUITABLE');
  });
  it('recommends 11AD36A with no change', () => {
    expect(r.out.plan.recommendedModeId).toBe('11AD36A');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('D03 wind 230/25: strong crosswind on 29 and a tailwind on 36 and 11', () => {
  // Runway 29 (hdg 286): dir-hdg = -56 -> headwind 13.98, xw 25 sin56 = 20.73 > 20.05 -> UNSUITABLE XW.
  // Runway 18 (hdg 177): dir-hdg = 53 -> headwind 15.05, xw 19.97 (passes, within 3 of the limit). Runway 36 (hdg 357): dir-hdg = -127 -> tailwind 15.05 -> TW.
  // Runway 11 (hdg 106): dir-hdg = 124 -> tailwind 13.98 -> TW.
  //   29AD18A: UNSUITABLE XW (29).   11AD18A: UNSUITABLE TW (11).   11AD36A: UNSUITABLE TW.   29AD36A: UNSUITABLE (both 29 and 36).
  const r = go(kt(230, 25));
  it('every mode fails, 29 on crosswind and 11 on tailwind', () => {
    expect(cell(r, '29AD36A-LAHSO', 0).status).toBe('UNSUITABLE');
    expect(cell(r, '29AD36A', 0).status).toBe('UNSUITABLE');
    expect(cell(r, '29AD18A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, '11AD36A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '11AD18A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
});

describe('D04 wind 180/12: the first-priority mode is unsuitable, so the plan moves to the second', () => {
  // Runway 18 (hdg 177): dir-hdg = 3 -> headwind 11.98. Runway 36 (hdg 357): dir-hdg = -177 -> tailwind 11.98 > 5.05 -> UNSUITABLE TW.
  // Runway 29 (hdg 286): dir-hdg = -106 -> tailwind 3.31 (above the 2 kt margin line -> MARGINAL), xw 11.5.
  // Runway 11 (hdg 106): dir-hdg = 74 -> headwind 3.31, xw 11.5.
  //   29AD36A: UNSUITABLE TW (36).   29AD18A: MARGINAL (29).   11AD36A: UNSUITABLE TW (36).   11AD18A: SUITABLE.
  //   29AD36A-LAHSO: UNSUITABLE TW (36).
  // Plan: 29AD18A costs 5 + 3 = 8 a slot; 11AD18A costs 20. So 29AD18A throughout, no change.
  const r = go(kt(180, 12));
  it('statuses', () => {
    expect(cell(r, '29AD36A-LAHSO', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '29AD36A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '29AD18A', 0).status).toBe('MARGINAL');
    expect(cell(r, '11AD36A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '11AD18A', 0).status).toBe('SUITABLE');
  });
  it('recommends the second mode, 29AD18A, with no change', () => {
    expect(r.out.plan.recommendedModeId).toBe('29AD18A');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('D05 to D10: the LAHSO minima (ceiling 3000 ft, visibility 8000 m, dry) on wind 290/10', () => {
  // Wind 290/10 as D01: 29AD36A SUITABLE, 29AD18A MARGINAL (18 tailwind 3.91), 11AD36A and 11AD18A UNSUITABLE TW. Dry unless rain is written.
  // Costs a slot with the wind alone: 29AD36A-LAHSO 0, 29AD36A 2, 29AD18A 5 + 3 = 8, the 11 modes cannot be chosen.
  // Wet (D08): tailwind limit 0, so 18 (tailwind 3.91) is UNSUITABLE as well; 29 and 36 are headwinds, so 29AD36A stays SUITABLE.
  const wx = (vis: string, cloud: string, rain = '') => {
    const w = kt(290, 10);
    const body = [vis, rain, cloud].filter((x) => x !== '').join(' ');
    return run({
      ref: YPDN_PACK, nowIso: NOW, windowMinutes: 240,
      metar: `METAR YPDN 230300Z ${w} ${body} 31/24 Q1010`,
      taf: `TAF YPDN 230200Z 2303/2403 ${w} ${body}`,
    });
  };
  const OTHERS = [['29AD36A', 'SUITABLE'], ['29AD18A', 'MARGINAL'], ['11AD36A', 'UNSUITABLE'], ['11AD18A', 'UNSUITABLE']] as const;

  const good = wx('9999', 'BKN040');
  it('D05 good weather (ceiling 4000 ft, visibility 9999, dry) recommends 29AD36A-LAHSO in every slot', () => {
    expect(cell(good, '29AD36A-LAHSO', 0).status).toBe('SUITABLE');
    expect(good.out.plan.recommendedModeId).toBe('29AD36A-LAHSO');
    expect(new Set(chosen(good))).toEqual(new Set(['29AD36A-LAHSO']));
    expect(good.out.plan.changes).toHaveLength(0);
  });

  const low = wx('9999', 'BKN025');
  it('D06 ceiling BKN025 (2500 ft) makes 29AD36A-LAHSO UNSUITABLE (MIN) and the plan uses 29AD36A', () => {
    expect(cell(low, '29AD36A-LAHSO', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'MIN' });
    expect(low.out.plan.recommendedModeId).toBe('29AD36A');
    expect(new Set(chosen(low))).toEqual(new Set(['29AD36A']));
    expect(low.out.plan.changes).toHaveLength(0);
  });

  it('D07 visibility 7000 m the same', () => {
    const r = wx('7000', 'BKN040');
    expect(cell(r, '29AD36A-LAHSO', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'MIN' });
    expect(r.out.plan.recommendedModeId).toBe('29AD36A');
    expect(new Set(chosen(r))).toEqual(new Set(['29AD36A']));
  });

  it('D08 rain in the METAR and TAF (runway WET) makes it UNSUITABLE (MIN); 29AD36A is recommended', () => {
    const r = wx('9999', 'BKN040', '-RA');
    expect(cell(r, '29AD36A-LAHSO', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'MIN' });
    expect(cell(r, '29AD36A', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('29AD36A');
  });

  it('D09 exactly BKN030 and 8000 m is allowed; CAVOK is allowed; one step below either limit is not', () => {
    expect(cell(wx('8000', 'BKN030'), '29AD36A-LAHSO', 0).status).toBe('SUITABLE');
    expect(wx('8000', 'BKN030').out.plan.recommendedModeId).toBe('29AD36A-LAHSO');
    expect(cell(wx('CAVOK', ''), '29AD36A-LAHSO', 0).status).toBe('SUITABLE');
    expect(cell(wx('8000', 'BKN029'), '29AD36A-LAHSO', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'MIN' });
    expect(cell(wx('7900', 'BKN030'), '29AD36A-LAHSO', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'MIN' });
  });

  it('D10 the other four modes are not affected by the low ceiling or the low visibility', () => {
    for (const r of [low, wx('7000', 'BKN040'), good]) {
      for (const [id, status] of OTHERS) {
        expect(cell(r, id, 0).status).toBe(status);
        expect(statuses(r, id)).toEqual(statuses(good, id));
      }
    }
  });
});

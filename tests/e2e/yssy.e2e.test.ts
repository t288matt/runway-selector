// YR-12 part 1: end-to-end scenarios on the YSSY pack. Every expectation was worked by hand from
// docs/REQUIREMENTS.md and the numbers in refdata/airports/YSSY BEFORE the engine source was read.
//
// Pack numbers used throughout (YSSY):
//   headings: 16L/16R 160, 34L/34R 340, 07 070, 25 250.
//   tailwind dry 5, wet 0, tolerance 0.05 (pass if component <= limit + 0.05), calm 3, near-limit margin 3,
//   crosswind limit 20 for every mode, so MARGINAL when 17 < xw <= 20.05, UNSUITABLE above 20.05.
//   wet-probability 40, drying 60 min, METAR window 60 min, marginal penalty 3.
//   day band 06:00-23:00 local: Mode 1 not allowed (cause PLAN), every other mode penalty 5 (default).
//   night band 23:00-06:00 local: Mode 1 penalty 0, every other mode penalty 20.
//   change penalty light 1 / medium 5 / busy 25, unknown-demand change 5. Traffic bands (arrivals per slot):
//   light 0-5, medium 6-11, busy 12+.
//   Mode runways: 1 (arr 34L, dep 16R), 5 (25, 16R, 16L), 7 and 8 (34L, 34R, 25), 9 (34L, 34R), 10 (16L, 16R),
//   12 (07), 13 (25), 14A (07, 16R, 16L). Mode order in modes.json: 1, 5, 7, 8, 9, 10, 12, 13, 14A.
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
// Clock: 23-10-2026 03:10Z is 14:10 AEDT (UTC+11), inside the day band, which runs to 12:00Z.
//
// A test marked it.fails documents a DISAGREEMENT between the hand-worked expectation and the tool
// (see the QA report). The assertion is the hand-worked one; the test goes red when the tool is fixed.
import { describe, expect, it } from 'vitest';
import { EARLY_CHANGE_TITLE, NO_SUITABLE_TITLE } from '../../src/engine';
import { YSSY_PACK } from '../helpers/packs';
import { at, cell, chosen, hhmm, kt, run, statuses, type RunOptions } from './pipeline';

const NOW = '2026-10-23T03:10:00Z';
const ENABLED = ['1', '5', '7', '8', '9', '10', '12', '13', '14A'];

function metar(wind: string, wx = '', obs = '230300Z'): string {
  return ['METAR YSSY', obs, wind, '9999', wx, 'FEW020 20/10 Q1015'].filter((x) => x !== '').join(' ');
}
function taf(body: string, issue = '230200Z', valid = '2303/2403'): string {
  return `TAF YSSY ${issue} ${valid} ${body}`;
}
function go(o: Partial<RunOptions> & { metar?: string | null; taf?: string | null }) {
  return run({ ref: YSSY_PACK, nowIso: NOW, windowMinutes: 240, ...o });
}

// ---------------------------------------------------------------------------------------------
describe('E01 strong crosswind closes one mode and not another (WC-8, WC-2)', () => {
  // Wind 070/25. Mode 12 (07, hdg 070): headwind 25, xw 0 -> SUITABLE.
  // Mode 10 (hdg 160): dir-hdg = -90 -> xw 25 > 20.05 -> UNSUITABLE XW.   Mode 9 (hdg 340): -270 -> xw 25 -> XW.
  // Mode 14A (07, 16R, 16L): 16R xw 25 -> XW.   Modes 13, 5, 7, 8 use 25 (hdg 250): dir-hdg = -180 -> tailwind 25 > 5.05 -> TW first.
  // Mode 1 is not allowed by day -> PLAN. Only Mode 12 is SUITABLE, so it is recommended with no change.
  const r = go({ metar: metar(kt(70, 25)), taf: taf(kt(70, 25) + ' 9999 SCT020') });
  it('only mode 12 passes, with the right cause on each other mode', () => {
    expect(statuses(r, '12').every((s) => s === 'SUITABLE')).toBe(true);
    expect(cell(r, '10', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, '9', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, '14A', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    for (const id of ['5', '7', '8', '13']) expect(cell(r, id, 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '1', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'PLAN' });
  });
  it('recommends mode 12 for every slot', () => {
    expect(r.out.plan.recommendedModeId).toBe('12');
    expect(new Set(chosen(r))).toEqual(new Set(['12']));
    expect(r.out.plan.changes).toHaveLength(0);
  });
  // Mode 10 crosswind sweep with wind from 070 (pure crosswind, the limit is 20 and the margin 3).
  it.each([
    [15, 'SUITABLE'], // 15 <= 17
    [18, 'MARGINAL'], // 17 < 18 <= 20.05
    [20, 'MARGINAL'], // exactly on the limit passes
    [21, 'UNSUITABLE'], // 21 > 20.05
  ])('mode 10 at 070/%i kt is %s', (speed, want) => {
    const rr = go({ metar: metar(kt(70, speed)), taf: taf(kt(70, speed) + ' 9999 SCT020') });
    expect(cell(rr, '10', 0).status).toBe(want);
  });
  // Non-integer crosswind: 076/20 -> dir-hdg = -84 deg -> xw = 20 sin 84 = 19.89 (passes, margin) ; 087/21 -> -73 deg -> 21 sin 73 = 20.08 > 20.05 fails.
  it('19.89 kt crosswind passes (MARGINAL) and 20.08 kt fails', () => {
    const a = go({ metar: metar(kt(76, 20)), taf: taf(kt(76, 20) + ' 9999 SCT020') });
    expect(cell(a, '10', 0).status).toBe('MARGINAL');
    const b = go({ metar: metar(kt(87, 21)), taf: taf(kt(87, 21) + ' 9999 SCT020') });
    expect(cell(b, '10', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('E02 dry tailwind 4.9 / 5.1 kt at one runway (WC-1, WC-11, WC-13)', () => {
  // Mode 13 = runway 25 (hdg 250). Wind from direction D: tailwind = -S cos(D - 250).
  //   080/05: D-250 = -170 -> cos = -0.98481 -> tailwind 4.924 <= 5.05, inside the margin (> 2) -> MARGINAL (eligible, not green).
  //   070/05: tailwind exactly 5.000 -> MARGINAL.
  //   103/06: D-250 = -147 -> cos = -0.83867 -> 5.032 <= 5.05 (tolerance) -> MARGINAL.
  //   102/06: D-250 = -148 -> cos = -0.84805 -> 5.088 > 5.05 -> UNSUITABLE (TW).
  it.each([
    [80, 5, 'MARGINAL'],
    [70, 5, 'MARGINAL'],
    [103, 6, 'MARGINAL'],
    [102, 6, 'UNSUITABLE'],
  ])('mode 13 with wind %i/%i kt is %s', (dir, spd, want) => {
    const rr = go({ metar: metar(kt(dir, spd)), taf: taf(kt(dir, spd) + ' 9999 SCT020') });
    const c = cell(rr, '13', 0);
    expect(c.status).toBe(want);
    if (want === 'UNSUITABLE') expect(c.cause).toBe('TW');
    // Never green above the near-limit line.
    expect(c.status).not.toBe('SUITABLE');
  });
  it('the 4.924 kt case reports its figure to one decimal place', () => {
    const rr = go({ metar: metar(kt(80, 5)), taf: taf(kt(80, 5) + ' 9999 SCT020') });
    const fig = cell(rr, '13', 0).runways[0]!;
    expect(fig.tailwindKt).toBeCloseTo(4.924, 3);
    expect(fig.tailwindLimitDryKt).toBe(5);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E03 wet runway from the METAR (WC-12, WC-1, WC-10)', () => {
  // 158/04, mode 13 (hdg 250): D-250 = -92 -> cos = -0.0349 -> tailwind 0.1396.
  //   Dry: 0.14 <= 5.05 and not inside the margin (<= 2) -> SUITABLE.   Wet: wet limit 0 + 0.05 < 0.14 -> UNSUITABLE TW.
  const tafDry = taf(kt(158, 4) + ' 9999 SCT020');
  it('0.14 kt tailwind: dry SUITABLE, wet UNSUITABLE', () => {
    const dry = go({ metar: metar(kt(158, 4)), taf: tafDry });
    expect(cell(dry, '13', 0).status).toBe('SUITABLE');
    expect(dry.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    const wet = go({ metar: metar(kt(158, 4), '-RA'), taf: tafDry });
    expect(wet.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(wet, '13', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
  it('wet headwind is fine: 250/10 with rain leaves mode 13 SUITABLE and mode 12 (tailwind 10) UNSUITABLE', () => {
    const w = go({ metar: metar(kt(250, 10), '-RA'), taf: taf(kt(250, 10) + ' 9999 SCT020') });
    expect(cell(w, '13', 0).status).toBe('SUITABLE');
    expect(cell(w, '12', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
  // Rain in the METAR at slot 0 (03:00-03:30). Drying: WET stays for 60 min after the end of the last wet slot:
  // 03:30 + 60 = 04:30 at the earliest, 05:00 if the 03:30 slot is also wet. So 03:30 and 04:00 are WET, 05:00 is DRY.
  it('stays wet while drying and is DRY again from 05:00', () => {
    const w = go({ metar: metar(kt(158, 4), '-RA'), taf: tafDry });
    expect(w.out.evaluation.slots[at(w, '03:30')]!.runwayState).toBe('WET');
    expect(w.out.evaluation.slots[at(w, '04:00')]!.runwayState).toBe('WET');
    expect(w.out.evaluation.slots[at(w, '05:00')]!.runwayState).toBe('DRY');
    expect(cell(w, '13', '04:00').status).toBe('UNSUITABLE');
    expect(cell(w, '13', '05:00').status).toBe('SUITABLE');
  });
  it('recent rain (RERA) in the METAR makes slot 1 WET (WC-12)', () => {
    const w = go({ metar: metar(kt(158, 4), 'RERA'), taf: tafDry });
    expect(w.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(w, '13', 0).status).toBe('UNSUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E04 TEMPO / PROB / INTER showers (WC-9, WC-5, WC-10)', () => {
  // Wind 158/04 all period. Mode 13 tailwind 0.14: dry SUITABLE, wet UNSUITABLE.
  // Overlay 2305/2307 covers the slots starting 05:00, 05:30, 06:00, 06:30.
  //   TEMPO, PROB30 TEMPO, PROB40 TEMPO, INTER, PROB30 (plain, 30 < 40): WET POSSIBLE -> mode 13 MARGINAL (passes dry only). No drying clock.
  //   PROB40 (plain, 40 >= 40): WET -> mode 13 UNSUITABLE in 05:00-06:30, and WET while drying 07:00 and 07:30
  //   (last wet slot ends 07:00, +60 min = 08:00) -> DRY from 08:00.
  // Mode 10 (hdg 160) has a headwind: SUITABLE wet or dry. Modes 12 and 14A also stay SUITABLE. Mode 5 (uses 25) behaves like 13.
  // Mode 10 comes first in modes.json among the always-SUITABLE modes, so it is recommended with no change.
  const base = kt(158, 4) + ' 9999 SCT020';
  const m = metar(kt(158, 4));
  const wp = ['05:00', '05:30', '06:00', '06:30'];
  it.each([['TEMPO'], ['PROB30 TEMPO'], ['PROB40 TEMPO'], ['INTER'], ['PROB30']])(
    '%s 2305/2307 SHRA is WET POSSIBLE: mode 13 MARGINAL there, SUITABLE after, and the drying clock never starts',
    (group) => {
      const r = go({ metar: m, taf: taf(`${base} ${group} 2305/2307 4000 SHRA`), windowMinutes: 360 });
      for (const t of wp) {
        expect(r.out.evaluation.slots[at(r, t)]!.runwayState).toBe('WET_POSSIBLE');
        expect(cell(r, '13', t).status).toBe('MARGINAL');
        expect(cell(r, '10', t).status).toBe('SUITABLE');
      }
      expect(r.out.evaluation.slots[at(r, '07:00')]!.runwayState).toBe('DRY');
      expect(cell(r, '13', '07:00').status).toBe('SUITABLE');
      expect(cell(r, '13', '04:30').status).toBe('SUITABLE');
      expect(r.out.plan.recommendedModeId).toBe('10');
      expect(new Set(chosen(r))).toEqual(new Set(['10']));
    },
  );
  it('PROB40 2305/2307 SHRA (no TEMPO) is WET, with 60 minutes of drying', () => {
    const r = go({ metar: m, taf: taf(`${base} PROB40 2305/2307 4000 SHRA`), windowMinutes: 360 });
    for (const t of [...wp, '07:00', '07:30']) {
      expect(r.out.evaluation.slots[at(r, t)]!.runwayState).toBe('WET');
      expect(cell(r, '13', t)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    }
    expect(r.out.evaluation.slots[at(r, '08:00')]!.runwayState).toBe('DRY');
    expect(cell(r, '13', '08:00').status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('10');
  });
  it('a PROB30 TEMPO with heavy thunderstorm text and its own wind keeps the same runway-state behaviour', () => {
    const r = go({ metar: m, taf: taf(`${base} PROB30 TEMPO 2305/2307 01020G30KT 1000 +TSRA BKN005`), windowMinutes: 360 });
    expect(r.out.evaluation.slots[at(r, '05:30')]!.runwayState).toBe('WET_POSSIBLE');
    expect(r.out.evaluation.slots[at(r, '07:00')]!.runwayState).toBe('DRY');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E05 FM wind shift in two hours: the resilient mode is chosen first (OP-2, OP-6, section 11)', () => {
  // METAR 160/12 at 03:00. TAF: 160/12 until FM at 05:00, then 340/12. Window 4 h = 03:00-06:30 (8 slots).
  // Mode 10 (hdg 160): headwind 12 before, after FM dir-hdg = 180 -> tailwind 12 > 5.05 -> UNSUITABLE TW from slot 4 (05:00).
  // Modes 12 (07) and 13 (25) see the wind at 90 deg both times: xw 12 <= 17 -> SUITABLE all 8 slots, tailwind ~0.
  // 5 and 14A use runway 16 (tailwind after FM), 7/8/9 use 34 (tailwind before FM): each fails somewhere.
  // Equal day preference (5) everywhere, so the cheapest plan is a single mode with no change; the first in modes.json is 12.
  const r = go({ metar: metar(kt(160, 12)), taf: taf(`${kt(160, 12)} 9999 SCT020 FM230500 ${kt(340, 12)} 9999 SCT020`) });
  it('mode 10 survives exactly 4 slots and fails on tailwind at 05:00', () => {
    const mi = r.pack.modes.findIndex((x) => x.id === '10');
    const s = r.out.evaluation.survival[mi]!;
    expect(s.viableSlots).toBe(4);
    expect(s.firstUnsuitableSlot).toBe(4);
    expect(s.firstUnsuitableCause).toBe('TW');
    expect(hhmm(r, 4)).toBe('05:00');
  });
  it('the two crosswind-only modes survive all 8 slots', () => {
    expect(statuses(r, '12').every((x) => x === 'SUITABLE')).toBe(true);
    expect(statuses(r, '13').every((x) => x === 'SUITABLE')).toBe(true);
  });
  it('recommends mode 12 straight away and plans no change', () => {
    expect(r.out.plan.recommendedModeId).toBe('12');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E06 BECMG applies from its start time (WX-8, OD-20)', () => {
  // Base 250/10, BECMG 2305/2308 to 070/15 (the group's weather applies from 05:00, not gradually). Window 6 h.
  // Mode 13 (hdg 250): 03:00-04:30 headwind 10 -> SUITABLE; from 05:00 tailwind 15 > 5.05 -> UNSUITABLE (also at 06:30 and 08:00).
  // Mode 12 (hdg 070): the mirror image.  Modes 9 and 10 are crosswind-only both ways (xw 10, then 15 <= 17) -> SUITABLE throughout;
  // 9 is first in modes.json, so mode 9 is recommended with no change.
  const r = go({ metar: metar(kt(250, 10)), taf: taf(`${kt(250, 10)} 9999 SCT020 BECMG 2305/2308 ${kt(70, 15)}`), windowMinutes: 360 });
  it('mode 13 flips at 05:00 exactly, not at 08:00', () => {
    expect(cell(r, '13', '04:30').status).toBe('SUITABLE');
    expect(cell(r, '13', '05:00')).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '13', '06:30').status).toBe('UNSUITABLE');
    expect(cell(r, '12', '04:30').status).toBe('UNSUITABLE');
    expect(cell(r, '12', '05:00').status).toBe('SUITABLE');
  });
  it('plans through the shift on a crosswind-only mode', () => {
    expect(r.out.plan.recommendedModeId).toBe('9');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E07 METAR governs the first slots, TAF-worse is MARGINAL (WX-7, OD-25)', () => {
  // METAR obs 03:00: 250/10. TAF: 250/10, FM 03:30 -> 070/10. Slots 03:00 and 03:30 start within 60 min of the observation -> METAR governs.
  // Mode 13 (hdg 250): METAR headwind 10 -> SUITABLE; at 03:30 the TAF view has tailwind 10 > 5.05 (UNSUITABLE, worse) -> the cell is MARGINAL with a TAF reason.
  // From 04:30 (90 min after the observation) the TAF governs: 070/10 -> UNSUITABLE. 04:00 starts exactly 60 min after the observation (boundary, either answer).
  // Mode 12 (hdg 070): METAR tailwind 10 -> UNSUITABLE at 03:00 and 03:30 (a better TAF view cannot lift it); SUITABLE from 04:30.
  const r = go({ metar: metar(kt(250, 10)), taf: taf(`${kt(250, 10)} 9999 SCT020 FM230330 ${kt(70, 10)} 9999 SCT020`) });
  it('slots 03:00 and 03:30 are METAR-governed; 04:30 is TAF-governed', () => {
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('METAR');
    expect(r.out.evaluation.slots[1]!.governedBy).toBe('METAR');
    expect(r.out.evaluation.slots[at(r, '04:30')]!.governedBy).toBe('TAF');
  });
  it('mode 13: SUITABLE, then MARGINAL on the TAF warning, then UNSUITABLE once the TAF governs', () => {
    expect(cell(r, '13', '03:00').status).toBe('SUITABLE');
    const c = cell(r, '13', '03:30');
    expect(c.status).toBe('MARGINAL');
    expect(c.reasons.some((x) => x.code === 'TAF')).toBe(true);
    expect(['MARGINAL', 'UNSUITABLE']).toContain(cell(r, '13', '04:00').status);
    expect(cell(r, '13', '04:30').status).toBe('UNSUITABLE');
  });
  it('mode 12: UNSUITABLE under the METAR, SUITABLE once the TAF governs', () => {
    expect(cell(r, '12', '03:00').status).toBe('UNSUITABLE');
    expect(cell(r, '12', '03:30').status).toBe('UNSUITABLE');
    expect(cell(r, '12', '04:30').status).toBe('SUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E08 METAR only, TAF only, neither (WX-9, OP-13)', () => {
  it('METAR only: the METAR window is judged, later slots are UNKNOWN, the plan runs through them as uncertain', () => {
    // 250/10: modes 5, 9, 10, 13 are SUITABLE now (5 uses 25 headwind and 16 crosswind 10). First in modes.json: 5.
    const r = go({ metar: metar(kt(250, 10)), taf: null });
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('METAR');
    expect(r.out.evaluation.slots.at(-1)!.governedBy).toBe('NONE');
    expect(cell(r, '13', 0).status).toBe('SUITABLE');
    expect(cell(r, '13', 7).status).toBe('UNKNOWN');
    expect(r.out.plan.recommendedModeId).toBe('5');
    expect(r.out.plan.uncertain).toBe(true);
    expect(r.built.banners.map((b) => b.code)).toContain('no-taf');
    expect(r.out.explanation.uncertaintyLine).toMatch(/uncertain slot/);
  });
  it('TAF only: the TAF governs from slot 1 and slot 1 is DRY', () => {
    const r = go({ metar: null, taf: taf(kt(158, 4) + ' 9999 SCT020') });
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('TAF');
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '13', 0).status).toBe('SUITABLE');
    expect(r.built.banners.map((b) => b.code)).toContain('no-metar');
  });
  // WX-9 / WX-7 / WC-12 say slot 1 is DRY with no METAR; WC-9 says prevailing TAF rain makes a slot WET. The specific rule is taken: slot 1 DRY,
  // slot 2 WET (prevailing -RA in the TAF base group).
  it('TAF only with prevailing rain: slot 1 DRY by rule, later slots WET', () => {
    const r = go({ metar: null, taf: taf(kt(158, 4) + ' 9999 -RA SCT020') });
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '13', 0).status).toBe('SUITABLE');
    expect(r.out.evaluation.slots[1]!.runwayState).toBe('WET');
    expect(cell(r, '13', 1).status).toBe('UNSUITABLE');
  });
  it('neither: no weather entered, no mode recommended', () => {
    const r = go({ metar: null, taf: null });
    expect(r.built.banners.map((b) => b.code)).toContain('no-weather');
    expect(r.out.plan.recommendedModeId).toBeNull();
    expect(r.out.plan.noRecommendation).toBe('WEATHER_UNKNOWN');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E09 stale and old METARs (WX-7, WX-9, OD-30)', () => {
  const tafOk = taf(kt(158, 4) + ' 9999 SCT020');
  it('a METAR 130 minutes old governs nothing: the TAF governs from slot 1, slot 1 is DRY even though the old METAR had rain', () => {
    // Old METAR 250/10 -RA; TAF 158/04: mode 13 tailwind 0.14 is fine dry, fails wet. DRY + SUITABLE proves the METAR was not used.
    const r = go({ metar: metar(kt(250, 10), '-RA', '230100Z'), taf: tafOk });
    for (const s of r.out.evaluation.slots) expect(s.governedBy).toBe('TAF');
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '13', 0).status).toBe('SUITABLE');
    expect(r.built.banners.map((b) => b.code)).toContain('metar-stale');
    expect(r.built.metarAgeMinutes).toBe(130);
  });
  it('a METAR observed 02:20Z (50 min old) governs slot 03:00 (40 min after observation) but not 03:30 (70 min)', () => {
    const r = go({ metar: metar(kt(158, 4), '-RA', '230220Z'), taf: tafOk });
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('METAR');
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(r, '13', 0).status).toBe('UNSUITABLE');
    expect(r.out.evaluation.slots[1]!.governedBy).toBe('TAF');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E10 variable wind (OD-33, WC-11)', () => {
  // YSSY: calm 3, dry tailwind 5 (+0.05), crosswind 20.
  const vrb = (spd: string, wx = '') => go({ metar: metar(spd, wx), taf: taf(spd + ' 9999 SCT020') });
  const flying = ENABLED.filter((m) => m !== '1');
  it('VRB03KT is calm: every day mode SUITABLE', () => {
    const r = vrb('VRB03KT');
    for (const id of flying) expect(cell(r, id, 0).status).toBe('SUITABLE');
  });
  it('VRB05KT is above calm and does not break 5.05 or 20.05: every mode MARGINAL with cause VRB', () => {
    const r = vrb('VRB05KT');
    for (const id of flying) {
      const c = cell(r, id, 0);
      expect(c.status).toBe('MARGINAL');
      expect(c.reasons.some((x) => x.code === 'VRB')).toBe(true);
    }
  });
  it('VRB05KT with rain is NOT judged against the wet tailwind limit (OD-33): still MARGINAL, not UNSUITABLE', () => {
    const r = vrb('VRB05KT', '-RA');
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('WET');
    for (const id of flying) expect(cell(r, id, 0).status).toBe('MARGINAL');
  });
  // VRB06KT: the full speed 6 counts as a tailwind on EVERY runway (worst case) and 6 > 5.05, so on every runway of every mode the dry limit breaks.
  it('VRB06KT: full speed 6 > 5.05 on every runway of every mode, so every mode is UNSUITABLE', () => {
    const r = vrb('VRB06KT');
    for (const id of flying) expect(cell(r, id, 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.recommendedModeId).toBeNull();
  });
  it('gusting VRB uses the stronger of mean and gust: VRB04G12KT is judged at 12', () => {
    const r = vrb('VRB04G12KT');
    for (const id of flying) expect(cell(r, id, 0).status).toBe('UNSUITABLE');
  });
  // Direction range: 190/10 with 160V220. Mode 12 (hdg 070): at 190, dir-hdg = 120 -> tailwind 5.0 -> MARGINAL. Worst direction 220:
  // dir-hdg = 150 -> tailwind 8.66 > 5.05 -> UNSUITABLE. Mode 10 (hdg 160): headwind 5 to 10, xw up to 8.66 -> SUITABLE either way.
  it('160V220 is tested at the worst direction in the range', () => {
    const fixed = go({ metar: metar(kt(190, 10)), taf: taf(kt(190, 10) + ' 9999 SCT020') });
    expect(cell(fixed, '12', 0).status).toBe('MARGINAL');
    const ranged = go({ metar: 'METAR YSSY 230300Z 19010KT 160V220 9999 FEW020 20/10 Q1015', taf: taf(kt(190, 10) + ' 9999 SCT020') });
    expect(cell(ranged, '12', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(ranged, '10', 0).status).toBe('SUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E11 weather in the vicinity never counts as wet (OD-34, WC-9)', () => {
  // Real SBFI METAR (VCSH VCTS), 090/10, replayed with YSSY runways. Mode 9 (hdg 340): dir-hdg = -250 -> cos = -0.342 -> tailwind 3.42:
  // dry: 3.42 > 2 (margin) and <= 5.05 -> MARGINAL;  wet would be UNSUITABLE (3.42 > 0.05).
  const sbfi = 'METAR SBFI 231400Z 09010KT 9999 VCSH VCTS BKN030 FEW040CB OVC080 23/19 Q1015';
  const NOW14 = '2026-10-23T14:10:00Z';
  it('VCSH VCTS in the METAR leaves slot 1 DRY; mode 9 is MARGINAL (dry), not UNSUITABLE (wet)', () => {
    const r = run({ ref: YSSY_PACK, station: 'SBFI', nowIso: NOW14, metar: sbfi, taf: null, windowMinutes: 240 });
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '9', 0).status).toBe('MARGINAL');
  });
  it('the same METAR with -SHRA (at the station) is WET and mode 9 is UNSUITABLE', () => {
    const r = run({ ref: YSSY_PACK, station: 'SBFI', nowIso: NOW14, metar: sbfi.replace('VCSH VCTS', '-SHRA'), taf: null, windowMinutes: 240 });
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(r, '9', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
  // Real MYGF TAF: base VCSH, 050/12 for the whole period. Mode 10 (hdg 160): dir-hdg = -110 -> tailwind 4.10 -> MARGINAL dry; wet would be UNSUITABLE.
  it('a TAF with VCSH in its base group never makes a slot wet', () => {
    const raw = 'TAF MYGF 231100Z 2312/2412 05012KT 9999 VCSH SCT018 BKN040';
    const r = run({ ref: YSSY_PACK, station: 'MYGF', nowIso: NOW14, metar: null, taf: raw, windowMinutes: null });
    expect(r.out.evaluation.slots.length).toBeGreaterThan(20);
    for (const s of r.out.evaluation.slots) expect(s.runwayState).toBe('DRY');
    expect(cell(r, '10', 0).status).toBe('MARGINAL');
  });
  it.each([['TEMPO'], ['PROB40 TEMPO'], ['PROB40']])('%s with VCSH is not WET POSSIBLE either', (group) => {
    const r = go({ metar: metar(kt(158, 4)), taf: taf(`${kt(158, 4)} 9999 SCT020 ${group} 2305/2307 VCSH`), windowMinutes: 360 });
    for (const s of r.out.evaluation.slots) expect(s.runwayState).toBe('DRY');
    expect(cell(r, '13', '06:00').status).toBe('SUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E12 curfew night band at local 23:00 across the daylight-saving change (SY-5, AG-5, OP-10)', () => {
  // Sydney DST 2026 begins Sunday 04-10-2026 at 02:00 AEST (= 16:00Z on 03-10-2026); AEST is UTC+10, AEDT UTC+11.
  // Wind 070/10: Mode 1 (34L, 16R) sees xw 10 on both ends -> SUITABLE when allowed. Modes 9, 10, 12, 14A are SUITABLE; 5, 7, 8, 13 fail on runway 25 tailwind.
  const w = kt(70, 10);
  const win = (nowIso: string, obs: string, issue: string, valid: string) =>
    run({ ref: YSSY_PACK, nowIso, metar: `METAR YSSY ${obs} ${w} 9999 FEW020 20/10 Q1015`, taf: `TAF YSSY ${issue} ${valid} ${w} 9999 SCT020`, windowMinutes: 240 });
  const bandIds = (r: ReturnType<typeof win>) => r.out.evaluation.slots.map((s) => s.bandId);

  it('before DST (03-10-2026, AEST): 12:30Z is 22:30 local (day); 13:00Z is 23:00 local (night)', () => {
    const r = win('2026-10-03T12:40:00Z', '031230Z', '031100Z', '0312/0412');
    expect(hhmm(r, 0)).toBe('12:30');
    expect(bandIds(r)).toEqual(['day', 'night', 'night', 'night', 'night', 'night', 'night', 'night']);
    expect(cell(r, '1', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'PLAN' });
    expect(cell(r, '1', 1).status).toBe('SUITABLE');
  });
  it('after DST (05-10-2026, AEDT): 11:30Z is 22:30 local (day); 12:00Z is 23:00 local (night)', () => {
    const r = win('2026-10-05T11:40:00Z', '051130Z', '051100Z', '0511/0611');
    expect(hhmm(r, 0)).toBe('11:30');
    expect(bandIds(r)).toEqual(['day', 'night', 'night', 'night', 'night', 'night', 'night', 'night']);
    expect(cell(r, '1', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'PLAN' });
    expect(cell(r, '1', 1).status).toBe('SUITABLE');
  });
  // Plan on either evening: slot 0 (day) cannot be Mode 1. Staying in a day mode through 7 night slots costs 5 + 7 x 20 = 145;
  // changing to Mode 1 at slot 1 costs 5 (day) + 5 (change, traffic unknown) + 0 = 10. So: first-in-file suitable mode (9), then Mode 1 at slot 1.
  it.each([
    ['2026-10-03T12:40:00Z', '031230Z', '031100Z', '0312/0412'],
    ['2026-10-05T11:40:00Z', '051130Z', '051100Z', '0511/0611'],
  ])('on the evening of %s the plan moves to Mode 1 at 23:00 local (slot 1)', (nowIso, obs, issue, valid) => {
    const r = win(nowIso, obs, issue, valid);
    expect(r.out.plan.recommendedModeId).toBe('9');
    expect(r.out.plan.changes).toHaveLength(1);
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 1, fromModeId: '9', toModeId: '1' });
  });
  // Morning of the change: 18:30Z on 03-10 is 05:30 AEDT (night); 19:00Z is 06:00 AEDT (day). (A fixed +10 would call 19:00Z 05:00 and keep night until 20:00Z.)
  it('the morning of the change: the night band ends at 19:00Z, not 20:00Z', () => {
    const r = win('2026-10-03T18:40:00Z', '031830Z', '031100Z', '0312/0412');
    expect(hhmm(r, 0)).toBe('18:30');
    expect(bandIds(r).slice(0, 3)).toEqual(['night', 'day', 'day']);
    expect(cell(r, '1', 0).status).toBe('SUITABLE');
    expect(cell(r, '1', 1)).toMatchObject({ status: 'UNSUITABLE', cause: 'PLAN' });
    // Mode 1 (0) in the night slot, then a day mode: 0 + 5 (change) + 7 x 5 = 40; a day mode throughout: 20 + 7 x 5 = 55.
    expect(r.out.plan.recommendedModeId).toBe('1');
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 1, fromModeId: '1', toModeId: '9' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('E13 capacity set on a copy of the pack (TR-6, OD-16, OD-24)', () => {
  // Copy of the YSSY pack with capacity 20 movements per hour on Mode 5 only: 10 per half-hour slot. Wind 250/10 (Modes 5, 7, 8, 9, 10 and 13 all pass on wind).
  const withCap: RunOptions['edit'] = (files) => {
    files['modes.json'].modes.find((m: { id: string }) => m.id === '5').capacity = 20;
  };
  const base = { edit: withCap, metar: metar(kt(250, 10)), taf: taf(kt(250, 10) + ' 9999 SCT020') };
  it('10 arrivals in a slot is at the limit and passes; 11 fails; unknown demand is never UNSUITABLE', () => {
    const r = go({ ...base, arrivals: [10, 11, 6, null, null, null, null, null] });
    expect(cell(r, '5', 0).demand.capacityInSlot).toBe(10);
    expect(cell(r, '5', 0).status).toBe('SUITABLE');
    expect(cell(r, '5', 1)).toMatchObject({ status: 'UNSUITABLE', cause: 'CAP' });
    expect(cell(r, '5', 2).status).toBe('SUITABLE');
    expect(cell(r, '5', 3).status).not.toBe('UNSUITABLE');
    expect(cell(r, '5', 3).uncertain).toBe(true);
    // A mode with no capacity is untouched by the same traffic.
    expect(cell(r, '9', 1).status).toBe('SUITABLE');
  });
  it('known arrivals plus known departures: 6 + 5 = 11 > 10 fails in slot 1', () => {
    const r = go({ ...base, arrivals: [6, 4, null, null, null, null, null, null], departures: [5, null, null, null, null, null, null, null] });
    expect(cell(r, '5', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'CAP' });
    expect(cell(r, '5', 1).status).toBe('SUITABLE');
  });
  it('the plan avoids the mode that cannot carry the traffic: Mode 7 (next in file that passes on wind: 34L/34R arrivals, 25 departures) from slot 0, no change', () => {
    const r = go({ ...base, arrivals: [10, 11, 6, 6, 6, 6, 6, 6] });
    expect(r.out.plan.recommendedModeId).toBe('7');
    expect(r.out.plan.changes).toHaveLength(0);
    expect(new Set(chosen(r))).toEqual(new Set(['7']));
  });
  it('without a capacity in the pack (shipped YSSY) the same traffic changes nothing (SY-7)', () => {
    const r = go({ metar: metar(kt(250, 10)), taf: taf(kt(250, 10) + ' 9999 SCT020'), arrivals: [10, 50, 6, 6, 6, 6, 6, 6] });
    expect(cell(r, '5', 1).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('5');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E14 the current mode becomes unsuitable: red banner data and the replacement (UP-4, OD-21, OP-8)', () => {
  it('already unsuitable now: 070/10 with Mode 13 current (tailwind 10 on runway 25)', () => {
    // Suitable at 070/10: 9, 10, 12, 14A. First in modes.json: 9. Leaving the current mode in slot 1 costs the unknown-demand change 5, any alternative needs it too.
    const r = go({ metar: metar(kt(70, 10)), taf: taf(kt(70, 10) + ' 9999 SCT020'), current: '13' });
    expect(cell(r, '13', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.startModeId).toBe('13');
    expect(r.out.plan.recommendedModeId).toBe('9');
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 0, fromModeId: '13', toModeId: '9' });
    const co = r.out.changeovers[0]!;
    expect(co.trigger).toMatchObject({ slotIndex: 0, cause: 'TW' });
    expect(co.replacementModeId).toBe('9');
  });
  it('becomes unsuitable at 05:00 (FM to 070/10): the trigger is the 05:00 slot and unknown traffic gives no early-change banner', () => {
    const r = go({ metar: metar(kt(250, 10)), taf: taf(`${kt(250, 10)} 9999 SCT020 FM230500 ${kt(70, 10)} 9999 SCT020`), current: '13' });
    expect(cell(r, '13', 3).status).toBe('SUITABLE');
    expect(cell(r, '13', 4).status).toBe('UNSUITABLE');
    expect(r.out.changeovers.length).toBeGreaterThan(0);
    expect(r.out.changeovers[0]!.trigger).toMatchObject({ slotIndex: 4, cause: 'TW' });
    expect(r.out.explanation.earlyChange).toBeNull();
    // The plan never sits in Mode 13 from 05:00.
    expect(chosen(r).slice(4).every((m) => m !== '13')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E15 busy-traffic early change: banner only when the forced change is in strictly busier traffic (OP-6, OP-7)', () => {
  // METAR 160/12; FM 05:00 -> 340/12. Current mode 10 (headwind, then tailwind 12 > 5.05 -> UNSUITABLE from slot 4).
  // Only 12 and 13 (crosswind-only) survive every slot; 9 is unusable before the FM. Window 4 h: slots 0-3 before the shift, slot 4 is the forced slot.
  // Arrivals decide the level: light <= 5, medium 6-11, busy >= 12. Change cost: light 1, medium 5, busy 25 (charged in the slot where the new mode starts).
  // Preference is 5 for every day mode, so only change costs differ.
  const wx = { metar: metar(kt(160, 12)), taf: taf(`${kt(160, 12)} 9999 SCT020 FM230500 ${kt(340, 12)} 9999 SCT020`), current: '10' };
  const traffic = (before: number | null, after: number | null) => [before, before, before, before, after, after, after, after];

  it('medium before, busy at the forced slot: changing early costs 5, waiting costs 25 -> EARLY banner, change in a medium slot before 05:00', () => {
    const r = go({ ...wx, arrivals: traffic(8, 14) });
    const early = r.out.explanation.earlyChange;
    expect(early).not.toBeNull();
    expect(early!.title).toBe(EARLY_CHANGE_TITLE);
    expect(early!.trafficAtChange).toBe('medium');
    expect(early!.trafficAtForced).toBe('busy');
    expect(early!.forcedStartMs).toBe(Date.parse('2026-10-23T05:00:00Z'));
    expect(early!.changeStartMs).toBeLessThan(early!.forcedStartMs);
    expect(['12', '13']).toContain(r.out.plan.changes[0]!.toModeId);
    expect(r.out.plan.changes[0]!.slotIndex).toBeLessThan(4);
  });
  it('light before, medium at the forced slot: strictly busier, early cost 1 < waiting cost 5 -> banner', () => {
    const r = go({ ...wx, arrivals: traffic(3, 8) });
    const early = r.out.explanation.earlyChange;
    expect(early).not.toBeNull();
    expect(early!.trafficAtChange).toBe('light');
    expect(early!.trafficAtForced).toBe('medium');
  });
  it('medium everywhere: waiting costs the same as changing early, so no banner', () => {
    const r = go({ ...wx, arrivals: traffic(8, 8) });
    expect(r.out.explanation.earlyChange).toBeNull();
  });
  it('busy everywhere: no banner', () => {
    const r = go({ ...wx, arrivals: traffic(14, 14) });
    expect(r.out.explanation.earlyChange).toBeNull();
  });
  it('medium before, light at the forced slot: waiting costs 1 < 5, so the plan waits for 05:00 and shows no banner', () => {
    const r = go({ ...wx, arrivals: traffic(8, 3) });
    expect(r.out.explanation.earlyChange).toBeNull();
    expect(r.out.plan.changes[0]!.slotIndex).toBe(4);
    expect(r.out.plan.changes[0]!.fromModeId).toBe('10');
  });
  it('traffic unknown at the change slot: no banner (pre-emptive advice needs known traffic)', () => {
    const r = go({ ...wx, arrivals: traffic(null, 14) });
    expect(r.out.explanation.earlyChange).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('E16 no suitable mode (OD-13, OP-11)', () => {
  // 115/40: dir-hdg is +45 (07), -135 (25), -45 (16), -225 (34). 07 and 16: xw 28.3 > 20.05. 25 and 34: tailwind 28.3 > 5.05. Every runway fails, so every mode fails.
  const bad = kt(115, 40);
  const r = go({ metar: metar(bad), taf: taf(bad + ' 9999 SCT020') });
  it('every enabled mode is UNSUITABLE in every slot', () => {
    for (const id of ENABLED) expect(statuses(r, id).every((s) => s === 'UNSUITABLE')).toBe(true);
  });
  it('no mode is recommended, the required title is shown and no least-bad mode is named', () => {
    expect(r.out.plan.recommendedModeId).toBeNull();
    expect(r.out.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
    expect(chosen(r).every((m) => m === null)).toBe(true);
    expect(r.out.explanation.noSuitableMode?.title).toBe(NO_SUITABLE_TITLE);
    expect(NO_SUITABLE_TITLE).toBe('NO SUITABLE STANDARD MODE IDENTIFIED');
    // No mode is named anywhere in the explanation lines (they may state that none is suitable).
    for (const l of r.out.explanation.lines) expect(l).not.toMatch(/recommend|Mode \d/i);
    const blocked = r.out.explanation.noSuitableMode!.perMode.map((b) => b.modeId);
    for (const id of ENABLED) expect(blocked).toContain(id);
    for (const b of r.out.explanation.noSuitableMode!.perMode) expect(b.restoreText.length).toBeGreaterThan(0);
  });
  it('a wind that eases at 05:00 restores modes from slot 4 and the gap is reported', () => {
    const e = go({ metar: metar(bad), taf: taf(`${bad} 9999 SCT020 FM230500 ${kt(70, 10)} 9999 SCT020`) });
    expect(e.out.plan.recommendedModeId).toBeNull();
    expect(e.out.plan.gaps[0]).toMatchObject({ startSlot: 0, endSlot: 3 });
    expect(chosen(e)[4]).toBe('9');
    const nine = e.out.explanation.noSuitableMode!.perMode.find((b) => b.modeId === '9')!;
    expect(nine.availableFromMs).toBe(Date.parse('2026-10-23T05:00:00Z'));
  });
});

// ---------------------------------------------------------------------------------------------
describe('E17 month rollover, real TAF with hour 24 (WX-3, OP-2)', () => {
  // taf-eham-month-rollover-becmg, replayed with YSSY runways. Valid 31-10 18Z to 02-11 00Z (3118/0124). Clock 01-11-2026 00:30Z.
  // Base 120/12; BECMG 3121/3124 -> 170/17 from 21:00Z on 31-10; BECMG 0103/0106 -> 210/25G35 from 03:00Z on 01-11.
  // Slot 1 is the slot containing now (00:30Z), so the window runs from 00:30Z on 01-11 to the validity end 00:00Z on 02-11: 47 slots.
  // 02:30Z: 170/17. Mode 10 (hdg 160): xw 17 sin 10 = 2.95, headwind 16.7 -> SUITABLE.
  // 03:00Z onwards speed = gust 35 at 210: runway 16 xw 35 sin 50 = 26.8 -> Mode 10 UNSUITABLE XW. Runway 25 (hdg 250): xw 35 sin 40 = 22.5 fail;
  // runway 07: dir-hdg 140 -> tailwind 26.8; runway 34: -130 -> tailwind 22.5. So every mode fails from slot 6 to the end.
  const raw = 'TAF TAF EHAM 311720Z 3118/0124 12012KT CAVOK /         BECMG 3121/3124 17017KT /         BECMG 0103/0106 21025G35KT';
  const r = run({ ref: YSSY_PACK, station: 'EHAM', nowIso: '2026-11-01T00:30:00Z', metar: null, taf: raw, windowMinutes: null });
  it('the window is 47 slots, 01-11-2026 00:30Z to 02-11-2026 00:00Z', () => {
    expect(r.out.evaluation.slots).toHaveLength(47);
    expect(r.out.evaluation.slots[0]!.startMs).toBe(Date.parse('2026-11-01T00:30:00Z'));
    expect(r.out.evaluation.slots.at(-1)!.endMs).toBe(Date.parse('2026-11-02T00:00:00Z'));
  });
  it('the first BECMG (started on 31-10) prevails at the start, the second applies from 03:00Z', () => {
    expect(cell(r, '10', '2026-11-01T02:30').status).toBe('SUITABLE');
    expect(cell(r, '10', '2026-11-01T03:00')).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, '10', 0).status).toBe('SUITABLE');
  });
  it('every mode fails from 03:00Z to the end and the gap is reported', () => {
    for (const id of ENABLED.filter((x) => x !== '1')) {
      expect(statuses(r, id).slice(5).every((s) => s === 'UNSUITABLE')).toBe(true);
    }
    expect(r.out.plan.gaps[0]).toMatchObject({ startSlot: 5, endSlot: 46 });
    expect(r.out.plan.recommendedModeId).not.toBeNull();
  });
});

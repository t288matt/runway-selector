// YR-12 part 1: end-to-end scenarios on the YSSY pack. Every expectation was worked by hand from
// docs/REQUIREMENTS.md and the numbers in refdata/airports/YSSY BEFORE the engine source was read.
//
// Pack numbers used throughout (YSSY, as set by the owner on 23-10-2026 and 24-10-2026; recomputed for issue 26, YR-20b):
//   headings: 16L/16R 155, 34L/34R 335, 07 062, 25 242.
//   tailwind dry 5, wet 0, tolerance 0.05 (pass if component <= limit + 0.05), calm 3, near-limit margin 3,
//   crosswind limit 20 for every mode, so MARGINAL when 17 < xw <= 20.05, UNSUITABLE above 20.05.
//   wet-probability 40, drying 60 min, METAR window 40 min (a METAR governs a slot only when the slot starts less than
//   40 min after the observation, so slot 0 and the next slot when the METAR is observed on the half hour), marginal penalty 3.
//   one all-day band, every mode allowed. Preference penalty: SODPROPS 0; 25A16D, 34A25D, 34AD25, 07A16D 2; 34AD, 16AD 5;
//   07AD, 25AD 12. Equal penalties tie-break by file order.
//   change penalty light 1 / medium 5 / busy 25, unknown-demand change 5. Minimum stay 60 min: a stay shorter than that which
//   ends in a change costs 25 more (OD-74; slot 0 counts only the minutes left in it; the mode in use now and the last
//   stay in the window are not counted). Traffic bands (arrivals per slot): light 0-10, medium 11-20, busy 21+.
//   Capacity per hour (half of it in a 30 min slot): SODPROPS 20, 25A16D 30, 34A25D 30, 34AD25 30, 07AD 20, 25AD 20, 07A16D 30;
//   34AD and 16AD none.
//   Mode runways: SODPROPS (arr 34L, dep 16L and 16R), 25A16D (25, 16R, 16L), 34A25D and 34AD25 (34L, 34R, 25), 34AD (34L, 34R),
//   16AD (16L, 16R), 07AD (07), 25AD (25), 07A16D (07, 16R, 16L). Mode order in modes.json: SODPROPS, 25A16D, 34A25D, 34AD25,
//   34AD, 16AD, 07AD, 25AD, 07A16D.
// Component maths: headwind = S cos(D - H), tailwind = max(0, -headwind), crosswind = S |sin(D - H)|.
// Clock: 23-10-2026 03:10Z is 14:10 AEDT (UTC+11). The 03:00 slot is slot 0, with 20 minutes of it left.
//
// A test marked it.fails documents a DISAGREEMENT between the hand-worked expectation and the tool
// (see the QA report). The assertion is the hand-worked one; the test goes red when the tool is fixed.
import { describe, expect, it } from 'vitest';
import { EARLY_CHANGE_TITLE, NO_SUITABLE_TITLE } from '../../src/engine';
import { YSSY_PACK } from '../helpers/packs';
import { at, cell, chosen, hhmm, kt, run, statuses, type RunOptions } from './pipeline';

const NOW = '2026-10-23T03:10:00Z';
const ENABLED = ['SODPROPS', '25A16D', '34A25D', '34AD25', '34AD', '16AD', '07AD', '25AD', '07A16D'];
// A light tailwind on runway 25 (hdg 242): wind from 150 is 92 degrees off the heading, so the component is
// 4 cos 92 = -0.140, a tailwind of 0.140 kt. Dry that is SUITABLE (<= 5.05 and under the 2 kt margin line); wet it is
// UNSUITABLE (> 0 + 0.05, a 0 kt limit has no margin). On runway 16 (hdg 155) the same wind is a 3.98 kt headwind.
const LIGHT_TAIL = kt(150, 4);

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
  // Wind 070/25. Mode 07AD (07, hdg 062): dir-hdg = 8 -> headwind 24.8, xw 3.5 -> SUITABLE.
  // Mode 16AD (hdg 155): dir-hdg = -85 -> xw 24.9 > 20.05 -> UNSUITABLE XW.   Mode 34AD (hdg 335): -265 -> xw 24.9 -> XW.
  // Mode 07A16D (07, 16R, 16L): 16R xw 24.9 -> XW.   Modes 25AD, 25A16D, 34A25D, 34AD25 use 25 (hdg 242): dir-hdg = -172 -> tailwind 24.8 > 5.05 -> TW first.
  // Mode SODPROPS (arr 34L hdg 335, dep 16L/16R hdg 155) fails XW on every leg (24.9), same as 34AD/16AD.
  // Only Mode 07AD is SUITABLE, so it is recommended with no change.
  const r = go({ metar: metar(kt(70, 25)), taf: taf(kt(70, 25) + ' 9999 SCT020') });
  it('only mode 07AD passes, with the right cause on each other mode', () => {
    expect(statuses(r, '07AD').every((s) => s === 'SUITABLE')).toBe(true);
    expect(cell(r, '16AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, '34AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, '07A16D', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, 'SODPROPS', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    for (const id of ['25A16D', '34A25D', '34AD25', '25AD']) expect(cell(r, id, 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
  it('recommends mode 07AD for every slot', () => {
    expect(r.out.plan.recommendedModeId).toBe('07AD');
    expect(new Set(chosen(r))).toEqual(new Set(['07AD']));
    expect(r.out.plan.changes).toHaveLength(0);
  });
  // Mode 16AD crosswind sweep with wind from 070 (85 degrees off 155, so xw = S sin 85 = 0.996 S; limit 20, margin 3):
  //   15 -> 14.94 SUITABLE; 18 -> 17.93 MARGINAL (> 17); 20 -> 19.92 MARGINAL (<= 20.05); 21 -> 20.92 UNSUITABLE.
  it.each([
    [15, 'SUITABLE'], // 14.94 <= 17
    [18, 'MARGINAL'], // 17 < 17.93 <= 20.05
    [20, 'MARGINAL'], // 19.92 is inside the limit, above the margin line
    [21, 'UNSUITABLE'], // 20.92 > 20.05
  ])('mode 16AD at 070/%i kt is %s', (speed, want) => {
    const rr = go({ metar: metar(kt(70, speed)), taf: taf(kt(70, speed) + ' 9999 SCT020') });
    expect(cell(rr, '16AD', 0).status).toBe(want);
  });
  // Non-integer crosswind on 16AD (hdg 155), both winds from the ENE so the runway still has a headwind (no tailwind to confuse the cause):
  //   083/21 -> dir-hdg = -72 deg -> xw = 21 sin 72 = 21 x 0.95106 = 19.97 (<= 20.05 passes; > 17 so MARGINAL).
  //   080/21 -> dir-hdg = -75 deg -> xw = 21 sin 75 = 21 x 0.96593 = 20.28 > 20.05 fails.
  it('19.97 kt crosswind passes (MARGINAL) and 20.28 kt fails', () => {
    const a = go({ metar: metar(kt(83, 21)), taf: taf(kt(83, 21) + ' 9999 SCT020') });
    expect(cell(a, '16AD', 0).status).toBe('MARGINAL');
    const b = go({ metar: metar(kt(80, 21)), taf: taf(kt(80, 21) + ' 9999 SCT020') });
    expect(cell(b, '16AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('E02 dry tailwind 4.9 / 5.1 kt at one runway (WC-1, WC-11, WC-13)', () => {
  // Mode 25AD = runway 25 (hdg 242). Wind from direction D: tailwind = -S cos(D - 242).
  //   072/05: D-242 = -170 -> cos = -0.98481 -> tailwind 4.924 <= 5.05, inside the margin (> 2) -> MARGINAL (eligible, not green).
  //   062/05: D-242 = -180 -> cos = -1 -> tailwind exactly 5.000 -> MARGINAL.
  //   095/06: D-242 = -147 -> cos = -0.83867 -> 5.032 <= 5.05 (tolerance) -> MARGINAL.
  //   094/06: D-242 = -148 -> cos = -0.84805 -> 5.088 > 5.05 -> UNSUITABLE (TW).
  // (Each direction is the original case moved 8 degrees to match heading 242 instead of 250.)
  it.each([
    [72, 5, 'MARGINAL'],
    [62, 5, 'MARGINAL'],
    [95, 6, 'MARGINAL'],
    [94, 6, 'UNSUITABLE'],
  ])('mode 25AD with wind %i/%i kt is %s', (dir, spd, want) => {
    const rr = go({ metar: metar(kt(dir, spd)), taf: taf(kt(dir, spd) + ' 9999 SCT020') });
    const c = cell(rr, '25AD', 0);
    expect(c.status).toBe(want);
    if (want === 'UNSUITABLE') expect(c.cause).toBe('TW');
    // Never green above the near-limit line.
    expect(c.status).not.toBe('SUITABLE');
  });
  it('the 4.924 kt case reports its figure to one decimal place', () => {
    const rr = go({ metar: metar(kt(72, 5)), taf: taf(kt(72, 5) + ' 9999 SCT020') });
    const fig = cell(rr, '25AD', 0).runways[0]!;
    expect(fig.tailwindKt).toBeCloseTo(4.924, 3);
    expect(fig.tailwindLimitDryKt).toBe(5);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E03 wet runway from the METAR (WC-12, WC-1, WC-10)', () => {
  // 150/04, mode 25AD (hdg 242): D-242 = -92 -> cos = -0.0349 -> tailwind 0.1396 (see LIGHT_TAIL).
  //   Dry: 0.14 <= 5.05 and not inside the margin (<= 2) -> SUITABLE.   Wet: wet limit 0 + 0.05 < 0.14 -> UNSUITABLE TW.
  const tafDry = taf(LIGHT_TAIL + ' 9999 SCT020');
  it('0.14 kt tailwind: dry SUITABLE, wet UNSUITABLE', () => {
    const dry = go({ metar: metar(LIGHT_TAIL), taf: tafDry });
    expect(cell(dry, '25AD', 0).status).toBe('SUITABLE');
    expect(dry.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    const wet = go({ metar: metar(LIGHT_TAIL, '-RA'), taf: tafDry });
    expect(wet.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(wet, '25AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
  it('wet headwind is fine: 250/10 with rain leaves mode 25AD SUITABLE and mode 07AD (tailwind 10) UNSUITABLE', () => {
    const w = go({ metar: metar(kt(250, 10), '-RA'), taf: taf(kt(250, 10) + ' 9999 SCT020') });
    expect(cell(w, '25AD', 0).status).toBe('SUITABLE');
    expect(cell(w, '07AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
  // Rain in the METAR observed 03:00. The 40 min window covers the slots starting 03:00 and 03:30 (30 < 40), so both carry the METAR's
  // own rain and are WET for sure; the last wet slot is 03:30-04:00. Drying: a slot is held WET while its START is before the last wet
  // slot's END + 60 min = 04:00 + 60 = 05:00. So 04:00 and 04:30 are WET (held by drying, which does not restart the clock), and 05:00 is
  // the first DRY slot.
  it('stays wet while drying and is DRY again from 05:00', () => {
    const w = go({ metar: metar(LIGHT_TAIL, '-RA'), taf: tafDry });
    expect(w.out.evaluation.slots[at(w, '03:30')]!.runwayState).toBe('WET');
    expect(w.out.evaluation.slots[at(w, '04:00')]!.runwayState).toBe('WET');
    expect(w.out.evaluation.slots[at(w, '04:30')]!.runwayState).toBe('WET');
    expect(w.out.evaluation.slots[at(w, '05:00')]!.runwayState).toBe('DRY');
    expect(cell(w, '25AD', '04:00').status).toBe('UNSUITABLE');
    expect(cell(w, '25AD', '05:00').status).toBe('SUITABLE');
  });
  it('recent rain (RERA) in the METAR makes slot 1 WET (WC-12)', () => {
    const w = go({ metar: metar(LIGHT_TAIL, 'RERA'), taf: tafDry });
    expect(w.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(w, '25AD', 0).status).toBe('UNSUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E04 TEMPO / PROB / INTER showers (WC-9, WC-5, WC-10)', () => {
  // Wind 150/04 all period (LIGHT_TAIL). Mode 25AD tailwind 0.14: dry SUITABLE, wet UNSUITABLE.
  // Overlay 2305/2307 covers the slots starting 05:00, 05:30, 06:00, 06:30.
  //   TEMPO, INTER, PROB30 (plain, 30 < 40): WET POSSIBLE -> mode 25AD MARGINAL (passes dry only). No drying clock.
  //   PROB30 TEMPO and PROB40 TEMPO: nothing changes, the runway stays DRY and 25AD SUITABLE (owner, 25-10-2026).
  //   PROB40 (plain, 40 >= 40): WET -> mode 25AD UNSUITABLE in 05:00-06:30, and WET while drying 07:00 and 07:30
  //   (last wet slot ends 07:00, +60 min = 08:00) -> DRY from 08:00.
  // Mode 16AD (hdg 155): 150 is 5 degrees off -> 3.98 kt headwind, SUITABLE wet or dry.
  // Recommended mode, worked from the preference penalties (12 slots in the 6 h window, no traffic so a change costs 5):
  //   Mode 07A16D (arr 07 hdg 062: 150-62 = 88 degrees -> a 0.14 kt headwind; dep 16: headwind) is SUITABLE wet or dry, penalty 2 a slot.
  //   Mode 25A16D (arr 25: the 0.14 kt tailwind) is SUITABLE dry, MARGINAL in the 4 wet-possible slots: 12 x 2 + 4 x 3 = 36.
  //   SODPROPS (arr 34L hdg 335: 150-335 = -185 -> a 3.98 kt tailwind, above the 2 kt margin line) is MARGINAL in every slot: 12 x (0 + 3) = 36.
  //   Modes 34A25D / 34AD25 have the same 34L/34R tailwind: 12 x (2 + 3) = 60.   07A16D: 12 x 2 = 24, the cheapest, no change.
  const base = LIGHT_TAIL + ' 9999 SCT020';
  const m = metar(LIGHT_TAIL);
  const wp = ['05:00', '05:30', '06:00', '06:30'];
  it.each([['TEMPO'], ['INTER'], ['PROB30']])(
    '%s 2305/2307 SHRA is WET POSSIBLE: mode 25AD MARGINAL there, SUITABLE after, and the drying clock never starts',
    (group) => {
      const r = go({ metar: m, taf: taf(`${base} ${group} 2305/2307 4000 SHRA`), windowMinutes: 360 });
      for (const t of wp) {
        expect(r.out.evaluation.slots[at(r, t)]!.runwayState).toBe('WET_POSSIBLE');
        expect(cell(r, '25AD', t).status).toBe('MARGINAL');
        expect(cell(r, '16AD', t).status).toBe('SUITABLE');
      }
      expect(r.out.evaluation.slots[at(r, '07:00')]!.runwayState).toBe('DRY');
      expect(cell(r, '25AD', '07:00').status).toBe('SUITABLE');
      expect(cell(r, '25AD', '04:30').status).toBe('SUITABLE');
      expect(r.out.plan.recommendedModeId).toBe('07A16D');
      expect(new Set(chosen(r))).toEqual(new Set(['07A16D']));
      expect(r.out.plan.changes).toHaveLength(0);
    },
  );
  // PROB40 plain: wet in 05:00-07:30 (6 slots, see above). Mode 07A16D is a headwind on both ends, so it stays SUITABLE at 2 a
  // slot; 25A16D, SODPROPS and the 34 modes all fail the 0 kt wet limit (UNSUITABLE) there. 07A16D throughout, no change.
  it('PROB40 2305/2307 SHRA (no TEMPO) is WET, with 60 minutes of drying', () => {
    const r = go({ metar: m, taf: taf(`${base} PROB40 2305/2307 4000 SHRA`), windowMinutes: 360 });
    for (const t of [...wp, '07:00', '07:30']) {
      expect(r.out.evaluation.slots[at(r, t)]!.runwayState).toBe('WET');
      expect(cell(r, '25AD', t)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    }
    expect(r.out.evaluation.slots[at(r, '08:00')]!.runwayState).toBe('DRY');
    expect(cell(r, '25AD', '08:00').status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('07A16D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
  it.each([['PROB30 TEMPO'], ['PROB40 TEMPO']])('%s 2305/2307 SHRA changes nothing: DRY and 25AD SUITABLE throughout', (group) => {
    const r = go({ metar: m, taf: taf(`${base} ${group} 2305/2307 4000 SHRA`), windowMinutes: 360 });
    for (const t of [...wp, '07:00']) {
      expect(r.out.evaluation.slots[at(r, t)]!.runwayState).toBe('DRY');
      expect(cell(r, '25AD', t).status).toBe('SUITABLE');
    }
  });
  it('a PROB30 TEMPO with heavy thunderstorm text and its own wind changes nothing', () => {
    const r = go({ metar: m, taf: taf(`${base} PROB30 TEMPO 2305/2307 01020G30KT 1000 +TSRA BKN005`), windowMinutes: 360 });
    for (const t of [...wp, '07:00']) {
      expect(r.out.evaluation.slots[at(r, t)]!.runwayState).toBe('DRY');
      expect(cell(r, '25AD', t).status).toBe('SUITABLE');
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('E05 FM wind shift in two hours: the resilient mode is chosen first (OP-2, OP-6, section 11)', () => {
  // METAR 160/12 at 03:00. TAF: 160/12 until FM at 05:00, then 340/12. Window 4 h = 03:00-06:30 (8 slots).
  // Mode 16AD (hdg 155): 160 is 5 degrees off -> headwind 11.95 before; after FM dir-hdg = 185 -> tailwind 11.95 > 5.05 -> UNSUITABLE TW from slot 4 (05:00).
  // Modes 07AD (07 hdg 062) and 25AD (25 hdg 242): before FM dir-hdg = 98 and -82 -> a 1.67 kt tail / head wind, xw 11.88 <= 17;
  //   after FM dir-hdg = 278 and 98 -> the reverse 1.67 kt; never above the 2 kt margin line -> SUITABLE all 8 slots.
  // 25A16D and 07A16D use runway 16 (tailwind after FM), 34A25D/34AD25/34AD use 34 (tailwind before FM): each fails somewhere.
  // SODPROPS (arr 34L, dep 16) has an 11.95 kt tailwind on one end both before and after FM, so it never passes.
  // Plan, worked from the preference penalties and the 5 point unknown-demand change cost (no traffic is entered):
  //   07AD or 25AD throughout: 8 x 12 = 96, no change.
  //   25A16D slots 0-3 (4 x 2 = 8), then change (5) to 34A25D slots 4-7 (4 x 2 = 8) = 21, the cheapest. Ties at penalty 2 go to the
  //   mode first in modes.json (25A16D before 07A16D; 34A25D before 34AD25). Each stay is 110 min or 120 min, over the 60 min minimum.
  const r = go({ metar: metar(kt(160, 12)), taf: taf(`${kt(160, 12)} 9999 SCT020 FM230500 ${kt(340, 12)} 9999 SCT020`) });
  it('mode 16AD survives exactly 4 slots and fails on tailwind at 05:00', () => {
    const mi = r.pack.modes.findIndex((x) => x.id === '16AD');
    const s = r.out.evaluation.survival[mi]!;
    expect(s.viableSlots).toBe(4);
    expect(s.firstUnsuitableSlot).toBe(4);
    expect(s.firstUnsuitableCause).toBe('TW');
    expect(hhmm(r, 4)).toBe('05:00');
  });
  it('the two crosswind-only modes survive all 8 slots', () => {
    expect(statuses(r, '07AD').every((x) => x === 'SUITABLE')).toBe(true);
    expect(statuses(r, '25AD').every((x) => x === 'SUITABLE')).toBe(true);
  });
  it('recommends mode 25A16D now and changes to 34A25D at 05:00, the two cheapest modes either side of the shift', () => {
    expect(r.out.plan.recommendedModeId).toBe('25A16D');
    expect(r.out.plan.changes).toHaveLength(1);
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 4, fromModeId: '25A16D', toModeId: '34A25D' });
    expect(chosen(r)).toEqual(['25A16D', '25A16D', '25A16D', '25A16D', '34A25D', '34A25D', '34A25D', '34A25D']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E06 BECMG applies from its start time (WX-8, OD-20)', () => {
  // Base 250/10, BECMG 2305/2308 to 070/15 (the group's weather applies from 05:00, not gradually). Window 6 h.
  // Mode 25AD (hdg 242): 03:00-04:30 dir-hdg = 8 -> headwind 9.9 -> SUITABLE; from 05:00 dir-hdg = -172 -> tailwind 14.85 > 5.05 -> UNSUITABLE (also at 06:30 and 08:00).
  // Mode 07AD (hdg 062): the mirror image.  Modes 34AD (hdg 335) and 16AD (hdg 155) see the wind about 90 degrees off both ways:
  //   before, 250 is 85 degrees off 335 (a 0.87 kt headwind, xw 9.96) and 95 off 155 (a 0.87 kt tailwind); after, 070 is -265 off 335
  //   (a 1.31 kt tailwind, xw 14.94 <= 17) and -85 off 155 (a 1.31 kt headwind); never above the 2 kt margin line -> SUITABLE throughout.
  // SODPROPS (arr 34L hdg 335, dep 16 hdg 155) is those same two ends: every component is under 2 kt and xw is 9.96 / 14.94, so it is SUITABLE
  // in all 12 slots too, with penalty 0, the lowest. It is recommended with no change.
  const r = go({ metar: metar(kt(250, 10)), taf: taf(`${kt(250, 10)} 9999 SCT020 BECMG 2305/2308 ${kt(70, 15)}`), windowMinutes: 360 });
  it('mode 25AD flips at 05:00 exactly, not at 08:00', () => {
    expect(cell(r, '25AD', '04:30').status).toBe('SUITABLE');
    expect(cell(r, '25AD', '05:00')).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '25AD', '06:30').status).toBe('UNSUITABLE');
    expect(cell(r, '07AD', '04:30').status).toBe('UNSUITABLE');
    expect(cell(r, '07AD', '05:00').status).toBe('SUITABLE');
  });
  it('plans through the shift on SODPROPS, whose components stay small and whose preference is 0', () => {
    for (const id of ['SODPROPS', '34AD', '16AD']) expect(statuses(r, id).every((x) => x === 'SUITABLE')).toBe(true);
    expect(r.out.plan.recommendedModeId).toBe('SODPROPS');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E07 METAR governs its slot alone; the TAF is not consulted (owner, 24-10-2026, amending WX-7, OD-25)', () => {
  // METAR obs 03:00: 250/10, metarValidityMinutes 40. TAF: 250/10, FM 03:30 -> 070/10.
  // Slots 03:00 (age 0) and 03:30 (30 min after the observation, under 40) are METAR-governed. Slot 04:00 starts 60 min after it, outside
  // the window (strict <), so the TAF governs it directly.
  // Mode 25AD (hdg 242): METAR headwind 9.9 -> SUITABLE at 03:00 and at 03:30, unaffected by the TAF's worse view of 03:30 (FM 03:30 -> 070/10).
  //   From 04:00 the TAF's own 070/10 governs directly: dir-hdg = -172 -> tailwind 9.9 > 5.05 -> UNSUITABLE (no TAF
  //   reason needed, the TAF is simply the weather now).
  // Mode 07AD (hdg 062): METAR tailwind 9.9 -> UNSUITABLE at 03:00 and 03:30 (its own better TAF view does not apply here either);
  //   SUITABLE from 04:00 once the TAF (a headwind on 07) governs.
  const r = go({ metar: metar(kt(250, 10)), taf: taf(`${kt(250, 10)} 9999 SCT020 FM230330 ${kt(70, 10)} 9999 SCT020`) });
  it('slots 03:00 and 03:30 are METAR-governed; slot 04:00 (60 minutes after the observation) is TAF-governed', () => {
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('METAR');
    expect(r.out.evaluation.slots[1]!.governedBy).toBe('METAR');
    expect(r.out.evaluation.slots[2]!.governedBy).toBe('TAF');
  });
  it('mode 25AD: SUITABLE under the METAR, UNSUITABLE once the TAF governs, with no TAF reason while the METAR governed', () => {
    const first = cell(r, '25AD', '03:00');
    expect(first.status).toBe('SUITABLE');
    expect(first.reasons.some((x) => x.code === 'TAF')).toBe(false);
    expect(cell(r, '25AD', '03:30').status).toBe('SUITABLE');
    expect(cell(r, '25AD', '03:30').reasons.some((x) => x.code === 'TAF')).toBe(false);
    expect(cell(r, '25AD', '04:00').status).toBe('UNSUITABLE');
  });
  it('mode 07AD: UNSUITABLE under the METAR, SUITABLE once the TAF governs', () => {
    expect(cell(r, '07AD', '03:00').status).toBe('UNSUITABLE');
    expect(cell(r, '07AD', '03:30').status).toBe('UNSUITABLE');
    expect(cell(r, '07AD', '04:00').status).toBe('SUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E08 METAR only, TAF only, neither (WX-9, OP-13)', () => {
  it('METAR only: the METAR window is judged, later slots are UNKNOWN, the plan runs through them as uncertain', () => {
    // 250/10: 07AD fails (07 hdg 062: dir-hdg 188, tailwind 9.9). Every other mode is SUITABLE now: 25 (hdg 242) a 9.9 kt headwind;
    // 16 (hdg 155) a 0.87 kt tailwind, xw 9.96; 34 (hdg 335) a 0.87 kt headwind, xw 9.96. That includes SODPROPS (34L headwind,
    // 16 tailwind 0.87, under the 2 kt margin line), penalty 0, the lowest, so SODPROPS is recommended. Later slots have no weather, so
    // every cell is UNKNOWN (not UNSUITABLE); UNKNOWN cells cost only their preference, so SODPROPS also carries the rest of the plan.
    const r = go({ metar: metar(kt(250, 10)), taf: null });
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('METAR');
    expect(r.out.evaluation.slots.at(-1)!.governedBy).toBe('NONE');
    expect(cell(r, '25AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '25AD', 7).status).toBe('UNKNOWN');
    expect(r.out.plan.recommendedModeId).toBe('SODPROPS');
    expect(r.out.plan.uncertain).toBe(true);
    expect(r.built.banners.map((b) => b.code)).toContain('no-taf');
    // OD-57 (24-10-2026): the line names each uncertain period and its reason, periods joined by "; ". Worked by hand: slots 0 and 1
    // (03:00-04:00, both inside the 40 min METAR window) are uncertain because SODPROPS has a capacity and no traffic is entered, so
    // demand is not known; slots 2-7 (04:00-07:00) have no weather at all, so they are uncertain because nothing forecasts them.
    expect(r.out.explanation.uncertaintyLine).toMatch(/^03:00 UTC to 04:00 UTC: .*demand.*; 04:00 UTC to 07:00 UTC: .*forecast/);
  });
  it('TAF only: the TAF governs from slot 1 and slot 1 is DRY', () => {
    const r = go({ metar: null, taf: taf(LIGHT_TAIL + ' 9999 SCT020') });
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('TAF');
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '25AD', 0).status).toBe('SUITABLE');
    expect(r.built.banners.map((b) => b.code)).toContain('no-metar');
  });
  // WX-9 / WX-7 / WC-12 say slot 1 is DRY with no METAR; WC-9 says prevailing TAF rain makes a slot WET. The specific rule is taken: slot 1 DRY,
  // slot 2 WET (prevailing -RA in the TAF base group).
  it('TAF only with prevailing rain: slot 1 DRY by rule, later slots WET', () => {
    const r = go({ metar: null, taf: taf(LIGHT_TAIL + ' 9999 -RA SCT020') });
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '25AD', 0).status).toBe('SUITABLE');
    expect(r.out.evaluation.slots[1]!.runwayState).toBe('WET');
    expect(cell(r, '25AD', 1).status).toBe('UNSUITABLE');
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
  const tafOk = taf(LIGHT_TAIL + ' 9999 SCT020');
  it('a METAR 130 minutes old governs nothing: the TAF governs from slot 1, slot 1 is DRY even though the old METAR had rain', () => {
    // Old METAR 250/10 -RA; TAF 150/04: mode 25AD tailwind 0.14 is fine dry, fails wet. DRY + SUITABLE proves the METAR was not used.
    const r = go({ metar: metar(kt(250, 10), '-RA', '230100Z'), taf: tafOk });
    for (const s of r.out.evaluation.slots) expect(s.governedBy).toBe('TAF');
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '25AD', 0).status).toBe('SUITABLE');
    expect(r.built.banners.map((b) => b.code)).toContain('metar-stale');
    expect(r.built.metarAgeMinutes).toBe(130);
  });
  // The METAR window is 40 minutes: a METAR governs a slot only when the slot starts less than 40 minutes after the observation.
  it('a METAR observed 02:50Z (20 min old) governs slot 03:00 (10 min after observation) but not 03:30 (40 min)', () => {
    const r = go({ metar: metar(LIGHT_TAIL, '-RA', '230250Z'), taf: tafOk });
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('METAR');
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(r, '25AD', 0).status).toBe('UNSUITABLE');
    expect(r.out.evaluation.slots[1]!.governedBy).toBe('TAF');
    // Slot 03:30 has no rain of its own in the TAF, but the runway is held WET: the last wet slot ended 03:30 and drying runs 60 min.
    expect(r.out.evaluation.slots[1]!.runwayState).toBe('WET');
    expect(r.out.evaluation.slots[1]!.runwayStateCause).toBe('DRYING');
  });
  it('a METAR observed 02:20Z (50 min old, not stale) is outside its 40 minute window and governs nothing (slot 03:00 starts 40 minutes after it)', () => {
    const r = go({ metar: metar(LIGHT_TAIL, '-RA', '230220Z'), taf: tafOk });
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('TAF');
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '25AD', 0).status).toBe('SUITABLE');
    expect(r.built.banners.map((b) => b.code)).toContain('metar-outside-window');
    expect(r.built.banners.map((b) => b.code)).not.toContain('metar-stale');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E10 variable wind (OD-33, WC-11)', () => {
  // YSSY: calm 3, dry tailwind 5 (+0.05), crosswind 20.
  const vrb = (spd: string, wx = '') => go({ metar: metar(spd, wx), taf: taf(spd + ' 9999 SCT020') });
  const flying = ENABLED;
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
  // Direction range: 190/08 with 160V220. Mode 07AD (hdg 062): at 190, dir-hdg = 128 -> tailwind 8 cos 52 = 4.93 (<= 5.05, above the 2 kt line) -> MARGINAL.
  // Worst direction 220: dir-hdg = 158 -> tailwind 8 cos 22 = 7.42 > 5.05 -> UNSUITABLE. Mode 16AD (hdg 155): 160 to 220 is 5 to 65 degrees off,
  // always a headwind, xw at most 8 sin 65 = 7.25 -> SUITABLE either way.
  it('160V220 is tested at the worst direction in the range', () => {
    const fixed = go({ metar: metar(kt(190, 8)), taf: taf(kt(190, 8) + ' 9999 SCT020') });
    expect(cell(fixed, '07AD', 0).status).toBe('MARGINAL');
    const ranged = go({ metar: 'METAR YSSY 230300Z 19008KT 160V220 9999 FEW020 20/10 Q1015', taf: taf(kt(190, 8) + ' 9999 SCT020') });
    expect(cell(ranged, '07AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(ranged, '16AD', 0).status).toBe('SUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E11 weather in the vicinity never counts as wet (OD-34, WC-9)', () => {
  // Real SBFI METAR (VCSH VCTS), 090/10, replayed with YSSY runways. Mode 34AD (hdg 335): dir-hdg = -245 -> cos = -0.4226 -> tailwind 4.23:
  // dry: 4.23 > 2 (margin) and <= 5.05 -> MARGINAL;  wet would be UNSUITABLE (4.23 > 0.05).
  const sbfi = 'METAR SBFI 231400Z 09010KT 9999 VCSH VCTS BKN030 FEW040CB OVC080 23/19 Q1015';
  const NOW14 = '2026-10-23T14:10:00Z';
  it('VCSH VCTS in the METAR leaves slot 1 DRY; mode 34AD is MARGINAL (dry), not UNSUITABLE (wet)', () => {
    const r = run({ ref: YSSY_PACK, station: 'SBFI', nowIso: NOW14, metar: sbfi, taf: null, windowMinutes: 240 });
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('DRY');
    expect(cell(r, '34AD', 0).status).toBe('MARGINAL');
  });
  it('the same METAR with -SHRA (at the station) is WET and mode 34AD is UNSUITABLE', () => {
    const r = run({ ref: YSSY_PACK, station: 'SBFI', nowIso: NOW14, metar: sbfi.replace('VCSH VCTS', '-SHRA'), taf: null, windowMinutes: 240 });
    expect(r.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(r, '34AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
  // Real MYGF TAF: base VCSH, 050/12 for the whole period. Mode 16AD (hdg 155): dir-hdg = -105 -> tailwind 12 cos 75 = 3.11 -> MARGINAL dry; wet would be UNSUITABLE.
  it('a TAF with VCSH in its base group never makes a slot wet', () => {
    const raw = 'TAF MYGF 231100Z 2312/2412 05012KT 9999 VCSH SCT018 BKN040';
    const r = run({ ref: YSSY_PACK, station: 'MYGF', nowIso: NOW14, metar: null, taf: raw, windowMinutes: null });
    expect(r.out.evaluation.slots.length).toBeGreaterThan(20);
    for (const s of r.out.evaluation.slots) expect(s.runwayState).toBe('DRY');
    expect(cell(r, '16AD', 0).status).toBe('MARGINAL');
  });
  it.each([['TEMPO'], ['PROB40 TEMPO'], ['PROB40']])('%s with VCSH is not WET POSSIBLE either', (group) => {
    const r = go({ metar: metar(LIGHT_TAIL), taf: taf(`${LIGHT_TAIL} 9999 SCT020 ${group} 2305/2307 VCSH`), windowMinutes: 360 });
    for (const s of r.out.evaluation.slots) expect(s.runwayState).toBe('DRY');
    expect(cell(r, '25AD', '06:00').status).toBe('SUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('E13 capacity set on a copy of the pack (TR-6, OD-16, OD-24)', () => {
  // Copy of the YSSY pack with capacity 20 movements per hour on Mode 25A16D (10 per half-hour slot) and on SODPROPS, and the
  // capacity of every other mode taken away, so the only capacities are the two this test sets. Wind 250/10: 07AD and 07A16D fail
  // (a 9.9 kt tailwind on 07, hdg 062); SODPROPS, 25A16D, 34A25D, 34AD25, 34AD, 16AD and 25AD all pass on wind (see E08).
  const withCap: RunOptions['edit'] = (files) => {
    for (const m of files['modes.json'].modes as { id: string; capacity: number | null }[]) m.capacity = m.id === '25A16D' || m.id === 'SODPROPS' ? 20 : null;
  };
  const base = { edit: withCap, metar: metar(kt(250, 10)), taf: taf(kt(250, 10) + ' 9999 SCT020') };
  it('10 arrivals in a slot is at the limit and passes; 11 fails; unknown demand is never UNSUITABLE', () => {
    const r = go({ ...base, arrivals: [10, 11, 6, null, null, null, null, null] });
    expect(cell(r, '25A16D', 0).demand.capacityInSlot).toBe(10);
    expect(cell(r, '25A16D', 0).status).toBe('SUITABLE');
    expect(cell(r, '25A16D', 1)).toMatchObject({ status: 'UNSUITABLE', cause: 'CAP' });
    expect(cell(r, '25A16D', 2).status).toBe('SUITABLE');
    expect(cell(r, '25A16D', 3).status).not.toBe('UNSUITABLE');
    expect(cell(r, '25A16D', 3).uncertain).toBe(true);
    // A mode with no capacity is untouched by the same traffic.
    expect(cell(r, '34AD', 1).status).toBe('SUITABLE');
  });
  it('known arrivals plus known departures: 6 + 5 = 11 > 10 fails in slot 1', () => {
    const r = go({ ...base, arrivals: [6, 4, null, null, null, null, null, null], departures: [5, null, null, null, null, null, null, null] });
    expect(cell(r, '25A16D', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'CAP' });
    expect(cell(r, '25A16D', 1).status).toBe('SUITABLE');
  });
  // Plan (8 slots; arrivals 10, 11, 6, 6, ...; no departures known; a change costs the level of the slot it starts in, light 1 here):
  //   SODPROPS (penalty 0) and 25A16D (2) both carry 10 in slot 0 but fail slot 1 (11 > 10); from slot 2 (6 arrivals) both fit again.
  //   Mode 34A25D (no capacity, penalty 2) passes every slot and is the first penalty-2 mode in modes.json that passes the wind, so the plan
  //   starts there: it avoids SODPROPS at slot 0, because a SODPROPS stay of 20 minutes that must end at slot 1 costs a change (5, medium) plus
  //   the short-stay 25 (OD-74), far more than the 2 it saves.
  //   Best way back to SODPROPS: 34A25D slots 0-2 (3 x 2 = 6; the stay is 20 + 30 + 30 = 80 min, over the 60 minimum), a light change (1) at
  //   slot 3, SODPROPS slots 3-7 (0): 7 in all, against 16 for 34A25D throughout. Going back at slot 2 instead would end a 50 minute stay
  //   (under 60): 4 + 1 + 25 = 30, so slot 3 is the first slot worth changing.
  it('the plan avoids the modes that cannot carry the traffic: Mode 34A25D (34L/34R arrivals, 25 departures) from slot 0, back to SODPROPS at slot 3', () => {
    const r = go({ ...base, arrivals: [10, 11, 6, 6, 6, 6, 6, 6] });
    expect(r.out.plan.recommendedModeId).toBe('34A25D');
    expect(r.out.plan.changes).toHaveLength(1);
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 3, fromModeId: '34A25D', toModeId: 'SODPROPS' });
    expect(chosen(r)).toEqual(['34A25D', '34A25D', '34A25D', 'SODPROPS', 'SODPROPS', 'SODPROPS', 'SODPROPS', 'SODPROPS']);
  });
  // The shipped YSSY pack now carries the owner's provisional capacities, so "no capacity" is tested on a copy with every capacity removed:
  // no mode can then fail on traffic, and SODPROPS (penalty 0, SUITABLE on wind) is recommended with no change however busy slot 1 is.
  it('with no capacity on any mode (a copy of the pack with them removed) the same traffic changes nothing (SY-7)', () => {
    const noCapacity: RunOptions['edit'] = (files) => {
      for (const m of files['modes.json'].modes as { capacity: number | null }[]) m.capacity = null;
    };
    const r = go({ edit: noCapacity, metar: metar(kt(250, 10)), taf: taf(kt(250, 10) + ' 9999 SCT020'), arrivals: [10, 50, 6, 6, 6, 6, 6, 6] });
    expect(cell(r, '25A16D', 1).status).toBe('SUITABLE');
    expect(cell(r, 'SODPROPS', 1).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('SODPROPS');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E14 the current mode becomes unsuitable: red banner data and the replacement (UP-4, OD-21, OP-8)', () => {
  it('already unsuitable now: 070/10 with Mode 25AD current (tailwind 9.9 on runway 25)', () => {
    // 25 is hdg 242: dir-hdg = -172 -> tailwind 9.9 > 5.05, UNSUITABLE TW. Suitable at 070/10: 07AD (a 9.9 kt headwind), 07A16D, 16AD, 34AD (each
    // under a 1 kt tail/head component with xw 9.96) and SODPROPS (34L tailwind 0.87, 16 headwind, xw 9.96). The lowest penalty is SODPROPS (0).
    // Leaving the current mode in slot 0 costs the unknown-demand change 5, which any alternative needs too, so SODPROPS from slot 0 is the plan.
    const r = go({ metar: metar(kt(70, 10)), taf: taf(kt(70, 10) + ' 9999 SCT020'), current: '25AD' });
    expect(cell(r, '25AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(r.out.plan.startModeId).toBe('25AD');
    expect(r.out.plan.recommendedModeId).toBe('SODPROPS');
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 0, fromModeId: '25AD', toModeId: 'SODPROPS' });
    const co = r.out.changeovers[0]!;
    expect(co.trigger).toMatchObject({ slotIndex: 0, cause: 'TW' });
    expect(co.replacementModeId).toBe('SODPROPS');
  });
  it('becomes unsuitable at 05:00 (FM to 070/10): the trigger is the 05:00 slot and unknown traffic gives no early-change banner', () => {
    const r = go({ metar: metar(kt(250, 10)), taf: taf(`${kt(250, 10)} 9999 SCT020 FM230500 ${kt(70, 10)} 9999 SCT020`), current: '25AD' });
    expect(cell(r, '25AD', 3).status).toBe('SUITABLE');
    expect(cell(r, '25AD', 4).status).toBe('UNSUITABLE');
    expect(r.out.changeovers.length).toBeGreaterThan(0);
    expect(r.out.changeovers[0]!.trigger).toMatchObject({ slotIndex: 4, cause: 'TW' });
    expect(r.out.explanation.earlyChange).toBeNull();
    // The plan never sits in Mode 25AD from 05:00.
    expect(chosen(r).slice(4).every((m) => m !== '25AD')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E15 busy-traffic early change: banner only when the forced change is in strictly busier traffic (OP-6, OP-7)', () => {
  // METAR 160/12; FM 05:00 -> 340/12. Current mode 16AD (hdg 155: a headwind, then a 11.95 kt tailwind > 5.05 -> UNSUITABLE from slot 4).
  // Survivors of every slot are 07AD and 25AD only (1.67 kt components either way, see E05); SODPROPS never passes. Window 4 h: slots 0-3
  // before the shift, slot 4 is the forced slot.
  // Arrivals decide the level: light <= 10, medium 11-20, busy >= 21. Change cost: light 1, medium 5, busy 25 (charged in the slot where the new mode starts).
  // The two decisive tests below (medium before / busy after, and medium before / light after) run on a COPY of the pack where every mode
  // has the same preference (5) and no capacity, which is the situation these cases were written for: only change costs then differ, with
  // the real preferences (SODPROPS 0 ... 07AD 12) a cheaper mode always wins by preference, and the real capacities would remove 07AD and 25AD
  // at 15 or more arrivals a slot. The other tests keep the real pack.
  const wx = { metar: metar(kt(160, 12)), taf: taf(`${kt(160, 12)} 9999 SCT020 FM230500 ${kt(340, 12)} 9999 SCT020`), current: '16AD' };
  const traffic = (before: number | null, after: number | null) => [before, before, before, before, after, after, after, after];
  const flatPlan: RunOptions['edit'] = (files) => {
    for (const m of files['modes.json'].modes as { capacity: number | null }[]) m.capacity = null;
    for (const band of files['operating_plan.json'].bands as { rows: { penalty: number }[] }[]) for (const row of band.rows) row.penalty = 5;
  };

  // Flat preference 5, so a plan costs 8 x 5 = 40 plus its changes. Waiting for slot 4 means a busy change: 40 + 25 = 65. Changing early in
  // a medium slot to 07AD or 25AD (the survivors) and staying costs 40 + 5 = 45, so the early plan wins and the banner appears.
  it('medium before, busy at the forced slot: changing early costs 5, waiting costs 25 -> EARLY banner, change in a medium slot before 05:00', () => {
    const r = go({ ...wx, edit: flatPlan, arrivals: traffic(15, 22) });
    const early = r.out.explanation.earlyChange;
    expect(early).not.toBeNull();
    expect(early!.title).toBe(EARLY_CHANGE_TITLE);
    expect(early!.trafficAtChange).toBe('medium');
    expect(early!.trafficAtForced).toBe('busy');
    expect(early!.forcedStartMs).toBe(Date.parse('2026-10-23T05:00:00Z'));
    expect(early!.changeStartMs).toBeLessThan(early!.forcedStartMs);
    expect(['07AD', '25AD']).toContain(r.out.plan.changes[0]!.toModeId);
    expect(r.out.plan.changes[0]!.slotIndex).toBeLessThan(4);
  });
  it('light before, medium at the forced slot: strictly busier, early cost 1 < waiting cost 5 -> banner', () => {
    const r = go({ ...wx, arrivals: traffic(3, 15) });
    const early = r.out.explanation.earlyChange;
    expect(early).not.toBeNull();
    expect(early!.trafficAtChange).toBe('light');
    expect(early!.trafficAtForced).toBe('medium');
  });
  it('medium everywhere: waiting costs the same as changing early, so no banner', () => {
    const r = go({ ...wx, arrivals: traffic(15, 15) });
    expect(r.out.explanation.earlyChange).toBeNull();
  });
  it('busy everywhere: no banner', () => {
    const r = go({ ...wx, arrivals: traffic(22, 22) });
    expect(r.out.explanation.earlyChange).toBeNull();
  });
  // Flat preference 5: waiting for slot 4 costs a light change, 40 + 1 = 41; changing early in a medium slot costs 40 + 5 = 45. Waiting wins.
  it('medium before, light at the forced slot: waiting costs 1 < 5, so the plan waits for 05:00 and shows no banner', () => {
    const r = go({ ...wx, edit: flatPlan, arrivals: traffic(15, 3) });
    expect(r.out.explanation.earlyChange).toBeNull();
    expect(r.out.plan.changes[0]!.slotIndex).toBe(4);
    expect(r.out.plan.changes[0]!.fromModeId).toBe('16AD');
  });
  it('traffic unknown at the change slot: no banner (pre-emptive advice needs known traffic)', () => {
    const r = go({ ...wx, arrivals: traffic(null, 14) });
    expect(r.out.explanation.earlyChange).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('E16 no suitable mode (OD-13, OP-11)', () => {
  // 115/40: dir-hdg is +53 (07, hdg 062), -127 (25, hdg 242), -40 (16, hdg 155), -220 (34, hdg 335).
  //   07: xw 40 sin 53 = 31.9 > 20.05.   16: xw 40 sin 40 = 25.7 > 20.05.   25: tailwind 40 cos 53 = 24.1 > 5.05.   34: tailwind 40 cos 40 = 30.6 > 5.05.
  // Every runway fails, so every mode fails (SODPROPS uses 34L and 16, both of which fail).
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
  // After FM 05:00 the wind is 070/10, under which SODPROPS, 07A16D, 16AD, 34AD and 07AD all pass (E14). The lowest penalty is SODPROPS (0),
  // so it takes slot 4 on; 34AD (5) is also available again from 05:00. The gap is slots 0-3, with nothing to carry the plan before 05:00.
  it('a wind that eases at 05:00 restores modes from slot 4 and the gap is reported', () => {
    const e = go({ metar: metar(bad), taf: taf(`${bad} 9999 SCT020 FM230500 ${kt(70, 10)} 9999 SCT020`) });
    expect(e.out.plan.recommendedModeId).toBeNull();
    expect(e.out.plan.gaps[0]).toMatchObject({ startSlot: 0, endSlot: 3 });
    expect(chosen(e)[4]).toBe('SODPROPS');
    for (const id of ['SODPROPS', '34AD']) {
      const back = e.out.explanation.noSuitableMode!.perMode.find((b) => b.modeId === id)!;
      expect(back.availableFromMs).toBe(Date.parse('2026-10-23T05:00:00Z'));
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('E17 month rollover, real TAF with hour 24 (WX-3, OP-2)', () => {
  // taf-eham-month-rollover-becmg, replayed with YSSY runways. Valid 31-10 18Z to 02-11 00Z (3118/0124). Clock 01-11-2026 00:30Z.
  // Base 120/12; BECMG 3121/3124 -> 170/17 from 21:00Z on 31-10; BECMG 0103/0106 -> 210/25G35 from 03:00Z on 01-11.
  // Slot 1 is the slot containing now (00:30Z), so the window runs from 00:30Z on 01-11 to the validity end 00:00Z on 02-11: 47 slots.
  // 02:30Z: 170/17. Mode 16AD (hdg 155): dir-hdg = 15, xw 17 sin 15 = 4.4, headwind 16.4 -> SUITABLE.
  // 03:00Z onwards speed = gust 35 at 210: runway 16 (hdg 155) dir-hdg 55 -> xw 35 sin 55 = 28.7 -> Mode 16AD UNSUITABLE XW. Runway 25 (hdg 242):
  // dir-hdg -32 -> xw 35 sin 32 = 18.5, headwind 29.7: above 17 but within 20.05, so MARGINAL, not a failure. Runway 07 (hdg 062): dir-hdg 148 ->
  // tailwind 35 cos 32 = 29.7 fails; runway 34 (hdg 335): dir-hdg -125 -> tailwind 35 cos 55 = 20.1 fails.
  // So from 03:00Z (slot 5) every mode fails except 25AD, which is MARGINAL on its 18.5 kt crosswind (every other mode uses 16, 07 or 34).
  // Before 03:00Z (170/17): 25A16D is SUITABLE (25: dir-hdg -72, a 5.25 kt headwind, xw 16.2; 16: a headwind), penalty 2; 07 and 34 fail on tailwind.
  // Plan: 25A16D slots 0-4 (5 x 2 = 10), then a forced change (unknown demand, 5) to 25AD slots 5-46 (42 x (12 + 3 marginal)); 25AD all the way is dearer by 50.
  const raw = 'TAF TAF EHAM 311720Z 3118/0124 12012KT CAVOK /         BECMG 3121/3124 17017KT /         BECMG 0103/0106 21025G35KT';
  const r = run({ ref: YSSY_PACK, station: 'EHAM', nowIso: '2026-11-01T00:30:00Z', metar: null, taf: raw, windowMinutes: null });
  it('the window is 47 slots, 01-11-2026 00:30Z to 02-11-2026 00:00Z', () => {
    expect(r.out.evaluation.slots).toHaveLength(47);
    expect(r.out.evaluation.slots[0]!.startMs).toBe(Date.parse('2026-11-01T00:30:00Z'));
    expect(r.out.evaluation.slots.at(-1)!.endMs).toBe(Date.parse('2026-11-02T00:00:00Z'));
  });
  it('the first BECMG (started on 31-10) prevails at the start, the second applies from 03:00Z', () => {
    expect(cell(r, '16AD', '2026-11-01T02:30').status).toBe('SUITABLE');
    expect(cell(r, '16AD', '2026-11-01T03:00')).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(r, '16AD', 0).status).toBe('SUITABLE');
  });
  it('from 03:00Z every mode but 25AD fails, 25AD is MARGINAL, and the plan changes to it', () => {
    for (const id of ENABLED.filter((x) => x !== '25AD')) {
      expect(statuses(r, id).slice(5).every((s) => s === 'UNSUITABLE')).toBe(true);
    }
    expect(statuses(r, '25AD').slice(5).every((s) => s === 'MARGINAL')).toBe(true);
    expect(r.out.plan.gaps).toHaveLength(0);
    expect(r.out.plan.recommendedModeId).toBe('25A16D');
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 5, fromModeId: '25A16D', toModeId: '25AD' });
    expect(chosen(r).slice(5).every((m) => m === '25AD')).toBe(true);
  });
});

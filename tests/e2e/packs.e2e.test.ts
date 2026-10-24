// YR-12 part 1: end-to-end scenarios run on YSSY, TEST and TEST1, with every expected value worked by hand
// relative to each pack's own limits (docs/REQUIREMENTS.md WC-1, WC-8, WC-9, WC-10, WC-11, WC-13, TR-6, AG-11).
//
// Pack numbers (from refdata/airports/YSSY and tests/fixtures/*):
//                       YSSY     TEST (America/St_Johns)     TEST1 (Asia/Kathmandu)
//   station             YSSY     TSTW                        TSTX
//   tailwind dry / wet  5 / 0    8 / 2                       10 / 3
//   crosswind (modes)   20 all   EAST 15, WEST 18 (default), SPLIT 12     25 both
//   calm                3        4                           3
//   near-limit margin   3        2                           3
//   PROB wet threshold  40       30                          40
//   drying              60 min   90 min                      60 min
//   headings            07 070, 25 250, 16 160, 34 340     9 090, 27 270, 18 180, 36 360     3 030, 21 210
// Mode used: YSSY 25AD (runway 25) and 07AD (runway 07); TEST TST_EAST (runway 9), TST_WEST (27), TST_SPLIT (arr 18, dep 9 and 18);
// TEST1 ONLY_A (runway 3) and ONLY_B (21).
// Rule for a pure tailwind or crosswind of S knots against limit L with margin M and calm C:
//   S <= C -> no component (SUITABLE); S > L + 0.05 -> UNSUITABLE; L - M < S <= L + 0.05 -> MARGINAL; otherwise SUITABLE.
import { describe, expect, it } from 'vitest';
import { TEST1_PACK, TEST_PACK, YSSY_PACK, type PackRef } from '../helpers/packs';
import { at, cell, chosen, hhmm, kt, makePack, run, type RunOptions } from './pipeline';

const NOW = '2026-10-23T15:10:00Z';
const PACKS: readonly PackRef[] = [YSSY_PACK, TEST_PACK, TEST1_PACK];

function station(ref: PackRef): string {
  return makePack(ref).airport.weatherStation;
}
function metar(ref: PackRef, wind: string, wx = ''): string {
  return ['METAR', station(ref), '231500Z', wind, '9999', wx, 'FEW020 20/10 Q1015'].filter((x) => x !== '').join(' ');
}
function taf(ref: PackRef, body: string): string {
  return `TAF ${station(ref)} 231400Z 2315/2415 ${body}`;
}
function go(ref: PackRef, o: Partial<RunOptions> & { wind: string; wx?: string; tafBody?: string }) {
  return run({
    ref,
    nowIso: NOW,
    windowMinutes: 240,
    metar: metar(ref, o.wind, o.wx),
    taf: taf(ref, o.tafBody ?? `${o.wind} 9999 SCT020`),
    ...o,
  });
}

interface Row {
  readonly ref: PackRef;
  readonly mode: string;
  readonly dir: number;
  readonly speed: number;
  readonly want: string;
}
const label = (r: Row) => `${r.ref.name} ${r.mode} ${kt(r.dir, r.speed)} -> ${r.want}`;

// ---------------------------------------------------------------------------------------------
describe('P1 dry tailwind at the limit, relative to each pack (WC-1, WC-11, WC-13)', () => {
  // Wind from directly behind the runway (heading + 180).
  const rows: Row[] = [
    // YSSY 25AD, hdg 250, wind from 070: limit 5, margin 3, calm 3.
    { ref: YSSY_PACK, mode: '25AD', dir: 70, speed: 3, want: 'SUITABLE' }, // 3 <= calm: no tailwind
    { ref: YSSY_PACK, mode: '25AD', dir: 70, speed: 4, want: 'MARGINAL' }, // 4 > 5 - 3
    { ref: YSSY_PACK, mode: '25AD', dir: 70, speed: 5, want: 'MARGINAL' }, // on the limit
    { ref: YSSY_PACK, mode: '25AD', dir: 70, speed: 6, want: 'UNSUITABLE' }, // 6 > 5.05
    // TEST TST_EAST, hdg 90, wind from 270: limit 8, margin 2, calm 4.
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 270, speed: 4, want: 'SUITABLE' }, // calm
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 270, speed: 5, want: 'SUITABLE' }, // 5 <= 6
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 270, speed: 7, want: 'MARGINAL' }, // 6 < 7 <= 8.05
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 270, speed: 8, want: 'MARGINAL' },
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 270, speed: 9, want: 'UNSUITABLE' }, // 9 > 8.05
    // TEST1 ONLY_A, hdg 30, wind from 210: limit 10, margin 3, calm 3.
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 210, speed: 3, want: 'SUITABLE' }, // calm
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 210, speed: 6, want: 'SUITABLE' }, // 6 <= 7
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 210, speed: 8, want: 'MARGINAL' }, // 7 < 8 <= 10.05
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 210, speed: 10, want: 'MARGINAL' },
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 210, speed: 11, want: 'UNSUITABLE' }, // 11 > 10.05
  ];
  it.each(rows.map((r) => [label(r), r] as const))('%s', (_n, r) => {
    const res = go(r.ref, { wind: kt(r.dir, r.speed) });
    expect(cell(res, r.mode, 0).status).toBe(r.want);
    if (r.want === 'UNSUITABLE') expect(cell(res, r.mode, 0).cause).toBe('TW');
  });
});

// ---------------------------------------------------------------------------------------------
describe('P2 wet runway from a METAR with rain, relative to each pack (WC-1, WC-12, WC-13)', () => {
  const rows: Row[] = [
    // Pure tailwind with rain. YSSY wet limit 0.
    { ref: YSSY_PACK, mode: '25AD', dir: 70, speed: 3, want: 'SUITABLE' }, // calm
    { ref: YSSY_PACK, mode: '25AD', dir: 70, speed: 4, want: 'UNSUITABLE' }, // 4 > 0.05
    // TEST wet limit 2, calm 4.
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 270, speed: 4, want: 'SUITABLE' }, // calm
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 270, speed: 5, want: 'UNSUITABLE' }, // 5 > 2.05
    // TEST1 wet limit 3, calm 3.
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 210, speed: 3, want: 'SUITABLE' }, // calm
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 210, speed: 4, want: 'UNSUITABLE' }, // 4 > 3.05
    // Wet headwind: always fine.
    { ref: YSSY_PACK, mode: '25AD', dir: 250, speed: 10, want: 'SUITABLE' },
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 90, speed: 10, want: 'SUITABLE' },
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 30, speed: 10, want: 'SUITABLE' },
  ];
  it.each(rows.map((r) => [label(r), r] as const))('wet: %s', (_n, r) => {
    const res = go(r.ref, { wind: kt(r.dir, r.speed), wx: '-RA' });
    expect(res.out.evaluation.slots[0]!.runwayState).toBe('WET');
    expect(cell(res, r.mode, 0).status).toBe(r.want);
  });
  // A small tailwind component above zero, with the wind above calm.
  //   TEST EAST (hdg 90): 198/05 -> dir-hdg = 108 -> tailwind = -5 cos 108 = 1.545. Wet limit 2 (<= 2.05) and above zero -> MARGINAL; dry: 1.545 <= 6 -> SUITABLE.
  //   TEST1 ONLY_A (hdg 30): 142/04 -> dir-hdg = 112 -> tailwind 1.498. Wet limit 3 -> MARGINAL; dry limit 10 -> SUITABLE.
  //   YSSY 25AD (hdg 250): 158/04 -> tailwind 0.140 > 0.05 -> wet UNSUITABLE (a 0 kt limit has no margin); dry SUITABLE.
  it.each([
    [YSSY_PACK, '25AD', 158, 4, 'SUITABLE', 'UNSUITABLE'],
    [TEST_PACK, 'TST_EAST', 198, 5, 'SUITABLE', 'MARGINAL'],
    [TEST1_PACK, 'ONLY_A', 142, 4, 'SUITABLE', 'MARGINAL'],
  ] as const)('%s small tailwind: dry and wet', (ref, mode, dir, spd, dry, wet) => {
    expect(cell(go(ref, { wind: kt(dir, spd) }), mode, 0).status).toBe(dry);
    expect(cell(go(ref, { wind: kt(dir, spd), wx: '-RA' }), mode, 0).status).toBe(wet);
  });
});

// ---------------------------------------------------------------------------------------------
describe('P3 crosswind against each mode\'s own limit (WC-7, WC-8)', () => {
  const rows: Row[] = [
    // YSSY 07AD (hdg 70), wind from 160: pure crosswind, limit 20, margin 3.
    { ref: YSSY_PACK, mode: '07AD', dir: 160, speed: 16, want: 'SUITABLE' },
    { ref: YSSY_PACK, mode: '07AD', dir: 160, speed: 18, want: 'MARGINAL' },
    { ref: YSSY_PACK, mode: '07AD', dir: 160, speed: 20, want: 'MARGINAL' },
    { ref: YSSY_PACK, mode: '07AD', dir: 160, speed: 21, want: 'UNSUITABLE' },
    // TEST, wind from 180: runway 9 and 27 see it as a pure crosswind. EAST limit 15 (margin 2), WEST default 18, SPLIT 12 (runway 9 departures).
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 180, speed: 12, want: 'SUITABLE' }, // 12 <= 13
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 180, speed: 14, want: 'MARGINAL' },
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 180, speed: 15, want: 'MARGINAL' },
    { ref: TEST_PACK, mode: 'TST_EAST', dir: 180, speed: 16, want: 'UNSUITABLE' }, // 16 > 15.05
    { ref: TEST_PACK, mode: 'TST_WEST', dir: 180, speed: 15, want: 'SUITABLE' }, // 15 <= 16
    { ref: TEST_PACK, mode: 'TST_WEST', dir: 180, speed: 17, want: 'MARGINAL' },
    { ref: TEST_PACK, mode: 'TST_WEST', dir: 180, speed: 18, want: 'MARGINAL' },
    { ref: TEST_PACK, mode: 'TST_WEST', dir: 180, speed: 19, want: 'UNSUITABLE' }, // 19 > 18.05
    { ref: TEST_PACK, mode: 'TST_SPLIT', dir: 180, speed: 9, want: 'SUITABLE' }, // 9 <= 10
    { ref: TEST_PACK, mode: 'TST_SPLIT', dir: 180, speed: 11, want: 'MARGINAL' },
    { ref: TEST_PACK, mode: 'TST_SPLIT', dir: 180, speed: 12, want: 'MARGINAL' },
    { ref: TEST_PACK, mode: 'TST_SPLIT', dir: 180, speed: 13, want: 'UNSUITABLE' }, // 13 > 12.05
    // TEST1 ONLY_A (hdg 30), wind from 120: crosswind limit 25, margin 3.
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 120, speed: 20, want: 'SUITABLE' }, // 20 <= 22
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 120, speed: 24, want: 'MARGINAL' },
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 120, speed: 25, want: 'MARGINAL' },
    { ref: TEST1_PACK, mode: 'ONLY_A', dir: 120, speed: 26, want: 'UNSUITABLE' }, // 26 > 25.05
  ];
  it.each(rows.map((r) => [label(r), r] as const))('%s', (_n, r) => {
    const res = go(r.ref, { wind: kt(r.dir, r.speed) });
    const c = cell(res, r.mode, 0);
    expect(c.status).toBe(r.want);
    if (r.want === 'UNSUITABLE') expect(c.cause).toBe('XW');
  });
  // One mode closes and the other does not.
  it('TEST 180/17: EAST (15) and SPLIT (12) are closed, WEST (default 18) stays open as MARGINAL; the plan uses WEST', () => {
    const res = go(TEST_PACK, { wind: kt(180, 17) });
    expect(cell(res, 'TST_EAST', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(res, 'TST_SPLIT', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(res, 'TST_WEST', 0).status).toBe('MARGINAL'); // 17 > 18 - 2
    expect(cell(res, 'TST_WEST', 0).reasons.find((x) => x.code === 'XW')?.limit).toBe(18);
    expect(res.out.plan.recommendedModeId).toBe('TST_WEST');
  });
  it('TEST1 030/30: ONLY_A has a 30 kt headwind, ONLY_B a 30 kt tailwind (> 10.05) and is closed', () => {
    const res = go(TEST1_PACK, { wind: kt(30, 30) });
    expect(cell(res, 'ONLY_A', 0).status).toBe('SUITABLE');
    expect(cell(res, 'ONLY_B', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(res.out.plan.recommendedModeId).toBe('ONLY_A');
  });
  it('changing the limit in the pack data changes the result with no code change (section 11)', () => {
    const tight = go(YSSY_PACK, {
      wind: kt(160, 16),
      edit: (f) => {
        f['modes.json'].modes.find((m: { id: string }) => m.id === '07AD').maxCrosswindKt = 15;
      },
    });
    // 16 kt crosswind on a 15 kt limit: 16 > 15.05.
    expect(cell(tight, '07AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(tight, '25AD', 0).status).toBe('SUITABLE'); // 25: 160 is 90 degrees off, 16 <= 17 on the untouched 20 kt limit
  });
});

// ---------------------------------------------------------------------------------------------
describe('P4 forecast wet threshold and drying time follow the pack (WC-9, WC-10)', () => {
  // Overlay 2317/2319 covers slots starting 17:00, 17:30, 18:00, 18:30 (Z). Calm wind everywhere, so only runwayState is read.
  //   PROB30 (no TEMPO), rain: WET on TEST (30 >= 30), WET POSSIBLE on YSSY and TEST1 (30 < 40).
  //   PROB40 (no TEMPO): WET on all three (40 >= 40 and 40 >= 30).
  //   PROB30 TEMPO and TEMPO: WET POSSIBLE on all three.
  const calmWind = '00000KT';
  const state = (ref: PackRef, group: string) => {
    const res = go(ref, { wind: calmWind, tafBody: `${calmWind} 9999 SCT020 ${group} 2317/2319 4000 RA`, windowMinutes: 360 });
    return res.out.evaluation.slots[at(res, '17:30')]!.runwayState;
  };
  it.each([
    ['PROB30', { YSSY: 'WET_POSSIBLE', TEST: 'WET', TEST1: 'WET_POSSIBLE' }],
    ['PROB40', { YSSY: 'WET', TEST: 'WET', TEST1: 'WET' }],
    ['PROB30 TEMPO', { YSSY: 'WET_POSSIBLE', TEST: 'WET_POSSIBLE', TEST1: 'WET_POSSIBLE' }],
    ['PROB40 TEMPO', { YSSY: 'WET_POSSIBLE', TEST: 'WET_POSSIBLE', TEST1: 'WET_POSSIBLE' }],
    ['TEMPO', { YSSY: 'WET_POSSIBLE', TEST: 'WET_POSSIBLE', TEST1: 'WET_POSSIBLE' }],
  ] as const)('%s 2317/2319 RA: runway state at 17:30Z', (group, want) => {
    for (const ref of PACKS) expect(state(ref, group), `${ref.name} ${group}`).toBe(want[ref.name as 'YSSY' | 'TEST' | 'TEST1']);
  });
  // METAR rain at slot 0 (15:00-15:30). The last wet slot ends 15:30 at the earliest (16:00 if the METAR also wets 15:30).
  // WET for sure while start < 15:30 + drying - 30 min (i.e. before the earliest dry time minus a slot) and DRY for sure from 16:00 + drying.
  //   drying 60 (YSSY, TEST1): WET at 15:00, 15:30, 16:00; DRY from 17:00.     drying 90 (TEST): WET at 15:00-16:30; DRY from 17:30.
  it.each([
    [YSSY_PACK, ['15:00', '15:30', '16:00'], '17:00'],
    [TEST1_PACK, ['15:00', '15:30', '16:00'], '17:00'],
    [TEST_PACK, ['15:00', '15:30', '16:00', '16:30'], '17:30'],
  ] as const)('%s: drying time from the pack', (ref, wet, dry) => {
    const res = go(ref, { wind: '00000KT', wx: '-RA' });
    for (const t of wet) expect(res.out.evaluation.slots[at(res, t)]!.runwayState, `${ref.name} ${t}`).toBe('WET');
    expect(res.out.evaluation.slots[at(res, dry)]!.runwayState, `${ref.name} ${dry}`).toBe('DRY');
  });
});

// ---------------------------------------------------------------------------------------------
describe('P5 half-hour-offset time zone with the fictional TEST pack (AG-5, WX-5)', () => {
  // TEST: America/St_Johns, NST UTC-3:30, NDT UTC-2:30. Daylight saving ends 01-11-2026 at 02:00 NDT (= 04:30Z).
  // Bands: early 06:30-22:30 (EAST 2, SPLIT 10, WEST default 5); late 22:30-06:30 (WEST 0, SPLIT default 5, EAST not allowed).
  // Calm wind, so every mode passes on weather and only the plan band and the penalties decide.
  const calmMetar = (obs: string) => `METAR TSTW ${obs} 00000KT 9999 FEW020 10/05 Q1015`;
  const bandIds = (r: ReturnType<typeof run>) => r.out.evaluation.slots.map((s) => s.bandId);

  it('in NDT (24-10-2026): 01:00Z is 22:30 local, the first slot of the late band', () => {
    const r = run({
      ref: TEST_PACK,
      nowIso: '2026-10-24T00:10:00Z',
      metar: calmMetar('240000Z'),
      taf: 'TAF TSTW 232300Z 2400/2424 00000KT 9999 SCT020',
      windowMinutes: 240,
    });
    expect(hhmm(r, 0)).toBe('00:00');
    expect(bandIds(r)).toEqual(['early', 'early', 'late', 'late', 'late', 'late', 'late', 'late']);
    expect(cell(r, 'TST_EAST', 1).status).toBe('SUITABLE');
    expect(cell(r, 'TST_EAST', 2)).toMatchObject({ status: 'UNSUITABLE', cause: 'PLAN' });
    // Plan: EAST x2 (2+2) + change (unknown traffic: 5) + WEST x6 (0) = 9, against WEST throughout 5+5+0 = 10.
    expect(chosen(r)).toEqual(['TST_EAST', 'TST_EAST', 'TST_WEST', 'TST_WEST', 'TST_WEST', 'TST_WEST', 'TST_WEST', 'TST_WEST']);
  });
  it('in NST (02-11-2026, after the change): 02:00Z is 22:30 local; a fixed NDT offset would be an hour out', () => {
    const r = run({
      ref: TEST_PACK,
      nowIso: '2026-11-02T01:40:00Z',
      metar: calmMetar('020130Z'),
      taf: 'TAF TSTW 020100Z 0201/0301 00000KT 9999 SCT020',
      windowMinutes: 240,
    });
    expect(hhmm(r, 0)).toBe('01:30');
    expect(bandIds(r)).toEqual(['early', 'late', 'late', 'late', 'late', 'late', 'late', 'late']);
    expect(cell(r, 'TST_EAST', 0).status).toBe('SUITABLE'); // 22:00 NST
    expect(cell(r, 'TST_EAST', 1)).toMatchObject({ status: 'UNSUITABLE', cause: 'PLAN' });
    // EAST then WEST: 2 + 5 + 0 = 7; WEST throughout: 5 + 0 = 5. So WEST for every slot.
    expect(new Set(chosen(r))).toEqual(new Set(['TST_WEST']));
  });
  it('the morning end of the late band is 06:30 local: 09:00Z in NDT (08:30Z is 06:00, still late)', () => {
    const r = run({
      ref: TEST_PACK,
      nowIso: '2026-10-24T08:10:00Z',
      metar: calmMetar('240800Z'),
      taf: 'TAF TSTW 240700Z 2408/2508 00000KT 9999 SCT020',
      windowMinutes: 240,
    });
    expect(hhmm(r, 0)).toBe('08:00');
    expect(bandIds(r).slice(0, 4)).toEqual(['late', 'late', 'early', 'early']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('P6 capacity on the TEST packs (TR-6)', () => {
  // TEST: TST_EAST has capacity 20 per hour = 10 per half-hour slot. Calm wind. 15:10Z is 12:40 NDT, early band.
  it('TEST: 10 arrivals pass, 11 fail, known arrivals + departures count, the other modes are unaffected', () => {
    const r = go(TEST_PACK, { wind: '00000KT', arrivals: [10, 11, 6, null, null, null, null, null], departures: [null, null, null, null, null, null, null, null] });
    expect(cell(r, 'TST_EAST', 0).demand.capacityInSlot).toBe(10);
    expect(cell(r, 'TST_EAST', 0).status).toBe('SUITABLE');
    expect(cell(r, 'TST_EAST', 1)).toMatchObject({ status: 'UNSUITABLE', cause: 'CAP' });
    expect(cell(r, 'TST_WEST', 1).status).toBe('SUITABLE');
    expect(cell(r, 'TST_SPLIT', 1).status).toBe('SUITABLE');
    const d = go(TEST_PACK, { wind: '00000KT', arrivals: [6, 4, null, null, null, null, null, null], departures: [5, null, null, null, null, null, null, null] });
    expect(cell(d, 'TST_EAST', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'CAP' }); // 6 + 5 = 11 > 10
    expect(cell(d, 'TST_EAST', 1).status).toBe('SUITABLE');
  });
  // TEST1 has no capacity. On a copy, ONLY_A gets 14 per hour = 7 per slot.
  it('TEST1 copy with capacity 14: 7 arrivals pass, 8 fail', () => {
    const edit: RunOptions['edit'] = (f) => {
      f['modes.json'].modes.find((m: { id: string }) => m.id === 'ONLY_A').capacity = 14;
    };
    const r = go(TEST1_PACK, { wind: '00000KT', edit, arrivals: [7, 8, 7, 8, null, null, null, null] });
    expect(cell(r, 'ONLY_A', 0).status).toBe('SUITABLE');
    expect(cell(r, 'ONLY_A', 1)).toMatchObject({ status: 'UNSUITABLE', cause: 'CAP' });
    expect(cell(r, 'ONLY_B', 1).status).toBe('SUITABLE');
    expect(cell(r, 'ONLY_A', 4).status).not.toBe('UNSUITABLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('P7 no suitable mode on every pack (OD-13, OP-11)', () => {
  // A very strong wind from a direction that is more than 30 degrees off every runway axis (so crosswind > 25 kt at 60 kt)
  // and, where it is behind a runway, far beyond every tailwind limit.
  //   YSSY 115/40 (see the YSSY file). TEST 135/50: runways 9, 27, 18, 36 are 45 degrees off, xw 35 > 18.05/15.05/12.05 and tail 35 > 8.05.
  //   TEST1 120/60 is perpendicular to 3 and 21: xw 60 > 25.05.
  it.each([
    [YSSY_PACK, kt(115, 40)],
    [TEST_PACK, kt(135, 50)],
    [TEST1_PACK, kt(120, 60)],
  ] as const)('%s', (ref, wind) => {
    const r = go(ref, { wind });
    expect(r.out.plan.recommendedModeId).toBeNull();
    expect(r.out.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
    expect(r.out.explanation.noSuitableMode?.title).toBe('NO SUITABLE STANDARD MODE IDENTIFIED');
    const enabled = r.pack.modes.filter((m) => m.enabled).map((m) => m.id);
    expect(r.out.explanation.noSuitableMode!.perMode.map((b) => b.modeId).sort()).toEqual([...enabled].sort());
    for (const id of enabled) expect(cell(r, id, 0).status).toBe('UNSUITABLE');
    expect(chosen(r).every((m) => m === null)).toBe(true);
  });
});

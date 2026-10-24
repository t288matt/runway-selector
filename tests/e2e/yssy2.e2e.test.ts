// YR-12 part 1, second YSSY file: preference against change cost, wrap-around and range directions, gusts,
// mid-slot FM, month-rollover METAR, and TAF-wet in the METAR window. Hand-worked from docs/REQUIREMENTS.md
// before the engine was read; pack numbers as in yssy.e2e.test.ts (YSSY: headings 07 062, 25 242, 16 155, 34 335; tail dry 5 /
// wet 0, xw 20, calm 3, margin 3; one all-day band: SODPROPS 0, 25A16D / 34A25D / 34AD25 / 07A16D 2, 34AD / 16AD 5, 07AD / 25AD 12;
// change light 1 / medium 5 / busy 25, unknown 5; minimum stay 60 min with a 25 point penalty; METAR window 30 min).
import { describe, expect, it } from 'vitest';
import { YSSY_PACK } from '../helpers/packs';
import { at, cell, chosen, kt, run, type RunOptions } from './pipeline';

const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string, wx = '', obs = '230300Z') => ['METAR YSSY', obs, wind, '9999', wx, 'FEW020 20/10 Q1015'].filter((x) => x !== '').join(' ');
const taf = (body: string, valid = '2303/2403') => `TAF YSSY 230200Z ${valid} ${body}`;
const go = (o: Partial<RunOptions>) => run({ ref: YSSY_PACK, nowIso: NOW, windowMinutes: 240, ...o });

// E18 used to be about the removed curfew mode's night preference (YR-20b). The same rule, a higher preference lasting only part of
// the window weighed against the change cost, is tested here on the single all-day plan, with SODPROPS (penalty 0) as the preferred mode.
describe('E18 a higher operating-plan preference lasting part of the window is weighed against the change cost (section 11, OP-6, OD-18, OD-74)', () => {
  // TAF only, now 03:10Z (slot 0 = 03:00-03:30). Wind 250/10, then FM to 160/10 at 05:00 (slot 4) in the first test, at 03:30 (slot 1) in the second.
  //   250/10: SODPROPS passes (arr 34L: dir-hdg -85, a 0.87 kt headwind; dep 16: a 0.87 kt tailwind; xw 9.96), and so does 25A16D (25 hdg 242:
  //   a 9.9 kt headwind; 16 a 0.87 kt tailwind).
  //   160/10: SODPROPS fails (arr 34L: dir-hdg -175, a 9.96 kt tailwind). 25A16D still passes (25: dir-hdg -82, a 1.39 kt headwind, xw 9.9; 16: dir-hdg 5, a headwind).
  // The copy of the pack has no capacities, so traffic only sets the change cost (light 1, medium 5, busy 25, by arrivals 0-10, 11-20, 21+).
  const noCapacity: RunOptions['edit'] = (files) => {
    for (const m of files['modes.json'].modes as { capacity: number | null }[]) m.capacity = null;
  };
  const all = (n: number) => Array.from({ length: 8 }, () => n);
  const tafWith = (fm: string) => `TAF YSSY 230200Z 2303/2403 ${kt(250, 10)} 9999 SCT020 FM${fm} ${kt(160, 10)} 9999 SCT020`;
  // Plan A: SODPROPS slots 0-3 (0), a change to 25A16D at slot 4 (c), then 4 x 2 = 8:  8 + c. The SODPROPS stay is 20 + 3 x 30 = 110 min, over the minimum.
  // Plan B: 25A16D throughout: 8 x 2 = 16, no change. A beats B when c < 8: light (1) and medium (5) yes; busy (25) no.
  it.each([
    ['light', 3],
    ['medium', 15],
  ] as const)('%s traffic: SODPROPS while it passes, then 25A16D when the wind turns at 05:00', (_l, n) => {
    const r = go({ edit: noCapacity, metar: null, taf: tafWith('230500'), arrivals: all(n) });
    expect(chosen(r)).toEqual(['SODPROPS', 'SODPROPS', 'SODPROPS', 'SODPROPS', '25A16D', '25A16D', '25A16D', '25A16D']);
    expect(r.out.plan.recommendedModeId).toBe('SODPROPS');
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 4, fromModeId: 'SODPROPS', toModeId: '25A16D' });
  });
  it('busy traffic: the 25 point change costs more than the 8 point preference gain, so 25A16D throughout', () => {
    const r = go({ edit: noCapacity, metar: null, taf: tafWith('230500'), arrivals: all(22) });
    expect(new Set(chosen(r))).toEqual(new Set(['25A16D']));
    expect(r.out.plan.changes).toHaveLength(0);
  });
  // The wind turns at 03:30, so SODPROPS passes slot 0 only (20 minutes left). Plan A: SODPROPS 0, a light change (1), a stay under the
  // 60 minute minimum (+25), then 7 x 2 = 14:  40. Plan B: 25A16D throughout, 16. B wins even in light traffic, because a stay that short is
  // not worth a change (OD-74).
  it('a SODPROPS stay shorter than the minimum is not worth a change, even in light traffic', () => {
    const r = go({ edit: noCapacity, metar: null, taf: tafWith('230330'), arrivals: all(3) });
    expect(new Set(chosen(r))).toEqual(new Set(['25A16D']));
    expect(r.out.plan.recommendedModeId).toBe('25A16D');
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('E19 directions: wrap through north, ranges that cross north, gusts, mid-slot FM (WC-2, WC-3, WC-11, OP-2)', () => {
  // Wind from 360 (36010KT), the direction wraps through north. Mode 34AD (hdg 335): dir-hdg = 25 -> headwind 9.06, xw 4.23 -> SUITABLE.
  // Mode 16AD (hdg 155): dir-hdg = 205 -> cos = -0.90631 -> tailwind 9.063 > 5.05 -> UNSUITABLE TW. Mode 07AD (hdg 062): dir-hdg = 298 ->
  // cos = 0.46947 -> headwind 4.69, xw 10 x |sin 298| = 8.83 <= 17 -> SUITABLE.
  it('wind from 360 (36010KT): Mode 34AD (hdg 335) headwind 9.1; Mode 16AD (hdg 155) tailwind 9.1 > 5.05; Mode 07AD (hdg 062) headwind 4.7, crosswind 8.8', () => {
    const r = go({ metar: metar('36010KT'), taf: taf('36010KT 9999 SCT020') });
    expect(cell(r, '34AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '16AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '07AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '16AD', 0).runways[0]!.tailwindKt).toBeCloseTo(9.063, 3);
  });
  // 020/06 with range 340V040 (clockwise through north). Mode 16AD (hdg 155): tailwind = -6 cos(D-155). At the mean 020: cos(-135) = -0.7071 -> 4.24: MARGINAL.
  // At 340 (in the range): cos(185) = -0.9962 -> 5.98 > 5.05 -> UNSUITABLE. Mode 34AD (hdg 335) sees every direction 340-040 as a headwind (<= 60 degrees off): SUITABLE;
  // reading the range the long way round (040 -> 340) would put a 6 kt tailwind on it.
  it('340V040 is the short arc through north: Mode 16AD UNSUITABLE (tailwind 6.0), Mode 34AD SUITABLE; without the range Mode 16AD is MARGINAL', () => {
    const ranged = go({ metar: metar('02006KT 340V040'), taf: taf('02006KT 9999 SCT020') });
    expect(cell(ranged, '16AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(ranged, '34AD', 0).status).toBe('SUITABLE');
    const plain = go({ metar: metar('02006KT'), taf: taf('02006KT 9999 SCT020') });
    expect(cell(plain, '16AD', 0).status).toBe('MARGINAL');
  });
  // 070/12 gusting 26: the stronger of mean and gust is used, 26. Mode 16AD (hdg 155): dir-hdg -85 -> crosswind 25.9 > 20.05. Without the gust 12 sin 85 = 11.95 <= 17: SUITABLE.
  it('a gust is used in place of the mean wind', () => {
    const gust = go({ metar: metar('07012G26KT'), taf: taf('07012G26KT 9999 SCT020') });
    expect(cell(gust, '16AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'XW' });
    expect(cell(gust, '07AD', 0).status).toBe('SUITABLE'); // headwind 26 on runway 07
    const steady = go({ metar: metar('07012KT'), taf: taf('07012KT 9999 SCT020') });
    expect(cell(steady, '16AD', 0).status).toBe('SUITABLE');
  });
  // FM 04:45 applies to the slot that CONTAINS its start (04:30), not to 05:00 (OP-2). 04:00 is the first TAF-governed slot.
  it('an FM at 04:45 changes the 04:30 slot, not the 05:00 one', () => {
    const r = go({ metar: metar(kt(250, 10)), taf: taf(`${kt(250, 10)} 9999 SCT020 FM230445 ${kt(70, 10)} 9999 SCT020`) });
    expect(cell(r, '25AD', '04:00').status).toBe('SUITABLE');
    expect(cell(r, '25AD', '04:30')).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
  });
});

describe('E20 METAR date resolution across a month end, and a METAR slightly ahead of the clock (WX-1, section 6 "Report entry")', () => {
  // Clock 01-11-2026 00:10Z. METAR day 31 at 23:50Z resolves to 31-10-2026 (the most recent such date at or before now): 20 minutes old.
  // Slot 00:00 (10 min after the observation) is inside the 30 minute window (metarValidityMinutes); 00:30 (40 min) is not.
  it('METAR 312350Z read on 01-11 is 20 minutes old and governs only 00:00', () => {
    const r = run({ ref: YSSY_PACK, nowIso: '2026-11-01T00:10:00Z', windowMinutes: 240, metar: 'METAR YSSY 312350Z 25010KT 9999 FEW020 20/10 Q1015', taf: null });
    expect(r.metar!.observedAtMs).toBe(Date.parse('2026-10-31T23:50:00Z'));
    expect(r.built.metarAgeMinutes).toBe(20);
    expect(r.out.evaluation.slots.map((s) => s.governedBy).slice(0, 3)).toEqual(['METAR', 'NONE', 'NONE']);
    expect(r.built.banners.map((b) => b.code)).not.toContain('metar-stale');
  });
  it('a METAR stamped 5 minutes ahead of the clock (clock skew) is still read as today, not as last month', () => {
    const r = go({ metar: metar(kt(250, 10), '', '230315Z'), taf: null });
    expect(r.metar!.observedAtMs).toBe(Date.parse('2026-10-23T03:15:00Z'));
    expect(r.out.evaluation.slots[0]!.governedBy).toBe('METAR');
  });
});

describe('E21 traffic level takes the higher of arrivals and departures (TR-4, OD-24)', () => {
  // YSSY bands: light 0-10, medium 11-20, busy 21+. Slot 0: 3 arrivals (light) and 22 departures (busy) -> busy. Slot 1 onward: 3 arrivals, departures unknown -> light.
  it('slot level is busy where departures are busy', () => {
    const r = go({ metar: metar(kt(250, 10)), taf: taf(kt(250, 10) + ' 9999 SCT020'), arrivals: Array(8).fill(3), departures: [22, null, null, null, null, null, null, null] });
    expect(r.out.plan.slots.map((s) => s.trafficLevel)).toEqual(['busy', 'light', 'light', 'light', 'light', 'light', 'light', 'light']);
  });
});

// E22 (a TAF that would be worse inside the METAR window warns without overriding it, WX-7, OD-25) is removed:
// its entire premise, the METAR-governed cross-check against the TAF's own view, no longer exists (owner,
// 24-10-2026 — a METAR-governed slot is judged on the METAR alone; see E07). Not a YR-20b recompute case.

describe('E23 other behaviours worked from the requirements', () => {
  // No mode is disabled in the shipped pack now (SODPROPS was enabled on 23-10-2026), so the rule is tested on a copy where SODPROPS is
  // switched off. A current mode that is disabled is not the starting mode, so there is no start and no change is charged from it: the plan
  // is the cheapest enabled path, 25A16D (penalty 2; SODPROPS cannot be used), with no change at all. The enabled-start case is the control.
  it('a current mode that is disabled in the pack is not used as the starting mode (DESIGN 6 Current mode)', () => {
    const noSodprops: RunOptions['edit'] = (files) => {
      files['modes.json'].modes.find((m: { id: string }) => m.id === 'SODPROPS').enabled = false;
    };
    const wx = { metar: metar(kt(250, 10)), taf: taf(kt(250, 10) + ' 9999 SCT020') };
    const r = go({ ...wx, edit: noSodprops, current: 'SODPROPS' });
    expect(r.out.plan.startModeId).toBeNull();
    expect(r.out.plan.recommendedModeId).toBe('25A16D');
    expect(r.out.plan.changes).toHaveLength(0);
    // Control: with SODPROPS enabled it is a usable starting mode.
    const control = go({ ...wx, current: 'SODPROPS' });
    expect(control.out.plan.startModeId).toBe('SODPROPS');
  });
  it('a METAR trend (TEMPO RA) is not weather in the slots: no trend (OD-32)', () => {
    const r = go({ metar: metar(kt(158, 4)) + ' TEMPO RA', taf: taf(kt(158, 4) + ' 9999 SCT020') });
    for (const s of r.out.evaluation.slots) expect(s.runwayState).toBe('DRY');
  });
  it('a wet spell ends, dries for 60 minutes, and a later WET POSSIBLE overlay does not restart the drying clock', () => {
    // Base -RA until FM 04:30. Slots 03:00 and 03:30 are METAR (dry) ; the TAF-governed 04:00 slot is WET (last wet slot, ends 04:30).
    // Drying: 04:30 and 05:00 WET, 05:30 DRY at the earliest. PROB30 TEMPO 2305/2306 (05:00, 05:30): WET inside the drying period (05:00), WET POSSIBLE at 05:30.
    const r = go({
      metar: metar(kt(158, 4)),
      taf: taf(`${kt(158, 4)} 9999 -RA SCT020 FM230430 ${kt(158, 4)} 9999 SCT020 PROB30 TEMPO 2305/2306 4000 SHRA`),
      windowMinutes: 360,
    });
    const state = (t: string) => r.out.evaluation.slots[at(r, t)]!.runwayState;
    expect(['04:00', '04:30', '05:00'].map(state)).toEqual(['WET', 'WET', 'WET']);
    expect(state('05:30')).toBe('WET_POSSIBLE');
    expect(['06:00', '06:30', '07:00'].map(state)).toEqual(['DRY', 'DRY', 'DRY']);
  });
});

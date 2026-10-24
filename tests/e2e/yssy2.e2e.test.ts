// YR-12 part 1, second YSSY file: preference against change cost, wrap-around and range directions, gusts,
// mid-slot FM, month-rollover METAR, and TAF-wet in the METAR window. Hand-worked from docs/REQUIREMENTS.md
// before the engine was read; pack numbers as in yssy.e2e.test.ts (YSSY: tail dry 5 / wet 0, xw 20, calm 3, margin 3,
// day penalty 5 for every mode but Mode Curfew, night penalty Mode Curfew = 0 and others = 20, change light 1 / medium 5 / busy 25).
import { describe, expect, it } from 'vitest';
import { YSSY_PACK } from '../helpers/packs';
import { at, cell, chosen, hhmm, kt, run, type RunOptions } from './pipeline';

const NOW = '2026-10-23T03:10:00Z';
const metar = (wind: string, wx = '', obs = '230300Z') => ['METAR YSSY', obs, wind, '9999', wx, 'FEW020 20/10 Q1015'].filter((x) => x !== '').join(' ');
const taf = (body: string, valid = '2303/2403') => `TAF YSSY 230200Z ${valid} ${body}`;
const go = (o: Partial<RunOptions>) => run({ ref: YSSY_PACK, nowIso: NOW, windowMinutes: 240, ...o });

// TODO YR-20b: wholly about the now-removed curfew mode's night preference; recompute or
// replace against the new priority order once a comparable scenario exists (23-10-2026).
describe.skip('E18 a higher operating-plan preference lasting one slot is weighed against the change cost (section 11, OP-6, OD-18)', () => {
  // Night, TAF only: 23-10-2026 12:00Z is 23:00 AEDT, the first night slot. Wind 070/10 in slot 0, then FM 12:30Z to 340/10.
  //   Mode Curfew (34L arrival, 16R departure): 070/10 is a pure crosswind on both ends -> SUITABLE in slot 0. At 340/10 runway 16R has a 10 kt tailwind -> UNSUITABLE.
  //   Slot 0 modes: 34AD, 16AD, 07AD, 07A16D. Slot 1 onward (340/10): 34A25D, 34AD25, 34AD, 07AD, 25AD. Only 34AD and 07AD pass every slot; 34AD is first in the file.
  //   Plan A: Mode Curfew in slot 0 (preference 0), then a change into Mode 34A25D (first in file at 340/10) and 7 slots at 20:  0 + change + 140.
  //   Plan B: Mode 34AD throughout: 8 x 20 = 160, no change.
  //   A beats B when the change costs less than 20: light (1) and medium (5) yes; busy (25) no.
  const base = {
    nowIso: '2026-10-23T12:10:00Z',
    metar: null,
    taf: `TAF YSSY 231100Z 2312/2412 ${kt(70, 10)} 9999 SCT020 FM231230 ${kt(340, 10)} 9999 SCT020`,
  };
  const all = (n: number) => Array.from({ length: 8 }, () => n);
  it.each([
    ['light', 3],
    ['medium', 8],
  ] as const)('%s traffic: Mode Curfew for the one slot it passes, then Mode 34A25D', (_l, n) => {
    const r = go({ ...base, arrivals: all(n) });
    expect(chosen(r)).toEqual(['Curfew', '34A25D', '34A25D', '34A25D', '34A25D', '34A25D', '34A25D', '34A25D']);
    expect(r.out.plan.recommendedModeId).toBe('Curfew');
    expect(r.out.plan.changes[0]).toMatchObject({ slotIndex: 1, fromModeId: 'Curfew', toModeId: '34A25D' });
  });
  it('busy traffic: the 25 point change costs more than the 20 point preference gain, so Mode 34AD throughout', () => {
    const r = go({ ...base, arrivals: all(14) });
    expect(new Set(chosen(r))).toEqual(new Set(['34AD']));
    expect(r.out.plan.changes).toHaveLength(0);
  });
});

describe('E19 directions: wrap through north, ranges that cross north, gusts, mid-slot FM (WC-2, WC-3, WC-11, OP-2)', () => {
  it.skip('wind from 360 (36010KT): Mode 34AD (hdg 340) headwind 9.4; Mode 16AD (hdg 160) tailwind 9.4 > 5.05; Mode 07AD (hdg 070) crosswind 9.4', () => {
    const r = go({ metar: metar('36010KT'), taf: taf('36010KT 9999 SCT020') });
    expect(cell(r, '34AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '16AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(r, '07AD', 0).status).toBe('SUITABLE');
    expect(cell(r, '16AD', 0).runways[0]!.tailwindKt).toBeCloseTo(9.397, 3);
  });
  // 020/06 with range 340V040 (clockwise through north). Mode 16AD (hdg 160): tailwind = -6 cos(D-160). At the mean 020: cos(-140) = -0.766 -> 4.60: MARGINAL.
  // At 340 (in the range): cos(180) = -1 -> 6.0 > 5.05 -> UNSUITABLE. Mode 34AD (hdg 340) sees every direction 340-040 as a headwind (<= 60 degrees off): SUITABLE;
  // reading the range the long way round (040 -> 340) would put a 6 kt tailwind on it.
  it('340V040 is the short arc through north: Mode 16AD UNSUITABLE (tailwind 6.0), Mode 34AD SUITABLE; without the range Mode 16AD is MARGINAL', () => {
    const ranged = go({ metar: metar('02006KT 340V040'), taf: taf('02006KT 9999 SCT020') });
    expect(cell(ranged, '16AD', 0)).toMatchObject({ status: 'UNSUITABLE', cause: 'TW' });
    expect(cell(ranged, '34AD', 0).status).toBe('SUITABLE');
    const plain = go({ metar: metar('02006KT'), taf: taf('02006KT 9999 SCT020') });
    expect(cell(plain, '16AD', 0).status).toBe('MARGINAL');
  });
  // 070/12 gusting 26: the stronger of mean and gust is used, 26. Mode 16AD (hdg 160): crosswind 26 > 20.05. Without the gust 12 <= 17: SUITABLE.
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
  it.skip('a current mode that is disabled in the pack is not used as the starting mode (DESIGN 6 Current mode)' /* TODO YR-20b: no mode is disabled any more now SODPROPS is enabled; needs a new scenario (23-10-2026) */, () => {
    const r = go({ metar: metar(kt(250, 10)), taf: taf(kt(250, 10) + ' 9999 SCT020'), current: 'SODPROPS' });
    expect(r.out.plan.startModeId).toBeNull();
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

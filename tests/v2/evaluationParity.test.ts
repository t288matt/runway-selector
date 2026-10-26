// PARITY (issue 94 phase 2): v2's evaluation model against v1's timeline model on
// the same fixtures. v2 has its own copy of v1's logic, so this is the proof that
// the copy did not drift: the same rows are hidden, every cell has the same
// status, cause word, glyph, uncertain flag and accessible name, the recommended
// path and the change positions match, and so do the wind and group bars, the busy
// runs, the event words, the cell detail and the range. If v2's model is changed so
// that it differs from v1's on any scenario below, a test here fails.
//
// The one place v1 and v2 are imported side by side is this test file; the
// production code of each imports nothing from the other (tests are outside the
// import guard).
import { describe, expect, it } from 'vitest';
import type { EngineInput, TrafficLevel, WeatherOverlay } from '../../src/engine';
import { cellDetailModel } from '../../src/ui/model/panels';
import { timelineModel, visibleRows } from '../../src/ui/model/timeline';

import { cellDetail, evaluationModel } from '../../src/v2/model/evaluation';
import type { ViewData } from '../../src/v2/model/dashboard';
import { inputFor } from '../engine/helpers';
import { BASE, packOf, rigFor, same, specsFor, trafficFor, type Rig, type Wx } from '../engine/planHelpers';
import { PACKS, YSSY_PACK } from '../helpers/packs';
import { packWith } from '../weather/helpers';
import { FIXTURE_NOW, FIXTURE_STATION, realView, viewFromInput, viewOf } from './helpers';

/** Everything the two models must agree on, compared field by field. */
function expectParity(view: ViewData, label: string): { cells: number; uncertain: number; marginal: number; hidden: number; bars: number; busy: number; changes: number } {
  const v1 = timelineModel(view, view.calcNowMs + 60_000);
  const shown = visibleRows(v1, false);
  const v2 = evaluationModel(view, view.calcNowMs + 60_000);
  const at = (what: string): string => `${label}: ${what}`;

  // which rows are drawn, in which order, and how many are left out
  expect(v2.rows.map((r) => r.modeId), at('rows')).toEqual(shown.rows.map((r) => r.modeId));
  expect(v2.hiddenCount, at('hidden count')).toBe(shown.hiddenCount);
  v2.rows.forEach((row, ri) => {
    const r1 = shown.rows[ri];
    expect(
      { isRecommended: row.isRecommended, isCurrent: row.isCurrent, allUnsuitable: row.allUnsuitable, runwaysText: row.runwaysText, title: row.title, index: row.index },
      at(`row ${row.modeId}`),
    ).toEqual({ isRecommended: r1?.isRecommended, isCurrent: r1?.isCurrent, allUnsuitable: r1?.allUnsuitable, runwaysText: r1?.runwaysText, title: r1?.title, index: r1?.index });
    row.cells.forEach((c, ci) => {
      const c1 = shown.cells[ri]?.[ci];
      expect(
        { status: c.status, className: c.className, icon: c.icon, word: c.word, code: c.code, uncertain: c.uncertain, label: c.label, onPath: c.onPath },
        at(`cell ${row.modeId} slot ${ci}`),
      ).toEqual({ status: c1?.status, className: c1?.className, icon: c1?.icon, word: c1?.word, code: c1?.code, uncertain: c1?.uncertain, label: c1?.label, onPath: shown.onPath[ri]?.[ci] });
    });
  });

  // columns, bars and overlays
  expect(v2.slotCount, at('slot count')).toBe(v1.slots.length);
  expect(v2.changeSlots, at('change line positions')).toEqual([...v1.changeSlots]);
  expect(v2.busyRuns, at('busy band')).toEqual([...v1.busyRuns]);
  expect(v2.overlayBars, at('group bars')).toEqual([...v1.overlayBars]);
  expect(v2.overlayLanes, at('group lanes')).toBe(v1.overlayLanes);
  expect(v2.hasEventText, at('event words flag')).toBe(v1.hasEventText);
  expect(v2.windRuns, at('wind bars')).toEqual([...v1.windRuns]);
  expect(v2.rangeText, at('range')).toBe(v1.rangeText);
  expect(v2.nowSlotFraction, at('now marker')).toBe(v1.nowSlotFraction);
  expect(v2.missing, at('missing weather')).toBe(v1.missing);
  v2.slots.forEach((s, i) => {
    const s1 = v1.slots[i];
    expect(
      { index: s.index, startMs: s.startMs, time: s.time, onTheHour: s.onTheHour, dateLabel: s.dateLabel, level: s.level, busy: s.busy, wet: s.wet, events: s.events, eventTitle: s.eventTitle, isChange: s.isChange, noMode: s.noMode, noTaf: s.noTaf },
      at(`slot ${i}`),
    ).toEqual({ index: s1?.index, startMs: s1?.startMs, time: s1?.time, onTheHour: s1?.onTheHour, dateLabel: s1?.dateLabel, level: s1?.level, busy: s1?.busy, wet: s1?.wet, events: s1?.events, eventTitle: s1?.eventTitle, isChange: s1?.isChange, noMode: s1?.noMode, noTaf: s1?.noTaf });
  });

  // the detail text behind every cell, for every mode (also the hidden rows)
  view.pack.modes.forEach((mode, mi) => {
    if (!mode.enabled) return;
    for (let si = 0; si < v1.slots.length; si += 1) {
      const d2 = cellDetail(view, mi, si);
      const d1 = cellDetailModel(view, mi, si);
      expect(d2 === null, at(`detail exists ${mode.id} ${si}`)).toBe(d1 === null);
      if (d1 === null || d2 === null) continue;
      expect(
        { title: d2.title, statusWord: d2.statusWord, icon: d2.icon, code: d2.code, reason: d2.reason, trigger: d2.trigger, runways: d2.runways, wind: d2.wind, overlays: d2.overlays, runwayAssumption: d2.runwayAssumption, traffic: d2.traffic, operatingPlan: d2.operatingPlan, survival: d2.survival, notes: d2.notes },
        at(`detail ${mode.id} ${si}`),
      ).toEqual({ title: d1.title, statusWord: d1.statusWord, icon: d1.icon, code: d1.code, reason: d1.reason, trigger: d1.trigger, runways: d1.runways, wind: d1.wind, overlays: d1.overlays, runwayAssumption: d1.runwayAssumption, traffic: d1.traffic, operatingPlan: d1.operatingPlan, survival: d1.survival, notes: d1.notes });
    }
  });

  const flat = v2.rows.flatMap((r) => r.cells);
  return {
    cells: flat.length,
    uncertain: flat.filter((c) => c.uncertain).length,
    marginal: flat.filter((c) => c.status === 'MARGINAL').length,
    hidden: v2.hiddenCount,
    bars: v2.overlayBars.length,
    busy: v2.busyRuns.length,
    changes: v2.changeSlots.length,
  };
}

type Totals = ReturnType<typeof expectParity>;
const sum = (all: Totals[]): Totals => all.reduce((a, t) => ({ cells: a.cells + t.cells, uncertain: a.uncertain + t.uncertain, marginal: a.marginal + t.marginal, hidden: a.hidden + t.hidden, bars: a.bars + t.bars, busy: a.busy + t.busy, changes: a.changes + t.changes }), { cells: 0, uncertain: 0, marginal: 0, hidden: 0, bars: 0, busy: 0, changes: 0 });

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 evaluation model equals v1 timeline model [%s]', (_n, ref) => {
  const rig: Rig = rigFor(ref);
  const pack = packOf(rig);
  const med = same<TrafficLevel | null>(8, 'medium');
  const early: (TrafficLevel | null)[] = [...med];
  early[4] = 'busy';
  const scenarios: readonly (readonly [string, readonly Wx[], readonly (TrafficLevel | null)[], string | null])[] = [
    ['all fine', same<Wx>(8, 'ok'), same(8, 'light'), null],
    ['a planned change, then back', ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'], early, null],
    ['A unsuitable throughout, current mode set', ['badA', 'badA', 'badA', 'badA'], same(4, 'medium'), rig.b],
    ['everything unsuitable', ['badBoth', 'badBoth', 'badBoth', 'badBoth'], same(4, 'medium'), null],
    ['marginal wind', ['ok', 'marginalA', 'marginalA', 'ok', 'marginalA', 'ok'], same(6, 'light'), null],
    ['no weather', same<Wx>(4, 'none'), [], null],
    ['weather ends part way', ['ok', 'ok', 'none', 'none'], same(4, 'medium'), null],
    ['busy runs and unknown traffic', same<Wx>(8, 'ok'), ['light', 'busy', 'busy', 'medium', 'light', null, null, 'busy'], rig.a],
  ];

  it.each(scenarios)('%s', (name, wx, levels, current) => {
    expectParity(viewOf(pack, rig, wx, levels, current), `${ref.name} ${name}`);
  });

  it('group bars, lanes, uncertain corners and marginal cells from TEMPO and PROB groups', () => {
    const group = (kind: WeatherOverlay['kind'], probabilityPct: 30 | 40 | null, wind: WeatherOverlay['wind'], text: string): WeatherOverlay => ({ kind, probabilityPct, wind, precipitation: false, text });
    const specs = specsFor(rig, same<Wx>(8, 'ok')).map((s, i) => {
      const overlays: WeatherOverlay[] = [];
      if (i >= 1 && i <= 3) overlays.push(group('TEMPO', null, rig.badForA, `TEMPO 1502/1504 ${i}`));
      if (i >= 2 && i <= 5) overlays.push(group('PROB', 30, rig.marginalA, `PROB30 TEMPO 1503/1506 ${i >= 4 ? 'B' : 'B'}`));
      if (i === 6) overlays.push(group('INTER', null, null, 'INTER 1507/1508 4000 SHRA'));
      return { ...s, overlays };
    });
    const input: EngineInput = { ...inputFor(BASE, specs, trafficFor(pack, same(8, 'light'))), currentMode: null };
    const totals = expectParity(viewFromInput(pack, input), `${ref.name} groups`);
    expect(totals.bars).toBeGreaterThanOrEqual(2);
    expect(totals.uncertain).toBeGreaterThan(0);
  });

  it('covers every kind of cell, bar and hidden row somewhere in the scenarios (so the parity is not vacuous)', () => {
    const totals = sum(scenarios.map(([n, wx, levels, current]) => expectParity(viewOf(pack, rig, wx, levels, current), n)));
    expect(totals.cells).toBeGreaterThan(50);
    expect(totals.hidden).toBeGreaterThan(0);
    expect(totals.busy).toBeGreaterThan(0);
    expect(totals.changes).toBeGreaterThan(0);
  });
});

describe('v2 evaluation model equals v1 timeline model on real reports', () => {
  const real = packWith(YSSY_PACK, { weatherStation: FIXTURE_STATION });
  it.each([
    ['no traffic', null],
    ['with aircraft', { aircraft: [], prefiles: [], fetchedAtMs: FIXTURE_NOW - 30_000, error: null, errorAtMs: null }],
  ] as const)('the real METAR and TAF, %s', (name, feed) => {
    const view = feed === null ? realView(real, YSSY_PACK) : realView(real, YSSY_PACK, feed);
    const totals = expectParity(view, `real ${name}`);
    expect(totals.cells).toBeGreaterThan(0);
  });
});

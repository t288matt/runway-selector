// The view model of the expanded Evaluation and TAF section, rule by rule. (The
// match with v1's timeline model is in evaluationParity.test.ts.)
import { describe, expect, it } from 'vitest';
import type { EngineInput, TrafficLevel, WeatherOverlay } from '../../src/engine';
import { CAUSE_WORDS, STATUS_STYLE } from '../../src/v2/model/status';
import { cellDetail, cellDetailText, evaluationModel, LEGEND, levelShortWord, moveFocus, overlayBars, overlayDisplayLabel, visibleRowIndexes, type ModeRow } from '../../src/v2/model/evaluation';
import { inputFor } from '../engine/helpers';
import { BASE, packOf, rigFor, same, specsFor, trafficFor, type Wx } from '../engine/planHelpers';
import { PACKS, YSSY_PACK } from '../helpers/packs';
import { packWith } from '../weather/helpers';
import { FIXTURE_NOW, FIXTURE_STATION, realView, viewFromInput, viewOf } from './helpers';

const row = (modeId: string, extra: Partial<ModeRow> = {}): ModeRow => ({ index: 0, modeId, isRecommended: false, isCurrent: false, allUnsuitable: false, runwaysText: '', title: '', ...extra });

describe('which mode rows are drawn (v1 rule, no reveal button)', () => {
  it('hides a row that is red in every slot unless it is recommended or current', () => {
    const rows = [row('A', { allUnsuitable: true }), row('B', { allUnsuitable: true, isRecommended: true }), row('C', { allUnsuitable: true, isCurrent: true }), row('D')];
    expect(visibleRowIndexes(rows)).toEqual([1, 2, 3]);
  });
  it('keeps every row when none is fully red, and never leaves the grid empty when all are', () => {
    expect(visibleRowIndexes([row('A'), row('B')])).toEqual([0, 1]);
    expect(visibleRowIndexes([row('A', { allUnsuitable: true }), row('B', { allUnsuitable: true })])).toEqual([0, 1]);
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('evaluation model [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('leaves the fully red rows out and reports how many; the recommended and current rows stay', () => {
    const view = viewOf(pack, rig, ['badA', 'badA', 'badA', 'badA'], same(4, 'medium'), rig.b);
    const m = evaluationModel(view, view.calcNowMs);
    const enabled = pack.modes.filter((x) => x.enabled).length;
    expect(m.rows.length + m.hiddenCount).toBe(enabled);
    for (const r of m.rows.filter((x) => x.allUnsuitable)) expect(r.isRecommended || r.isCurrent || m.hiddenCount === 0).toBe(true);
    expect(m.rows.find((r) => r.isRecommended)?.modeId).toBe(view.result.plan.recommendedModeId);
  });

  it('a suitable cell has a tick and no word, an unsuitable one a cross and its cause word', () => {
    const view = viewOf(pack, rig, ['ok', 'badBoth'], same(2, 'light'));
    const m = evaluationModel(view, view.calcNowMs);
    for (const r of m.rows) {
      const [first, second] = r.cells;
      if (first?.status === 'SUITABLE') {
        expect(first.icon).toBe('\u2713');
        expect(first.code).toBe('');
      }
      if (second?.status === 'UNSUITABLE') {
        expect(second.icon).toBe('\u2715');
        expect(second.code).not.toBe('');
        expect(second.label).toContain(`cause ${CAUSE_WORDS[second.code] ?? second.code}`);
      }
    }
    expect(m.rows.flatMap((r) => r.cells).some((c) => c.status === 'UNSUITABLE')).toBe(true);
  });

  it('a marginal cell is drawn green WITH its cause word and NO tick, and the engine status stays MARGINAL', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'marginalA'), same(4, 'light'));
    const marginal = evaluationModel(view, view.calcNowMs).rows.flatMap((r) => r.cells).filter((c) => c.status === 'MARGINAL');
    expect(marginal.length).toBeGreaterThan(0);
    for (const c of marginal) {
      expect(c.className).toBe(STATUS_STYLE.SUITABLE.className);
      expect(c.className).toBe('cs-suitable');
      expect(c.icon).toBe('');
      expect(c.code).not.toBe('');
      expect(c.word).toBe('marginal');
    }
  });

  it('the white corner: a cell that depends on an uncertain input says so in its flag and name', () => {
    const overlay: WeatherOverlay = { kind: 'TEMPO', probabilityPct: null, wind: rig.badForA, precipitation: false, text: 'TEMPO 1502/1504 test' };
    const specs = specsFor(rig, same<Wx>(4, 'ok')).map((s, i) => (i === 1 ? { ...s, overlays: [overlay] } : s));
    const view = viewFromInput(pack, { ...inputFor(BASE, specs, trafficFor(pack, same(4, 'light'))), currentMode: null } as EngineInput);
    const cells = evaluationModel(view, view.calcNowMs).rows.flatMap((r) => r.cells);
    const unc = cells.filter((c) => c.uncertain);
    expect(unc.length).toBeGreaterThan(0);
    for (const c of unc) expect(c.label).toContain('depends on an uncertain input');
    expect(cells.filter((c) => !c.uncertain).every((c) => !c.label.includes('uncertain input'))).toBe(true);
  });

  it('the change line is at the slot of each changeover; the path outline marks the recommended mode only', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'], ['medium', 'medium', 'medium', 'medium', 'busy', 'medium', 'medium', 'medium']);
    const m = evaluationModel(view, view.calcNowMs);
    expect(m.changeSlots).toEqual(view.result.changeovers.map((c) => c.change.slotIndex));
    expect(m.slots.filter((s) => s.isChange).map((s) => s.index)).toEqual([...m.changeSlots]);
    for (const r of m.rows) r.cells.forEach((c, i) => expect(c.onPath).toBe(view.result.plan.slots[i]?.modeId === r.modeId));
  });

  it('the busy band covers runs of HIGH traffic slots and the traffic row words are LOW, MED, HIGH and ?', () => {
    const levels: (TrafficLevel | null)[] = ['light', 'busy', 'busy', 'medium', null, 'busy'];
    const view = viewOf(pack, rig, same<Wx>(6, 'ok'), levels);
    const m = evaluationModel(view, view.calcNowMs);
    expect(m.busyRuns).toEqual([[1, 2], [5, 5]]);
    expect(m.slots.map((s) => s.levelShort)).toEqual(['LOW', 'HIGH', 'HIGH', 'MED', '?', 'HIGH']);
    expect(levelShortWord('medium')).toBe('MED');
  });

  it('the NOW marker sits inside the window at the slot that holds now, and is absent when now is outside', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'));
    const inside = evaluationModel(view, view.calcNowMs + 40 * 60_000);
    expect(inside.showNow).toBe(true);
    expect(inside.nowCol).toBe(1);
    expect(inside.nowText).toMatch(/^NOW \d\d:\d\dZ$/);
    const after = evaluationModel(view, view.calcNowMs + 6 * 3_600_000);
    expect(after.showNow).toBe(false);
    expect(after.nowCol).toBeNull();
  });

  it('the event row has WET words for a wet slot and "no weather" with no reports; no words means no row', () => {
    const dry = evaluationModel(viewOf(pack, rig, same<Wx>(3, 'ok')), 0);
    expect(dry.hasEventText).toBe(false);
    const none = evaluationModel(viewOf(pack, rig, same<Wx>(3, 'none')), 0);
    expect(none.slots[0]?.events).toContain('no weather');
    expect(none.hasEventText).toBe(true);
  });

  it('says what a cell is in plain text: title, status, the reason, the wind, the traffic and the plan', () => {
    const view = viewOf(pack, rig, ['badA', 'ok'], same(2, 'medium'));
    const idx = pack.modes.findIndex((m) => m.id === rig.a);
    const d = cellDetail(view, idx, 0);
    expect(d).not.toBeNull();
    const text = cellDetailText(d ?? (null as never));
    expect(text).toContain(`Mode ${rig.a}`);
    expect(text).toContain('UNSUITABLE');
    expect(text).toContain('Wind used:');
    expect(text).toContain('Traffic: MEDIUM');
    expect(text).toContain('Operating plan:');
    expect(text).not.toMatch(/<|>/);
    expect(cellDetail(view, idx, 99)).toBeNull();
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('no per-slot traffic figures in a cell popover (owner decision) [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const FIGURES = /known demand|in the slot|capacity \d|per hour|demand unknown|no capacity set|arrivals only|movements/i;
  it('a cell with known traffic names the traffic class only, never the demand or capacity numbers', () => {
    const view = viewOf(pack, rig, ['ok', 'badA', 'marginalA', 'ok'], same(4, 'busy'));
    const cells = evaluationModel(view, view.calcNowMs).rows.flatMap((r) => r.cells);
    expect(cells.length).toBeGreaterThan(4);
    for (const c of cells) {
      expect(c.detail.match(FIGURES)?.[0] ?? '').toBe('');
      expect(c.detail).toContain('Traffic: HIGH');
    }
  });
});

describe('group bars (TEMPO, INTER, PROB)', () => {
  const g = (text: string, probabilityPct: number | null) => ({ weather: { overlays: [{ text, probabilityPct }] } });
  it('draws one bar per distinct group, ends it at a gap, and puts overlapping groups on separate lanes', () => {
    const a = 'PROB30 TEMPO 2511/2519 VRB30G40KT 1000 TSRA';
    const b = 'TEMPO 2514/2517 RA';
    const slots = [g(a, 30), { weather: { overlays: [{ text: a, probabilityPct: 30 }, { text: b, probabilityPct: null }] } }, { weather: { overlays: [] } }, g(a, 30)];
    const out = overlayBars(slots);
    expect(out.bars.map((x) => [x.label, x.startSlot, x.endSlot, x.lane, x.probability])).toEqual([
      [a, 0, 1, 0, true],
      [b, 1, 1, 1, false],
      [a, 3, 3, 0, true],
    ]);
    expect(out.lanes).toBe(2);
  });
  it('draws the text without its validity token', () => {
    expect(overlayDisplayLabel('PROB30 TEMPO 2511/2519 VRB30G40KT 1000 TSRA')).toBe('PROB30 TEMPO VRB30G40KT 1000 TSRA');
  });
});

describe('legend and raw reports', () => {
  it('has the v1 legend entries in order, with the green-with-a-word line', () => {
    expect(LEGEND.map((l) => l.key)).toEqual(['suitable', 'unsuitable', 'path', 'busy', 'uncertain']);
    // the Unknown, green-with-a-word and planned-change entries are gone (owner, 26-10-2026)
    expect(LEGEND.map((l) => l.text).join('|')).not.toMatch(/Unknown|Green with a word|Dashed blue line/);
  });
  it('carries the raw METAR and TAF in use, or says none is entered with the station', () => {
    const real = packWith(YSSY_PACK, { weatherStation: FIXTURE_STATION });
    const view = realView(real, YSSY_PACK);
    const m = evaluationModel(view, FIXTURE_NOW);
    expect(m.metar.text).toBe(view.metar?.raw);
    expect(m.taf.text).toBe(view.taf?.raw);
    const empty = evaluationModel({ ...view, metar: null, taf: null }, FIXTURE_NOW);
    expect(empty.metar.text).toBeNull();
    expect(empty.metar.empty).toBe(`Station ${FIXTURE_STATION}. No METAR entered.`);
    expect(empty.taf.empty).toBe(`Station ${FIXTURE_STATION}. No TAF entered.`);
  });
});

describe('keyboard movement in the grid', () => {
  it('moves with the arrows and stops at the edges; Home, End and the Page keys move along the row', () => {
    expect(moveFocus('ArrowRight', { row: 0, col: 0 }, 3, 12, null, null)).toEqual({ row: 0, col: 1 });
    expect(moveFocus('ArrowLeft', { row: 0, col: 0 }, 3, 12, null, null)).toEqual({ row: 0, col: 0 });
    expect(moveFocus('ArrowDown', { row: 2, col: 5 }, 3, 12, null, null)).toEqual({ row: 2, col: 5 });
    expect(moveFocus('ArrowUp', { row: 1, col: 5 }, 3, 12, null, null)).toEqual({ row: 0, col: 5 });
    expect(moveFocus('End', { row: 0, col: 2 }, 3, 12, null, null)).toEqual({ row: 0, col: 11 });
    expect(moveFocus('PageDown', { row: 0, col: 9 }, 3, 12, null, null)).toEqual({ row: 0, col: 11 });
    expect(moveFocus('x', { row: 0, col: 0 }, 3, 12, null, null)).toBeNull();
  });
  it('N goes to now and C to the first change, when there is one', () => {
    expect(moveFocus('n', { row: 1, col: 7 }, 3, 12, 2, 5)).toEqual({ row: 1, col: 2 });
    expect(moveFocus('C', { row: 1, col: 0 }, 3, 12, 2, 5)).toEqual({ row: 1, col: 5 });
    expect(moveFocus('N', { row: 1, col: 0 }, 3, 12, null, null)).toBeNull();
  });
});

// The answer band: the state rule, the mode and the next change, on every pack; and the PARITY test that v2 shows the same recommended
// mode, next change and state as v1's own model on the same inputs.
import { describe, expect, it } from 'vitest';
import { type TrafficLevel } from '../../src/engine';
import { panelAModel } from '../../src/ui/model/panels';
import { hhmmZRel } from '../../src/ui/format';
import { answerModel, bandOf, BANDS, modeSizeFor } from '../../src/v2/model/answer';
import { calculate as calculateV2, EMPTY_FEED } from '../../src/v2/model/dashboard';
import { calculate as calculateV1 } from '../../src/ui/model/dashboard';
import { PACKS } from '../helpers/packs';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { viewOf as viewOfV1 } from '../ui/helpers';
import { FIXTURE_NOW, FIXTURE_STATION, realView, viewOf } from './helpers';
import { packWith } from '../weather/helpers';

const med = (n: number) => same<TrafficLevel | null>(n, 'medium');
const WX8: Wx[] = ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'];
const EARLY_LEVELS: (TrafficLevel | null)[] = [...med(8)];
EARLY_LEVELS[4] = 'busy';

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 state band [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('is RECOMMENDED (internal id HOLD) when nothing is wrong and no mode is set', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light'));
    expect(bandOf(view)).toBe(BANDS.HOLD);
    expect(bandOf(view).word).toBe('RECOMMENDED');
    expect(bandOf(view).id).toBe('HOLD');
  });

  it('is CHANGE NOW when the mode the operator is on is unsuitable now (v1 red banner)', () => {
    const view = viewOf(pack, rig, ['badA', 'badA', 'ok'], med(3), rig.a);
    expect(bandOf(view)).toBe(BANDS.CHANGE_NOW);
    expect(answerModel(view).why).toContain(`Current mode ${rig.a} is unsuitable`);
  });

  it('is CHANGE SOON when the engine recommends an early change (v1 amber banner)', () => {
    const view = viewOf(pack, rig, WX8, EARLY_LEVELS);
    expect(view.result.explanation.earlyChange).not.toBeNull();
    expect(bandOf(view)).toBe(BANDS.CHANGE_SOON);
    expect(answerModel(view).why).toBe(view.result.explanation.earlyChange?.text);
  });

  it('is HOLD, not CHANGE SOON, for a planned change that is not an early change (no time threshold of its own)', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'], same(9, 'light'));
    expect(view.result.explanation.earlyChange).toBeNull();
    const a = answerModel(view);
    expect(a.nextChange).not.toBeNull();
    expect(a.band).toBe(BANDS.HOLD);
  });

  it('is CHANGE NOW, not CHANGE SOON, when both banners would show in v1', () => {
    const view = viewOf(pack, rig, ['badA', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'], EARLY_LEVELS, rig.a);
    expect(bandOf(view)).toBe(BANDS.CHANGE_NOW);
  });

  it('says no suitable mode, with a cross, when every mode fails now', () => {
    const view = viewOf(pack, rig, ['badBoth', 'badBoth'], med(2));
    const a = answerModel(view);
    expect(a.band).toBe(BANDS.NO_SUITABLE);
    expect(a.band.glyph).toBe('cross');
    expect(a.modeId).toBeNull();
    expect(a.next).toBe('');
  });

  it('says NO DATA, grey, when the weather now is not known, and names what is missing', () => {
    const view = viewOf(pack, rig, same<Wx>(3, 'none'));
    const a = answerModel(view);
    expect(a.band).toBe(BANDS.NO_DATA);
    expect(a.band.tone).toBe('unk');
    expect(a.why).toContain('No mode is recommended because the weather for the current period is not known');
  });

  it('gives every state a glyph and a word, so colour is never the only signal', () => {
    for (const band of Object.values(BANDS)) {
      expect(band.word.length).toBeGreaterThan(0);
      expect(['tick', 'triangle', 'cross', 'question']).toContain(band.glyph);
    }
    expect(new Set(Object.values(BANDS).map((b) => b.glyph)).size).toBe(4);
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 answer values [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('shows the recommended mode, its arrival and departure runways, and "No change planned"', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light'));
    const a = answerModel(view);
    const mode = pack.modes.find((m) => m.id === view.result.plan.recommendedModeId);
    expect(a.modeId).toBe(mode?.id);
    expect(a.modeLabel).toBe(`Recommended mode ${mode?.id}`);
    expect(a.arrivals).toBe(mode?.arrivals.join(', ') || 'none');
    expect(a.departures).toBe(mode?.departures.join(', ') || 'none');
    expect(a.next).toBe('No change planned');
  });

  it('shows "Forecasting: <mode> at HH:MMZ" for the first change after now', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'badA', 'badA', 'badA'], same(5, 'light'));
    const a = answerModel(view);
    const upcoming = view.result.changeovers.find((c) => c.change.slotIndex > 0);
    expect(upcoming).toBeDefined();
    expect(a.next).toBe(`Forecasting: ${upcoming?.change.toModeId} at ${hhmmZRel(upcoming?.change.startMs ?? 0, view.calcNowMs)}`);
    expect(a.next).toMatch(/^Forecasting: \S+ at \d{4}Z$/);
  });

  it('lists alternatives (issue 122): suitable in both of the next two slots, never the recommended mode, most preferred first', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'badA', 'badA'], same(4, 'light'));
    const a = answerModel(view);
    const ids = a.alternatives.map((x) => x.modeId);
    expect(ids).not.toContain(a.modeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < a.alternatives.length; i++) expect(a.alternatives[i]!.rank).toBeGreaterThanOrEqual(a.alternatives[i - 1]!.rank);
    for (const alt of a.alternatives) {
      const k = pack.modes.findIndex((m) => m.id === alt.modeId);
      expect(pack.modes[k]?.enabled).toBe(true);
      for (const slot of [0, 1]) expect(view.result.evaluation.cells[k]?.[slot]?.status).toBe('SUITABLE');
    }
    expect(a.rank).not.toBeNull();
  });

  it('alternatives follow the rule on a known case: listed when suitable in both slots, dropped for marginal in slot 2, kept when only slot 3 fails, none with one slot, never a disabled mode (issue 122)', () => {
    const rigY = rigFor(PACKS.find((p) => p.name === 'YSSY')!);
    const packY = packOf(rigY);
    const base = viewOf(packY, rigY, same<Wx>(4, 'ok'), same(4, 'light'));
    const listed = answerModel(base).alternatives.map((x) => x.modeId);
    expect(listed.length).toBeGreaterThan(0);
    const target = listed[0]!;
    const k = packY.modes.findIndex((m) => m.id === target);
    const withCells = (edit: (cells: typeof base.result.evaluation.cells) => typeof base.result.evaluation.cells) => ({ ...base, result: { ...base.result, evaluation: { ...base.result.evaluation, cells: edit(base.result.evaluation.cells) } } });
    const setStatus = (slot: number, status: 'MARGINAL' | 'UNSUITABLE') => withCells((cells) => cells.map((row, i) => (i === k ? row.map((c, s) => (s === slot ? { ...c, status } : c)) : row)));
    expect(answerModel(setStatus(1, 'MARGINAL')).alternatives.map((x) => x.modeId)).not.toContain(target);
    expect(answerModel(setStatus(2, 'UNSUITABLE')).alternatives.map((x) => x.modeId)).toContain(target);
    expect(answerModel(withCells((cells) => cells.map((row) => row.slice(0, 1)))).alternatives).toEqual([]);
    const disabled = { ...base, pack: { ...packY, modes: packY.modes.map((m) => (m.id === target ? { ...m, enabled: false } : m)) } };
    expect(answerModel(disabled).alternatives.map((x) => x.modeId)).not.toContain(target);
  });

  it('priority text lists every enabled, allowed mode in rank order with recommended, suitable or unsuitable (issue 122)', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'badA', 'badA'], same(4, 'light'));
    const a = answerModel(view);
    const lines = (a.priorityText ?? '').split('\n');
    expect(lines[0]).toBe('Runway mode priority (1 is the most preferred)');
    expect(lines.filter((l) => l.endsWith(': recommended'))).toHaveLength(1);
    expect(lines.some((l) => l.includes(`${a.modeId}: recommended`))).toBe(true);
    for (const alt of a.alternatives) expect(lines).toContain(`${alt.rank}. ${alt.modeId}: suitable`);
    const ranks = lines.slice(1).map((l) => Number(l.split('.')[0]));
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
    expect(answerModel(viewOf(pack, rig, ['badBoth', 'badBoth'], same(2, 'medium'))).priorityText).toBeNull();
  });

  it('lists no alternative that fails in the second slot, and none when no mode is recommended', () => {
    const early = viewOf(pack, rig, ['ok', 'badA', 'badA', 'badA'], same(4, 'light'));
    for (const alt of answerModel(early).alternatives) {
      const k = pack.modes.findIndex((m) => m.id === alt.modeId);
      expect(early.result.evaluation.cells[k]?.[1]?.status).toBe('SUITABLE');
    }
    const none = answerModel(viewOf(pack, rig, ['badBoth', 'badBoth'], same(2, 'medium')));
    expect(none.alternatives).toEqual([]);
    expect(none.rank).toBeNull();
  });

  it('has no current-mode choices: the answer model carries neither a list of modes to pick nor a chosen mode', () => {
    const a = answerModel(viewOf(pack, rig, same<Wx>(2, 'ok')));
    expect('choices' in a).toBe(false);
    expect('current' in a).toBe(false);
  });
});

describe('v2 mode size', () => {
  it('uses a smaller type for longer ids so they cannot overflow', () => {
    expect(modeSizeFor('21AD')).toBe('normal');
    expect(modeSizeFor('21AD0')).toBe('normal');
    expect(modeSizeFor('03AD06')).toBe('long');
    expect(modeSizeFor('24A21AD')).toBe('long');
    expect(modeSizeFor('ABCDEFGH')).toBe('xlong');
    expect(modeSizeFor(null)).toBe('normal');
  });
});

// ---------------------------------------------------------------- parity
/** v1's state, from its own banners, in v2's words (the owner's provisional rule, issue 94 / 96). */
function v1State(view: ReturnType<typeof viewOfV1>): string {
  const m = panelAModel(view);
  if (m.kind === 'no-suitable') return BANDS.NO_SUITABLE.id;
  if (m.kind === 'no-data') return BANDS.NO_DATA.id;
  if (m.banners.some((b) => b.tone === 'red')) return BANDS.CHANGE_NOW.id;
  if (m.banners.some((b) => b.tone === 'amber')) return BANDS.CHANGE_SOON.id;
  return BANDS.HOLD.id;
}

describe.each(PACKS.map((p) => [p.name, p] as const))('PARITY: v2 shows what v1 shows [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const scenarios: [string, Wx[], (TrafficLevel | null)[], string | null][] = [
    ['all fine', same<Wx>(4, 'ok'), same(4, 'light'), null],
    ['all fine, mode set', same<Wx>(4, 'ok'), same(4, 'light'), rig.b],
    ['current unsuitable', ['badA', 'badA', 'ok'], med(3), rig.a],
    ['early change', WX8, EARLY_LEVELS, null],
    ['early change, mode set', WX8, EARLY_LEVELS, rig.a],
    ['planned change', ['ok', 'ok', 'badA', 'badA', 'badA'], same(5, 'light'), null],
    ['change then change back', ['ok', 'badA', 'badA', 'ok', 'ok', 'ok'], med(6), null],
    ['marginal now', ['marginalA', 'ok', 'ok'], same(3, 'light'), null],
    ['no suitable mode', ['badBoth', 'badBoth'], med(2), null],
    ['gap later', ['ok', 'ok', 'badBoth', 'badA', 'badA'], med(5), null],
    ['no data', same<Wx>(3, 'none'), [], null],
    ['unknown traffic', same<Wx>(6, 'ok'), same(6, null), null],
  ];

  it.each(scenarios)('same mode, next change and state: %s', (_name, wx, levels, current) => {
    const v1 = viewOfV1(pack, rig, wx, levels, current);
    const v2 = viewOf(pack, rig, wx, levels, current);
    const m1 = panelAModel(v1);
    const a2 = answerModel(v2);
    expect(a2.modeId).toBe(m1.modeId);
    // OWNER DECISION (issue 104): v2 has no current mode, so its state is compared with v1's only for the no-current-mode case.
    if (current === null) expect(a2.band.id).toBe(v1State(v1));
    if (a2.nextChange === null) {
      expect(m1.nextChange === 'No change planned' || a2.modeId === null).toBe(true);
      if (a2.modeId !== null) expect(a2.next).toBe('No change planned');
    } else {
      const up = v1.result.changeovers.find((c) => c.change.slotIndex > 0);
      expect(m1.nextChange).toBe(`${up?.change.fromModeId} to ${a2.nextChange.modeId} at ${hhmmZRel(a2.nextChange.atMs, v1.calcNowMs)}`);
      expect(a2.next).toBe(`Forecasting: ${a2.nextChange.modeId} at ${hhmmZRel(a2.nextChange.atMs, v2.calcNowMs)}`);
    }
  });

  it('same result for the real METAR and TAF fixtures, with each enabled mode set as the current one', () => {
    const real = packWith(ref, { weatherStation: FIXTURE_STATION });
    const feed = { aircraft: [], prefiles: [], fetchedAtMs: FIXTURE_NOW, error: null, errorAtMs: null };
    for (const current of [null, ...real.modes.filter((m) => m.enabled).map((m) => m.id)]) {
      const v2 = realView(real, ref, feed, current);
      const v1 = calculateV1({ pack: real, nowMs: v2.calcNowMs, metar: v2.metar, taf: v2.taf, windowChoice: 'full', currentMode: current, feed });
      const m1 = panelAModel(v1);
      const a2 = answerModel(v2);
      expect(a2.modeId, `current ${current}`).toBe(m1.modeId);
      // OWNER DECISION (issue 104): v2 has no current mode, so its state is compared with v1's only for the no-current-mode case.
      if (current === null) expect(a2.band.id, `current ${current}`).toBe(v1State(v1));
      const up = v1.result.changeovers.find((c) => c.change.slotIndex > 0);
      expect(a2.nextChange?.modeId ?? null, `current ${current}`).toBe(up?.change.toModeId ?? null);
    }
  });

  it('v2 and v1 calculate the same plan from the same inputs', () => {
    const real = packWith(ref, { weatherStation: FIXTURE_STATION });
    const v2 = realView(real, ref);
    const v1 = calculateV1({ pack: real, nowMs: v2.calcNowMs, metar: v2.metar, taf: v2.taf, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    expect(v2.result).toEqual(v1.result);
    expect(calculateV2({ pack: real, nowMs: v2.calcNowMs, metar: v2.metar, taf: v2.taf, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED }).result).toEqual(v1.result);
  });
});

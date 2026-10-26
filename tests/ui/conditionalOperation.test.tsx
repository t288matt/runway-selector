// The conditional-operation note in Panel A (issue 58), on the fictional TEST pack with a conditional operation
// added to one mode in memory. It is a note only: the plan, the cells and the recommendation are the same with or
// without it. Each test fails if the rule it names is removed.
import { describe, expect, it } from 'vitest';
import { plan, type EngineInput, type PrecipitationFlags, type SlotSource, type SlotWeather } from '../../src/engine';
import { panelAModel } from '../../src/ui/model/panels';
import { BASE, WORKED, packOf, rigFor, same, specsFor, type Wx } from '../engine/planHelpers';
import { SLOT_MS, inputFor } from '../engine/helpers';
import { TEST_PACK } from '../helpers/packs';
import { renderDashboard, textOf, viewFromInput } from './helpers';

const rig = rigFor(TEST_PACK);
const OP = { name: 'TESTNOTE', ceilingFt: 3000, visibilityMetres: 8000, requiresDrySurface: true };
const withOp = (id: string) =>
  packOf(rig, { ...WORKED, marginal: 1 }, (f) => {
    f['modes.json'].modes.find((m: { id: string }) => m.id === id).conditionalOperation = OP;
  });
const pack = withOp(rig.a);
const GOOD: Partial<SlotWeather> = { ceilingFt: 3500, visibilityMetres: 9999 };
const hhmm = (slot: number) => new Date(BASE + slot * SLOT_MS).toISOString().slice(11, 16).replace(':', '');

/** One entry per slot: the engine weather named by `wx` plus these weather fields. */
function view(wx: readonly Wx[], fields: readonly Partial<SlotWeather>[], p = pack, gov: SlotSource = 'TAF') {
  const base = inputFor(BASE, specsFor(rig, wx).map((s) => ({ ...s, gov: s.gov ?? gov })));
  const input: EngineInput = { ...base, weather: base.weather.map((w, i) => ({ ...w, weather: { ...w.weather, ...fields[i] } })) };
  return viewFromInput(p, input);
}
const bannerOf = (v: ReturnType<typeof view>) => panelAModel(v).banners.find((b) => b.title === 'TESTNOTE conditions met');
const okSlots = same<Wx>(4, 'ok');

describe('the conditions-met note', () => {
  it('shows "until" the end of the last qualifying slot when the first slot qualifies', () => {
    const b = bannerOf(view(okSlots, same(4, GOOD)));
    expect(b).toEqual({ tone: 'ok', title: 'TESTNOTE conditions met', text: `until ${hhmm(4)}Z` });
  });

  it('stops at the first slot that no longer qualifies', () => {
    const b = bannerOf(view(okSlots, [GOOD, GOOD, { ...GOOD, ceilingFt: 2999 }, GOOD]));
    expect(b?.text).toBe(`until ${hhmm(2)}Z`);
  });

  it('shows "from" the start of the first qualifying slot when only a later one qualifies', () => {
    const b = bannerOf(view(okSlots, [{ ...GOOD, visibilityMetres: 7999 }, { ...GOOD, visibilityMetres: 7999 }, GOOD, GOOD]));
    expect(b).toMatchObject({ tone: 'ok', text: `from ${hhmm(2)}Z` });
  });

  it('shows nothing when no slot qualifies', () => {
    expect(bannerOf(view(okSlots, same(4, { ...GOOD, ceilingFt: 2999 })))).toBeUndefined();
  });

  it('shows nothing when the ceiling or the visibility is not reported', () => {
    expect(bannerOf(view(okSlots, same(4, { visibilityMetres: 9999 })))).toBeUndefined();
    expect(bannerOf(view(okSlots, same(4, { ceilingFt: 3500 })))).toBeUndefined();
  });

  it('shows nothing when the runway is wet now, or may be wet in the first slot', () => {
    const precip = (p: Partial<PrecipitationFlags>) => same(4, { ...GOOD, precipitation: { prevailing: false, probable: null, temporary: false, recent: false, ...p } });
    expect(bannerOf(view(okSlots, precip({ prevailing: true }), pack, 'METAR'))).toBeUndefined();
    expect(bannerOf(view(okSlots, precip({ recent: true }), pack, 'METAR'))).toBeUndefined();
  });

  it('follows the engine runway state along the path: wet or possibly wet later slots end the "until"', () => {
    const dry = { ...GOOD };
    const wet = { ...GOOD, precipitation: { prevailing: true, probable: null, temporary: false, recent: false } };
    const maybe = { ...GOOD, precipitation: { prevailing: false, probable: 30, temporary: false, recent: false } };
    expect(bannerOf(view(okSlots, [dry, wet, dry, dry]))?.text).toBe(`until ${hhmm(1)}Z`);
    expect(bannerOf(view(okSlots, [dry, maybe, dry, dry]))?.text).toBe(`until ${hhmm(1)}Z`);
  });

  it('shows nothing when a TEMPO group with rain would break the dry condition', () => {
    const tempo = { kind: 'TEMPO' as const, probabilityPct: null, wind: null, precipitation: true, text: 'TEMPO RA' };
    expect(bannerOf(view(okSlots, same(4, { ...GOOD, overlays: [tempo] })))).toBeUndefined();
  });

  it('shows nothing while the cell is amber, even though the conditions are met', () => {
    const v = view(same<Wx>(4, 'marginalA'), same(4, GOOD));
    expect(v.result.plan.recommendedModeId).toBe(rig.a);
    expect(v.result.evaluation.cells[v.pack.modes.findIndex((m) => m.id === rig.a)]?.[0]?.status).toBe('MARGINAL');
    expect(bannerOf(v)).toBeUndefined();
  });

  it('counts only suitable slots of the path: an amber slot ends the "until"', () => {
    const b = bannerOf(view(['ok', 'ok', 'marginalA', 'ok'], same(4, GOOD)));
    expect(b?.text).toBe(`until ${hhmm(2)}Z`);
  });

  it('shows nothing when the recommended mode has no entry', () => {
    const v = view(same<Wx>(4, 'badA'), same(4, GOOD));
    expect(v.result.plan.recommendedModeId).toBe(rig.b);
    expect(bannerOf(v)).toBeUndefined();
    expect(bannerOf(view(okSlots, same(4, GOOD), withOp(rig.b)))).toBeUndefined();
  });

  it('shows nothing when there is no recommendation or no weather', () => {
    const none = view(same<Wx>(4, 'badBoth'), same(4, GOOD));
    expect(none.result.plan.recommendedModeId).toBeNull();
    expect(panelAModel(none).banners).toEqual([]);
    expect(panelAModel(view(same<Wx>(4, 'none'), same(4, GOOD))).banners).toEqual([]);
  });

  it('never changes the recommendation, the plan or a cell', () => {
    const fields = [GOOD, GOOD, { ...GOOD, ceilingFt: 100 }, GOOD];
    const withNote = view(okSlots, fields);
    const without = view(okSlots, fields, packOf(rig, { ...WORKED, marginal: 1 }));
    expect(withNote.result).toEqual(without.result);
    expect(plan(withNote.pack, { ...inputFor(BASE, specsFor(rig, okSlots)) }).plan).toEqual(plan(without.pack, { ...inputFor(BASE, specsFor(rig, okSlots)) }).plan);
  });
});

describe('the note on the screen', () => {
  it('is drawn in Panel A as a quiet green status box with a check mark', () => {
    const html = renderDashboard(view(okSlots, same(4, GOOD)));
    const panel = html.slice(html.indexOf('Panel A'), html.indexOf('Panel B'));
    expect(panel).toContain('banner banner-ok');
    expect(panel).toContain('role="status"');
    expect(textOf(panel)).toContain(`\u2713 TESTNOTE conditions met`);
    expect(textOf(panel)).toContain(`until ${hhmm(4)}Z`);
    expect(panel).not.toContain('role="alert"');
  });

  it('draws nothing when the conditions are not met', () => {
    const html = renderDashboard(view(okSlots, same(4, { ...GOOD, ceilingFt: 2999 })));
    expect(html).not.toContain('banner-ok');
    expect(textOf(html)).not.toContain('conditions met');
  });

  it('draws nothing for a pack without a conditional operation', () => {
    const html = renderDashboard(view(okSlots, same(4, GOOD), packOf(rig, { ...WORKED, marginal: 1 })));
    expect(html).not.toContain('banner-ok');
  });
});

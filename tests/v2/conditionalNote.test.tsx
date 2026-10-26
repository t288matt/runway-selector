// The conditional-operation note on the v2 answer band (issue 58, OD-79; v2 placement owner, 26-10-2026): the same
// "<name> conditions met" note v1 shows in Panel A, drawn under "Also suitable" and kept in the Why
// section of the drawer. On the fictional TEST pack with a conditional operation added to one mode in memory. It is a
// note only: it never changes the recommendation. Each test fails if the rule it names is removed.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineInput, SlotSource, SlotWeather } from '../../src/engine';
import { Dashboard } from '../../src/v2/components/Dashboard';
import { NO_AUTO_WEATHER } from '../../src/v2/controller';
import { answerModel } from '../../src/v2/model/answer';
import { EMPTY_FEED } from '../../src/v2/model/dashboard';
import { whyModel } from '../../src/v2/model/drawer';
import { screenModel } from '../../src/v2/model/screen';
import { BASE, WORKED, packOf, rigFor, same, specsFor, type Wx } from '../engine/planHelpers';
import { SLOT_MS, inputFor } from '../engine/helpers';
import { TEST_PACK } from '../helpers/packs';
import { viewFromInput } from './helpers';

const rig = rigFor(TEST_PACK);
const OP = { name: 'TESTNOTE', ceilingFt: 3000, visibilityMetres: 8000, requiresDrySurface: true };
const pack = packOf(rig, { ...WORKED, marginal: 1 }, (f) => {
  f['modes.json'].modes.find((m: { id: string }) => m.id === rig.a).conditionalOperation = OP;
});
const GOOD: Partial<SlotWeather> = { ceilingFt: 3500, visibilityMetres: 9999 };
const okSlots = same<Wx>(4, 'ok');
const hhmm = (slot: number) => new Date(BASE + slot * SLOT_MS).toISOString().slice(11, 16).replace(':', '');

function view(fields: readonly Partial<SlotWeather>[], gov: SlotSource = 'TAF') {
  const base = inputFor(BASE, specsFor(rig, okSlots).map((s) => ({ ...s, gov: s.gov ?? gov })));
  const input: EngineInput = { ...base, weather: base.weather.map((w, i) => ({ ...w, weather: { ...w.weather, ...fields[i] } })) };
  return viewFromInput(pack, input);
}

function render(v: ReturnType<typeof view>): string {
  const state = { view: v, feed: EMPTY_FEED, displayNowMs: v.calcNowMs + 60_000, audit: [], notices: [], reload: { status: 'idle' as const, message: null }, autoWeather: NO_AUTO_WEATHER };
  return renderToStaticMarkup(<Dashboard model={screenModel(state)} pack={v.pack} onDismissNotice={() => undefined} />);
}
const textOf = (markup: string): string => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('the conditions-met note on the v2 answer band', () => {
  it('is in the answer model: "until" the end of the last qualifying slot', () => {
    expect(answerModel(view(same(4, GOOD))).conditional).toEqual({ tone: 'ok', title: 'TESTNOTE conditions met', text: `until ${hhmm(4)}Z` });
  });

  it('is "from" the start of the first qualifying slot when only a later one qualifies', () => {
    const late = { ...GOOD, visibilityMetres: 7999 };
    expect(answerModel(view([late, late, GOOD, GOOD])).conditional).toMatchObject({ text: `from ${hhmm(2)}Z` });
  });

  it('is null when no slot qualifies, and when the weather is not reported', () => {
    expect(answerModel(view(same(4, { ...GOOD, ceilingFt: 2999 }))).conditional).toBeNull();
    expect(answerModel(view(same(4, { visibilityMetres: 9999 }))).conditional).toBeNull();
  });

  it('never changes the recommendation', () => {
    const plain = viewFromInput(packOf(rig, { ...WORKED, marginal: 1 }), inputFor(BASE, specsFor(rig, okSlots)));
    expect(answerModel(view(same(4, GOOD))).modeId).toBe(answerModel(plain).modeId);
  });

  it('is drawn as a green status box with a check mark, below the "Also suitable" section', () => {
    const html = render(view(same(4, GOOD)));
    const note = html.indexOf('data-testid="conditional-note"');
    expect(note).toBeGreaterThan(-1);
    const box = html.slice(html.lastIndexOf('<p', note), html.indexOf('</p>', note));
    expect(box).toContain('banner banner-ok');
    expect(box).toContain('role="status"');
    expect(textOf(box)).toContain(`✓ TESTNOTE conditions met until ${hhmm(4)}Z`);
    const alt = html.indexOf('data-testid="alternatives"');
    if (alt >= 0) expect(note).toBeGreaterThan(alt);
  });

  it('draws nothing when the conditions are not met', () => {
    const html = render(view(same(4, { ...GOOD, ceilingFt: 2999 })));
    expect(html).not.toContain('conditional-note');
    expect(textOf(html)).not.toContain('conditions met');
  });

  it('is still in the Why section of the drawer', () => {
    expect(whyModel(view(same(4, GOOD))).banners).toEqual([{ tone: 'ok', title: 'TESTNOTE conditions met', text: `until ${hhmm(4)}Z` }]);
  });
});

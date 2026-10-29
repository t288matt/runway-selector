// The approach-type chip beside the recommended mode on the v2 answer band (issue 99, OD-83). On the fictional TEST pack with a
// ladder added in memory (made-up words and limits), then on the real Sydney pack. Each test fails if the rule it names is removed.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineInput } from '../../src/engine';
import type { AirportPack } from '../../src/refdata';
import type { DecodedCloud, DecodedConditions, DecodedMetar } from '../../src/weather';
import { Dashboard } from '../../src/v2/components/Dashboard';
import { NO_AUTO_WEATHER } from '../../src/v2/controller';
import { answerModel } from '../../src/v2/model/answer';
import { approachChip } from '../../src/v2/model/approach';
import { EMPTY_FEED, type ViewData } from '../../src/v2/model/dashboard';
import { screenModel } from '../../src/v2/model/screen';
import { BASE, WORKED, packOf, rigFor, same, specsFor, type Wx } from '../engine/planHelpers';
import { inputFor } from '../engine/helpers';
import { TEST_PACK, YSSY_PACK, loadPackFrom } from '../helpers/packs';
import { viewFromInput } from './helpers';

const rig = rigFor(TEST_PACK);
const okSlots = same<Wx>(4, 'ok');
const LADDER = {
  id: 'second',
  description: 'A made-up second airport: different words and limits.',
  rows: [
    { id: 'clear', description: 'High and clear.', cloudBase: { atLeast: 1200 }, visibility: { above: 8000 }, chipText: 'VISUAL', hoverText: 'VISUAL APPROACH EXPECTED' },
    { id: 'low', description: 'Lower cloud.', cloudBase: { atLeast: 600, below: 1200 }, visibility: { atLeast: 3000 }, chipText: 'CIRCLING', hoverText: 'CIRCLING APPROACH EXPECTED' },
    { id: 'rest', description: 'Everything else.', chipText: 'ILS ONLY', hoverText: 'ILS APPROACH ONLY' },
  ],
};
/** The TEST pack with the made-up ladder named by mode `a` (the recommended one), by mode `b`, or by none. */
const withLadder = (onMode: 'a' | 'b' | 'none' = 'a'): AirportPack =>
  packOf(rig, { ...WORKED, marginal: 1 }, (f) => {
    f['modes.json'].approachLadders = [LADDER];
    if (onMode !== 'none') f['modes.json'].modes.find((m: { id: string }) => m.id === rig[onMode]).approachLadder = 'second';
  });

const cond = (over: Partial<DecodedConditions>): DecodedMetar => ({ wind: null, visibility: null, cavok: false, clouds: [], verticalVisibilityFt: null, weather: [], ...over }) as unknown as DecodedMetar;
const cloud = (quantity: DecodedCloud['quantity'], baseFt: number | null): DecodedCloud => ({ quantity, baseFt, type: null });
const vis = (metres: number) => ({ metres, moreThan: false, lessThan: false });

/** A view whose first slot is governed by the given METAR (or by none). */
function view(pack: AirportPack, metar: DecodedMetar | null, gov: 'METAR' | 'NONE' = 'METAR'): ViewData {
  const base = inputFor(BASE, specsFor(rig, okSlots));
  const input: EngineInput = { ...base, weather: base.weather.map((w, i) => (i === 0 ? { ...w, governedBy: gov } : w)) as EngineInput['weather'] };
  return { ...viewFromInput(pack, input), metar };
}
const chipOf = (v: ViewData) => answerModel(v).approach;

function render(v: ViewData): string {
  const state = { view: v, feed: EMPTY_FEED, displayNowMs: v.calcNowMs + 60_000, audit: [], notices: [], reload: { status: 'idle' as const, message: null }, autoWeather: NO_AUTO_WEATHER, atis: null };
  return renderToStaticMarkup(<Dashboard model={screenModel(state)} pack={v.pack} onDismissNotice={() => undefined} detailOpen={false} onToggleDetail={() => undefined} />);
}
const textOf = (markup: string): string => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('a made-up second airport: different texts and limits, no engine change', () => {
  const pack = withLadder();
  it('picks each row from the pack data', () => {
    expect(chipOf(view(pack, cond({ visibility: vis(9000), clouds: [cloud('SCT', 1500)] })))).toEqual({ chip: 'VISUAL', hover: 'VISUAL APPROACH EXPECTED' });
    expect(chipOf(view(pack, cond({ visibility: vis(4000), clouds: [cloud('BKN', 800)] })))).toEqual({ chip: 'CIRCLING', hover: 'CIRCLING APPROACH EXPECTED' });
    expect(chipOf(view(pack, cond({ visibility: vis(2000), clouds: [cloud('BKN', 800)] })))).toEqual({ chip: 'ILS ONLY', hover: 'ILS APPROACH ONLY' });
  });
  it('uses the limits of this pack: 8000 m is not above 8000, 1200 ft is the first row, 1199 ft is not', () => {
    expect(chipOf(view(pack, cond({ visibility: vis(8000), clouds: [cloud('SCT', 1000)] })))?.chip).toBe('CIRCLING');
    expect(chipOf(view(pack, cond({ visibility: vis(9000), clouds: [cloud('SCT', 1200)] })))?.chip).toBe('VISUAL');
    expect(chipOf(view(pack, cond({ visibility: vis(9000), clouds: [cloud('SCT', 1199)] })))?.chip).toBe('CIRCLING');
  });
});

describe('when no chip is shown', () => {
  const pack = withLadder();
  const GOOD = cond({ visibility: vis(9000), clouds: [cloud('SCT', 1500)] });
  it('a mode with no ladder shows no chip, whatever the weather, and no wrapper', () => {
    const v = view(withLadder('b'), GOOD);
    expect(v.result.plan.recommendedModeId).toBe(rig.a);
    expect(chipOf(v)).toBeNull();
    expect(render(v)).not.toContain('approach-chip');
    expect(render(v)).not.toContain('class="mode-row"');
  });
  it('a pack with no ladders shows no chip', () => {
    expect(chipOf(view(withLadder('none'), GOOD))).toBeNull();
  });
  it('no report shows no chip and no "unknown" wording', () => {
    const v = view(pack, null, 'NONE');
    expect(chipOf(v)).toBeNull();
    expect(textOf(render(v)).toLowerCase()).not.toContain('approach');
  });
  it('a METAR with no cloud group (cloud base unknown) and good visibility shows nothing', () => {
    const v = view(pack, cond({ visibility: vis(9000) }));
    expect(chipOf(v)).toBeNull();
    expect(render(v)).not.toContain('approach-chip');
  });
  it('unknown visibility with a cloud base that fits a visibility-bound row shows nothing', () => {
    expect(chipOf(view(pack, cond({ clouds: [cloud('SCT', 1500)] })))).toBeNull();
  });
});

describe('the chip on the answer band', () => {
  const pack = withLadder();
  const v = view(pack, cond({ visibility: vis(9000), clouds: [cloud('SCT', 1500)] }));
  const html = render(v);
  it('is beside the mode name, in words, with the hover text as its description', () => {
    const at = html.indexOf('data-testid="approach-chip"');
    expect(at).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="mode"')).toBeLessThan(at);
    const open = html.lastIndexOf('<span', at);
    const chip = html.slice(open, html.indexOf('</span></span>', at) + 14);
    expect(textOf(chip)).toContain('VISUAL');
    expect(textOf(html)).toContain('VISUAL APPROACH EXPECTED');
    expect(chip).toContain('aria-label="Approach type VISUAL"');
    expect(chip).toContain('aria-describedby=');
  });
  it('never uses the word ceiling', () => {
    const area = html.slice(html.indexOf('class="mode-row"'), html.indexOf('data-testid="next"'));
    expect(area.length).toBeGreaterThan(0);
    expect(area.toLowerCase()).not.toContain('ceiling');
  });
  it('does not change the recommendation', () => {
    const plain = view(withLadder('none'), cond({ visibility: vis(9000), clouds: [cloud('SCT', 1500)] }));
    expect(answerModel(v).modeId).toBe(answerModel(plain).modeId);
  });
});

describe('the Sydney pack through the answer band (limits and words from OD-83)', () => {
  const pack = loadPackFrom(YSSY_PACK);
  const rigY = rigFor(YSSY_PACK);
  const base = inputFor(BASE, specsFor(rigY, okSlots));
  const input: EngineInput = { ...base, weather: base.weather.map((w, i) => (i === 0 ? { ...w, governedBy: 'METAR' as const } : w)) as EngineInput['weather'] };
  const v = (metar: DecodedMetar | null): ViewData => ({ ...viewFromInput(pack, input), metar });
  const chip = (metar: DecodedMetar | null, mode: string) => approachChip(v(metar), mode)?.chip ?? null;
  const T = (over: Partial<DecodedConditions>) => cond({ visibility: vis(9999), ...over });

  it.each([
    ['base 3001, vis 9999', T({ clouds: [cloud('BKN', 3001)] }), 'IVA'],
    ['base 3000 exactly', T({ clouds: [cloud('BKN', 3000)] }), 'INSTR THEN IVA'],
    ['base 2000 exactly', T({ clouds: [cloud('OVC', 2000)] }), 'INSTR THEN IVA'],
    ['base 1999', T({ clouds: [cloud('OVC', 1999)] }), 'INSTRUMENT'],
    ['FEW015 (a base, though not a ceiling)', T({ clouds: [cloud('FEW', 1500)] }), 'INSTRUMENT'],
    ['VV002', T({ verticalVisibilityFt: 200 }), 'INSTRUMENT'],
    ['vis 5000, base 4000', cond({ visibility: vis(5000), clouds: [cloud('SCT', 4000)] }), 'IVA'],
    ['vis 4999, base 4000', cond({ visibility: vis(4999), clouds: [cloud('SCT', 4000)] }), 'INSTRUMENT'],
    ['CAVOK', cond({ cavok: true }), 'IVA'],
    ['NSC, vis 9999', T({ clouds: [cloud('NSC', null)] }), 'IVA'],
    ['no cloud group, vis 9999 (cloud unknown)', T({}), null],
    ['no cloud group, vis 4000 (decided by visibility)', cond({ visibility: vis(4000) }), 'INSTRUMENT'],
    ['no visibility, base 4000', cond({ clouds: [cloud('SCT', 4000)] }), null],
    ['no visibility, base 1500 (decided by cloud)', cond({ clouds: [cloud('SCT', 1500)] }), 'INSTRUMENT'],
  ])('34AD: %s', (_name, metar, expected) => {
    expect(chip(metar, '34AD')).toBe(expected);
  });

  it('shows the same chip on 16AD, 34A25D and 34AD25, and none on the other modes', () => {
    const m = T({ clouds: [cloud('BKN', 3001)] });
    for (const id of ['34AD', '16AD', '34A25D', '34AD25']) expect(chip(m, id), id).toBe('IVA');
    for (const id of ['SODPROPS', '25A16D', '07A16D', '07AD', '25AD']) expect(chip(m, id), id).toBeNull();
  });
  it('shows nothing with no report', () => {
    expect(chip(null, '34AD')).toBeNull();
  });
});

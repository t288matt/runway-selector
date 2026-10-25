import { describe, expect, it } from 'vitest';
import { YSSY_PACK } from '../helpers/packs';
import { DAY_START_MS, inputFor, packFrom } from '../engine/helpers';
import { LAYOUT, eventStripHeight, overlayDisplayLabel, timelineModel } from '../../src/ui/model/timeline';
import { viewFromInput } from './helpers';

describe('weather events row', () => {
  const pack = packFrom(YSSY_PACK);
  const eventsOf = (precip: boolean) => {
    const v = viewFromInput(pack, inputFor(DAY_START_MS, [{ gov: 'METAR', ...(precip ? { precip: { prevailing: true } } : {}) }]));
    return timelineModel(v, v.calcNowMs).slots[0]?.events;
  };

  it('writes WET in capitals for a wet slot', () => {
    expect(eventsOf(true)).toContain('WET');
    expect(eventsOf(true)).not.toContain('wet');
  });

  it('shows no wet event for a dry slot', () => {
    expect(eventsOf(false)).not.toContain('WET');
  });
});

describe('TEMPO, INTER and PROB bars under the wind bars', () => {
  const pack = packFrom(YSSY_PACK);
  const group = (text: string, probabilityPct: 30 | 40 | null, kind: 'TEMPO' | 'INTER' | 'PROB' = 'TEMPO') => ({ kind, probabilityPct, wind: null, precipitation: false, text });
  const modelOf = (specs: Parameters<typeof inputFor>[1]) => {
    const v = viewFromInput(pack, inputFor(DAY_START_MS, specs));
    return timelineModel(v, v.calcNowMs);
  };
  const tafSlot = (...overlays: ReturnType<typeof group>[]) => ({ gov: 'TAF' as const, overlays });

  it('draws no bar line and no event-words line when there is no TEMPO, INTER or PROB and nothing to say', () => {
    const m = modelOf([tafSlot(), tafSlot(), tafSlot()]);
    expect(m.overlayBars).toEqual([]);
    expect(m.overlayLanes).toBe(0);
    expect(m.hasEventText).toBe(false);
    expect(eventStripHeight(m)).toBe(LAYOUT.eventBase);
  });

  it('draws one bar for a group over the slots it covers, never as a word in the event line', () => {
    const g = group('PROB30 TEMPO 2511/2519 VRB30G40KT 1000 TSRA', 30);
    const m = modelOf([tafSlot(), tafSlot(g), tafSlot(g), tafSlot(g), tafSlot()]);
    expect(m.overlayBars).toEqual([{ startSlot: 1, endSlot: 3, lane: 0, label: g.text, displayLabel: 'PROB30 TEMPO VRB30G40KT 1000 TSRA', probability: true }]);
    expect(m.overlayLanes).toBe(1);
    expect(m.slots.flatMap((s) => s.events)).not.toContain('TEMPO');
    expect(eventStripHeight(m)).toBe(LAYOUT.eventBase + LAYOUT.eventLine);
  });

  it('puts groups that overlap in time on separate lines, and groups that do not on the same line', () => {
    const a = group('PROB30 TEMPO 2511/2519 TSRA', 30);
    const b = group('PROB40 TEMPO 2514/2517 TSRA', 40);
    const c = group('TEMPO 2518/2520 RA', null);
    const m = modelOf([tafSlot(a), tafSlot(a), tafSlot(a, b), tafSlot(a, b), tafSlot(a), tafSlot(c)]);
    const lane = (label: string) => m.overlayBars.find((x) => x.label === label)?.lane;
    expect(lane(a.text)).toBe(0);
    expect(lane(b.text)).toBe(1);
    expect(lane(c.text)).toBe(0);
    expect(m.overlayLanes).toBe(2);
    expect(m.overlayBars.find((x) => x.label === c.text)?.probability).toBe(false);
  });

  it('starts a new bar after a gap in coverage, not one bar across the gap', () => {
    const g = group('TEMPO 2511/2513 RA', null);
    const m = modelOf([tafSlot(g), { gov: 'METAR' }, tafSlot(g)]);
    expect(m.overlayBars.map((b) => [b.startSlot, b.endSlot])).toEqual([[0, 0], [2, 2]]);
    expect(m.overlayLanes).toBe(1);
  });

  it('draws one bar when the same group text is listed twice in one slot', () => {
    const g = group('TEMPO 2511/2513 RA', null);
    const m = modelOf([tafSlot(g, g), tafSlot(g, g)]);
    expect(m.overlayBars.map((b) => [b.startSlot, b.endSlot, b.lane])).toEqual([[0, 1, 0]]);
  });

  it('leaves the validity period off the bar text for TEMPO, INTER, PROB and PROB TEMPO, keeping the full group text as hover text', () => {
    const groups = [group('TEMPO 2513/2516 VRB20G30KT 1000 TSRA BKN010', null), group('INTER 2513/2516 RA', null, 'INTER'), group('PROB40 2516/2519 TSRA', 40, 'PROB'), group('PROB30 TEMPO 2516/2519 VRB30G40KT 1000 TSRA', 30)];
    const m = modelOf(groups.map((g) => tafSlot(g)));
    expect(m.overlayBars.map((b) => b.displayLabel)).toEqual(['TEMPO VRB20G30KT 1000 TSRA BKN010', 'INTER RA', 'PROB40 TSRA', 'PROB30 TEMPO VRB30G40KT 1000 TSRA']);
    for (const b of m.overlayBars) {
      expect(b.displayLabel).not.toMatch(/\d{4}\/\d{4}/);
      expect(b.label).toMatch(/\d{4}\/\d{4}/);
    }
  });

  it('removes only the validity token, and only the first one, from a group text', () => {
    expect(overlayDisplayLabel('TEMPO 2513/2516 RA')).toBe('TEMPO RA');
    expect(overlayDisplayLabel('PROB30 TEMPO 2516/2519 VRB30G40KT 1000 TSRA BKN010')).toBe('PROB30 TEMPO VRB30G40KT 1000 TSRA BKN010');
    expect(overlayDisplayLabel('TEMPO 2513/2516 RA 1200/1500')).toBe('TEMPO RA 1200/1500');
  });

  it('draws the event-words line only when a slot has something to say, such as WET', () => {
    const m = modelOf([{ gov: 'METAR', precip: { prevailing: true } }]);
    expect(m.hasEventText).toBe(true);
    expect(eventStripHeight(m)).toBe(LAYOUT.eventBase + LAYOUT.eventLine);
  });
});

// The tiles: the traffic trend rule (all five outcomes and its edges), the traffic,
// ceiling, runway-state and METAR values, and the trust chips.
import { describe, expect, it } from 'vitest';
import type { TrafficLevel } from '../../src/engine';
import { chipModels } from '../../src/v2/model/chips';
import { calculate, EMPTY_FEED, type FeedState } from '../../src/v2/model/dashboard';
import { decodeMetar } from '../../src/weather';
import { ceilingTile, conditionWords, levelWord, metarTile, runwayTile, TREND_HORIZON_MS, trafficTile, trafficTrend } from '../../src/v2/model/tiles';
import { NO_AUTO_WEATHER } from '../../src/v2/controller';
import { PACKS, YSSY_PACK } from '../helpers/packs';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { packWith } from '../weather/helpers';
import { FIXTURE_NOW, FIXTURE_STATION, realView, viewOf } from './helpers';

const T0 = Date.UTC(2026, 9, 25, 19, 0, 0);
const HALF = 30 * 60_000;
const starts = (n: number): number[] => Array.from({ length: n }, (_v, i) => T0 + i * HALF);
const NOW = T0 + 28 * 60_000; // 1928Z, the trend looks to 2128Z

describe('traffic trend (the two-hour rule)', () => {
  const L: TrafficLevel = 'light';
  const M: TrafficLevel = 'medium';
  const B: TrafficLevel = 'busy';

  it('1. steady: every known later slot is at the level now', () => {
    const t = trafficTrend([L, L, L, L, L], starts(5), NOW);
    expect(t.direction).toBe('steady');
    expect(t.text).toBe('steady to 2130Z');
  });

  it('2. increasing: a later slot is at a higher level', () => {
    const t = trafficTrend([L, L, M, M, B], starts(5), NOW);
    expect(t.direction).toBe('increasing');
    expect(t.text).toBe('increasing to MEDIUM from 2000Z');
  });

  it('3. decreasing: a later slot is at a lower level', () => {
    const t = trafficTrend([B, B, M, L, L], starts(5), NOW);
    expect(t.direction).toBe('decreasing');
    expect(t.text).toBe('decreasing to MEDIUM from 2000Z');
  });

  it('4. no arrow when every later slot is unknown', () => {
    const t = trafficTrend([L, null, null, null, null], starts(5), NOW);
    expect(t.direction).toBe('none');
    expect(t.text).toBe('later traffic is unknown');
  });

  it('5. no arrow when the level now is unknown', () => {
    const t = trafficTrend([null, L, M, B], starts(4), NOW);
    expect(t.direction).toBe('none');
  });

  it('ignores unknown slots among known ones, and says "unknown after" when the known ones stop', () => {
    const t = trafficTrend([L, L, null, L, null], starts(5), NOW);
    expect(t.direction).toBe('steady');
    expect(t.text).toBe('steady to 2100Z, unknown after');
    expect(trafficTrend([L, null, M, null, null], starts(5), NOW).direction).toBe('increasing');
  });

  it('looks only two hours ahead: a change beyond that is not a trend', () => {
    const s = starts(8);
    const t = trafficTrend([L, L, L, L, L, B, B, B], s, NOW);
    expect(s[5]).toBeGreaterThanOrEqual(NOW + TREND_HORIZON_MS);
    expect(t.direction).toBe('steady');
  });

  it('when the later slots go both ways, the first change decides', () => {
    expect(trafficTrend([M, M, B, L], starts(4), NOW).direction).toBe('increasing');
    expect(trafficTrend([M, M, L, B], starts(4), NOW).direction).toBe('decreasing');
  });

  it('is steady with a single slot of data only if a later one is known', () => {
    expect(trafficTrend([L], starts(1), NOW).direction).toBe('none');
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 tiles [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('traffic: the level word from the pack bands, the headline, the trend and the in and out counts', () => {
    const view = viewOf(pack, rig, same<Wx>(6, 'ok'), ['light', 'light', 'medium', 'medium', 'busy', 'busy']);
    const t = trafficTile(view, EMPTY_FEED);
    expect(t.state).toBe('ok');
    expect(t.word).toBe(levelWord('light'));
    expect(t.word).toBe('LOW');
    expect(t.headline).toBe('LOW → MEDIUM');
    expect(t.trend.direction).toBe('increasing');
    expect(t.sub).toMatch(/^by \d{4}Z · 0 in · 0 out$/);
    expect(t.aria).toContain('Traffic LOW, increasing');
    expect(t.popover).toContain('Connected now: 0 inbound');
  });

  it('traffic bars (issue 126): three half-hour slots; the headline names the first change; steady is just the level', () => {
    const rising = trafficTile(viewOf(pack, rig, same<Wx>(6, 'ok'), ['light', 'medium', 'busy', 'busy', 'busy', 'busy']), EMPTY_FEED);
    expect(rising.slots).toHaveLength(3);
    expect(rising.slots.map((s) => s.level)).toEqual(['light', 'medium', 'busy']);
    expect(rising.headline).toBe('LOW → MEDIUM');
    expect(trafficTile(viewOf(pack, rig, same<Wx>(6, 'ok'), ['busy', 'busy', 'medium', 'light', 'light', 'light']), EMPTY_FEED).headline).toBe('HIGH → MEDIUM');
    const steady = trafficTile(viewOf(pack, rig, same<Wx>(6, 'ok'), same(6, 'medium')), EMPTY_FEED);
    expect(steady.headline).toBe('MEDIUM');
    expect(steady.sub).toBe('Traffic · 0 in · 0 out');
    expect(trafficTile(viewOf(pack, rig, same<Wx>(6, 'ok'), ['light', 'light', 'light', 'busy', 'busy', 'busy']), EMPTY_FEED).headline).toBe('LOW');
    for (const s of rising.slots) expect(s.width).toBeGreaterThanOrEqual(0);
    expect(rising.popover).toContain('Next 90 minutes:');
  });

  it('traffic: no data says so and gives the reason when VATSIM failed', () => {
    const view = viewOf(pack, rig, same<Wx>(3, 'ok'));
    expect(trafficTile(view, EMPTY_FEED)).toMatchObject({ state: 'none', word: 'NO DATA', headline: 'NO DATA', slots: [] });
    const failed: FeedState = { ...EMPTY_FEED, error: 'network down', errorAtMs: 1 };
    expect(trafficTile(view, failed).popover).toContain('network down');
  });

  it('runway state: DRY with the time it turns wet, WET with the time it dries, and the bar has one segment per slot', () => {
    const dry = runwayTile(viewOf(pack, rig, same<Wx>(6, 'ok')));
    expect(dry.word).toBe('DRY');
    expect(dry.detail).toMatch(/^no wet runway forecast to \d{4}Z$/);
    expect(dry.segments).toEqual(same(6, 'dry'));
  });

  it('weather line (issue 123): says nothing is forecast, then "now", then "in N min" worded from the report', () => {
    const view = viewOf(pack, rig, same<Wx>(6, 'ok'));
    expect(runwayTile(view).headline).toBe('No precipitation forecast');
    const withPresent = (at: number, c: { intensity: '-' | '+' | null; descriptor: string | null; phenomena: string[] }) => ({
      ...view,
      weather: { ...view.weather, slots: view.weather.slots.map((s, i) => (i === at ? { ...s, weather: { ...s.weather, present: [c] } } : s)) },
    });
    expect(runwayTile(withPresent(0, { intensity: '+', descriptor: null, phenomena: ['RA'] })).headline).toBe('Heavy rain now');
    const soon = runwayTile(withPresent(1, { intensity: null, descriptor: 'SH', phenomena: ['RA'] })).headline;
    expect(soon).toMatch(/^Showers in \d+ min$/);
    const late = runwayTile(withPresent(5, { intensity: null, descriptor: 'SH', phenomena: ['RA'] }));
    expect(late.headline).toMatch(/^Showers (in \d+ h( \d+ min)?|from \d{4}Z)$/);
    expect(runwayTile(withPresent(0, { intensity: '+', descriptor: null, phenomena: ['RA'] })).aria).toContain('Heavy rain now. Runway');
  });

  it('weather words: intensity, showers, drizzle, snow, thunderstorm, freezing', () => {
    const w = (intensity: '-' | '+' | null, descriptor: string | null, ...phenomena: string[]) => conditionWords({ intensity, descriptor, phenomena });
    expect(w(null, 'SH', 'RA')).toBe('showers');
    expect(w('+', null, 'RA')).toBe('heavy rain');
    expect(w('-', null, 'DZ')).toBe('light drizzle');
    expect(w(null, 'TS', 'RA')).toBe('thunderstorm');
    expect(w(null, 'FZ', 'RA')).toBe('freezing rain');
    expect(w('-', 'SH', 'SN')).toBe('light snow showers');
    expect(w(null, null, 'UP')).toBe('precipitation');
  });

  it('runway state: unknown when no weather governs the slot', () => {
    expect(runwayTile(viewOf(pack, rig, same<Wx>(3, 'none')))).toMatchObject({ known: false, word: 'UNKNOWN' });
  });

  it('ceiling and METAR are Unknown without reports', () => {
    const view = viewOf(pack, rig, same<Wx>(2, 'ok'));
    expect(ceilingTile(view)).toMatchObject({ value: 'Unknown', visibility: 'vis unknown' });
    expect(metarTile(view).text).toBeNull();
  });
});

describe('v2 tiles from the real METAR and TAF', () => {
  const real = packWith(YSSY_PACK, { weatherStation: FIXTURE_STATION });
  const view = realView(real, YSSY_PACK);

  it('METAR line is the report without the station code', () => {
    const raw = view.metar?.raw ?? '';
    const line = metarTile(view).text ?? '';
    expect(line.length).toBeGreaterThan(0);
    expect(raw).toContain(line.replace(/^(METAR|SPECI)\s+/, ''));
    expect(line).not.toContain(FIXTURE_STATION);
  });

  it('ceiling reads the governing report: feet with a thousands comma, or the no-ceiling words', () => {
    const t = ceilingTile(view);
    expect(t.value).toMatch(/^(\d{1,3}(,\d{3})* ft|No ceiling|CAVOK|Unknown)$/);
    expect(t.visibility).toMatch(/^vis (\d+ m|10 km or more|unknown)$/);
    expect(t.aria).toMatch(/^Ceiling .+, visibility .+/);
  });
});

describe('v2 ceiling tile words', () => {
  const pack = packWith(PACKS[0]!, { weatherStation: 'YSSY' });
  const now = Date.parse('2026-10-24T10:00:00Z');
  const tileFor = (body: string) => {
    const metar = decodeMetar(`YSSY 241000Z ${body}`, { pack, nowMs: now });
    if (metar.kind !== 'ok') throw new Error('bad fixture METAR');
    return ceilingTile(calculate({ pack, nowMs: now, metar: metar.report, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED }));
  };

  it('CAVOK reads just "CAVOK" (the words "no ceiling" are redundant)', () => {
    const t = tileFor('03010KT CAVOK 24/15 Q1013');
    expect(t.value).toBe('CAVOK');
    expect(t.visibility).toBe('vis 10 km or more');
  });

  it('only FEW or SCT cloud still reads "No ceiling"', () => {
    expect(tileFor('03010KT 9999 FEW005 SCT010 24/15 Q1013').value).toBe('No ceiling');
  });
});

describe('v2 trust chips', () => {
  const real = packWith(YSSY_PACK, { weatherStation: FIXTURE_STATION });
  const view = realView(real, YSSY_PACK);
  const fresh: FeedState = { aircraft: [], prefiles: [], fetchedAtMs: FIXTURE_NOW - 59_000, error: null, errorAtMs: null };
  const tafAt = view.taf?.issuedAtMs ?? 0;
  const staleMs = real.settings.tafStaleMinutes * 60_000;
  const tafChip = (now: number) => chipModels(view, fresh, now, NO_AUTO_WEATHER).find((c) => c.id === 'taf');

  it('a TAF is a round dot until it is older than tafStaleMinutes, then an amber triangle', () => {
    expect(tafChip(tafAt + staleMs)).toMatchObject({ shape: 'dot', tone: 'ok', flag: null });
    expect(tafChip(tafAt + staleMs + 1)).toMatchObject({ shape: 'triangle', tone: 'warn', flag: 'Stale' });
    expect(tafChip(tafAt + staleMs + 1)?.tip).toContain(`${real.settings.tafStaleMinutes} min`);
  });

  it('a TAF that failed to fetch is a cross, whatever its age', () => {
    const auto = { metar: NO_AUTO_WEATHER.metar, taf: { ...NO_AUTO_WEATHER.taf, error: 'HTTP 503', source: 'automatic' as const } };
    expect(chipModels(view, fresh, tafAt + 60_000, auto).find((c) => c.id === 'taf')).toMatchObject({ shape: 'cross', tone: 'bad', flag: 'Failed' });
  });

  it('shows the METAR, TAF and VATSIM ages and the recalculation times', () => {
    const chips = chipModels(view, fresh, FIXTURE_NOW, NO_AUTO_WEATHER);
    expect(chips.map((c) => c.id)).toEqual(['metar', 'taf', 'vatsim', 'plan']);
    expect(chips.find((c) => c.id === 'vatsim')?.value).toBe('59s');
    expect(chips.find((c) => c.id === 'plan')?.value).toMatch(/^\d{4} → \d{4}$/);
    expect(chips.find((c) => c.id === 'plan')?.tip).toMatch(/^Plan recalculated at \d{4}Z\. Next recalculation \d{4}Z\.$/);
  });

  it('VATSIM: loading is a ring, failed is a cross with the last good time, old is a triangle', () => {
    const vatsim = (feed: FeedState, now = FIXTURE_NOW) => chipModels(view, feed, now, NO_AUTO_WEATHER).find((c) => c.id === 'vatsim');
    expect(vatsim(EMPTY_FEED)).toMatchObject({ shape: 'ring', flag: 'Loading' });
    expect(vatsim({ ...fresh, error: 'network down', errorAtMs: 1 })).toMatchObject({ shape: 'cross', flag: 'Failed' });
    expect(vatsim({ ...fresh, error: 'network down', errorAtMs: 1 })?.tip).toContain('The last good traffic data is from');
    const old = { ...fresh, fetchedAtMs: FIXTURE_NOW - (real.settings.vatsimStaleMinutes * 60_000 + 1) };
    expect(vatsim(old)).toMatchObject({ shape: 'triangle', flag: 'Stale' });
  });

  it('no weather entered is a ring with the words "Not entered"', () => {
    const empty = { ...view, metar: null, taf: null };
    const chips = chipModels(empty, fresh, FIXTURE_NOW, NO_AUTO_WEATHER);
    expect(chips.find((c) => c.id === 'metar')).toMatchObject({ shape: 'ring', flag: 'Not entered', value: null });
  });

});

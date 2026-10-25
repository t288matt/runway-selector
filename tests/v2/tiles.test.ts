// The tiles: the traffic trend rule (all five outcomes and its edges), the traffic,
// ceiling, runway-state and METAR values, and the trust chips.
import { describe, expect, it } from 'vitest';
import type { TrafficLevel } from '../../src/engine';
import { chipModels, provisionalParts } from '../../src/v2/model/chips';
import { EMPTY_FEED, type FeedState } from '../../src/v2/model/dashboard';
import { ceilingTile, levelWord, metarTile, runwayTile, TREND_HORIZON_MS, trafficTile, trafficTrend } from '../../src/v2/model/tiles';
import { NO_AUTO_WEATHER } from '../../src/v2/controller';
import { PACKS, readJson, toRaw, YSSY_PACK } from '../helpers/packs';
import { parsePack } from '../../src/refdata';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { packWith } from '../weather/helpers';
import { FIXTURE_NOW, FIXTURE_STATION, realView, viewOf } from './helpers';

const T0 = Date.UTC(2026, 9, 25, 19, 0, 0);
const HALF = 30 * 60_000;
const starts = (n: number): number[] => Array.from({ length: n }, (_v, i) => T0 + i * HALF);
const NOW = T0 + 28 * 60_000; // 19:28Z, the trend looks to 21:28Z

describe('traffic trend (the two-hour rule)', () => {
  const L: TrafficLevel = 'light';
  const M: TrafficLevel = 'medium';
  const B: TrafficLevel = 'busy';

  it('1. steady: every known later slot is at the level now', () => {
    const t = trafficTrend([L, L, L, L, L], starts(5), NOW);
    expect(t.direction).toBe('steady');
    expect(t.text).toBe('steady to 21:30Z');
  });

  it('2. increasing: a later slot is at a higher level', () => {
    const t = trafficTrend([L, L, M, M, B], starts(5), NOW);
    expect(t.direction).toBe('increasing');
    expect(t.text).toBe('increasing to MEDIUM from 20:00Z');
  });

  it('3. decreasing: a later slot is at a lower level', () => {
    const t = trafficTrend([B, B, M, L, L], starts(5), NOW);
    expect(t.direction).toBe('decreasing');
    expect(t.text).toBe('decreasing to MEDIUM from 20:00Z');
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
    expect(t.text).toBe('steady to 21:00Z, unknown after');
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

  it('traffic: the level word from the pack bands, three bars, the trend and the in and out counts', () => {
    const view = viewOf(pack, rig, same<Wx>(6, 'ok'), ['light', 'light', 'medium', 'medium', 'busy', 'busy']);
    const t = trafficTile(view, EMPTY_FEED);
    expect(t.state).toBe('ok');
    expect(t.word).toBe(levelWord('light'));
    expect(t.word).toBe('LOW');
    expect(t.bars).toBe(1);
    expect(t.trend.direction).toBe('increasing');
    expect(t.sub).toBe('Traffic · 0 in · 0 out');
    expect(t.aria).toContain('Traffic LOW, increasing');
    expect(t.popover).toContain('Connected now: 0 inbound');
  });

  it('traffic: HIGH lights three bars and MEDIUM two', () => {
    expect(trafficTile(viewOf(pack, rig, same<Wx>(2, 'ok'), ['busy', 'busy']), EMPTY_FEED).bars).toBe(3);
    expect(trafficTile(viewOf(pack, rig, same<Wx>(2, 'ok'), ['medium', 'medium']), EMPTY_FEED).bars).toBe(2);
  });

  it('traffic: no data says so and gives the reason when VATSIM failed', () => {
    const view = viewOf(pack, rig, same<Wx>(3, 'ok'));
    expect(trafficTile(view, EMPTY_FEED)).toMatchObject({ state: 'none', word: 'NO DATA', bars: 0 });
    const failed: FeedState = { ...EMPTY_FEED, error: 'network down', errorAtMs: 1 };
    expect(trafficTile(view, failed).popover).toContain('network down');
  });

  it('runway state: DRY with the time it turns wet, WET with the time it dries, and the bar has one segment per slot', () => {
    const dry = runwayTile(viewOf(pack, rig, same<Wx>(6, 'ok')));
    expect(dry.word).toBe('DRY');
    expect(dry.detail).toMatch(/^no wet runway forecast to \d\d:\d\dZ$/);
    expect(dry.segments).toEqual(same(6, 'dry'));
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
    expect(t.value).toMatch(/^(\d{1,3}(,\d{3})* ft|No ceiling|CAVOK \(no ceiling\)|Unknown)$/);
    expect(t.visibility).toMatch(/^vis (\d+ m|10 km or more|unknown)$/);
    expect(t.aria).toMatch(/^Ceiling .+, visibility .+/);
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
    const auto = { metar: NO_AUTO_WEATHER.metar, taf: { error: 'HTTP 503', fetched: true } };
    expect(chipModels(view, fresh, tafAt + 60_000, auto).find((c) => c.id === 'taf')).toMatchObject({ shape: 'cross', tone: 'bad', flag: 'Failed' });
  });

  it('shows the METAR, TAF and VATSIM ages and the recalculation times', () => {
    const chips = chipModels(view, fresh, FIXTURE_NOW, NO_AUTO_WEATHER);
    expect(chips.map((c) => c.id)).toEqual(['metar', 'taf', 'vatsim', 'plan']);
    expect(chips.find((c) => c.id === 'vatsim')?.value).toBe('59s');
    expect(chips.find((c) => c.id === 'plan')?.value).toMatch(/^\d\d:\d\d → \d\d:\d\d$/);
    expect(chips.find((c) => c.id === 'plan')?.tip).toMatch(/^Plan recalculated at \d\d:\d\dZ\. Next recalculation \d\d:\d\dZ\.$/);
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

  it('has no Pack draft chip unless the pack data says provisional', () => {
    expect(chipModels(view, fresh, FIXTURE_NOW, NO_AUTO_WEATHER).some((c) => c.id === 'draft')).toBe(false);
    expect(provisionalParts(real)).toEqual([]);
    const files = readJson(YSSY_PACK);
    files['runways.json'].status = 'provisional';
    files['runways.json'].source = 'a public source';
    const draft = parsePack(toRaw(files));
    const chips = chipModels({ ...view, pack: draft }, fresh, FIXTURE_NOW, NO_AUTO_WEATHER);
    const chip = chips.find((c) => c.id === 'draft');
    expect(chip).toMatchObject({ shape: 'triangle', label: 'Pack draft' });
    expect(chip?.tip).toContain('runways (a public source)');
  });
});

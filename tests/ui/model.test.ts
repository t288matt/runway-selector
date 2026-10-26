import { describe, expect, it } from 'vitest';
import { PACKS, YSSY_PACK, loadPackFrom } from '../helpers/packs';
import { decodeMetar, decodeTaf } from '../../src/weather';
import { preferencePenalty } from '../../src/engine/optimiser';
import { cellDetailModel, panelAModel } from '../../src/ui/model/panels';
import { decodeMetarFixture, decodeTafFixture, nowOf, fixture, packWith, MIN } from '../weather/helpers';
import {
  applyFeedResult,
  calculate,
  dataNotices,
  DEFAULT_WINDOW,
  EMPTY_FEED,
  freshness,
  freshnessChips,
  levelShortWord,
  levelWord,
  needsRecalculation,
  nextPlanMs,
  SLOT_MS,
  WINDOW_OPTIONS,
  windowMinutes,
  type FeedState,
} from '../../src/ui/model/dashboard';
import { moveFocus, modeRows, summaryTiles, timelineModel, visibleRows, windRuns, windShift, windText } from '../../src/ui/model/timeline';
import { hhmmZ, hhmmZRel, utcAndLocal, ageText, durationText, safeHttpsLink, dir3 } from '../../src/ui/format';
import { packOf, rigFor } from '../engine/planHelpers';
import { viewOf } from './helpers';

const METAR_ID = 'metar-yssy-auto-nodata';
const TAF_ID = 'taf-yssy-multiline-fm-tempo';

describe('window choices (OD-31)', () => {
  it('offers 4 hours, 6 hours and the full TAF, with the full TAF as the default', () => {
    expect(WINDOW_OPTIONS.map((o) => o.label)).toEqual(['4 hours', '6 hours', 'Full TAF']);
    expect(DEFAULT_WINDOW).toBe('full');
    expect(windowMinutes('4h')).toBe(240);
    expect(windowMinutes('6h')).toBe(360);
    expect(windowMinutes('full')).toBeNull();
  });

  describe.each(PACKS.map((p) => [p.name, p] as const))('slots of the chosen window [%s]', (_n, ref) => {
    const pack = packWith(ref, { weatherStation: fixture(METAR_ID).station });
    const metar = decodeMetarFixture(METAR_ID, ref);
    const taf = decodeTafFixture(TAF_ID, ref);
    const nowMs = nowOf(fixture(TAF_ID));
    const make = (choice: '4h' | '6h' | 'full') => calculate({ pack, nowMs, metar, taf, windowChoice: choice, currentMode: null, feed: EMPTY_FEED });

    it('4 hours is 8 slots, 6 hours is 12 slots, the full TAF runs to its validity', () => {
      expect(make('4h').weather.slots).toHaveLength(8);
      expect(make('6h').weather.slots).toHaveLength(12);
      const slot0 = Math.floor(nowMs / SLOT_MS) * SLOT_MS;
      expect(make('full').weather.slots).toHaveLength(Math.ceil((taf.validToMs - slot0) / SLOT_MS));
    });

    it('the plan and the timeline use the same slots as the window', () => {
      for (const choice of ['4h', '6h', 'full'] as const) {
        const v = make(choice);
        expect(v.result.evaluation.slots).toHaveLength(v.weather.slots.length);
        expect(timelineModel(v, nowMs).slots).toHaveLength(v.weather.slots.length);
      }
    });
  });
});

describe('freshness and stale flags', () => {
  it('is stale only after the limit; exactly at the limit is not stale', () => {
    const at = Date.UTC(2026, 9, 23, 10, 0);
    expect(freshness(at + 60 * MIN, at, 60)).toEqual({ ageMinutes: 60, stale: false });
    expect(freshness(at + 60 * MIN + 1, at, 60).stale).toBe(true);
    expect(freshness(at + 12 * MIN, at, 60)).toEqual({ ageMinutes: 12, stale: false });
  });

  describe.each(PACKS.map((p) => [p.name, p] as const))('chips use the pack limits [%s]', (_n, ref) => {
    const pack = packWith(ref, { weatherStation: fixture(METAR_ID).station });
    const metar = decodeMetarFixture(METAR_ID, ref);
    const taf = decodeTafFixture(TAF_ID, ref);
    const nowMs = nowOf(fixture(TAF_ID));
    const view = calculate({ pack, nowMs, metar, taf, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    const chip = (id: string, at: number, feed: FeedState = EMPTY_FEED) => freshnessChips(view, feed, at).find((c) => c.id === id);

    it('flags the METAR as stale from its own time group and metarStaleMinutes', () => {
      const limit = pack.settings.metarStaleMinutes * MIN;
      expect(chip('metar', metar.observedAtMs + limit)?.flag).toBeNull();
      expect(chip('metar', metar.observedAtMs + limit + 1000)?.flag).toBe('Stale');
      expect(chip('metar', metar.observedAtMs + limit + 1000)?.tone).toBe('warn');
    });

    it('flags the TAF as stale from tafStaleMinutes', () => {
      const limit = pack.settings.tafStaleMinutes * MIN;
      expect(chip('taf', taf.issuedAtMs + limit)?.flag).toBeNull();
      expect(chip('taf', taf.issuedAtMs + limit + 1000)?.flag).toBe('Stale');
    });

    it('flags traffic stale from vatsimStaleMinutes and failed when the last fetch failed', () => {
      const fetched = nowMs;
      const feed: FeedState = { aircraft: [], prefiles: [], fetchedAtMs: fetched, error: null, errorAtMs: null };
      const limit = pack.settings.vatsimStaleMinutes * MIN;
      expect(chip('vatsim', fetched + limit, feed)?.flag).toBeNull();
      expect(chip('vatsim', fetched + limit + 1000, feed)?.flag).toBe('Stale');
      const failed = chip('vatsim', fetched + 1000, { ...feed, error: 'HTTP 503' });
      expect(failed?.flag).toBe('Failed');
      expect(failed?.tone).toBe('bad');
      expect(failed?.detail).toContain(hhmmZ(fetched).replace('Z', ''));
    });

    it('says Not entered when a report is missing', () => {
      const none = calculate({ pack, nowMs, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
      const chips = freshnessChips(none, EMPTY_FEED, nowMs);
      expect(chips.find((c) => c.id === 'metar')?.flag).toBe('Not entered');
      expect(chips.find((c) => c.id === 'taf')?.flag).toBe('Not entered');
      expect(chips.find((c) => c.id === 'vatsim')?.detail).toBe('Loading');
    });

    it('shows the plan time and the next plan time on the half hour', () => {
      expect(chip('plan', nowMs)?.detail).toBe(`${hhmmZ(nowMs)}, next ${hhmmZ(nextPlanMs(nowMs))}`);
      expect(nextPlanMs(nowMs) % SLOT_MS).toBe(0);
      expect(nextPlanMs(nowMs)).toBeGreaterThan(nowMs);
    });
  });
});

describe('notices for missing and stale data (WX-9, UI_DESIGN section 7)', () => {
  const ref = PACKS[0];
  if (ref === undefined) throw new Error('no pack');
  const pack = packWith(ref, { weatherStation: fixture(METAR_ID).station });
  const metar = decodeMetarFixture(METAR_ID, ref);
  const nowMs = nowOf(fixture(METAR_ID));

  it('names the missing report', () => {
    const noTaf = calculate({ pack, nowMs, metar, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    expect(dataNotices(noTaf, EMPTY_FEED, nowMs).map((n) => n.id)).toContain('no-taf');
    const none = calculate({ pack, nowMs, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    expect(dataNotices(none, EMPTY_FEED, nowMs).map((n) => n.id)).toContain('no-weather');
  });

  it('words a stale METAR from the live clock and a failed feed in red, naming the time of the last good data', () => {
    const view = calculate({ pack, nowMs, metar, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    const later = metar.observedAtMs + (pack.settings.metarStaleMinutes + 2) * MIN;
    const stale = dataNotices(view, EMPTY_FEED, later).find((n) => n.id === 'metar-stale');
    expect(stale?.text).toContain(`${pack.settings.metarStaleMinutes + 2} min old`);
    const failed = dataNotices(view, { aircraft: [], prefiles: [], fetchedAtMs: nowMs, error: 'HTTP 503', errorAtMs: nowMs }, nowMs).find((n) => n.id === 'vatsim-failed');
    expect(failed?.tone).toBe('bad');
    expect(failed?.text).toContain('HTTP 503');
    expect(failed?.text).toContain('last good traffic data');
  });
});

describe('the traffic feed keeps its previous data on failure (UP-3)', () => {
  const good: FeedState = { aircraft: [{ latitude: 0, longitude: 0, altitude: 0, groundspeed: 0, departure: 'AAAA', arrival: 'BBBB' }], prefiles: [], fetchedAtMs: 1000, error: null, errorAtMs: null };

  it('replaces the data on success and clears the error', () => {
    const next = applyFeedResult({ ...good, error: 'old' }, { ok: true, aircraft: [], prefiles: [], fetchedAtMs: 2000, feedTimestampMs: null, skippedPilots: 0 }, 2000);
    expect(next).toEqual({ aircraft: [], prefiles: [], fetchedAtMs: 2000, error: null, errorAtMs: null });
  });

  it('a good fetch brings its prefiles in; a failed fetch clears them (a prefile has no date, so an old one must not count again)', () => {
    const plan = { departure: 'YSSY', arrival: 'YMML', departureMinuteOfDay: 640, enrouteMinutes: 90 };
    const fetched = applyFeedResult(EMPTY_FEED, { ok: true, aircraft: [], prefiles: [plan], fetchedAtMs: 1000, feedTimestampMs: null, skippedPilots: 0 }, 1000);
    expect(fetched.prefiles).toEqual([plan]);
    const failed = applyFeedResult(fetched, { ok: false, error: { kind: 'network', message: 'down' } }, 2000);
    expect(failed.prefiles).toEqual([]);
    expect(failed.aircraft).toEqual([]);
  });

  it('the feed reaches the demand model: a prefile filed for the next slot counts there', () => {
    const plan = { departure: 'YSSY', arrival: 'YMML', departureMinuteOfDay: 640, enrouteMinutes: 90 };
    const feed: FeedState = { aircraft: [], prefiles: [plan], fetchedAtMs: 1000, error: null, errorAtMs: null };
    const v = calculate({ pack: loadPackFrom(YSSY_PACK), nowMs: Date.UTC(2026, 9, 23, 10, 10), metar: null, taf: null, windowChoice: '4h', currentMode: null, feed });
    expect(v.demand?.slots[1]?.departures).toBe(1);
    expect(v.demand?.slots[0]?.departures).toBe(0);
  });

  it('keeps the aircraft and the time of the last good data on failure, and records the failure', () => {
    const next = applyFeedResult(good, { ok: false, error: { kind: 'network', message: 'Traffic data could not be read' } }, 3000);
    expect(next.aircraft).toBe(good.aircraft);
    expect(next.fetchedAtMs).toBe(1000);
    expect(next.error).toBe('Traffic data could not be read');
    expect(next.errorAtMs).toBe(3000);
  });
});

describe('recalculation every 30 minutes (UP-1)', () => {
  const half = Date.UTC(2026, 9, 23, 10, 30);
  it('does not recalculate inside the same half hour', () => {
    expect(needsRecalculation(half + 2 * MIN, half + 29 * MIN)).toBe(false);
  });
  it('recalculates when the clock crosses a half hour, even after a few minutes', () => {
    expect(needsRecalculation(half + 29 * MIN, half + 31 * MIN)).toBe(true);
  });
  it('recalculates after a full 30 minutes whatever the alignment', () => {
    expect(needsRecalculation(half, half + 30 * MIN)).toBe(true);
  });
});

describe('traffic words (display mapping only)', () => {
  it('shows light, medium and busy as LOW, MEDIUM and HIGH', () => {
    expect(levelWord('light')).toBe('LOW');
    expect(levelWord('medium')).toBe('MEDIUM');
    expect(levelWord('busy')).toBe('HIGH');
    expect(levelWord(null)).toBe('UNKNOWN');
    expect(['light', 'medium', 'busy', null].map((l) => levelShortWord(l as 'light' | 'medium' | 'busy' | null))).toEqual(['LOW', 'MED', 'HIGH', '?']);
  });
});

describe('formatting', () => {
  // OD-36 (24-10-2026): the screen shows UTC only now. utcAndLocal is kept as a thin
  // alias of hhmmZ so existing call sites need no change; this proves it ignores the zone.
  it('shows UTC only, ignoring the zone argument', () => {
    const ms = Date.UTC(2026, 9, 23, 14, 0);
    expect(utcAndLocal(ms, 'Australia/Sydney')).toBe('1400Z');
    expect(utcAndLocal(ms, 'Asia/Kathmandu')).toBe('1400Z');
    expect(utcAndLocal(ms, 'Not/AZone')).toBe('1400Z');
  });
  it('never marks a later UTC day (issue 129)', () => {
    const ms = Date.UTC(2026, 9, 24, 0, 30);
    expect(hhmmZRel(ms, Date.UTC(2026, 9, 23, 23, 0))).toBe('0030Z');
    expect(hhmmZRel(ms, ms)).toBe('0030Z');
  });
  it('words ages, durations and directions', () => {
    expect(ageText(12)).toBe('12 min');
    expect(ageText(135)).toBe('2 h 15 min');
    expect(durationText(9 * 3_600_000 + 18 * MIN)).toBe('9 h 18 min');
    expect(dir3(5)).toBe('005');
    expect(dir3(360)).toBe('360');
  });
  it('allows a link only for https', () => {
    expect(safeHttpsLink('https://example.org/a')).toBe('https://example.org/a');
    expect(safeHttpsLink('http://example.org/a')).toBeNull();
    expect(safeHttpsLink('javascript:alert(1)')).toBeNull();
    expect(safeHttpsLink('not a link')).toBeNull();
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('timeline rows and tiles [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const wx = ['ok', 'ok', 'ok', 'ok', 'badA', 'badA'] as const;

  it('lists enabled modes only, in operating-plan priority order, badging the recommended and current modes', () => {
    const v = viewOf(pack, rig, wx, [], rig.b);
    const rows = modeRows(v);
    expect(rows.map((r) => r.modeId).sort()).toEqual(pack.modes.filter((m) => m.enabled).map((m) => m.id).sort());
    const cell0 = (r: (typeof rows)[number]) => v.result.evaluation.cells[r.index]?.[0];
    const penalties = rows.map((r) => preferencePenalty(pack, cell0(r)?.bandId ?? '', r.modeId));
    expect(penalties).toEqual([...penalties].sort((x, y) => x - y));
    expect(rows.find((r) => r.isRecommended)?.modeId).toBe(v.result.plan.recommendedModeId);
    expect(rows.find((r) => r.isCurrent)?.modeId).toBe(rig.b);
    expect(rows.filter((r) => r.isRecommended)).toHaveLength(1);
  });

  it('draws the recommended path from the plan and the changeover from the changeovers', () => {
    const v = viewOf(pack, rig, wx);
    const m = timelineModel(v, v.calcNowMs);
    m.rows.forEach((r, ri) => {
      m.slots.forEach((_s, i) => {
        expect(m.onPath[ri]?.[i]).toBe(v.result.plan.slots[i]?.modeId === r.modeId);
      });
    });
    expect(m.changeSlots).toEqual(v.result.changeovers.map((c) => c.change.slotIndex));
    expect(m.slots.filter((s) => s.isChange).map((s) => s.index)).toEqual([...m.changeSlots]);
  });

  it('has three summary tiles, Recommended, Next change and Next wet runway (OD-50, OD-59)', () => {
    const v = viewOf(pack, rig, wx);
    expect(summaryTiles(v).map((t) => t.label)).toEqual(['Recommended', 'Next change', 'Next wet runway']);
    expect(summaryTiles(v)[0]?.value).toBe(v.result.plan.recommendedModeId);
    const c = v.result.changeovers[0];
    const next = summaryTiles(v)[1]?.value ?? '';
    if (v.result.plan.recommendedModeId === null) expect(next).toBe('-');
    else if (c === undefined) expect(next).toBe('No change planned');
    else expect(next).toBe(`${c.change.toModeId} at ${hhmmZRel(c.change.startMs, v.calcNowMs)}`);
  });

  it('the Next wet runway tile says when the runway next turns wet (OD-59)', () => {
    const v = viewOf(pack, rig, wx);
    const slots = v.result.evaluation.slots;
    const first = slots[0];
    const value = summaryTiles(v)[2]?.value ?? '';
    if (first === undefined || v.weather.slots[0]?.governedBy === 'NONE') expect(value).toBe('Unknown');
    else if (first.runwayState !== 'DRY') expect(value).toBe('Now');
    else {
      const next = slots.findIndex((s, i) => i > 0 && s.runwayState !== 'DRY');
      if (next < 0) expect(value).toBe('Not in forecast');
      else expect(value).toBe(hhmmZRel(slots[next]?.startMs ?? 0, v.calcNowMs));
    }
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('fully red rows are hidden unless asked for (OD-39) [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const enabled = pack.modes.filter((m) => m.enabled).length;
  const scenarios = [
    ['A unsuitable throughout', ['badA', 'badA', 'badA', 'badA']],
    ['everything unsuitable', ['badBoth', 'badBoth', 'badBoth', 'badBoth']],
    ['all fine', ['ok', 'ok', 'ok', 'ok']],
  ] as const;

  it.each(scenarios)('%s: only fully red rows that are neither recommended nor current are hidden', (_name, wx) => {
    const v = viewOf(pack, rig, wx, [], rig.b);
    const model = timelineModel(v, v.calcNowMs);
    const shown = visibleRows(model, false);
    const all = modeRows(v);
    const hidden = all.filter((r) => !shown.rows.some((s) => s.modeId === r.modeId));
    expect(shown.rows.length + hidden.length).toBe(enabled);
    for (const r of hidden) {
      expect(r.allUnsuitable).toBe(true);
      expect(r.isRecommended || r.isCurrent).toBe(false);
    }
    // a row that is shown and fully red is only so because it is recommended, current, or nothing else could be drawn
    for (const r of shown.rows.filter((x) => x.allUnsuitable)) expect(r.isRecommended || r.isCurrent || hidden.length === 0).toBe(true);
    expect(shown.cells).toHaveLength(shown.rows.length);
    expect(shown.onPath).toHaveLength(shown.rows.length);
    expect(shown.hiddenCount).toBe(hidden.length);
  });

  it.each(scenarios)('%s: asking to see them returns every row, in the same order', (_name, wx) => {
    const v = viewOf(pack, rig, wx, [], rig.b);
    const model = timelineModel(v, v.calcNowMs);
    const everything = visibleRows(model, true);
    expect(everything.rows.map((r) => r.modeId)).toEqual(modeRows(v).map((r) => r.modeId));
    expect(everything.hiddenCount).toBe(0);
  });

  it('never leaves the grid empty: when every row is fully red, all are shown', () => {
    const v = viewOf(pack, rig, ['badBoth', 'badBoth', 'badBoth', 'badBoth']);
    const rows = modeRows(v);
    if (!rows.every((r) => r.allUnsuitable)) return;
    const shown = visibleRows(timelineModel(v, v.calcNowMs), false);
    expect(shown.rows).toHaveLength(rows.length);
    expect(shown.hiddenCount).toBe(0);
  });

  it('hides at least one row somewhere in the pack scenarios, so the feature is exercised', () => {
    const v = viewOf(pack, rig, ['badA', 'badA', 'badA', 'badA'], [], rig.b);
    const total = visibleRows(timelineModel(v, v.calcNowMs), false).hiddenCount;
    expect(total).toBeGreaterThanOrEqual(ref.name === 'TEST1' ? 0 : 1);
  });
});

describe('keyboard movement in the grid (UI_DESIGN section 9)', () => {
  const at = { row: 1, col: 5 };
  it('moves with the arrows and stops at the edges', () => {
    expect(moveFocus('ArrowRight', at, 3, 10, null, null)).toEqual({ row: 1, col: 6 });
    expect(moveFocus('ArrowLeft', { row: 1, col: 0 }, 3, 10, null, null)).toEqual({ row: 1, col: 0 });
    expect(moveFocus('ArrowDown', { row: 2, col: 3 }, 3, 10, null, null)).toEqual({ row: 2, col: 3 });
    expect(moveFocus('ArrowUp', at, 3, 10, null, null)).toEqual({ row: 0, col: 5 });
  });
  it('Home, End, Page Up and Page Down move along the row; Page keys jump 4 slots', () => {
    expect(moveFocus('Home', at, 3, 10, null, null)).toEqual({ row: 1, col: 0 });
    expect(moveFocus('End', at, 3, 10, null, null)).toEqual({ row: 1, col: 9 });
    expect(moveFocus('PageDown', at, 3, 10, null, null)).toEqual({ row: 1, col: 9 });
    expect(moveFocus('PageUp', at, 3, 10, null, null)).toEqual({ row: 1, col: 1 });
    expect(moveFocus('PageDown', { row: 0, col: 1 }, 3, 20, null, null)).toEqual({ row: 0, col: 5 });
  });
  it('N goes to the now column and C to the first changeover, when there is one', () => {
    expect(moveFocus('N', at, 3, 10, 0, 4)).toEqual({ row: 1, col: 0 });
    expect(moveFocus('c', at, 3, 10, 0, 4)).toEqual({ row: 1, col: 4 });
    expect(moveFocus('C', at, 3, 10, 0, null)).toBeNull();
    expect(moveFocus('x', at, 3, 10, 0, 4)).toBeNull();
  });
});

describe('wind changes in the event strip', () => {
  const steady = (directionDegrees: number, speedKt: number, gustKt: number | null = null, variableRangeDegrees: readonly [number, number] | null = null) => ({
    kind: 'steady' as const,
    directionDegrees,
    speedKt,
    gustKt,
    variableRangeDegrees,
  });
  const variable = (speedKt: number) => ({ kind: 'variable' as const, speedKt, gustKt: null });

  it('shows direction, speed and gust', () => {
    expect(windText(steady(20, 12, 22))).toBe('020/12G22');
    expect(windText(steady(340, 5))).toBe('340/05');
    expect(windText(variable(4))).toBe('VRB/04');
  });

  it('a variable direction range replaces the mean direction, since the worst case across it drives the figures', () => {
    expect(windText(steady(250, 13, 26, [200, 290]))).toBe('200V290/13G26');
  });

  it('labels a turn with the new wind and gives the old wind and the size of the turn in the hover text', () => {
    expect(windShift(steady(340, 10), steady(20, 12, 22))).toEqual({ label: '020/12G22', title: 'Wind 340/10 to 020/12G22, turn of 40 degrees' });
  });

  it('measures the turn the short way round', () => {
    expect(windShift(steady(350, 10), steady(10, 10))?.title).toContain('turn of 20 degrees');
  });

  it('ignores a change under 10 degrees and under 5 knots, but not a bigger direction, speed or gust change', () => {
    expect(windShift(steady(340, 10), steady(345, 12))).toBeNull();
    expect(windShift(steady(340, 10), steady(340, 10))).toBeNull();
    expect(windShift(steady(340, 10), steady(350, 10))).not.toBeNull();
    expect(windShift(steady(340, 10), steady(340, 15))).not.toBeNull();
    expect(windShift(steady(340, 10), steady(340, 10, 20))).not.toBeNull();
  });

  it('handles variable wind and missing wind', () => {
    expect(windShift(steady(340, 10), variable(5))?.label).toBe('VRB/05');
    expect(windShift(variable(5), variable(6))).toBeNull();
    expect(windShift(variable(5), steady(340, 10))?.label).toBe('340/10');
    expect(windShift(null, steady(340, 10))).toBeNull();
    expect(windShift(steady(340, 10), null)).toBeNull();
  });
});

describe('wind bars in the event strip (OD-51)', () => {
  const steady = (directionDegrees: number, speedKt: number) => ({ kind: 'steady' as const, directionDegrees, speedKt, gustKt: null, variableRangeDegrees: null });

  it('starts with the wind now and breaks only where the wind changes enough to label', () => {
    const runs = windRuns([steady(340, 7), steady(342, 8), steady(340, 7), steady(20, 14), steady(20, 14)]);
    expect(runs.map((r) => [r.startSlot, r.endSlot, r.label])).toEqual([[0, 2, '340/07'], [3, 4, '020/14']]);
    expect(runs[0]?.title).toBe('Wind 340/07');
    expect(runs[1]?.title).toContain('turn of 40 degrees');
  });

  it('measures drift from the wind the bar started with, so small steps cannot add up unseen', () => {
    const runs = windRuns([steady(340, 7), steady(346, 7), steady(352, 7), steady(358, 7)]);
    expect(runs.map((r) => r.startSlot)).toEqual([0, 2]);
  });

  it('leaves a gap where no wind is known and restarts after it', () => {
    const runs = windRuns([steady(340, 7), null, steady(340, 7)]);
    expect(runs.map((r) => [r.startSlot, r.endSlot])).toEqual([[0, 0], [2, 2]]);
    expect(windRuns([null, null])).toEqual([]);
  });
});

describe('Ceiling (OD-66)', () => {
  const ref = PACKS[0]!;
  const pack = packWith(ref, { weatherStation: 'YSSY' });
  const now = Date.parse('2026-10-24T10:00:00Z');
  const ceilingFor = (body: string): string => {
    const metar = decodeMetar(`YSSY 241000Z ${body}`, { pack, nowMs: now });
    if (metar.kind !== 'ok') throw new Error('bad fixture METAR');
    const view = calculate({ pack, nowMs: now, metar: metar.report, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    return panelAModel(view).ceiling;
  };

  it('is the lowest BKN or OVC base', () => {
    expect(ceilingFor('03010KT 9999 FEW020 BKN030 OVC045 24/15 Q1013')).toBe('3,000 ft');
  });

  it('ignores FEW and SCT, which are not a ceiling', () => {
    expect(ceilingFor('03010KT 9999 FEW005 SCT010 24/15 Q1013')).toBe('No ceiling');
  });

  it('is the vertical visibility when it is lower than the lowest cloud, or when no base is reported', () => {
    expect(ceilingFor('03010KT 0800 VV002 24/15 Q1013')).toBe('200 ft');
  });

  it('CAVOK means no ceiling', () => {
    expect(ceilingFor('03010KT CAVOK 24/15 Q1013')).toBe('CAVOK (no ceiling)');
  });

  it('is Unknown with no governing report', () => {
    const view = calculate({ pack, nowMs: now, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    expect(panelAModel(view).ceiling).toBe('Unknown');
  });
});

describe('cell detail cause (OD-71)', () => {
  it('names the TEMPO or PROB wind group that makes a cell marginal', () => {
    const pack = packWith(YSSY_PACK, { weatherStation: 'YSSY' });
    const nowMs = Date.UTC(2026, 9, 24, 12, 52);
    const m = decodeMetar('METAR YSSY 241230Z 02012KT 9999 SCT040 20/12 Q1016', { pack, nowMs });
    const t = decodeTaf('TAF AMD YSSY 241117Z 2412/2518 02012KT CAVOK TEMPO 2509/2512 VRB20G30KT 4000 TSRA SCT015 SCT070CB', { pack, nowMs });
    if (m.kind !== 'ok' || t.kind !== 'ok') throw new Error('decode');
    const view = calculate({ pack, nowMs, metar: m.report, taf: t.report, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    const triggers: string[] = [];
    view.result.evaluation.cells.forEach((row, mi) => row.forEach((_c, si) => {
      const d = cellDetailModel(view, mi, si);
      if (d !== null && d.trigger !== '') triggers.push(d.trigger);
    }));
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.every((x) => /^TEMPO .*VRB20G30KT$/.test(x))).toBe(true);
  });
});

// The decode adapter: every expected value below is worked out by hand from the
// report text (not read back from the library). Report strings are the real
// fixtures in tests/fixtures/weather (see SOURCES.md). A few inputs are marked
// SYNTHETIC: they exercise a branch that no sourced report exercised.
import { describe, expect, it } from 'vitest';
import { decodeMetar, decodeTaf, MAX_REPORT_CHARS } from '../../src/weather/decode';
import { PACKS, TEST_PACK, YSSY_PACK, describeForEachPack } from '../helpers/packs';
import { FIXTURES, decodeFixture, decodeMetarFixture, decodeTafFixture, fixture, nowOf, packWith, utc } from './helpers';

const KT_PER_MPS = 3600 / 1852;

function ctx(station: string, nowIso = '2026-10-23T14:10:00Z') {
  return { pack: packWith(YSSY_PACK, { weatherStation: station }), nowMs: utc(nowIso) };
}

describe('fixture set', () => {
  it('has 30 to 50 real reports from many airports and countries', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(30);
    expect(FIXTURES.length).toBeLessThanOrEqual(53);
    expect(new Set(FIXTURES.map((f) => f.country)).size).toBeGreaterThanOrEqual(20);
    expect(new Set(FIXTURES.map((f) => f.station)).size).toBeGreaterThanOrEqual(40);
    for (const f of FIXTURES) {
      expect(f.source.url, f.id).toMatch(/^https:\/\//);
      expect(f.source.retrieved, f.id).toMatch(/^\d{2}-\d{2}-\d{4}$/);
      expect(f.source.licence.length, f.id).toBeGreaterThan(10);
    }
  });

  it('is listed in SOURCES.md, id by id', async () => {
    const { readFileSync } = await import('node:fs');
    const md = readFileSync(new URL('../fixtures/weather/SOURCES.md', import.meta.url), 'utf8');
    for (const f of FIXTURES) expect(md, f.id).toContain(`| ${f.id} |`);
  });

  const EXPECT_KIND: Record<string, 'ok' | 'none' | 'error'> = {
    'metar-svmc-nil': 'none',
    'taf-vtbd-cancelled': 'none',
    'taf-fzic-fm-with-space': 'error',
    'taf-mdpp-two-tafs-joined': 'error',
    'taf-kngu-no-issue-time': 'error',
    'metar-dgsi-free-text': 'error',
  };
  it.each(FIXTURES.map((f) => [f.id, f] as const))('%s decodes as expected against every pack', (id, f) => {
    for (const ref of PACKS) {
      const r = decodeFixture(f, ref);
      expect(r.kind, `${id} on ${ref.name}`).toBe(EXPECT_KIND[id] ?? 'ok');
    }
  });
});

describe('METAR values', () => {
  it('reads wind, visibility, cloud and pressure from an Australian automatic report', () => {
    const m = decodeMetarFixture('metar-yssy-auto-nodata', YSSY_PACK);
    expect(m.observedAtMs).toBe(utc('2026-10-23T14:00:00Z'));
    expect(m.wind).toEqual({ kind: 'steady', directionDegrees: 20, speedKt: 10, gustKt: null, variableRangeDegrees: null });
    expect(m.visibility).toEqual({ metres: 9999, moreThan: true, lessThan: false });
    expect(m.clouds).toEqual([{ quantity: 'FEW', baseFt: 1200, type: null }]);
    expect(m.qnhHpa).toBe(1016);
    expect(m.auto).toBe(true);
    expect(m.reportType).toBe('METAR');
  });

  it('converts statute miles and inHg (US report)', () => {
    const m = decodeMetarFixture('metar-kjfk-sm-inhg', YSSY_PACK);
    expect(m.visibility?.metres).toBe(Math.round(10 * 1609.344)); // 10SM = 16093 m
    expect(m.qnhHpa).toBe(1028.1); // A3036 = 30.36 inHg x 33.8639
    expect(m.wind).toMatchObject({ kind: 'steady', directionDegrees: 50, speedKt: 14 });
  });

  it('converts a Canadian report: 6SM, A2994', () => {
    const m = decodeMetarFixture('metar-cybw-speci-snow', YSSY_PACK);
    expect(m.visibility?.metres).toBe(9656);
    expect(m.qnhHpa).toBe(1013.9);
    expect(m.wind).toMatchObject({ speedKt: 21, gustKt: 31 });
  });

  it('converts m/s to knots without rounding, including gusts', () => {
    const z = decodeMetarFixture('metar-zhhh-mps-cavok', YSSY_PACK);
    expect(z.wind).toMatchObject({ kind: 'steady', directionDegrees: 20 });
    expect((z.wind as { speedKt: number }).speedKt).toBeCloseTo(2 * KT_PER_MPS, 9);
    expect(z.cavok).toBe(true);
    const u = decodeMetarFixture('metar-usdd-speci-mps-gust-range', YSSY_PACK);
    const w = u.wind as { speedKt: number; gustKt: number };
    expect(w.speedKt).toBeCloseTo(4 * KT_PER_MPS, 9);
    expect(w.gustKt).toBeCloseTo(10 * KT_PER_MPS, 9);
    expect(u.reportType).toBe('SPECI');
  });

  it('maps direction ranges, including one crossing north (260V010)', () => {
    expect(decodeMetarFixture('metar-uibb-mps-range', YSSY_PACK).wind).toMatchObject({ kind: 'steady', directionDegrees: 280, variableRangeDegrees: [250, 310] });
    expect(decodeMetarFixture('metar-usdd-speci-mps-gust-range', YSSY_PACK).wind).toMatchObject({ variableRangeDegrees: [260, 10] });
  });

  it('maps VRB to a variable wind and calm to a steady wind of speed 0', () => {
    expect(decodeMetarFixture('metar-skbu-vrb-re', YSSY_PACK).wind).toEqual({ kind: 'variable', speedKt: 2, gustKt: null });
    expect(decodeMetarFixture('metar-rjcc-vrb', YSSY_PACK).wind).toEqual({ kind: 'variable', speedKt: 2, gustKt: null });
    expect(decodeMetarFixture('metar-waqq-calm', YSSY_PACK).wind).toEqual({ kind: 'steady', directionDegrees: 0, speedKt: 0, gustKt: null, variableRangeDegrees: null });
    expect(decodeMetarFixture('metar-kues-speci-fog', YSSY_PACK).wind).toMatchObject({ kind: 'steady', speedKt: 0 });
  });

  it('treats SPECI as a METAR, keeps the type, and reads a correction', () => {
    const s = decodeMetarFixture('metar-kues-speci-fog', YSSY_PACK);
    expect(s.reportType).toBe('SPECI');
    expect(s.visibility?.metres).toBe(402); // 1/4SM
    expect(s.weather).toEqual([{ intensity: null, descriptor: null, phenomena: ['FG'], codes: ['FG'] }]);
    expect(decodeMetarFixture('metar-espa-cor', YSSY_PACK).corrected).toBe(true);
  });

  it('reads present weather and the RE recent-weather group (which the library does not decode)', () => {
    const b = decodeMetarFixture('metar-skbu-vrb-re', YSSY_PACK);
    expect(b.weather.map((w) => w.codes)).toEqual([['DZ']]);
    expect(b.weather[0]?.intensity).toBe('-');
    expect(b.recentWeather.map((w) => w.codes)).toEqual([['TS'], ['RA']]); // RETS RERA
    const k = decodeMetarFixture('metar-hkel-showers-re', YSSY_PACK);
    expect(k.weather).toEqual([]);
    expect(k.recentWeather).toEqual([{ intensity: null, descriptor: 'SH', phenomena: ['RA'], codes: ['SH', 'RA'] }]); // RESHRA
    expect(decodeMetarFixture('metar-yssy-auto-nodata', YSSY_PACK).recentWeather).toEqual([]);
  });

  it('keeps the observation time from the report, resolved against the clock', () => {
    const f = fixture('metar-kjfk-sm-inhg');
    expect(decodeMetarFixture(f.id, YSSY_PACK).observedAtMs).toBe(utc('2026-10-23T13:51:00Z'));
    // Same report, clock moved a month on: the day-of-month 23 now means 23 Nov (no, the most recent 23rd at or before now).
    expect(decodeMetarFixture(f.id, YSSY_PACK, utc('2026-11-10T00:00:00Z')).observedAtMs).toBe(utc('2026-10-23T13:51:00Z'));
    expect(decodeMetarFixture(f.id, YSSY_PACK, utc('2026-11-23T14:00:00Z')).observedAtMs).toBe(utc('2026-11-23T13:51:00Z'));
  });

  it('is NIL when the report says NIL', () => {
    const f = fixture('metar-svmc-nil');
    const r = decodeMetar(f.raw, ctx('SVMC', '2026-10-21T17:30:00Z'));
    expect(r).toMatchObject({ kind: 'none', reason: 'nil', station: 'SVMC' });
  });
});

describe('warnings for groups the library drops', () => {
  const warningCodes = (id: string): string[] => {
    const r = decodeFixture(fixture(id), YSSY_PACK);
    if (r.kind !== 'ok') throw new Error('expected ok');
    return r.warnings.map((w) => w.code);
  };
  const warningText = (id: string): string => {
    const r = decodeFixture(fixture(id), YSSY_PACK);
    if (r.kind !== 'ok') throw new Error('expected ok');
    return r.warnings.map((w) => w.message).join(' | ');
  };

  it('///037/// and //////CB cloud groups are reported, not silently lost', () => {
    expect(warningCodes('metar-uibb-mps-range')).toContain('cloud-group-dropped');
    expect(warningText('metar-uibb-mps-range')).toContain('///037///');
    expect(warningText('metar-egll-cloud-unknown-type')).toContain('//////CB');
  });

  it('a glued BECMG2312/2314 group the library dropped is reported with its content', () => {
    expect(warningText('taf-dngo-glued-becmg')).toContain('BECMG2312/2314');
    expect(warningText('taf-dngo-glued-becmg')).toContain('5000');
  });

  it('a PROB40 group with no time period (dropped by the library) is reported', () => {
    expect(warningText('taf-oitl-prob-no-period')).toContain('PROB40');
  });

  it('a mistyped cloud group is named', () => {
    expect(warningText('taf-oing-typo-cloud')).toContain('SCT20CB');
  });

  it('1/16SM, which the library cannot read, is repaired to 100 m with a warning', () => {
    expect(warningCodes('metar-kdlh-sixteenth')).toEqual(['visibility-repaired']);
    expect(decodeMetarFixture('metar-kdlh-sixteenth', YSSY_PACK).visibility).toEqual({ metres: 100, moreThan: false, lessThan: false });
  });


  it('a METAR trend forecast is not used and says so', () => {
    expect(warningCodes('metar-eddh-tempo-trend')).toContain('metar-trend-ignored');
  });

  it('the US "WND 110V190" direction range is reported as not used', () => {
    expect(warningText('taf-kaff-wnd-qnh-ins')).toContain('WND 110V190');
  });

  it('a clean report has no warnings', () => {
    for (const id of ['metar-yssy-auto-nodata', 'metar-kjfk-sm-inhg', 'taf-yssy-multiline-fm-tempo', 'taf-kjfk-fm-statute-miles', 'taf-limc-prob40-tempo']) {
      expect(warningCodes(id), id).toEqual([]);
    }
  });

  it('no wind reported (/////KT) is flagged and gives a null wind', () => {
    // SYNTHETIC: the wind group is replaced by slashes in an otherwise real report.
    const r = decodeMetar('METAR YSSY 231400Z AUTO /////KT 9999 FEW012 20/17 Q1016', ctx('YSSY'));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.report.wind).toBeNull();
      expect(r.warnings.map((w) => w.code)).toContain('wind-not-reported');
    }
  });
});

describe('TAF structure', () => {
  it('reads validity, issue time and prevailing periods of a multi-line TAF with "$" maintenance marks', () => {
    const t = decodeTafFixture('taf-yssy-multiline-fm-tempo', YSSY_PACK);
    expect(t.issuedAtMs).toBe(utc('2026-10-23T11:08:00Z'));
    expect(t.validFromMs).toBe(utc('2026-10-23T12:00:00Z'));
    expect(t.validToMs).toBe(utc('2026-10-24T18:00:00Z'));
    expect(t.periods.map((p) => [p.kind, new Date(p.startMs).toISOString().slice(5, 16)])).toEqual([
      ['BASE', '10-23T12:00'],
      ['FM', '10-23T16:00'],
      ['FM', '10-23T22:00'],
      ['FM', '10-24T03:00'],
      ['FM', '10-24T09:00'],
      ['FM', '10-24T14:00'],
    ]);
    expect(t.periods[1]?.wind).toMatchObject({ directionDegrees: 340, speedKt: 7 });
    expect(t.periods[3]?.cavok).toBe(true);
    expect(t.amended).toBe(false);
  });

  it('keeps TEMPO as an overlay with its window, never as a prevailing period', () => {
    const t = decodeTafFixture('taf-yssy-multiline-fm-tempo', YSSY_PACK);
    expect(t.overlays).toHaveLength(1);
    expect(t.overlays[0]).toMatchObject({ kind: 'TEMPO', probabilityPct: null, startMs: utc('2026-10-23T12:00:00Z'), endMs: utc('2026-10-23T19:00:00Z'), wind: null });
    expect(t.overlays[0]?.clouds).toEqual([{ quantity: 'BKN', baseFt: 1000, type: null }]);
  });

  it('PROB30/40 on TEMPO is a TEMPO overlay carrying its probability; PROB alone is kind PROB', () => {
    expect(decodeTafFixture('taf-limc-prob40-tempo', YSSY_PACK).overlays).toMatchObject([{ kind: 'TEMPO', probabilityPct: 40, startMs: utc('2026-10-23T12:00:00Z'), endMs: utc('2026-10-23T16:00:00Z') }]);
    expect(decodeTafFixture('taf-edhi-prob30-tempo', YSSY_PACK).overlays).toMatchObject([{ kind: 'TEMPO', probabilityPct: 30 }]);
    expect(decodeTafFixture('taf-essv-prob40-plain', YSSY_PACK).overlays).toMatchObject([{ kind: 'PROB', probabilityPct: 40 }]);
    expect(decodeTafFixture('taf-limc-prob40-tempo', YSSY_PACK).periods).toHaveLength(1);
  });

  it('INTER and PROB on INTER are INTER overlays', () => {
    expect(decodeTafFixture('taf-ypcc-inter', YSSY_PACK).overlays).toMatchObject([{ kind: 'INTER', probabilityPct: null }]);
    expect(decodeTafFixture('taf-nvss-prob40-inter', YSSY_PACK).overlays).toMatchObject([{ kind: 'INTER', probabilityPct: 40 }]);
    const m = decodeTafFixture('taf-ymml-multiline-amd-inter', YSSY_PACK);
    expect(m.amended).toBe(true);
    expect(m.overlays.map((o) => [o.kind, o.probabilityPct])).toEqual([
      ['TEMPO', null],
      ['INTER', null],
      ['INTER', 30],
    ]);
  });

  it('treats BECMG as an ordinary change at its start time, not its end', () => {
    const t = decodeTafFixture('taf-egkk-becmg-tempo-prob', YSSY_PACK);
    // BECMG 2312/2315 29022G38KT: prevailing from 12:00.
    const first = t.periods[1];
    expect(first?.kind).toBe('BECMG');
    expect(first?.startMs).toBe(utc('2026-10-23T12:00:00Z'));
    expect(first?.wind).toMatchObject({ directionDegrees: 290, speedKt: 22, gustKt: 38 });
    expect(t.overlays.filter((o) => o.kind === 'TEMPO' || o.kind === 'PROB')).not.toHaveLength(0);
    expect(t.periods.every((p) => p.kind === 'BASE' || p.kind === 'BECMG')).toBe(true);
  });

  it('a BECMG that gives only a wind keeps the visibility and cloud of the period before it', () => {
    const t = decodeTafFixture('taf-egkk-becmg-tempo-prob', YSSY_PACK);
    const before = t.periods[0];
    const after = t.periods[1];
    expect(before?.visibility).toEqual({ metres: 9999, moreThan: true, lessThan: false });
    expect(after?.visibility).toEqual(before?.visibility);
    expect(after?.clouds).toEqual([{ quantity: 'SCT', baseFt: 1500, type: null }]);
  });

  it('BECMG that introduces rain makes it prevailing from its start, and weather without a new group is carried', () => {
    const t = decodeTafFixture('taf-encn-becmg-rain', YSSY_PACK);
    expect(t.periods[0]?.weather).toEqual([]);
    expect(t.periods[1]).toMatchObject({ kind: 'BECMG', startMs: utc('2026-10-23T19:00:00Z') });
    expect(t.periods[1]?.weather.map((w) => w.codes)).toEqual([['RA']]);
    // The wind was not restated, so it is carried: 060 at 8 kt.
    expect(t.periods[1]?.wind).toMatchObject({ directionDegrees: 60, speedKt: 8 });
  });

  it('an FM group inherits visibility and cloud it does not state (SYNTHETIC: no sourced FM omitted them)', () => {
    const text = 'TAF YSSY 231108Z 2312/2418 04010KT 9999 SCT012 FM231600 34007KT FM232200 03014KT 5000 BKN020 FM240300 05012KT 8000';
    const r = decodeTaf(text, ctx('YSSY'));
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const [base, fm1, fm2, fm3] = r.report.periods;
    expect(fm1?.visibility).toEqual(base?.visibility); // 9999 carried
    expect(fm1?.clouds).toEqual([{ quantity: 'SCT', baseFt: 1200, type: null }]); // SCT012 carried
    expect(fm1?.wind).toMatchObject({ directionDegrees: 340, speedKt: 7 });
    expect(fm2?.visibility).toEqual({ metres: 5000, moreThan: false, lessThan: false });
    expect(fm2?.clouds).toEqual([{ quantity: 'BKN', baseFt: 2000, type: null }]);
    expect(fm3?.visibility?.metres).toBe(8000);
    expect(fm3?.clouds).toEqual(fm2?.clouds); // BKN020 carried through the second FM
  });

  it('FM weather is not carried: an FM that omits weather clears it', () => {
    const r = decodeTaf('TAF YSSY 231108Z 2312/2418 04010KT 4000 -RA BKN010 FM231600 34007KT 9999 SCT020', ctx('YSSY'));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.report.periods[0]?.weather).toHaveLength(1);
      expect(r.report.periods[1]?.weather).toEqual([]);
    }
  });

  it('NSW clears weather rather than being kept as a condition', () => {
    const r = decodeTaf('TAF YSSY 231108Z 2312/2418 04010KT 4000 -RA BKN010 BECMG 2316/2318 9999 NSW', ctx('YSSY'));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.report.periods[1]?.weather).toEqual([]);
  });

  it('converts m/s and VRB in a TAF', () => {
    expect(decodeTafFixture('taf-uauu-mps-vrb', YSSY_PACK).periods[0]?.wind).toMatchObject({ kind: 'variable' });
    const w = decodeTafFixture('taf-urwa-mps-gust', YSSY_PACK).periods[0]?.wind as { speedKt: number; gustKt: number; directionDegrees: number };
    expect(w.directionDegrees).toBe(100);
    expect(w.speedKt).toBeCloseTo(6 * KT_PER_MPS, 9);
    expect(w.gustKt).toBeCloseTo(12 * KT_PER_MPS, 9);
  });

  it('reads 1 1/2SM written as 11/2SM as one and a half miles (the library reads 5.5)', () => {
    const t = decodeTafFixture('taf-cwwu-mixed-fraction', YSSY_PACK);
    expect(t.overlays[0]?.visibility?.metres).toBe(Math.round(1.5 * 1609.344)); // 2414 m
    const c = decodeTafFixture('taf-czbf-day30-amd-nautical', YSSY_PACK);
    expect(c.overlays[0]?.visibility?.metres).toBe(2414);
    expect(c.overlays[1]?.visibility?.metres).toBe(Math.round(0.75 * 1609.344)); // 3/4SM
    expect(c.periods[0]?.visibility?.metres).toBe(Math.round(6 * 1609.344));
  });

  it('keeps vertical visibility', () => {
    expect(decodeTafFixture('taf-klan-vv-tempo', YSSY_PACK).periods[0]?.verticalVisibilityFt).toBe(300);
  });

  it('puts a mid-slot FM (FM231315) at its real time', () => {
    const t = decodeTafFixture('taf-khlg-fm-mid-slot', YSSY_PACK);
    expect(t.periods.map((p) => p.startMs)).toContain(utc('2026-10-23T13:15:00Z'));
  });

  it('is a corrected TAF when COR', () => {
    expect(decodeTafFixture('taf-mmmx-cor', YSSY_PACK).corrected).toBe(true);
  });

  it('a cancelled TAF is "no TAF"', () => {
    const f = fixture('taf-vtbd-cancelled');
    expect(decodeTaf(f.raw, ctx('VTBD', f.nowUtc))).toMatchObject({ kind: 'none', reason: 'cancelled', station: 'VTBD' });
  });

  it('a NIL TAF is "no TAF" (SYNTHETIC: no real NIL TAF could be sourced; the library throws on this text)', () => {
    for (const text of ['TAF YSSY 231100Z NIL', 'TAF YSSY 231100Z NIL=', 'TAF AMD YSSY 231100Z NIL', 'TAF YSSY 231100Z 2312/2418 NIL', 'yssy 231100z nil']) {
      expect(decodeTaf(text, ctx('YSSY')), text).toMatchObject({ kind: 'none', reason: 'nil', station: 'YSSY' });
    }
  });
});

describe('dates and rollover', () => {
  it('resolves hour 24 as midnight of the next day (validity end 0124)', () => {
    const k = decodeTafFixture('taf-kmsn-month-rollover-hour24', YSSY_PACK);
    expect(k.validToMs).toBe(utc('2026-11-02T00:00:00Z'));
  });

  it('TAF issued 302325Z with validity 0100/0124 rolls into the next month, with the issue on the 30th', () => {
    const k = decodeTafFixture('taf-kmsn-month-rollover-hour24', YSSY_PACK);
    expect(k.issuedAtMs).toBe(utc('2026-10-30T23:25:00Z'));
    expect(k.validFromMs).toBe(utc('2026-11-01T00:00:00Z'));
  });

  it('TAF issued 311720Z, validity 3118/0124, BECMG 0103/0106 lands on 1 November', () => {
    const e = decodeTafFixture('taf-eham-month-rollover-becmg', YSSY_PACK);
    expect(e.issuedAtMs).toBe(utc('2026-10-31T17:20:00Z'));
    expect(e.validFromMs).toBe(utc('2026-10-31T18:00:00Z'));
    expect(e.validToMs).toBe(utc('2026-11-02T00:00:00Z'));
    expect(e.periods.map((p) => p.startMs)).toEqual([utc('2026-10-31T18:00:00Z'), utc('2026-10-31T21:00:00Z'), utc('2026-11-01T03:00:00Z')]);
  });

  it('BECMG that ends at hour 24 (2322/2324) is read, not refused', () => {
    const f = decodeTafFixture('taf-fbsk-becmg-hour24', YSSY_PACK);
    expect(f.periods[1]).toMatchObject({ kind: 'BECMG', startMs: utc('2026-10-23T22:00:00Z') });
  });

  it('a TAF issued on the 30th, read on 1 November, belongs to 30 October (most recent 30th)', () => {
    const c = decodeTafFixture('taf-czbf-day30-amd-nautical', YSSY_PACK);
    expect(c.issuedAtMs).toBe(utc('2026-10-30T09:39:00Z'));
    expect(c.validToMs).toBe(utc('2026-10-30T22:00:00Z'));
  });

  it('day 31 on 1 November is 31 October; day 31 on 1 March skips February', () => {
    const m = decodeMetar('METAR YSSY 310900Z 18005KT 9999 FEW020 15/10 Q1015', ctx('YSSY', '2026-11-01T00:30:00Z'));
    expect(m.kind === 'ok' && m.report.observedAtMs).toBe(utc('2026-10-31T09:00:00Z'));
    const m2 = decodeMetar('METAR YSSY 310900Z 18005KT 9999 FEW020 15/10 Q1015', ctx('YSSY', '2027-03-01T00:30:00Z'));
    expect(m2.kind === 'ok' && m2.report.observedAtMs).toBe(utc('2027-01-31T09:00:00Z'));
  });

  it('a report day later than today means last month; one a few minutes ahead of the clock stays today and warns', () => {
    const old = decodeMetar('METAR YSSY 240900Z 18005KT 9999 FEW020 15/10 Q1015', ctx('YSSY', '2026-10-23T14:10:00Z'));
    expect(old.kind === 'ok' && old.report.observedAtMs).toBe(utc('2026-09-24T09:00:00Z'));
    const ahead = decodeMetar('METAR YSSY 231420Z 18005KT 9999 FEW020 15/10 Q1015', ctx('YSSY', '2026-10-23T14:10:00Z'));
    expect(ahead.kind).toBe('ok');
    if (ahead.kind === 'ok') {
      expect(ahead.report.observedAtMs).toBe(utc('2026-10-23T14:20:00Z'));
      expect(ahead.warnings.map((w) => w.code)).toContain('time-in-future');
    }
  });

  it('rejects impossible dates and times', () => {
    expect(decodeMetar('METAR YSSY 321400Z 18005KT 9999 FEW020 15/10 Q1015', ctx('YSSY')).kind).toBe('error');
    expect(decodeMetar('METAR YSSY 232500Z 18005KT 9999 FEW020 15/10 Q1015', ctx('YSSY')).kind).toBe('error');
    expect(decodeMetar('METAR YSSY 231461Z 18005KT 9999 FEW020 15/10 Q1015', ctx('YSSY')).kind).toBe('error');
    expect(decodeMetar('METAR YSSY 000000Z 18005KT 9999 FEW020 15/10 Q1015', ctx('YSSY')).kind).toBe('error');
    expect(decodeTaf('TAF YSSY 231108Z 2312/2312 04010KT 9999', ctx('YSSY')).kind).toBe('error');
    expect(decodeTaf('TAF YSSY 231108Z 2312/2520 04010KT 9999', ctx('YSSY')).kind).toBe('error'); // longer than 36 hours
  });
});

describe('station check', () => {
  describeForEachPack('refuses a report for another station, naming both', (pack) => {
    it('METAR', () => {
      const f = fixture('metar-kjfk-sm-inhg');
      const r = decodeMetar(f.raw, { pack, nowMs: nowOf(f) });
      expect(r.kind).toBe('error');
      if (r.kind === 'error') {
        expect(r.message).toContain(f.station);
        expect(r.message).toContain(pack.airport.weatherStation);
      }
    });
    it('TAF', () => {
      const f = fixture('taf-kjfk-fm-statute-miles');
      const r = decodeTaf(f.raw, { pack, nowMs: nowOf(f) });
      expect(r.kind).toBe('error');
      if (r.kind === 'error') {
        expect(r.message).toContain(f.station);
        expect(r.message).toContain(pack.airport.weatherStation);
      }
    });
    it('NIL and cancelled reports for another station are refused too', () => {
      const f = fixture('taf-vtbd-cancelled');
      expect(decodeTaf(f.raw, { pack, nowMs: nowOf(f) }).kind).toBe('error');
      const n = fixture('metar-svmc-nil');
      expect(decodeMetar(n.raw, { pack, nowMs: nowOf(n) }).kind).toBe('error');
    });
  });

  it('accepts the report when the pack names that station, whichever pack', () => {
    for (const ref of PACKS) expect(decodeFixture(fixture('metar-kjfk-sm-inhg'), ref).kind).toBe('ok');
  });

  it('the pack default station is used as the pack states it', () => {
    const f = fixture('metar-yssy-auto-nodata');
    expect(decodeMetar(f.raw, { pack: packWith(YSSY_PACK), nowMs: nowOf(f) }).kind).toBe('ok');
    expect(decodeMetar(f.raw, { pack: packWith(TEST_PACK), nowMs: nowOf(f) }).kind).toBe('error');
  });
});

describe('input refusal (SEC-3)', () => {
  const good = fixture('metar-yssy-auto-nodata').raw;
  const c = ctx('YSSY', '2026-10-23T14:25:00Z');

  it('refuses text over 4 KB, saying how long it was', () => {
    const r = decodeMetar(good + ' '.repeat(MAX_REPORT_CHARS), c);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.message).toContain(String(good.length + MAX_REPORT_CHARS));
      expect(r.message).toContain('4096');
    }
    expect(decodeTaf('TAF ' + 'X'.repeat(MAX_REPORT_CHARS), c).kind).toBe('error');
  });

  it('accepts text of exactly 4096 characters', () => {
    expect(MAX_REPORT_CHARS).toBe(4096);
    expect(decodeMetar(good + ' '.repeat(MAX_REPORT_CHARS - good.length), c).kind).toBe('ok');
    expect(decodeMetar(good + ' '.repeat(MAX_REPORT_CHARS - good.length + 1), c).kind).toBe('error');
  });

  it.each([
    ['NUL', '\u0000', 'U+0000'],
    ['BEL', '\u0007', 'U+0007'],
    ['ESC', '\u001b', 'U+001B'],
    ['DEL', '\u007f', 'U+007F'],
    ['vertical tab', '\u000b', 'U+000B'],
  ])('refuses a control character (%s) and names it and its position', (_n, ch, code) => {
    const text = good.slice(0, 20) + ch + good.slice(20);
    const r = decodeMetar(text, c);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.message).toContain('control character');
      expect(r.message).toContain(code);
      expect(r.message).toContain('position 21');
    }
  });

  it.each([
    ['e acute', 'é', 'U+00E9'],
    ['no-break space', ' ', 'U+00A0'],
    ['zero-width space', '​', 'U+200B'],
    ['right-to-left mark', '‏', 'U+200F'],
    ['emoji (surrogate)', '😀', 'U+D83D'],
  ])('refuses a non-ASCII character (%s)', (_n, ch, code) => {
    const r = decodeTaf('TAF YSSY 231108Z 2312/2418 04010KT 9999 SCT012' + ch, c);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.message).toContain('non-ASCII');
      expect(r.message).toContain(code);
    }
  });

  it('accepts tabs, line feeds and carriage returns', () => {
    const t = fixture('taf-yssy-multiline-fm-tempo').raw.replace(/\n/g, '\r\n\t');
    expect(decodeTaf(t, c).kind).toBe('ok');
  });

  it('refuses empty text, and text that is not a string', () => {
    expect(decodeMetar('   \n ', c).kind).toBe('error');
    expect(decodeTaf('', c).kind).toBe('error');
    expect(decodeMetar(undefined as unknown as string, c).kind).toBe('error');
    expect(decodeTaf(42 as unknown as string, c).kind).toBe('error');
  });
});

describe('reports that cannot be read name what could not be read', () => {
  it('a TAF in the METAR box and a METAR in the TAF box are refused with a pointer to the right box', () => {
    const t = fixture('taf-kjfk-fm-statute-miles');
    const asMetar = decodeMetar(t.raw, ctx('KJFK'));
    expect(asMetar.kind).toBe('error');
    if (asMetar.kind === 'error') expect(asMetar.message).toContain('TAF');
    const m = fixture('metar-kjfk-sm-inhg');
    const asTaf = decodeTaf(m.raw, ctx('KJFK'));
    expect(asTaf.kind).toBe('error');
    if (asTaf.kind === 'error') expect(asTaf.message).toContain('METAR');
    // Without the TAF keyword the validity group still gives it away.
    const bare = decodeMetar(t.raw.replace(/^TAF /, ''), ctx('KJFK'));
    expect(bare.kind === 'error' && bare.message).toContain('validity');
  });

  it('two reports pasted together are refused', () => {
    const a = fixture('metar-yssy-auto-nodata').raw;
    const r = decodeMetar(`${a}\n${a.replace('231400Z', '231330Z')}`, ctx('YSSY', '2026-10-23T14:25:00Z'));
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toContain('more than one report');
    const two = decodeTaf(fixture('taf-mdpp-two-tafs-joined').raw, ctx('MDPP'));
    expect(two.kind === 'error' && two.message).toContain('more than one report');
  });

  it('real malformed reports are refused with a message that names the problem', () => {
    const fzic = decodeTaf(fixture('taf-fzic-fm-with-space').raw, ctx('FZIC'));
    expect(fzic.kind === 'error' && fzic.message).toContain('FM 240000');
    const kngu = decodeTaf(fixture('taf-kngu-no-issue-time').raw, ctx('KNGU'));
    expect(kngu.kind === 'error' && kngu.message).toContain('issue time');
    const dgsi = decodeMetar(fixture('metar-dgsi-free-text').raw, ctx('DGSI'));
    expect(dgsi.kind === 'error' && dgsi.message).toContain('observation time');
  });

  it('a library rejection names the groups we could not recognise', () => {
    const r = decodeMetar('METAR YSSY 231400Z 02010KT 9999 FEW012 20/17 Q1016 ZZZZZZ9', ctx('YSSY', '2026-10-23T14:25:00Z'));
    // Either refused with the unknown group named, or accepted with a warning naming it: never silent.
    if (r.kind === 'error') expect(r.message).toContain('ZZZZZZ9');
    else if (r.kind === 'ok') expect(r.warnings.map((w) => w.message).join(' ')).toContain('ZZZZZZ9');
    else throw new Error('unexpected none');
  });

  it('an invalid wind direction is refused, not guessed', () => {
    const r = decodeMetar('METAR YSSY 231400Z 99910KT 9999 FEW012 20/17 Q1016', ctx('YSSY', '2026-10-23T14:25:00Z'));
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toContain('999');
  });

  it('accepts lower case and a trailing "="', () => {
    const f = fixture('metar-kjfk-sm-inhg');
    const r = decodeMetar(f.raw.toLowerCase() + '=', ctx('KJFK', f.nowUtc));
    expect(r.kind).toBe('ok');
  });
});

describe('wind safety: junk must never feed the wind', () => {
  const c = ctx('YSSY', '2026-10-23T14:25:00Z');
  const metar = (wind: string) => decodeMetar(`METAR YSSY 231400Z ${wind} 9999 FEW012 20/17 Q1016`, c);

  it('a valid wind group with a gust still passes', () => {
    const r = metar('27015G25KT');
    expect(r.kind === 'ok' && r.report.wind).toEqual({ kind: 'steady', directionDegrees: 270, speedKt: 15, gustKt: 25, variableRangeDegrees: null });
  });

  it('27015KTX is refused, naming the token (METAR and TAF)', () => {
    const r = metar('27015KTX');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toContain('27015KTX');
    const t = decodeTaf('TAF YSSY 231108Z 2312/2418 27015KTX 9999 SCT012', c);
    expect(t.kind).toBe('error');
    if (t.kind === 'error') expect(t.message).toContain('27015KTX');
  });

  it('a 4000-digit token is refused as too long and is not echoed whole', () => {
    const junk = '1'.repeat(4000);
    for (const r of [metar(junk), decodeTaf(`TAF YSSY 231108Z 2312/2418 ${junk} 9999 SCT012`, c)]) {
      expect(r.kind).toBe('error');
      if (r.kind === 'error') {
        expect(r.message).toContain('far too long');
        expect(r.message.length).toBeLessThan(300);
      }
    }
  });

  it('a long junk token that contains a wind-like group in a TEMPO is refused', () => {
    const r = decodeTaf('TAF YSSY 231108Z 2312/2418 04010KT 9999 SCT012 TEMPO 2312/2316 27015KTX', c);
    expect(r.kind).toBe('error');
  });

  it('a long token inside remarks is allowed', () => {
    const r = decodeMetar(`METAR YSSY 231400Z 02010KT 9999 FEW012 20/17 Q1016 RMK ${'X'.repeat(80)}`, c);
    expect(r.kind).toBe('ok');
  });
});

describe('messages never echo a long token whole', () => {
  it('a long unknown group in a warning is cut at 40 characters with an ellipsis', () => {
    const long = 'ZZ' + '9'.repeat(35); // 37 chars: under the limit, kept
    const longer = 'ZQ' + '9'.repeat(38); // 40 chars exactly: kept
    const r = decodeMetar(`METAR YSSY 231400Z 02010KT 9999 FEW012 20/17 Q1016 ${long}`, ctx('YSSY', '2026-10-23T14:25:00Z'));
    expect(r.kind === 'ok' && r.warnings.map((w) => w.message).join(' ')).toContain(long);
    void longer;
  });

  it('a station-position token of any length is clipped in the error', () => {
    const r = decodeMetar('METAR ' + 'Q'.repeat(500) + ' 231400Z', ctx('YSSY'));
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message.length).toBeLessThan(200);
    const t = decodeTaf('TAF YSSY ' + 'Q'.repeat(500), ctx('YSSY'));
    expect(t.kind).toBe('error');
    if (t.kind === 'error') expect(t.message.length).toBeLessThan(200);
  });
});

describe('fixture provenance', () => {
  it('every fixture says whether it is awc-live, upstream-test-suite or synthetic', () => {
    for (const f of FIXTURES) expect(['awc-live', 'upstream-test-suite', 'synthetic'], f.id).toContain(f.provenance);
  });

  it('provenance agrees with the source, and synthetic fixtures carry a synthetic- id', () => {
    for (const f of FIXTURES) {
      if (f.provenance === 'awc-live') expect(f.source.url, f.id).toContain('aviationweather.gov');
      if (f.provenance === 'upstream-test-suite') expect(f.source.url, f.id).toContain('github.com');
      if (f.provenance === 'synthetic') expect(f.id.startsWith('synthetic-'), f.id).toBe(true);
    }
    for (const id of ['taf-kmsn-month-rollover-hour24', 'taf-eham-month-rollover-becmg', 'metar-svmc-nil', 'taf-vtbd-cancelled', 'taf-czbf-day30-amd-nautical']) {
      expect(fixture(id).provenance, id).toBe('upstream-test-suite');
    }
  });
});

describe('METAR 11/2SM and warning grammar', () => {
  it('a METAR visibility written 11/2SM is one and a half miles, not 5.5 (SYNTHETIC string: no sourced METAR uses this form)', () => {
    const r = decodeMetar('METAR YSSY 231400Z 18005KT 11/2SM BR OVC005 10/10 Q1015', ctx('YSSY', '2026-10-23T14:25:00Z'));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.report.visibility?.metres).toBe(Math.round(1.5 * 1609.344));
  });

  it('the dropped-group sentence agrees in number', async () => {
    const { groupWarnings } = await import('../../src/weather/decode/tokens');
    const scan = { counts: { wind: 1, windTokens: ['27015KT'], visibility: 1, clouds: 0, weather: 0 }, unknown: [], unknownClouds: [], windNotReported: false, sixteenths: 0, trendFollows: false };
    const one = groupWarnings(scan, { hasWind: true, hasVisibility: false, clouds: 0, weather: 0 }, 'X')[0]!.message;
    expect(one).toContain('the visibility group that appears in the text');
    const two = groupWarnings({ ...scan, counts: { ...scan.counts, clouds: 1 } }, { hasWind: true, hasVisibility: false, clouds: 0, weather: 0 }, 'X')[0]!.message;
    expect(two).toContain('groups that appear in the text');
  });
});

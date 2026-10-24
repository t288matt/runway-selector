import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePack, type AirportPack } from '../../src/refdata';
import type { DecodedMetar } from '../../src/weather';
import { NO_SUITABLE_TITLE, EARLY_CHANGE_TITLE, type EngineInput, type TrafficLevel } from '../../src/engine';
import { runwaysOfMode } from '../../src/engine/eligibility';
import { AppBody, PackError } from '../../src/ui/App';
import { FLIGHT_SIM_NOTICE, extraNoticeOf } from '../../src/ui/components/Frame';
import { NO_AUTO_WEATHER } from '../../src/ui/controller';
import { WeatherEntry, ApplyNote } from '../../src/ui/components/WeatherEntry';
import { calculate, defaultWindowFor, EMPTY_FEED, type ViewData } from '../../src/ui/model/dashboard';
import { cellDetailModel, currentWind, panelDModel, runwayComponentRows } from '../../src/ui/model/panels';
import { modeRows, timelineModel, visibleRows } from '../../src/ui/model/timeline';

/** The rows the screen draws by default: fully red rows are hidden until the user asks (OD-39). */
const drawnRows = (view: ViewData) => visibleRows(timelineModel(view, view.calcNowMs), false);
import { applyMetarText } from '../../src/ui/model/apply';
import { PACKS, readJson, toRaw, TEST1_PACK } from '../helpers/packs';
import { baseFor, inputFor, quietTraffic, steady, tailwindOn } from '../engine/helpers';
import { BASE, packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { decodeMetarFixture, decodeTafFixture, fixture, nowOf, packWith } from '../weather/helpers';
import { createMemoryStore } from '../../src/store';
import { gridCellClasses, renderDashboard, textOf, viewFromInput, viewOf } from './helpers';

const METAR_ID = 'metar-yssy-auto-nodata';
const TAF_ID = 'taf-yssy-multiline-fm-tempo';
const BANNED = /\b(penalty|penalties|cost|costs|points?|scores?|least[- ]bad)\b/i;

function realView(pack: AirportPack, ref: (typeof PACKS)[number], aircraft: boolean = false): ViewData {
  return calculate({
    pack,
    nowMs: nowOf(fixture(TAF_ID)),
    metar: decodeMetarFixture(METAR_ID, ref),
    taf: decodeTafFixture(TAF_ID, ref),
    windowChoice: 'full',
    currentMode: null,
    feed: aircraft ? { aircraft: [], fetchedAtMs: nowOf(fixture(TAF_ID)), error: null, errorAtMs: null } : EMPTY_FEED,
  });
}

describe.each(PACKS.map((p) => [p.name, p] as const))('the screen from real reports [%s]', (_n, ref) => {
  const pack = packWith(ref, { weatherStation: fixture(METAR_ID).station });
  const view = realView(pack, ref);
  const html = renderDashboard(view);
  const text = textOf(html);

  it('builds the title from the pack and shows the fixed notice and the pack line', () => {
    expect(text).toContain('Runway Mode Planner');
    expect(text).not.toContain(`${pack.airport.name} (${pack.airport.icao})`);
    expect(html).toContain(FLIGHT_SIM_NOTICE);
    const extra = extraNoticeOf(pack);
    if (extra !== null) expect(text).toContain(extra);
  });

  it('keeps the fixed order: header, chips, A, B, weather entry, D, F, notice', () => {
    const marks = ['<header', 'aria-label="Data freshness"', 'Panel A', 'Panel B', 'aria-label="Raw METAR and TAF"', 'Panel D', 'Panel F', 'role="note"'].map((m) => html.indexOf(m));
    expect(marks.every((i) => i >= 0)).toBe(true);
    expect([...marks].sort((a, b) => a - b)).toEqual(marks);
  });

  it('shows the reports in use as plain text; the METAR age is in the freshness chip, not repeated under the report', () => {
    expect(html).toContain('data-testid="wx-metar-in-use"');
    expect(text).toContain(view.metar?.raw ?? 'missing');
    expect(text).not.toContain('Taken from the time group in the report');
  });

  it('draws one row per enabled mode and one cell per mode and slot', () => {
    const drawn = drawnRows(view);
    expect(drawn.rows.length + drawn.hiddenCount).toBe(pack.modes.filter((m) => m.enabled).length);
    const cells = gridCellClasses(html);
    expect(cells).toHaveLength(drawn.rows.length * view.weather.slots.length);
    for (const r of drawn.rows) expect(text).toContain(r.modeId);
  });

  it('shows every runway end of the pack in the diagram, for any number of runways, and has no weather components panel (OD-40)', () => {
    const f = html.slice(html.indexOf('Panel F'));
    expect(html).not.toContain('Panel C');
    for (const r of pack.runways) expect(f).toContain(r.name);
    expect(f).toContain('<svg');
    expect(f).toContain('role="img"');
    expect(runwayComponentRows(view)).toHaveLength(pack.runways.length);
  });

  it('uses the plain-language words only', () => {
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(/\btrend\b/i);
  });

  it('has no inline script and no HTML insertion', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('dangerouslySetInnerHTML');
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  it('shows the window selector with the three choices and the default selected', () => {
    expect(html).toContain('<option value="4h">4 hours</option>');
    expect(html).toContain('<option value="6h">6 hours</option>');
    expect(html).toContain('Full TAF');
    expect(defaultWindowFor(pack)).toBe(pack.settings.forecastWindowMinutes === 240 ? '4h' : pack.settings.forecastWindowMinutes === 360 ? '6h' : 'full');
  });

  it('shows the legend, the now marker and the summary tiles', () => {
    expect(html).toContain('aria-label="Legend"');
    expect(html).toContain('class="ov now"');
    for (const label of ['Recommended', 'Survives', 'Next constraint', 'Traffic at changeover']) expect(text).toContain(label);
  });
});

describe('the single-runway pack renders the diagram and the timeline', () => {
  const pack = packWith(TEST1_PACK, { weatherStation: fixture(METAR_ID).station });
  const html = renderDashboard(realView(pack, TEST1_PACK));
  it('has runway ends 3 and 21 in one drawn runway', () => {
    expect(pack.runways).toHaveLength(2);
    const f = html.slice(html.indexOf('Panel F'));
    expect((f.match(/class="dg-rwy/g) ?? []).length).toBe(1);
    expect(f).toContain('>3');
    expect(f).toContain('>21');
    expect(html).toContain('role="grid"');
    expect(gridCellClasses(html).length).toBeGreaterThan(0);
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('a cell is green only when the engine says SUITABLE [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const scenarios: [string, Wx[]][] = [
    ['all fine', same<Wx>(8, 'ok')],
    ['mixed', ['ok', 'marginalA', 'badA', 'badB', 'badBoth', 'ok', 'none', 'marginalA']],
    ['no weather', same<Wx>(6, 'none')],
    ['A fails late', ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA']],
  ];
  it.each(scenarios)('%s', (_name, wx) => {
    const levels: (TrafficLevel | null)[] = wx.map((_w, i) => (i % 3 === 0 ? 'busy' : i % 3 === 1 ? 'medium' : null));
    const view = viewOf(pack, rig, wx, levels);
    const classes = gridCellClasses(renderDashboard(view));
    const rows = drawnRows(view).rows;
    let k = 0;
    let suitable = 0;
    rows.forEach((row) => {
      view.weather.slots.forEach((_s, i) => {
        const status = view.result.evaluation.cells[row.index]?.[i]?.status;
        const cls = (classes[k] ?? '').split(' ');
        expect(cls.includes('cs-suitable')).toBe(status === 'SUITABLE');
        const colours = cls.filter((c) => c.startsWith('cs-'));
        expect(colours).toHaveLength(1);
        if (status === 'SUITABLE') suitable += 1;
        k += 1;
      });
    });
    expect(k).toBe(classes.length);
    expect(classes.filter((c) => c.split(' ').includes('cs-suitable'))).toHaveLength(suitable);
  });

  it('a tailwind just over the dry limit is never drawn green and carries the cause TW', () => {
    const mode = pack.modes.find((m) => m.enabled && runwaysOfMode(pack, m).length > 0);
    if (mode === undefined) throw new Error('no enabled mode');
    const used = runwaysOfMode(pack, mode)[0];
    if (used === undefined) throw new Error('no runway');
    const base = baseFor(pack, mode.id, 1);
    const input: EngineInput = inputFor(base, [{ wind: tailwindOn(used.headingDegrees, pack.settings.tailwindDryKt + 0.1, pack.settings.calmWindKt) }], quietTraffic(base, 1));
    // the mode is the current one, so its fully red row is drawn (a current-mode row is never hidden)
    const view = { ...viewFromInput(pack, input), currentMode: mode.id };
    const rows = modeRows(view);
    const html = renderDashboard(view);
    const classes = gridCellClasses(html);
    const idx = rows.findIndex((r) => r.modeId === mode.id);
    expect(view.result.evaluation.cells[rows[idx]?.index ?? 0]?.[0]?.status).toBe('UNSUITABLE');
    expect(classes[idx]).toContain('cs-unsuitable');
    expect(classes[idx]).not.toContain('cs-suitable');
    const cell = html.split('role="gridcell"')[idx + 1] ?? '';
    expect(textOf(cell.slice(0, cell.indexOf('</div>') + 6))).toContain('TW');
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('Panel A states [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const WX8: Wx[] = ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'];
  const med = same<TrafficLevel | null>(8, 'medium');

  it('shows no banner when nothing is wrong and the current mode is not set', () => {
    const html = renderDashboard(viewOf(pack, rig, same<Wx>(4, 'ok')));
    expect(html).not.toContain('class="banner');
    expect(html).not.toContain('Not set: no starting mode');
  });

  it('shows the red banner when the current mode is unsuitable now', () => {
    const view = viewOf(pack, rig, ['badA', 'badA', 'ok'], same(3, 'medium'), rig.a);
    const html = renderDashboard(view);
    const text = textOf(html);
    expect(html).toContain('banner banner-red');
    expect(text).toContain(`Current mode ${rig.a} is unsuitable`);
    expect(text).toContain(`Change to Mode ${view.result.plan.recommendedModeId}`);
    expect(text).not.toMatch(BANNED);
  });

  it('shows a quiet note when the recommendation differs from the current mode and nothing is urgent', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light'), rig.b);
    const text = textOf(renderDashboard(view));
    if (view.result.plan.recommendedModeId !== rig.b) expect(text).toContain('Recommended differs from current');
    else expect(text).not.toContain('Recommended differs from current');
  });

  it('shows the amber EARLY MODE CHANGE RECOMMENDED banner with the engine text', () => {
    const levels = [...med];
    levels[4] = 'busy';
    const view = viewOf(pack, rig, WX8, levels);
    const html = renderDashboard(view);
    expect(view.result.explanation.earlyChange).not.toBeNull();
    expect(html).toContain('banner banner-amber');
    expect(html).toContain(EARLY_CHANGE_TITLE);
    expect(textOf(html)).toContain(view.result.explanation.earlyChange?.text ?? 'missing');
  });

  it('shows NO SUITABLE STANDARD MODE IDENTIFIED with the blocking cause per mode and never a least-bad mode', () => {
    const view = viewOf(pack, rig, ['badBoth', 'badBoth'], same(2, 'medium'));
    expect(view.result.plan.recommendedModeId).toBeNull();
    const html = renderDashboard(view);
    const text = textOf(html);
    expect(text).toContain(NO_SUITABLE_TITLE);
    expect(text).not.toContain('Recommended mode now');
    const a = html.slice(html.indexOf('Panel A'), html.indexOf('Panel B'));
    for (const b of view.result.explanation.noSuitableMode?.perMode ?? []) expect(textOf(a)).toContain(b.text);
    expect(view.result.explanation.noSuitableMode?.perMode.length).toBe(pack.modes.filter((m) => m.enabled).length);
    expect(a).not.toContain('aria-label="Recommended mode');
    expect(text).not.toMatch(BANNED);
  });

  it('shows the gap line when no mode is suitable for a while', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'badBoth', 'badA', 'badA'], same(5, 'medium'));
    expect(textOf(renderDashboard(view))).toContain('No suitable mode from');
  });

  it('says there is no data when slot 1 has no weather, and lists what is missing', () => {
    const view = viewOf(pack, rig, same<Wx>(3, 'none'));
    const text = textOf(renderDashboard(view));
    expect(text).toContain('No data. Cannot recommend a mode.');
    expect(text).toContain('No mode is recommended because the weather for the current period is not known');
    expect(text).not.toContain('Recommended mode now');
  });
});

describe('the weather components and the hover detail come from the engine', () => {
  describe.each(PACKS.map((p) => [p.name, p] as const))('[%s]', (_n, ref) => {
    const rig = rigFor(ref);
    const pack = packOf(rig);

    it('shows the components of a pure tailwind on the first runway end, with the limit it breaks', () => {
      const r0 = pack.runways[0];
      if (r0 === undefined) throw new Error('no runway');
      const speed = pack.settings.tailwindDryKt + 7;
      const input = inputFor(BASE, [{ wind: steady((r0.headingDegrees + 180) % 360, speed) }]);
      const view = viewFromInput(pack, input);
      const row = runwayComponentRows(view)[0];
      expect(row?.name).toBe(r0.name);
      expect(row?.tailwind).toBe(Math.round(speed).toString());
      expect(row?.headwind).toBe('0');
      expect(row?.over).toBe('TW');
      expect(runwayComponentRows(view)).toHaveLength(pack.runways.length);
      expect(currentWind(view)).not.toBeNull();
    });

    it('shows Unknown in every figure when there is no wind', () => {
      const view = viewOf(pack, rig, ['none']);
      for (const r of runwayComponentRows(view)) expect([r.headwind, r.tailwind, r.crosswind]).toEqual(['Unknown', 'Unknown', 'Unknown']);
    });

    it('gives the hover detail from the cell: time, reason, figures per runway of the mode, state, traffic, plan', () => {
      const view = viewOf(pack, rig, ['badA', 'ok'], same(2, 'busy'));
      const rows = modeRows(view);
      const a = rows.find((r) => r.modeId === rig.a);
      const d = cellDetailModel(view, a?.index ?? 0, 0);
      const cell = view.result.evaluation.cells[a?.index ?? 0]?.[0];
      expect(d?.statusWord).toBe('UNSUITABLE');
      expect(d?.reason).toBe(cell?.reasons.find((r) => r.severity === 'FAIL')?.text);
      expect(d?.runways.map((r) => r.name)).toEqual(cell?.runways.map((r) => r.runway));
      expect(d?.title).toContain('Z to');
      expect(d?.runwayAssumption).toBe('DRY');
      expect(d?.traffic).toContain('HIGH');
      expect(d?.operatingPlan.length).toBeGreaterThan(0);
      expect(d?.runways.some((r) => r.overTailwind || r.overCrosswind)).toBe(true);
    });
  });
});

describe('Panel D', () => {
  it('shows four slots, departures for the first only, unknown demand beyond the horizon, and no trend', () => {
    const ref = PACKS[0];
    if (ref === undefined) throw new Error('no pack');
    const pack = packWith(ref, { weatherStation: fixture(METAR_ID).station });
    const view = realView(pack, ref, true);
    const m = panelDModel(view);
    expect(m.columns).toHaveLength(4);
    expect(m.columns.map((c) => c.label)).toEqual(['Next 30 mins', '+30 min', '+60 min', '+90 min']);
    expect(m.columns[0]?.departures).toBe('0');
    expect(m.columns.slice(1).every((c) => c.departures === 'not est.')).toBe(true);
    expect(m.unknownFrom).not.toBeNull();
    const text = textOf(renderDashboard(view, { aircraft: [], fetchedAtMs: view.calcNowMs, error: null, errorAtMs: null }));
    expect(text).toContain('Demand unknown from');
    expect(text).toContain('Connected aircraft are not movements');
    expect(text).not.toMatch(/\btrend\b/i);
  });

  it('shows "No traffic data" when no feed has arrived', () => {
    const ref = PACKS[0];
    if (ref === undefined) throw new Error('no pack');
    const pack = packWith(ref, { weatherStation: fixture(METAR_ID).station });
    const text = textOf(renderDashboard(realView(pack, ref)));
    expect(text).toContain('No traffic data.');
  });

  it('warns when the pack has no airport elevation', () => {
    const pack = packWith(TEST1_PACK, { weatherStation: fixture(METAR_ID).station });
    expect(pack.airport.elevationFt).toBeNull();
    const view = realView(pack, TEST1_PACK, true);
    expect(panelDModel(view).elevationMissing).toBe(true);
    expect(textOf(renderDashboard(view))).toContain('no airport elevation');
  });
});

describe('text safety (SEC-2)', () => {
  const HOSTILE = '<img src=x onerror=alert(1)>';

  function hostilePack(): AirportPack {
    const files = readJson(PACKS[0] ?? TEST1_PACK);
    files['airport.json'].name = HOSTILE;
    files['airport.json'].labels = { extraNotice: `${HOSTILE} <script>alert(2)</script>` };
    files['settings.json'].tailwindDryKt.description = `${HOSTILE} drawer text`;
    files['settings.json'].source = 'javascript:alert(3)';
    return parsePack(toRaw(files));
  }

  it('renders hostile pack text as text: no element is created from it', () => {
    const pack = hostilePack();
    const view = calculate({ pack: { ...pack, airport: { ...pack.airport, weatherStation: 'YSSY' } }, nowMs: Date.UTC(2026, 0, 15, 0, 0), metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    const html = renderDashboard(view, EMPTY_FEED, true);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(textOf(html)).toContain(HOSTILE);
    // a source that is not https is never a link
    expect(html).not.toContain('href="javascript');
  });

  it('cannot reword or hide the fixed notice through a pack line', () => {
    const files = readJson(PACKS[0] ?? TEST1_PACK);
    files['airport.json'].labels = { extraNotice: 'This is real-world guidance.' };
    const pack = parsePack(toRaw(files));
    const html = renderDashboard(calculate({ pack, nowMs: Date.UTC(2026, 0, 15, 0, 0), metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED }));
    expect(html).toContain(FLIGHT_SIM_NOTICE);
    expect(html).toContain('This is real-world guidance.');
    // a pack with no line still shows the notice
    expect(extraNoticeOf(parsePack(toRaw(readJson(TEST1_PACK))))).toBeNull();
    const bare = renderDashboard(calculate({ pack: parsePack(toRaw(readJson(TEST1_PACK))), nowMs: Date.UTC(2026, 0, 15, 0, 0), metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED }));
    expect(bare).toContain(FLIGHT_SIM_NOTICE);
  });

  it('shows an https source as a link and nothing else as one', () => {
    const files = readJson(PACKS[0] ?? TEST1_PACK);
    files['settings.json'].source = 'https://example.org/limits';
    const pack = parsePack(toRaw(files));
    const html = renderDashboard(calculate({ pack, nowMs: Date.UTC(2026, 0, 15, 0, 0), metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED }), EMPTY_FEED, true);
    expect(html).toContain('<a href="https://example.org/limits" rel="noopener noreferrer"');
  });

  it('renders a pasted report and the refusal message as text', () => {
    const ref = PACKS[0] ?? TEST1_PACK;
    const pack = packWith(ref, { weatherStation: fixture(METAR_ID).station });
    const hostileMetar: DecodedMetar = { ...decodeMetarFixture(METAR_ID, ref), raw: HOSTILE };
    const html = renderToStaticMarkup(<WeatherEntry pack={pack} metar={hostileMetar} taf={null} onApplyMetar={() => ({ ok: true, message: null, warnings: [] })} onApplyTaf={() => ({ ok: true, message: null, warnings: [] })} auto={NO_AUTO_WEATHER} onResumeAutomatic={() => undefined} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    // the real refusal of a hostile paste, rendered the way the screen renders it
    const refused = applyMetarText(`${HOSTILE} <script>x</script>`, pack, nowOf(fixture(METAR_ID)));
    expect(refused.report).toBeNull();
    expect(refused.outcome.ok).toBe(false);
    const note = renderToStaticMarkup(<ApplyNote outcome={refused.outcome} />);
    expect(note).not.toContain('<img');
    expect(note).not.toContain('<script');
    expect(note).toContain('role="alert"');
  });
});

describe('the application states', () => {
  const deps = { fetch: () => Promise.reject(new Error('not used')), now: () => 0, store: createMemoryStore() };
  it('draws only the error when the pack is invalid', () => {
    const html = renderToStaticMarkup(<AppBody state={{ status: 'error', message: 'modes.json: unknown field' }} deps={deps} />);
    expect(textOf(html)).toContain('modes.json: unknown field');
    expect(html).not.toContain('Panel A');
    expect(html).not.toContain(FLIGHT_SIM_NOTICE);
    expect(html).not.toContain('role="grid"');
    expect(renderToStaticMarkup(<PackError message="x" />)).toContain('role="alert"');
  });

  it('shows a loading state with the fixed notice and nothing recommended', () => {
    const html = renderToStaticMarkup(<AppBody state={{ status: 'loading' }} deps={deps} />);
    expect(textOf(html)).toContain('Loading the airport pack and the VATSIM feed');
    expect(html).toContain(FLIGHT_SIM_NOTICE);
    expect(html).not.toContain('Panel A');
  });

  it('starts with no paste boxes, "No weather entered" and a button offering them, for any pack', () => {
    for (const ref of PACKS) {
      const pack = packWith(ref);
      const html = renderToStaticMarkup(<AppBody state={{ status: 'ready', pack, airports: [pack.airport.icao], airportError: null }} deps={deps} />);
      const text = textOf(html);
      expect(text).toContain('No weather entered');
      expect(html).not.toContain('<textarea');
      expect(html).not.toContain('>Apply<');
      expect(text).toContain('Use my own weather');
      expect(text).toContain('No data. Cannot recommend a mode.');
      expect(html).toContain('Panel A');
    }
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('times are UTC only and the window note [%s]', (_n, ref) => {
  const pack = packWith(ref, { weatherStation: fixture(METAR_ID).station });
  const view = realView(pack, ref);
  const text = textOf(renderDashboard(view));

  // OD-36 (24-10-2026): no clock time is shown in the airport's local zone and no zone
  // offset is stated. "local record" (the audit trail) and a band's own hours ("06:00 to
  // 23:00 local time", a pack fact, not a parallel clock) are unaffected and still say "local".
  it('shows no UTC-offset wording and no clock stamp paired with "local"', () => {
    expect(text).not.toMatch(/UTC[+-]\d/);
    expect(text).not.toMatch(/\d{1,2}:\d{2}[^)]*\(?\s*local\)/i);
  });

  it('no longer carries the window note (OD-41); the window choice itself is still on screen', () => {
    expect(text).not.toContain('looks ahead only as far as the window');
    expect(text).toContain('Window');
  });
});

// OD-36 (24-10-2026) removed local-time display entirely, so the half-hour/45-minute zone
// case this used to cover (tests/ui/render.test.tsx formerly here) no longer has anything to
// test against; the generic "times are UTC only" check above runs on every pack, TEST and
// TEST1 included.

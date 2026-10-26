// The expandable Detail section and the shared popover, as static
// markup (like render.test.tsx; there is no DOM test library, so the open and
// close, which the browser does natively, and the pinned answer band, which is
// CSS, are checked in a real browser and by the stylesheet tests below).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineInput, TrafficLevel, WeatherOverlay } from '../../src/engine';
import { Dashboard } from '../../src/v2/components/Dashboard';
import { Tip } from '../../src/v2/components/Popover';
import { NO_AUTO_WEATHER, type ControllerState } from '../../src/v2/controller';
import { EMPTY_FEED, type ViewData } from '../../src/v2/model/dashboard';
import { screenModel } from '../../src/v2/model/screen';
import { inputFor } from '../engine/helpers';
import { BASE, packOf, rigFor, same, specsFor, trafficFor, type Wx } from '../engine/planHelpers';
import { PACKS, YSSY_PACK } from '../helpers/packs';
import { packWith } from '../weather/helpers';
import { FIXTURE_NOW, FIXTURE_STATION, realView, viewFromInput, viewOf } from './helpers';

const BANNED_WORDS = /\b(penalty|penalties|cost|costs|points?|scores?|least[- ]bad)\b/i;

function stateOf(view: ViewData, displayNowMs: number = view.calcNowMs + 60_000): ControllerState {
  return { view, feed: EMPTY_FEED, displayNowMs, audit: [], notices: [], reload: { status: 'idle', message: null }, autoWeather: NO_AUTO_WEATHER };
}
function render(view: ViewData, displayNowMs?: number): string {
  return renderToStaticMarkup(<Dashboard model={screenModel(stateOf(view, displayNowMs))} pack={view.pack} onDismissNotice={() => undefined} />);
}
const textOf = (markup: string): string => markup.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
/** Just the expansion's markup. */
const expansionOf = (html: string): string => html.slice(html.indexOf('data-testid="evaluation"'), html.indexOf('</details>'));
const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe.each(PACKS.map((p) => [p.name, p] as const))('the Detail section [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const levels: (TrafficLevel | null)[] = ['light', 'busy', 'busy', 'medium', 'light', 'light', 'medium', 'light'];
  const wx: Wx[] = ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'marginalA', 'ok'];

  it('is a native details element with a summary labelled "Detail", a chevron and the time range, closed to begin with', () => {
    const html = render(viewOf(pack, rig, wx, levels));
    expect(html).toMatch(/<details class="fcx"[^>]*data-testid="forecast-bar">\s*<summary /);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toMatch(/<summary[^>]*aria-label="Detail: open or close\./);
    expect(textOf(html)).toMatch(/Detail \d\d:\d\dZ to \d\d:\d\dZ/);
    expect(html).toContain('class="chev"');
  });

  it('inside it holds the timeline block, the legend and the raw METAR and TAF in that order, and nothing else', () => {
    const html = render(viewOf(pack, rig, wx, levels));
    const marks = ['<summary', 'data-testid="evaluation"', 'Time (UTC)', 'Weather events', 'role="rowheader">Traffic<', 'data-testid="mode-row"', 'data-testid="legend"', 'data-testid="raw-reports"'].map((m) => html.indexOf(m));
    expect(marks.every((i) => i >= 0)).toBe(true);
    expect([...marks].sort((a, b) => a - b)).toEqual(marks);
    const inner = expansionOf(html);
    // not in the expansion: an inputs table, reasons text, an outlook, a decoded TAF, new headings or captions
    expect(inner).not.toContain('<table');
    expect(inner).not.toMatch(/<h[1-6]/);
    expect(inner).not.toContain('<figcaption');
    // (the cell tooltips carry v1's hover detail, which has its own lines; they are not sections)
    const visible = textOf(inner.replace(/<span id="[^"]*" role="tooltip"[^>]*>[\s\S]*?<\/span>/g, ''));
    expect(visible).not.toMatch(/Outlook|Inputs|Decoded|Why/);
    expect(visible).not.toMatch(BANNED_WORDS);
  });

  it('draws the UTC time row with a column per slot, and the NOW marker at the slot that holds now', () => {
    const view = viewOf(pack, rig, wx, levels);
    const html = render(view, view.calcNowMs + 40 * 60_000);
    expect(count(html, 'data-testid="slot-time"')).toBe(view.weather.slots.length);
    expect(html).toContain('data-testid="now-marker"');
    expect(textOf(html)).toMatch(/NOW \d\d:\d\dZ/);
    expect(render(view, view.calcNowMs + 8 * 3_600_000)).not.toContain('data-testid="now-marker"');
  });

  it('draws one row per mode that is not hidden, REC on the recommended mode, and the runways under the name', () => {
    const view = viewOf(pack, rig, wx, levels);
    const html = render(view);
    const model = screenModel(stateOf(view)).evaluation;
    expect(count(html, 'data-testid="mode-row"')).toBe(model.rows.length);
    expect(html).toMatch(/<span class="rt rec"> REC<\/span>/);
    for (const r of model.rows) expect(textOf(html)).toContain(r.runwaysText);
    expect(count(html, 'class="rt rec"')).toBe(1);
  });

  it('every cell is a focusable grid cell with an accessible name and its detail as the popover text; one tab stop for the whole grid', () => {
    const html = render(viewOf(pack, rig, wx, levels));
    const cells = html.match(/<div role="gridcell"[^>]*>/g) ?? [];
    expect(cells.length).toBeGreaterThan(8);
    expect(cells.filter((c) => c.includes('tabindex="0"'))).toHaveLength(1);
    for (const c of cells) {
      expect(c).toMatch(/aria-label="Mode [^"]+, \d\d:\d\dZ, (suitable|marginal|unsuitable|unknown)/);
      const id = /aria-describedby="([^"]+)"/.exec(c)?.[1] ?? 'missing';
      expect(html).toContain(`<span id="${id}" role="tooltip" class="tip-pop" hidden="">Mode `);
    }
  });

  it('a suitable cell has a tick; an unsuitable cell has a cross and its cause word; the glyph is hidden from screen readers and the status is in the name', () => {
    const html = render(viewOf(pack, rig, ['ok', 'badBoth', 'ok'], same(3, 'light')));
    expect(html).toMatch(/data-status="SUITABLE" class="cell cs-suitable[^"]*"[^>]*><span aria-hidden="true">✓<\/span>/);
    expect(html).toMatch(/data-status="UNSUITABLE" class="cell cs-unsuitable[^"]*"[^>]*><span aria-hidden="true">✕<\/span><small aria-hidden="true" data-testid="cell-code">[A-Z? ]+<\/small>/);
  });

  it('a marginal cell is GREEN with its cause word and NO tick', () => {
    const html = render(viewOf(pack, rig, same<Wx>(4, 'marginalA'), same(4, 'light')));
    const marginal = html.match(/<div role="gridcell"[^>]*data-status="MARGINAL"[^>]*>[\s\S]*?<\/span><\/div>/g) ?? [];
    expect(marginal.length).toBeGreaterThan(0);
    for (const m of marginal) {
      expect(m).toContain('cs-suitable');
      expect(m).not.toContain('✓');
      expect(m).toContain('data-testid="cell-code"');
      expect(m).toContain('marginal');
    }
  });

  it('draws the white corner on a cell with an uncertain input, and the blue outline on the recommended path', () => {
    const overlay: WeatherOverlay = { kind: 'TEMPO', probabilityPct: null, wind: rig.badForA, precipitation: false, text: 'TEMPO 1502/1504 test' };
    const specs = specsFor(rig, same<Wx>(4, 'ok')).map((s, i) => (i === 1 ? { ...s, overlays: [overlay] } : s));
    const view = viewFromInput(pack, { ...inputFor(BASE, specs, trafficFor(pack, same(4, 'light'))), currentMode: null } as EngineInput);
    const html = render(view);
    expect(html).toMatch(/class="cell [^"]*\bunc\b[^"]*"/);
    expect(html).toMatch(/class="cell [^"]*\brec\b[^"]*"/);
    expect(count(html, 'depends on an uncertain input')).toBeGreaterThan(0);
    const plain = render(viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light')));
    expect(plain).not.toMatch(/class="cell [^"]*\bunc\b/);
  });

  it('draws the dashed change line at each planned change, and the amber busy band over runs of HIGH traffic', () => {
    const view = viewOf(pack, rig, wx, levels);
    const model = screenModel(stateOf(view)).evaluation;
    const html = render(view);
    expect(count(html, 'data-testid="change-line"')).toBe(model.changeSlots.length);
    expect(count(html, 'data-testid="busy-band"')).toBe(model.busyRuns.length);
    expect(model.busyRuns.length).toBeGreaterThan(0);
    expect(textOf(html)).not.toContain('Dashed blue line: planned change'); // the line is drawn but not explained in the legend
    expect(textOf(html)).toContain('Amber band: HIGH traffic');
  });

  it('hides a mode row that is red in every slot unless it is recommended or current, and has no button to reveal them', () => {
    const view = viewOf(pack, rig, ['badA', 'badA', 'badA', 'badA'], same(4, 'medium'), rig.b);
    const model = screenModel(stateOf(view)).evaluation;
    const html = render(view);
    expect(count(html, 'data-testid="mode-row"')).toBe(model.rows.length);
    expect(textOf(html)).not.toMatch(/Show \d+ unsuitable|Hide unsuitable/);
    const all = pack.modes.filter((m) => m.enabled).map((m) => m.id);
    const shown = model.rows.map((r) => r.modeId);
    for (const id of all.filter((x) => !shown.includes(x))) expect(view.result.plan.recommendedModeId === id || view.currentMode === id).toBe(false);
  });

  it('draws the wind bars, and the TEMPO, INTER and PROB bars when the TAF has them', () => {
    const overlay: WeatherOverlay = { kind: 'INTER', probabilityPct: null, wind: null, precipitation: false, text: 'INTER 1502/1504 4000 SHRA' };
    const specs = specsFor(rig, same<Wx>(4, 'ok')).map((s, i) => (i >= 1 && i <= 2 ? { ...s, overlays: [overlay] } : s));
    const html = render(viewFromInput(pack, { ...inputFor(BASE, specs, trafficFor(pack, same(4, 'light'))), currentMode: null } as EngineInput));
    expect(html).toContain('data-testid="wind-bar"');
    expect(html).toContain('data-testid="group-bar"');
    expect(textOf(html)).toContain('INTER 4000 SHRA');
    expect(render(viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light')))).not.toContain('data-testid="group-bar"');
  });

  it('has no slim bar rows: the toggle row is all the closed state shows of the forecast', () => {
    const html = render(viewOf(pack, rig, wx, levels));
    expect(html).not.toContain('data-testid="path-seg"');
    expect(html).not.toContain('class="fc2"');
    expect(html).toContain('class="sumhead"');
  });
});

describe('Detail with the real reports', () => {
  const real = packWith(YSSY_PACK, { weatherStation: FIXTURE_STATION });
  const view = realView(real, YSSY_PACK);

  it('shows the raw METAR and the raw TAF as received, with line breaks kept by the stylesheet', () => {
    const html = render(view, FIXTURE_NOW);
    expect(html).toContain(`data-testid="raw-metar">${view.metar?.raw ?? 'missing'}<`);
    const tafRaw = view.taf?.raw ?? 'missing';
    expect(html).toContain(`data-testid="raw-taf">${tafRaw}<`);
    expect(readFileSync(resolve(import.meta.dirname, '../../src/v2/v2.css'), 'utf8')).toMatch(/\.rawtext\s*\{\s*white-space: pre-wrap/);
  });

  it('with no reports entered says so with the station', () => {
    const html = render({ ...view, metar: null, taf: null }, FIXTURE_NOW);
    expect(textOf(html)).toContain(`Station ${FIXTURE_STATION}. No METAR entered.`);
    expect(textOf(html)).toContain(`Station ${FIXTURE_STATION}. No TAF entered.`);
  });
});

describe('the shared popover', () => {
  it('is plain text in the page, hidden until opened, and is the trigger\'s accessible description', () => {
    const html = renderToStaticMarkup(
      <Tip text="Fetched automatically every 5 minutes. Not stored." tabIndex={0} aria-label="METAR, 27m, fresh" data-testid="x">
        METAR
      </Tip>,
    );
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1] ?? 'missing';
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(`<span id="${id}" role="tooltip" class="tip-pop" hidden="">Fetched automatically every 5 minutes. Not stored.</span>`);
  });

  it('escapes markup in the text instead of drawing it (SEC-2)', () => {
    const html = renderToStaticMarkup(<Tip text={'<img src=x onerror=alert(1)>'}>t</Tip>);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  describe.each(PACKS.map((p) => [p.name, p] as const))('is on every kind of trigger [%s]', (_n, ref) => {
    const rig = rigFor(ref);
    const pack = packOf(rig);
    const html = render(viewOf(pack, rig, same<Wx>(6, 'ok'), same(6, 'light')));
    it.each(['chip-metar', 'chip-taf', 'chip-vatsim', 'chip-plan', 'tile-traffic', 'tile-ceiling', 'tile-runway', 'tile-metar'])('%s is focusable with a tooltip it is described by', (testid) => {
      const tag = new RegExp(`<(?:span|div)[^>]*data-testid="${testid}"[^>]*>`).exec(html)?.[0] ?? '';
      expect(tag, testid).toContain('tabindex="0"');
      const id = /aria-describedby="([^"]+)"/.exec(tag)?.[1] ?? 'missing';
      expect(html).toContain(`id="${id}" role="tooltip"`);
    });
    it('the slim bar has the summary as its tooltip and in its name', () => {
      const summary = /<summary[^>]*aria-label="Detail: open or close\. ([^"]*)"/.exec(html)?.[1] ?? 'missing';
      expect(html).toContain(`role="tooltip" class="tip-pop" hidden="">${summary}</span>`);
    });
  });

  it('the chips say how the reports are fetched and that they are not stored', () => {
    const real = packWith(YSSY_PACK, { weatherStation: FIXTURE_STATION });
    const html = render(realView(real, YSSY_PACK), FIXTURE_NOW);
    expect(textOf(html)).toMatch(/Fetched automatically every \d+ minutes?\. Not stored\./);
  });
});

describe('the stylesheet', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../../src/v2/v2.css'), 'utf8');
  it('pins the answer band to one line while the expansion is open', () => {
    expect(css).toMatch(/\.app:has\(\.fcx\[open\]\) \.hero\s*\{[^}]*position: sticky/);
    expect(css).toMatch(/\.app:has\(\.fcx\[open\]\) \.hero \.pic,[\s\S]*?\{\s*display: none/);
  });
  it('turns the popover into a strip at the bottom of a phone, and the grid scrolls sideways with sticky mode names', () => {
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.tip-pop,[\s\S]*bottom: 8px/);
    expect(css).toMatch(/\.tlx\s*\{[^}]*overflow-x: auto/);
    expect(css).toMatch(/\.tlx \.lab\s*\{[^}]*position: sticky/);
  });
  it('has no rules left for the removed slim bar or the selector', () => {
    for (const gone of ['fc2', 'pathwrap', 'track', 'nowm', 'chgline', 'axis', 'cur']) expect(new RegExp(String.raw`\.${gone}[\s{,.:]`).test(css), gone).toBe(false);
    expect(/\.seg[\s{,.:]/.test(css)).toBe(false);
  });
});

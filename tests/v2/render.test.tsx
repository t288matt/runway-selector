// The v2 answer screen as static markup: what is drawn for each state, the tiles,
// the picture, the forecast bar, the chips and the fixed notice. (Static markup
// like tests/ui/render.test.tsx; the drawer's keyboard behaviour is checked in a
// real browser.)
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TrafficLevel } from '../../src/engine';
import { FLIGHT_SIM_NOTICE as V1_NOTICE } from '../../src/ui/components/Frame';
import { AppBody, PackError, type PackState } from '../../src/v2/App';
import { Dashboard } from '../../src/v2/components/Dashboard';
import { Drawer } from '../../src/v2/components/Drawer';
import { NO_AUTO_WEATHER, type ControllerState } from '../../src/v2/controller';
import { EMPTY_FEED, type FeedState, type ViewData } from '../../src/v2/model/dashboard';
import { FLIGHT_SIM_NOTICE } from '../../src/v2/model/notice';
import { screenModel } from '../../src/v2/model/screen';
import { createMemoryStore } from '../../src/store';
import { PACKS, readJson, toRaw, YSSY_PACK } from '../helpers/packs';
import { parsePack } from '../../src/refdata';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { packWith } from '../weather/helpers';
import { FIXTURE_NOW, FIXTURE_STATION, realView, viewOf } from './helpers';

const BANNED_WORDS = /\b(penalty|penalties|cost|costs|points?|scores?|least[- ]bad)\b/i;

function stateOf(view: ViewData, feed: FeedState = EMPTY_FEED, notices: string[] = [], displayNowMs: number = view.calcNowMs + 60_000): ControllerState {
  return { view, feed, displayNowMs, audit: [], notices, reload: { status: 'idle', message: null }, autoWeather: NO_AUTO_WEATHER };
}

function render(view: ViewData, feed: FeedState = EMPTY_FEED, notices: string[] = []): string {
  return renderToStaticMarkup(<Dashboard model={screenModel(stateOf(view, feed, notices))} pack={view.pack} onDismissNotice={() => undefined} />);
}

const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

const stateAttr = (html: string): string => /data-state="([A-Z_]+)"/.exec(html)?.[1] ?? 'missing';

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 answer screen states [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const med = same<TrafficLevel | null>(8, 'medium');
  const early: (TrafficLevel | null)[] = [...med];
  early[4] = 'busy';

  it('RECOMMENDED (id HOLD): a tick and the word, the mode with its accessible name, "No change planned", and NO current-mode selector', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light'));
    const html = render(view);
    const mode = view.result.plan.recommendedModeId ?? 'missing';
    expect(stateAttr(html)).toBe('HOLD');
    expect(textOf(html)).toContain('RECOMMENDED');
    expect(textOf(html)).not.toContain('HOLD');
    expect(html).toContain(`aria-label="Recommended mode ${mode}"`);
    expect(textOf(html)).toContain('No change planned');
    // the answer band has no selector and no "I am on" (issue 104)
    expect(html).not.toContain('I am on');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('Not set');
  });

  it('CHANGE SOON: a triangle and the words, with the engine text of the early change under the mode', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'], early);
    const html = render(view);
    expect(stateAttr(html)).toBe('CHANGE_SOON');
    expect(textOf(html)).toContain('CHANGE SOON');
    expect(html).toContain('M8 2l7 12H1z');
    expect(textOf(html)).toContain(view.result.explanation.earlyChange?.text ?? 'missing');
    expect(textOf(html)).toMatch(/Forecasting: \S+ at \d\d:\d\dZ/);
  });

  it('shows the info mark and the alternatives as chips, with no P-numbers on screen; the ranking is in the popover (issue 122)', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light'));
    const html = render(view);
    expect(html).toContain('data-testid="priority-info"');
    expect(html).toContain('Runway mode priority</b>');
    expect(html).toContain('pr-row pr-recommended');
    expect(html).not.toContain('title="Runway mode priority"');
    expect(html).not.toMatch(/>P\d+</);
    const alts = screenModel(stateOf(view)).answer.alternatives;
    expect(html.includes('data-testid="alternatives"')).toBe(alts.length > 0);
    expect(html.split('data-testid="alt-chip"').length - 1).toBe(alts.length);
    if (alts.length > 0) expect(textOf(html)).toContain('Also suitable for the next hour');
  });

  it('no suitable mode: the red label replaces the mode and no mode is named as recommended', () => {
    const view = viewOf(pack, rig, ['badBoth', 'badBoth'], same(2, 'medium'));
    const html = render(view);
    expect(stateAttr(html)).toBe('NO_SUITABLE');
    expect(html).not.toContain('aria-label="Recommended mode');
    expect(html).toContain('aria-label="No recommended mode"');
    expect(textOf(html)).not.toMatch(BANNED_WORDS);
  });

  it('no data: a grey NO DATA label with a question mark, and what is missing', () => {
    const view = viewOf(pack, rig, same<Wx>(3, 'none'));
    const html = render(view);
    expect(stateAttr(html)).toBe('NO_DATA');
    expect(textOf(html)).toContain('NO DATA');
    expect(textOf(html)).toContain('No mode is recommended because the weather for the current period is not known');
    expect(html).toContain('tone-unk');
  });

  it('draws the whole closed state in the fixed order: header-less answer, picture, tiles, Detail toggle, chips, notice', () => {
    const html = render(viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light')));
    const marks = ['class="state ', 'data-testid="picture"', 'data-testid="tile-traffic"', 'data-testid="tile-metar"', 'data-testid="forecast-bar"', 'data-testid="chip-metar"', 'role="note"'].map((m) => html.indexOf(m));
    expect(marks.every((i) => i >= 0)).toBe(true);
    expect([...marks].sort((a, b) => a - b)).toEqual(marks);
  });

  it('never uses a v1 panel name or the words penalty, cost, points or score', () => {
    const html = render(viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light')));
    expect(textOf(html)).not.toMatch(BANNED_WORDS);
    expect(html).not.toContain('Panel A');
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 tiles and picture [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('traffic tile: the headline, three bars for the next 90 minutes, the counts, and the hover rows (issue 126)', () => {
    const up = render(viewOf(pack, rig, same<Wx>(5, 'ok'), ['light', 'light', 'medium', 'busy', 'busy']));
    expect(textOf(up)).toContain('LOW');
    expect(textOf(up)).toContain('LOW → MEDIUM');
    expect(textOf(up)).toMatch(/by \d\d:\d\dZ · 0 in · 0 out/);
    expect(up.split('tl-').length - 1).toBeGreaterThanOrEqual(3);
    expect(textOf(up)).toContain('Traffic, next 90 minutes');
    const down = render(viewOf(pack, rig, same<Wx>(5, 'ok'), ['busy', 'busy', 'medium', 'light', 'light']));
    expect(textOf(down)).toContain('HIGH → MEDIUM');
    const flat = render(viewOf(pack, rig, same<Wx>(5, 'ok'), same(5, 'medium')));
    expect(textOf(flat)).toContain('Traffic · 0 in · 0 out');
    expect(textOf(flat)).not.toMatch(/MEDIUM →/);
    const none = render(viewOf(pack, rig, same<Wx>(5, 'ok'), ['medium', null, null, null, null]));
    expect(textOf(none)).not.toMatch(/MEDIUM →/);
  });

  it('the trend is also said in words, for hover and for screen readers', () => {
    const html = render(viewOf(pack, rig, same<Wx>(5, 'ok'), ['light', 'light', 'medium', 'busy', 'busy']));
    expect(html).toMatch(/aria-label="Traffic LOW, increasing to MEDIUM from \d\d:\d\dZ\./);
    expect(html).toContain('role="tooltip"');
  });

  it('traffic tile with no data says so, with a cross and the reason', () => {
    const failed: FeedState = { ...EMPTY_FEED, error: 'network down', errorAtMs: 1 };
    const html = render(viewOf(pack, rig, same<Wx>(3, 'ok')), failed);
    expect(textOf(html)).toContain('NO DATA');
    expect(textOf(html)).toContain('network down');
  });

  it('runway tile: DRY with a bar of one segment per slot', () => {
    const html = render(viewOf(pack, rig, same<Wx>(6, 'ok')));
    expect(html).toContain('data-testid="runway-word">DRY<');
    expect((html.match(/class="w-dry"/g) ?? []).length).toBe(6);
  });

  it('picture: has a text title, the wind label, and one line per runway of the pack', () => {
    const view = viewOf(pack, rig, same<Wx>(3, 'ok'));
    const html = render(view);
    expect(html).toContain('<title');
    expect(html).toContain('data-testid="wind-label"');
    expect((html.match(/stroke-width="10"/g) ?? []).length).toBeGreaterThanOrEqual(1);
    for (const r of pack.runways) expect(textOf(html)).toContain(r.name);
  });

  it('the slim forecast bar is gone; the closed screen has the Detail toggle row in its place', () => {
    const html = render(viewOf(pack, rig, ['ok', 'ok', 'badA', 'badA'], same(4, 'light')));
    expect(html).toMatch(/<summary[^>]*aria-label="Detail: open or close\. Forecast \d\d:\d\dZ to \d\d:\d\dZ\. Path: /);
    expect(textOf(html)).toMatch(/Detail \d\d:\d\dZ to \d\d:\d\dZ/);
    expect(html).not.toContain('class="fc2"');
    expect(html).not.toContain('data-testid="path-seg"');
    expect(html).not.toContain('class="track"');
    expect(html).not.toContain('class="pathwrap"');
  });
});

describe('v2 chips, notice and failure states on real reports', () => {
  const real = packWith(YSSY_PACK, { weatherStation: FIXTURE_STATION });
  const view = realView(real, YSSY_PACK, { aircraft: [], prefiles: [], fetchedAtMs: FIXTURE_NOW - 30_000, error: null, errorAtMs: null });

  it('shows METAR, TAF, VATSIM and the plan chip, each with a shape and a hover text', () => {
    const html = renderToStaticMarkup(
      <Dashboard model={screenModel(stateOf(view, { aircraft: [], prefiles: [], fetchedAtMs: FIXTURE_NOW - 30_000, error: null, errorAtMs: null }, [], FIXTURE_NOW))} pack={real} onDismissNotice={() => undefined} />,
    );
    for (const id of ['metar', 'taf', 'vatsim', 'plan']) expect(html).toContain(`data-testid="chip-${id}"`);
    expect(html).toContain('data-shape="dot"');
    expect(textOf(html)).toContain('30s');
    expect(html).not.toContain('chip-draft');
  });

  it('the fixed notice has the same wording as v1 and is always drawn', () => {
    expect(FLIGHT_SIM_NOTICE).toBe(V1_NOTICE);
    expect(render(view)).toContain(`>${FLIGHT_SIM_NOTICE}<`);
    expect(renderToStaticMarkup(<AppBody state={{ status: 'loading' }} deps={{ fetch: async () => new Response(''), now: () => 0, store: createMemoryStore() }} />)).toContain(FLIGHT_SIM_NOTICE);
  });

  it('a pack can add a further line but cannot reword or hide the notice', () => {
    const files = readJson(YSSY_PACK);
    files['airport.json'].labels = { extraNotice: 'A pack line.' };
    files['airport.json'].weatherStation = FIXTURE_STATION;
    const pack = parsePack(toRaw(files));
    const html = renderToStaticMarkup(<Dashboard model={screenModel(stateOf({ ...view, pack }))} pack={pack} onDismissNotice={() => undefined} />);
    expect(html).toContain(FLIGHT_SIM_NOTICE);
    expect(textOf(html)).toContain('A pack line.');
  });

  it('shows a store notice above the answer with a Dismiss button', () => {
    const html = render(view, EMPTY_FEED, ['The stored mode was cleared.']);
    expect(textOf(html)).toContain('The stored mode was cleared.');
    expect(html.indexOf('class="toast"')).toBeLessThan(html.indexOf('class="hero'));
    expect(html).toContain('>Dismiss<');
  });

  it('with no weather entered and no traffic, the screen still draws and says Unknown', () => {
    const empty: ViewData = { ...view, metar: null, taf: null };
    const html = render(empty);
    expect(textOf(html)).toContain('Unknown');
    expect(html).toContain('data-shape="ring"');
  });
});

describe('v2 shell states', () => {
  const deps = { fetch: async () => new Response(''), now: () => 0, store: createMemoryStore() };

  it('an invalid pack gives a full-screen alert and nothing else', () => {
    const state: PackState = { status: 'error', message: 'settings.json: a number was expected' };
    const html = renderToStaticMarkup(<AppBody state={state} deps={deps} />);
    expect(html).toContain('role="alert"');
    expect(textOf(html)).toContain('settings.json: a number was expected');
    expect(html).not.toContain('class="hero');
    expect(renderToStaticMarkup(<PackError message="x" />)).toContain('The airport data could not be loaded');
  });

  it('loading says so', () => {
    expect(textOf(renderToStaticMarkup(<AppBody state={{ status: 'loading' }} deps={deps} />))).toContain('Loading the airport pack and the VATSIM feed');
  });
});

describe('the More drawer shell', () => {
  it('is a modal dialog with a name and a Close button, and draws nothing when closed', () => {
    const ref = { current: null };
    expect(renderToStaticMarkup(<Drawer open={false} onClose={() => undefined} returnFocusTo={ref} />)).toBe('');
    const html = renderToStaticMarkup(<Drawer open onClose={() => undefined} returnFocusTo={ref} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="drawer-title"');
    expect(html).toContain('>Close<');
  });
});

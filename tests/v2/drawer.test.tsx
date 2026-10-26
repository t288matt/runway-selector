// The More drawer's contents as static markup: Why, Reports, Key and Settings, and
// the owner's decision that there is NO Data section and no per-slot arrivals,
// departures and movements figures in v2. (The paste, audit and reload behaviour is
// in drawerController.test.ts; the keyboard behaviour of the dialog is checked in a
// real browser.)
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../src/store';
import { WEATHER_CREDIT } from '../../src/weather/config';
import { Drawer } from '../../src/v2/components/Drawer';
import { DrawerContent, DRAWER_SECTIONS, type DrawerBridge } from '../../src/v2/components/DrawerContent';
import { NO_AUTO_WEATHER } from '../../src/v2/controller';
import type { ViewData } from '../../src/v2/model/dashboard';
import { evaluationModel } from '../../src/v2/model/evaluation';
import { auditRows, keyModel, REACHABLE_STATES, planBandModel, settingsModel, whyModel } from '../../src/v2/model/drawer';
import { CAUSE_WORDS } from '../../src/v2/model/status';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { PACKS, YSSY_PACK } from '../helpers/packs';
import { packWith } from '../weather/helpers';
import { FIXTURE_NOW, FIXTURE_STATION, realView, viewOf } from './helpers';

const BANNED_WORDS = /\b(penalty|penalties|cost|costs|points?|scores?|least[- ]bad)\b/i;
const textOf = (markup: string): string => markup.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

function bridgeFor(view: ViewData, extra: Partial<DrawerBridge> = {}): DrawerBridge {
  return {
    view,
    displayNowMs: view.calcNowMs,
    auto: NO_AUTO_WEATHER,
    reload: { status: 'idle', message: null },
    audit: [],
    onApplyMetar: () => ({ ok: true, message: null, warnings: [] }),
    onApplyTaf: () => ({ ok: true, message: null, warnings: [] }),
    onResume: () => undefined,
    onReload: () => undefined,
    onClearAudit: () => undefined,
    onExportAudit: () => ({ filename: 'x.json', text: '{}' }),
    ...extra,
  };
}
const render = (view: ViewData, extra: Partial<DrawerBridge> = {}): string => renderToStaticMarkup(<DrawerContent bridge={bridgeFor(view, extra)} />);

describe.each(PACKS.map((p) => [p.name, p] as const))('the drawer sections [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const view = viewOf(pack, rig, ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'], ['medium', 'medium', 'medium', 'medium', 'busy', 'medium', 'medium', 'medium']);

  it('has Why, Reports, Key and Settings in that order, each a named section with a heading, and no Data section', () => {
    const html = render(view);
    expect(DRAWER_SECTIONS.map((s) => s.title)).toEqual(['Why', 'Reports', 'Key', 'Settings']);
    const marks = ['section-why', 'section-reports', 'section-key', 'section-settings'].map((t) => html.indexOf(`data-testid="${t}"`));
    expect(marks.every((i) => i >= 0)).toBe(true);
    expect([...marks].sort((a, b) => a - b)).toEqual(marks);
    for (const s of DRAWER_SECTIONS) expect(html).toMatch(new RegExp(`<section id="${s.id}" aria-labelledby="${s.id}-title"`));
    expect(html).not.toMatch(/<h3[^>]*>\s*Data\s*<\/h3>/);
    expect(html).not.toContain('section-data');
    expect(html).toContain('aria-label="Details sections"');
  });

  it('does NOT show the per-slot arrivals, departures and movements figures (owner decision)', () => {
    const t = textOf(render(view));
    expect(t.match(/.{0,50}(Arrivals|Departures|Movements).{0,50}/)?.[0] ?? '').toBe('');
    expect(t).not.toContain('(prefiled)');
    // the same holds for the cell popovers of the Evaluation and TAF section
    const popovers = evaluationModel(view, view.calcNowMs).rows.flatMap((r) => r.cells.map((c) => c.detail)).join(' ');
    expect(popovers.match(/known demand|in the slot|capacity \d|per hour|demand unknown|arrivals only|movements/i)?.[0] ?? '').toBe('');
    expect(t).not.toContain('arrivals only');
    expect(t).not.toMatch(/Per 30 min/);
  });

  it('never uses the words penalty, cost, points or score', () => {
    expect(textOf(render(view)).match(/.{0,40}b(penalty|penalties|cost|costs|points?|scores?|least[- ]bad)b.{0,40}/i)?.[0] ?? '').toBe('');
  });

  it('Why: names the early-change advice from the engine and the reasons in plain text', () => {
    const m = whyModel(view);
    expect(m.kind).toBe('recommended');
    const html = textOf(render(view));
    for (const b of m.banners) expect(html).toContain(b.text);
    for (const l of m.lines) expect(html).toContain(l.slice(0, 40));
  });

  it('Why: with the current mode unsuitable, gives the v1 sentence under CURRENT MODE UNSUITABLE', () => {
    const v = viewOf(pack, rig, ['badA', 'badA', 'ok'], same(3, 'medium'), rig.a);
    const m = whyModel(v);
    expect(m.banners.find((b) => b.tone === 'red')?.text).toContain(`Current mode ${rig.a} is unsuitable`);
    expect(textOf(render(v))).toContain('CURRENT MODE UNSUITABLE');
  });

  it('Why: with no suitable mode, says why for each mode; with no data, says what is missing', () => {
    const none = viewOf(pack, rig, ['badBoth', 'badBoth'], same(2, 'medium'));
    expect(whyModel(none).kind).toBe('no-suitable');
    expect(whyModel(none).noSuitable?.perMode.length).toBeGreaterThan(0);
    for (const p of whyModel(none).noSuitable?.perMode ?? []) expect(textOf(render(none))).toContain(p.text.slice(0, 30));
    const nodata = viewOf(pack, rig, same<Wx>(3, 'none'));
    expect(whyModel(nodata).kind).toBe('no-data');
    for (const t of whyModel(nodata).missing) expect(textOf(render(nodata))).toContain(t.slice(0, 40));
  });

  it('Reports: the paste boxes are hidden until "Use my own weather" is pressed, and the credit line is shown', () => {
    const html = render(view);
    expect(html).toContain('>Use my own weather<');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<textarea');
    expect(textOf(html)).toContain(WEATHER_CREDIT);
    expect(textOf(html)).toContain('Reports are not stored.');
    expect(textOf(html)).toContain('No METAR entered.');
  });

  it('Reports: says a pasted report is pasted, with Resume automatic; and shows a failed fetch with the reason', () => {
    const html = render(view, {
      auto: { metar: { source: 'pasted', paused: true, error: null, warnings: [] }, taf: { source: 'automatic', paused: false, error: 'HTTP 503', warnings: ['a warning'] } },
    });
    expect(textOf(html)).toContain('Pasted by you; automatic METAR updates are paused.');
    expect(html).toContain('>Resume automatic<');
    expect(textOf(html)).toContain('HTTP 503 The previous TAF, if any, stays in use.');
    expect(textOf(html)).toContain('a warning');
    expect(html).toContain('role="alert"');
  });

  it('Key: the state words, the cell legend, the cause words and the runway picture key', () => {
    const k = keyModel();
    // only states that can appear: no current mode in v2, so no CHANGE NOW; HOLD is worded RECOMMENDED
    expect(k.states.map((s) => s.band.word)).toEqual(['RECOMMENDED', 'CHANGE SOON', 'NO SUITABLE STANDARD MODE IDENTIFIED', 'NO DATA']);
    expect(k.states.map((s) => s.band.id)).toEqual([...REACHABLE_STATES]);
    expect(textOf(render(view))).not.toContain('CHANGE NOW');
    expect(textOf(render(view))).not.toContain('HOLD');
    const t = textOf(render(view));
    for (const s of k.states) expect(t).toContain(s.band.word);
    for (const [code, word] of Object.entries(CAUSE_WORDS)) {
      expect(t).toContain(code);
      expect(t).toContain(word);
    }
    for (const l of k.legend) expect(t).toContain(l.text);
    for (const l of k.runwayKey) expect(t).toContain(l);
  });

  it('Settings: read-only values from the pack, in named groups; Reload data; the audit trail with Export and Clear', () => {
    const html = render(view);
    const t = textOf(html);
    const m = settingsModel(pack, view.calcNowMs);
    for (const label of ['Limits', 'Runway wetness', 'Traffic and timing', 'Enabled modes', 'Operating plan priorities', 'Time zone', 'Airport and data', 'Audit trail']) expect(t).toContain(label);
    for (const sec of m.sections) for (const r of sec.rows) expect(t).toContain(r.value);
    expect(t).toContain(`${pack.settings.tailwindDryKt} kt`);
    expect(t).toContain(pack.airport.timeZone);
    expect(html).toContain('>Reload data<');
    expect(html).toContain('>Export audit trail<');
    expect(html).toContain('>Clear audit trail<');
    expect(html).not.toContain('<input');
    expect(t).toContain('Simulation setting');
    expect(t).toContain('Choose the airport at the top of the screen');
  });

  it('Settings: with no changes the audit buttons are disabled and it says so; with entries it lists them newest first', () => {
    const empty = render(view);
    expect(empty).toContain('data-testid="audit-empty"');
    expect(empty).toMatch(/<button type="button" class="btn" disabled="">Export audit trail<\/button>/);
    expect(empty).toMatch(/<button type="button" class="btn" disabled="">Clear audit trail<\/button>/);
    const id = pack.modes.filter((x) => x.enabled).map((x) => x.id);
    const entries: AuditEntry[] = [
      { schemaVersion: 1, airport: pack.airport.icao, timeMs: view.calcNowMs - 3_600_000, path: 'currentMode', old: null, new: id[0] ?? 'x' },
      { schemaVersion: 1, airport: pack.airport.icao, timeMs: view.calcNowMs, path: 'currentMode', old: id[0] ?? 'x', new: id[1] ?? 'y' },
    ];
    const rows = auditRows(entries);
    expect(rows[0]).toMatchObject({ what: 'Current mode', old: `Mode ${id[0]}`, new: `Mode ${id[1]}` });
    expect(rows[1]).toMatchObject({ old: 'Not set' });
    const html = render(view, { audit: entries });
    expect(html).toContain('data-testid="audit-table"');
    expect(html).not.toMatch(/disabled="">Export audit trail/);
  });

  it('Settings: the reload states are said in words, and a refusal keeps the precise message', () => {
    expect(textOf(render(view, { reload: { status: 'refused', message: 'settings.json: bad value' } }))).toContain('Reload refused. The previous valid data stays in use. settings.json: bad value');
    expect(textOf(render(view, { reload: { status: 'unchanged', message: 'The airport data was re-read and has not changed.' } }))).toContain('has not changed');
    expect(render(view, { reload: { status: 'busy', message: null } })).toMatch(/disabled="">Reload data/);
  });

  it('the operating plan is a rank, never a penalty', () => {
    for (const b of pack.plan) {
      const m = planBandModel(pack, b);
      expect(m.groups.every((g) => g.rank >= 1)).toBe(true);
      expect(JSON.stringify(m)).not.toMatch(BANNED_WORDS);
    }
  });
});

describe('the drawer with the real reports', () => {
  const real = packWith(YSSY_PACK, { weatherStation: FIXTURE_STATION });
  const view = realView(real, YSSY_PACK);
  it('Reports shows the raw METAR and TAF in use', () => {
    const html = render({ ...view }, { displayNowMs: FIXTURE_NOW });
    expect(html).toContain(`data-testid="wx-metar-in-use">${view.metar?.raw ?? 'missing'}<`);
    expect(html).toContain(`data-testid="wx-taf-in-use">${view.taf?.raw ?? 'missing'}<`);
    expect(textOf(html)).not.toContain('No METAR entered.');
  });
});

describe('the drawer dialog', () => {
  it('is a modal dialog named More with a Close button, holding the sections, and draws nothing when closed', () => {
    const view = viewOf(packOf(rigFor(YSSY_PACK)), rigFor(YSSY_PACK), same<Wx>(3, 'ok'));
    const ref = { current: null };
    expect(renderToStaticMarkup(<Drawer open={false} onClose={() => undefined} returnFocusTo={ref} />)).toBe('');
    const html = renderToStaticMarkup(
      <Drawer open onClose={() => undefined} returnFocusTo={ref}>
        <DrawerContent bridge={bridgeFor(view)} />
      </Drawer>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="drawer-title"');
    expect(html).toContain('>Close<');
    expect(html).toContain('data-testid="section-settings"');
  });
});

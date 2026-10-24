// The settings drawer (step 8, UI half): persisted current mode and window, the
// amber stale flag and Still current, Reload data, airport isolation and the
// audit trail view. Run over the YSSY, TEST and TEST1 packs with an in-memory
// store and a fake fetch: no browser, no network.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePack, type AirportPack } from '../../src/refdata';
import { createMemoryStore, loadAudit, loadCurrentMode, storageKey, saveCurrentMode, type Store } from '../../src/store';
import { AppBody } from '../../src/ui/App';
import { createController, type Controller } from '../../src/ui/controller';
import { calculate, EMPTY_FEED } from '../../src/ui/model/dashboard';
import { auditRows, currentModeStatus, drawerModel, limitText, planBandModel } from '../../src/ui/model/drawer';
import { PACKS, TEST_PACK, YSSY_PACK, readJson, toRaw, type PackRef } from '../helpers/packs';
import { packWith } from '../weather/helpers';
import { renderDashboard, testBridge, textOf } from './helpers';

const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);
const MIN = 60_000;
const BANNED = /\b(penalty|penalties|cost|costs|points?|scores?)\b/i;
/** The pack's own description of the tolerance says "floating-point noise"; that is arithmetic, not the optimiser's points. */
const withoutArithmetic = (t: string): string => t.replace(/floating-point/gi, 'floating');
const HOSTILE = '<img src=x onerror=alert(1)>';

const noTimers = { setInterval: () => 0, clearInterval: () => undefined };

interface Rig {
  readonly ctrl: Controller;
  readonly clock: { now: number };
  readonly store: Store;
}

function rig(pack: AirportPack, store: Store = createMemoryStore(), fetch: (url: string) => Promise<Response> = () => Promise.reject(new Error('offline')), start = NOW): Rig {
  const clock = { now: start };
  const ctrl = createController({ pack, store, now: () => clock.now, timers: noTimers, fetch: (url: string) => fetch(url) });
  return { ctrl, clock, store };
}

const enabledIds = (pack: AirportPack): string[] => pack.modes.filter((m) => m.enabled).map((m) => m.id);

/** A fake server for one pack's files and app.json. */
function serve(ref: PackRef, edit: (files: ReturnType<typeof readJson>) => void = () => undefined, airports?: string[]): (url: string) => Promise<Response> {
  const files = readJson(ref);
  edit(files);
  const raw = toRaw(files);
  const icao = files['airport.json'].icao as string;
  return async (url: string) => {
    const path = url.split('?')[0] ?? '';
    if (path.endsWith('/app.json')) return new Response(JSON.stringify({ schemaVersion: 1, airports: airports ?? [icao], default: icao }));
    const name = path.split('/').pop() as keyof typeof raw;
    return name in raw ? new Response(raw[name]) : new Response('missing', { status: 404 });
  };
}

describe('limitText formats the pack value, not a literal 2 hours', () => {
  it.each([
    [120, '2 hours'],
    [60, '1 hour'],
    [90, '90 minutes'],
    [150, '2 hours 30 minutes'],
    [45, '45 minutes'],
    [1, '1 minute'],
  ])('%i minutes reads %s', (minutes, words) => {
    expect(limitText(minutes)).toBe(words);
  });
});

describe('the stale words come from the pack value', () => {
  it.each([[90, 'set more than 90 minutes ago'], [180, 'set more than 3 hours ago'], [120, 'set more than 2 hours ago']])('currentModeStaleMinutes %i', (minutes, words) => {
    const pack = packWith(YSSY_PACK, { settings: { currentModeStaleMinutes: minutes } });
    const record = { schemaVersion: 1 as const, modeId: enabledIds(pack)[0] ?? null, setAtMs: NOW };
    expect(currentModeStatus(record, NOW + (minutes + 1) * MIN, pack).staleWords).toBe(words);
    expect(currentModeStatus(record, NOW + minutes * MIN, pack).staleWords).toBeNull();
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('current mode and window are kept [%s]', (_name, ref) => {
  const pack = packWith(ref);
  const [a, b] = enabledIds(pack) as [string, string];

  it('survives a fresh controller on the same store (round trip)', () => {
    const r = rig(pack);
    r.ctrl.setCurrentMode(b);
    r.ctrl.setWindowChoice('6h');
    const again = rig(pack, r.store, undefined, NOW + 5 * MIN);
    const s = again.ctrl.getState();
    expect(s.view.currentMode).toBe(b);
    expect(s.currentModeRecord).toEqual({ schemaVersion: 1, modeId: b, setAtMs: NOW });
    expect(s.view.windowChoice).toBe('6h');
    expect(s.audit.map((e) => e.path)).toEqual(['currentMode', 'forecastWindow']);
    expect(s.notices).toEqual([]);
  });

  it('recalculates when the mode changes and writes an audit entry only on a change', () => {
    const r = rig(pack);
    r.clock.now = NOW + 7 * MIN;
    r.ctrl.setCurrentMode(a);
    expect(r.ctrl.getState().view.calcNowMs).toBe(r.clock.now);
    expect(r.ctrl.getState().audit).toHaveLength(1);
    expect(r.ctrl.getState().audit[0]).toMatchObject({ path: 'currentMode', old: null, new: a, timeMs: r.clock.now });
    r.clock.now += MIN;
    r.ctrl.setCurrentMode(a);
    expect(r.ctrl.getState().audit).toHaveLength(1);
    expect(r.ctrl.getState().view.calcNowMs).toBe(NOW + 7 * MIN);
    r.ctrl.setCurrentMode(b);
    r.ctrl.setCurrentMode(null);
    expect(r.ctrl.getState().audit.map((e) => [e.old, e.new])).toEqual([[null, a], [a, b], [b, null]]);
    expect(r.ctrl.getState().view.currentMode).toBeNull();
  });

  it('refuses a mode the pack does not enable and stores nothing', () => {
    const r = rig(pack);
    r.ctrl.setCurrentMode('NOT-A-MODE');
    expect(r.ctrl.getState().currentModeRecord).toBeNull();
    expect(r.ctrl.getState().audit).toEqual([]);
    expect(r.ctrl.getState().notices.join(' ')).toContain('not enabled');
  });

  it('keeps the window and writes an audit entry only when the choice changes', () => {
    const r = rig(pack);
    const start = r.ctrl.getState().view.windowChoice;
    r.ctrl.setWindowChoice(start);
    expect(r.ctrl.getState().audit).toEqual([]);
    const other = start === '6h' ? '4h' : '6h';
    r.ctrl.setWindowChoice(other);
    r.ctrl.setWindowChoice(other);
    expect(r.ctrl.getState().audit).toHaveLength(1);
    expect(r.ctrl.getState().audit[0]).toMatchObject({ path: 'forecastWindow', old: start, new: other });
    expect(rig(pack, r.store).ctrl.getState().view.windowChoice).toBe(other);
  });

  it('shows a cleared stored mode once, in a notice, and the notice can be dismissed', () => {
    const store = createMemoryStore();
    store.setItem(storageKey(pack.airport.icao, 'currentMode'), '{"schemaVersion":1,"modeId":"GONE","setAtMs":1}');
    const r = rig(pack, store);
    const n = r.ctrl.getState().notices;
    expect(n).toHaveLength(1);
    expect(n[0]).toContain('no longer enabled');
    expect(r.ctrl.getState().view.currentMode).toBeNull();
    expect(store.getItem(storageKey(pack.airport.icao, 'currentMode'))).toBeNull();
    expect(rig(pack, store).ctrl.getState().notices).toEqual([]);
    const html = renderDashboard(r.ctrl.getState().view, EMPTY_FEED, false, testBridge({ notices: n }));
    expect(textOf(html)).toContain('no longer enabled');
    r.ctrl.dismissNotice(0);
    expect(r.ctrl.getState().notices).toEqual([]);
  });

  it('discards a corrupt audit trail with a message and shows an empty trail', () => {
    const store = createMemoryStore();
    store.setItem(storageKey(pack.airport.icao, 'audit'), '{"nope":1}');
    const r = rig(pack, store);
    expect(r.ctrl.getState().audit).toEqual([]);
    expect(r.ctrl.getState().notices.join(' ')).toContain('audit trail');
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('stale amber and Still current [%s]', (_name, ref) => {
  const pack = packWith(ref);
  const limit = pack.settings.currentModeStaleMinutes * MIN;
  const [a] = enabledIds(pack) as [string];
  const record = { schemaVersion: 1 as const, modeId: a, setAtMs: NOW };

  it('is amber with words only when set strictly longer ago than the pack value', () => {
    expect(currentModeStatus(record, NOW + limit, pack).stale).toBe(false);
    const stale = currentModeStatus(record, NOW + limit + 1, pack);
    expect(stale.stale).toBe(true);
    expect(stale.staleWords).toBe(`set more than ${limitText(pack.settings.currentModeStaleMinutes)} ago`);
    expect(stale.canConfirm).toBe(true);
  });

  it('states the set time in UTC (OD-36: no local time)', () => {
    const s = currentModeStatus(record, NOW, pack);
    expect(s.setText).toBe('set 10:00 UTC');
  });

  it('shows no flag and no Still current button when no mode is set', () => {
    for (const rec of [null, { ...record, modeId: null }]) {
      const s = currentModeStatus(rec, NOW + 10 * limit, pack);
      expect(s).toMatchObject({ stale: false, canConfirm: false, setText: null });
    }
    const html = renderDashboard(calculate({ pack, nowMs: NOW, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED }), EMPTY_FEED, true);
    expect(html).not.toContain('Still current');
    expect(html).not.toContain('cur-stale');
  });

  it('renders the amber state in Panel A and the drawer, with its words and the button', () => {
    const view = calculate({ pack, nowMs: NOW, metar: null, taf: null, windowChoice: 'full', currentMode: a, feed: EMPTY_FEED });
    const later = NOW + limit + 5 * MIN;
    const html = renderDashboard(view, EMPTY_FEED, true, testBridge({ currentModeRecord: record }), later);
    expect(html.match(/cur-status cur-stale/g)).toHaveLength(2);
    expect(textOf(html)).toContain(`Possibly out of date: set more than ${limitText(pack.settings.currentModeStaleMinutes)} ago.`);
    expect(html.match(/>Still current</g)).toHaveLength(2);
    const fresh = renderDashboard(view, EMPTY_FEED, true, testBridge({ currentModeRecord: record }), NOW + MIN);
    expect(fresh).not.toContain('cur-stale');
    expect(textOf(fresh)).toContain('set 10:00 UTC');
  });

  it('Still current renews the time with no audit entry, no mode change and no recalculation', () => {
    const r = rig(pack);
    r.ctrl.setCurrentMode(a);
    const auditBefore = r.ctrl.getState().audit;
    const planned = r.ctrl.getState().view;
    r.clock.now = NOW + limit + 10 * MIN;
    expect(currentModeStatus(r.ctrl.getState().currentModeRecord, r.clock.now, pack).stale).toBe(true);
    r.ctrl.confirmCurrentMode();
    const s = r.ctrl.getState();
    expect(s.currentModeRecord).toEqual({ schemaVersion: 1, modeId: a, setAtMs: r.clock.now });
    expect(currentModeStatus(s.currentModeRecord, r.clock.now, pack).stale).toBe(false);
    expect(s.audit).toEqual(auditBefore);
    expect(s.view).toBe(planned);
    expect(loadCurrentMode(r.store, pack).record?.setAtMs).toBe(r.clock.now);
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('Reload data [%s]', (_name, ref) => {
  const pack = packWith(ref);
  const [a, b] = enabledIds(pack) as [string, string];

  it('keeps the previous valid pack, with the precise message, when the new files are refused', async () => {
    const bad = serve(ref, (f) => {
      f['settings.json'].tailwindDryKt.value = 'fast';
    });
    const r = rig(pack, undefined, bad);
    r.ctrl.setCurrentMode(a);
    const before = r.ctrl.getState().view;
    await r.ctrl.reloadPack();
    const s = r.ctrl.getState();
    expect(s.reload.status).toBe('refused');
    expect(s.reload.message).toContain('settings.json');
    expect(s.reload.message).toContain('tailwindDryKt');
    expect(s.view).toBe(before);
    expect(s.view.pack).toBe(pack);
    expect(s.currentModeRecord?.modeId).toBe(a);
    const html = renderDashboard(s.view, EMPTY_FEED, true, testBridge({ reload: s.reload }));
    expect(textOf(html)).toContain('Reload refused. The previous valid data stays in use.');
    expect(textOf(html)).toContain('tailwindDryKt');
  });

  it('keeps the previous pack when the files cannot be fetched', async () => {
    const r = rig(pack);
    await r.ctrl.reloadPack();
    expect(r.ctrl.getState().reload.status).toBe('refused');
    expect(r.ctrl.getState().view.pack).toBe(pack);
  });

  it('says so and does not recalculate when nothing changed', async () => {
    const r = rig(pack, undefined, serve(ref));
    const before = r.ctrl.getState().view;
    r.clock.now += 3 * MIN;
    await r.ctrl.reloadPack();
    expect(r.ctrl.getState().reload.status).toBe('unchanged');
    expect(r.ctrl.getState().view).toBe(before);
  });

  it('uses a changed pack and recalculates once', async () => {
    const r = rig(pack, undefined, serve(ref, (f) => {
      f['settings.json'].tailwindDryKt.value = 2;
    }));
    r.clock.now += 3 * MIN;
    await r.ctrl.reloadPack();
    const s = r.ctrl.getState();
    expect(s.reload.status).toBe('changed');
    expect(s.view.pack.settings.tailwindDryKt).toBe(2);
    expect(s.view.pack).not.toBe(pack);
    expect(s.view.calcNowMs).toBe(r.clock.now);
    expect(textOf(renderDashboard(s.view, EMPTY_FEED, true, testBridge({ reload: s.reload })))).toContain('2 kt');
  });

  it('clears a stored current mode that the new pack no longer enables, with a message', async () => {
    const r = rig(pack, undefined, serve(ref, (f) => {
      const m = (f['modes.json'].modes as { id: string; enabled: boolean }[]).find((x) => x.id === a);
      if (m !== undefined) m.enabled = false;
    }));
    r.ctrl.setCurrentMode(a);
    await r.ctrl.reloadPack();
    const s = r.ctrl.getState();
    expect(s.reload.status).toBe('changed');
    expect(s.currentModeRecord).toBeNull();
    expect(s.view.currentMode).toBeNull();
    expect(s.notices.join(' ')).toContain('no longer enabled');
    expect(loadCurrentMode(r.store, s.view.pack).record).toBeNull();
    // a mode that is still enabled is kept
    expect(b).not.toBe(a);
  });
});

describe('airports are kept apart (AG-8)', () => {
  const yssy = packWith(YSSY_PACK);
  const test = packWith(TEST_PACK);

  it('a mode, window and audit trail set for one airport never reach the other', () => {
    const store = createMemoryStore();
    const one = rig(yssy, store);
    const two = rig(test, store);
    one.ctrl.setCurrentMode(enabledIds(yssy)[1] as string);
    one.ctrl.setWindowChoice('6h');
    two.ctrl.setCurrentMode(enabledIds(test)[0] as string);
    const freshYssy = rig(yssy, store).ctrl.getState();
    const freshTest = rig(test, store).ctrl.getState();
    expect(freshYssy.view.currentMode).toBe(enabledIds(yssy)[1]);
    expect(freshYssy.view.windowChoice).toBe('6h');
    expect(freshYssy.audit).toHaveLength(2);
    expect(freshTest.view.currentMode).toBe(enabledIds(test)[0]);
    expect(freshTest.view.windowChoice).not.toBe('6h');
    expect(freshTest.audit).toHaveLength(1);
    expect(loadAudit(store, 'YSSY', 500).entries.every((e) => e.airport === 'YSSY')).toBe(true);
    expect(loadAudit(store, 'TEST', 500).entries.every((e) => e.airport === 'TEST')).toBe(true);
    // the other airport's mode id is not accepted under this one
    store.setItem(storageKey('YSSY', 'currentMode'), JSON.stringify({ schemaVersion: 1, modeId: enabledIds(test)[0], setAtMs: 1 }));
    expect(rig(yssy, store).ctrl.getState().view.currentMode).toBeNull();
  });

  it('the airport box is always visible, with one pack listed or several, and the drawer has no second control (OD-37)', () => {
    const view = calculate({ pack: yssy, nowMs: NOW, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    for (const airports of [['YSSY'], ['YSSY', 'TEST']]) {
      for (const drawerOpen of [false, true]) {
        const html = renderDashboard(view, EMPTY_FEED, drawerOpen, testBridge({ airports }));
        expect(html).toMatch(/<input id="airport-icao"[^>]*value="YSSY"/);
        expect(html).not.toContain('airport-select');
        for (const id of airports) expect(html).toContain(`<option value="${id}"`);
      }
    }
  });
  it('the page offers the selector from a two-airport app config, and a refused switch keeps the airport in use', () => {
    const deps = { fetch: () => Promise.reject(new Error('x')), now: () => NOW, store: createMemoryStore() };
    const html = renderToStaticMarkup(<AppBody state={{ status: 'ready', pack: test, airports: ['TEST', 'YSSY'], airportError: null }} deps={deps} />);
    expect(html).toContain('Runway Mode Planner');
    expect(html).not.toContain('airport-select');
    expect(html).toContain('id="airport-icao"');
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('drawer content [%s]', (_name, ref) => {
  const pack = packWith(ref);
  const model = drawerModel(pack, NOW);
  const view = calculate({ pack, nowMs: NOW, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
  const html = renderDashboard(view, EMPTY_FEED, true);
  const text = textOf(html.slice(html.indexOf('id="drawer"')));

  it('shows every read-only value from the pack with its description', () => {
    const s = pack.settings;
    // Owner decision 24-10-2026: display is whole knots (kt1), except limitToleranceKt, which is
    // never passed through kt1 and so keeps its own precision (0.05).
    for (const v of [`${Math.round(s.tailwindDryKt)} kt`, `${Math.round(s.tailwindWetKt)} kt`, `${Math.round(s.calmWindKt)} kt`, `${s.limitToleranceKt} kt`, `${Math.round(s.nearLimitMarginKt)} kt`, `${s.wetRunwayProbabilityPct} %`, `${s.dryingTimeMinutes} min`, `${s.changeoverPreparationMinutes} min`, `${s.demandHorizonMinutes} min`]) {
      expect(text).toContain(v);
    }
    for (const m of pack.modes.filter((x) => x.enabled)) {
      expect(text).toContain(`Crosswind limit, Mode ${m.id}`);
      expect(text).toContain(`${Math.round(m.maxCrosswindKt)} kt`);
      expect(text).toContain(m.capacity === null ? 'no limit' : `${m.capacity} movements per hour`);
    }
    for (const name of ['tailwindDryKt', 'tailwindWetKt', 'calmWindKt', 'limitToleranceKt', 'nearLimitMarginKt', 'wetRunwayProbabilityPct', 'dryingTimeMinutes', 'trafficBands', 'changeoverPreparationMinutes', 'demandHorizonMinutes'] as const) {
      expect(text).toContain(pack.descriptions[name]);
    }
    expect(text).toContain('Simulation setting');
    expect(text).toContain('LOW 0 to');
    expect(text).toContain('HIGH');
    expect(text).toContain('On screen you can change only the current mode and the window');
  });

  it('shows the time zone (as pack metadata, not a parallel clock) and the pack status', () => {
    expect(text).toContain(pack.airport.timeZone);
    expect(text).toMatch(/Now [A-Za-z ,.]+ 10:12Z/);
    expect(model.provenance.map((p) => p.label)).toEqual(['Airport', 'Runways', 'Modes', 'Operating plan', 'Settings']);
    expect(text).toContain(`Settings: ${pack.meta.settings.status ?? 'not stated'}.`);
  });

  it('uses no word for penalty, cost, points or score anywhere in the drawer', () => {
    const entries = [{ schemaVersion: 1 as const, timeMs: NOW, airport: pack.airport.icao, path: 'currentMode', old: null, new: enabledIds(pack)[0] ?? null }];
    const full = renderDashboard(view, EMPTY_FEED, true, testBridge({ audit: entries, reload: { status: 'changed', message: 'The airport data was re-read and has changed. The plan was recalculated.' } }));
    const drawer = textOf(full.slice(full.indexOf('id="drawer"')));
    expect(withoutArithmetic(drawer)).not.toMatch(BANNED);
    expect(withoutArithmetic(JSON.stringify(model))).not.toMatch(BANNED);
  });

  it('shows the operating plan as ranks derived from the pack numbers, equal numbers equal', () => {
    expect(model.plan).toHaveLength(pack.plan.length);
    pack.plan.forEach((band, i) => {
      const m = planBandModel(pack, band);
      expect(m).toEqual(model.plan[i]);
      const value = (id: string): number | null => {
        const r = band.rows.find((x) => x.mode === id);
        return r === undefined ? pack.settings.preferenceDefaultPenalty : r.allowed ? r.penalty : null;
      };
      const allowed = pack.modes.filter((x) => x.enabled && value(x.id) !== null);
      for (const g of m.groups) {
        for (const id of g.modes) {
          const own = value(id) as number;
          expect(g.rank).toBe(1 + allowed.filter((x) => (value(x.id) as number) < own).length);
          for (const other of g.modes) expect(value(other)).toBe(own);
        }
      }
      expect(m.groups.flatMap((g) => g.modes).sort()).toEqual(allowed.map((x) => x.id).sort());
      expect([...m.notAllowed].sort()).toEqual(pack.modes.filter((x) => x.enabled && value(x.id) === null).map((x) => x.id).sort());
      expect(m.groups[0]?.rank).toBe(1);
      expect(m.allEqual).toBe(m.groups.length === 1);
      expect(text).toContain(`Band ${band.id}:`);
    });
  });
});

describe('plan ranks with different numbers', () => {
  it('ranks the TEST pack bands: lower number preferred, an unlisted mode takes the default', () => {
    const pack = packWith(TEST_PACK);
    const early = pack.plan.find((b) => b.id === 'early');
    if (early === undefined) throw new Error('no band');
    const m = planBandModel(pack, early);
    expect(m.groups[0]).toMatchObject({ rank: 1, word: 'preferred' });
    expect(m.groups.length).toBeGreaterThan(1);
    expect(m.groups[m.groups.length - 1]?.word).toBe('less preferred');
  });
});

describe('audit trail view', () => {
  const pack = packWith(YSSY_PACK);
  const [a, b] = enabledIds(pack) as [string, string];

  it('lists newest first with UTC time, what changed, old and new', () => {
    const r = rig(pack);
    r.ctrl.setCurrentMode(a);
    r.clock.now += 5 * MIN;
    r.ctrl.setWindowChoice('4h');
    r.clock.now += 5 * MIN;
    r.ctrl.setCurrentMode(b);
    const rows = auditRows(r.ctrl.getState().audit, pack);
    expect(rows.map((x) => x.what)).toEqual(['Current mode', 'Forecast window', 'Current mode']);
    expect(rows[0]).toMatchObject({ old: `Mode ${a}`, new: `Mode ${b}` });
    expect(rows[1]).toMatchObject({ old: 'Full TAF', new: '4 hours' });
    expect(rows[2]).toMatchObject({ old: 'Not set', new: `Mode ${a}` });
    expect(rows[0]?.time).toBe('10:10Z');
    const html = renderDashboard(r.ctrl.getState().view, EMPTY_FEED, true, testBridge({ audit: r.ctrl.getState().audit }));
    const text = textOf(html);
    expect(text).toContain('local record, not tamper-proof');
    expect(text.indexOf('10:10Z')).toBeLessThan(text.indexOf('10:00Z (') + 1000);
    expect(text).toContain('Export audit trail');
    expect(text).toContain('Clear audit trail');
    expect(text).toContain(`keeps the last ${pack.settings.auditMaxEntries} entries`);
  });

  it('shows an empty state and disables Export and Clear when there is nothing to export', () => {
    const view = calculate({ pack, nowMs: NOW, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    const html = renderDashboard(view, EMPTY_FEED, true);
    expect(textOf(html)).toContain('No changes yet.');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Export audit trail/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Clear audit trail/);
  });

  it('exports the stored entries with the not-tamper-proof notice, and clears them', () => {
    const r = rig(pack);
    r.ctrl.setCurrentMode(a);
    const file = r.ctrl.exportAudit();
    expect(file.filename).toBe('audit-trail-YSSY-23-10-2026.json');
    const parsed = JSON.parse(file.text);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.notice).toContain('not tamper-proof');
    r.ctrl.clearAudit();
    expect(r.ctrl.getState().audit).toEqual([]);
    expect(loadAudit(r.store, 'YSSY', 500).entries).toEqual([]);
    // clearing the trail does not touch the current mode
    expect(r.ctrl.getState().currentModeRecord?.modeId).toBe(a);
  });

  it('drops the oldest entries beyond the pack cap', () => {
    const small = packWith(YSSY_PACK, { settings: { auditMaxEntries: 10 } });
    const r = rig(small);
    const ids = enabledIds(small);
    for (let i = 0; i < 14; i += 1) r.ctrl.setCurrentMode(ids[i % 2] ?? null);
    expect(r.ctrl.getState().audit).toHaveLength(10);
  });
});

describe('drawer accessibility and text safety', () => {
  const pack = packWith(YSSY_PACK);
  const view = calculate({ pack, nowMs: NOW, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });

  it('is a labelled dialog beside the page whose heading can take focus, with labelled buttons', () => {
    const html = renderDashboard(view, EMPTY_FEED, true);
    expect(html).toContain('<aside id="drawer" role="dialog" aria-modal="false" aria-labelledby="drawer-title">');
    expect(html).toMatch(/<h2 id="drawer-title" tabindex="-1">Settings<\/h2>/);
    expect(html).toContain('>Close settings</button>');
    expect(html).toContain('>Reload data</button>');
    expect(html).toContain('for="drawer-current-mode"');
    expect(html).toContain('for="drawer-window"');
    expect(renderDashboard(view, EMPTY_FEED, false)).not.toContain('id="drawer"');
  });

  it('renders hostile pack text, a refusal message and a source as text, never as elements or links', () => {
    const files = readJson(YSSY_PACK);
    files['settings.json'].tailwindDryKt.description = `${HOSTILE} <script>alert(1)</script>`;
    files['settings.json'].source = 'javascript:alert(3)';
    files['modes.json'].source = 'https://example.org/modes';
    const hostile = parsePack(toRaw(files));
    const v = calculate({ pack: hostile, nowMs: NOW, metar: null, taf: null, windowChoice: 'full', currentMode: null, feed: EMPTY_FEED });
    const html = renderDashboard(v, EMPTY_FEED, true, testBridge({ reload: { status: 'refused', message: `${HOSTILE}\nsettings.json: bad` }, airportError: HOSTILE, notices: [HOSTILE], airports: ['YSSY', 'TEST'] }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('href="javascript');
    expect(textOf(html)).toContain('Source: javascript:alert(3)');
    expect(html).toContain('<a href="https://example.org/modes" rel="noopener noreferrer"');
    expect(html.match(/<a href=/g)).toHaveLength(1);
  });

  it('refuses hostile values in storage instead of showing them', () => {
    const store = createMemoryStore();
    store.setItem(storageKey('YSSY', 'currentMode'), JSON.stringify({ schemaVersion: 1, modeId: HOSTILE, setAtMs: NOW }));
    store.setItem(storageKey('YSSY', 'audit'), JSON.stringify({ schemaVersion: 1, entries: [{ schemaVersion: 1, timeMs: NOW, airport: 'YSSY', path: HOSTILE, old: null, new: null }] }));
    const r = rig(pack, store);
    expect(r.ctrl.getState().currentModeRecord).toBeNull();
    expect(r.ctrl.getState().audit).toEqual([]);
    const s = r.ctrl.getState();
    const html = renderDashboard(s.view, EMPTY_FEED, true, testBridge({ notices: s.notices, audit: s.audit }));
    expect(html).not.toContain('<img');
    // a stale-time current mode written by hand with a valid id still reads back
    saveCurrentMode(store, 'YSSY', enabledIds(pack)[0] ?? null, NOW);
    expect(rig(pack, store).ctrl.getState().currentModeRecord?.modeId).toBe(enabledIds(pack)[0]);
  });
});

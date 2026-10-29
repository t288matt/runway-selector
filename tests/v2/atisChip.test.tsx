// The real-world runway mode chip (issue 159): the model, the markup, the style rules agreed with the owner,
// and the controller's polling. Fake clock, timers and network (tests/v2/rig.ts). Each test names the rule
// it fails without.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ATIS_NOT_SET_UP_CODE, ATIS_POLL_MARGIN_MS, ATIS_STALE_MINUTES } from '../../src/atis/config';
import { fetchAtis } from '../../src/atis/fetchAtis';
import { Dashboard } from '../../src/v2/components/Dashboard';
import { NO_AUTO_WEATHER, type AtisReading, type ControllerState } from '../../src/v2/controller';
import { atisChip } from '../../src/v2/model/atis';
import { EMPTY_FEED } from '../../src/v2/model/dashboard';
import { screenModel } from '../../src/v2/model/screen';
import { TEST_PACK, YSSY_PACK, loadPackFrom } from '../helpers/packs';
import { packWith } from '../weather/helpers';
import { realView } from './helpers';
import { rig } from './rig';

const here = import.meta.dirname;
const sample = (name: string): string => readFileSync(join(here, '..', 'atis', 'fixtures', name), 'utf8');
const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);

const syd = loadPackFrom(YSSY_PACK);
const reading = (text: string, ageMin = 5): AtisReading => ({ text, fetchedAtMs: NOW - ageMin * MIN });

describe('atisChip (the model)', () => {
  it('unmatched runways are shown raw: "RW: 34L arr, 16R dep"', () => {
    expect(atisChip(reading(sample('real-sydney.txt')), syd, NOW)).toEqual({ text: 'RW: 34L arr, 16R dep', label: 'Real-world runway mode now: 34L arr, 16R dep', matched: false });
  });
  it('matched runways show the mode id', () => {
    const test = loadPackFrom(TEST_PACK);
    expect(atisChip(reading(sample('synthetic-test.txt')), test, NOW)).toEqual({ text: 'RW: TST_SPLIT', label: 'Real-world runway mode now: TST_SPLIT', matched: true });
  });
  it('no reading, or text that does not parse, hides the chip', () => {
    expect(atisChip(null, syd, NOW)).toBeNull();
    expect(atisChip(reading('ATIS XXXX A 010000\n  nothing useful'), syd, NOW)).toBeNull();
  });
  it('a reading older than 90 minutes is hidden, never shown as current (stale-hide rule)', () => {
    expect(ATIS_STALE_MINUTES).toBe(90);
    expect(atisChip(reading(sample('real-sydney.txt'), 90), syd, NOW)).not.toBeNull();
    expect(atisChip(reading(sample('real-sydney.txt'), 91), syd, NOW)).toBeNull();
  });
});

describe('the chip on the answer card', () => {
  const view = realView(syd, YSSY_PACK);
  const html = (atis: AtisReading | null): string => {
    const state: ControllerState = { view, feed: EMPTY_FEED, displayNowMs: NOW, audit: [], notices: [], reload: { status: 'idle', message: null }, autoWeather: NO_AUTO_WEATHER, atis };
    return renderToStaticMarkup(<Dashboard model={screenModel(state)} pack={view.pack} onDismissNotice={() => undefined} detailOpen={false} onToggleDetail={() => undefined} />);
  };
  it('shows as text, with an accessible name, after the Also suitable chips, and is focusable', () => {
    const out = html(reading(sample('real-sydney.txt')));
    expect(out).toMatch(/<div class="atis-chip" role="group" tabindex="0" aria-label="Real-world runway mode now: 34L arr, 16R dep" data-testid="atis-chip" data-matched="false"><i class="atis-dot" aria-hidden="true"><\/i>RW: 34L arr, 16R dep<\/div>/);
    const alt = out.indexOf('data-testid="alternatives"');
    expect(alt).toBeGreaterThanOrEqual(0);
    expect(out.indexOf(`data-testid="atis-chip"`)).toBeGreaterThan(alt);
  });
  it('is absent when there is no reading, the text does not parse, or the reading is stale', () => {
    expect(html(null)).not.toContain('atis-chip');
    expect(html(reading('garbage'))).not.toContain('atis-chip');
    expect(html(reading(sample('real-sydney.txt'), 120))).not.toContain('atis-chip');
  });
  it('carries no banned words and no markup from the ATIS text (text nodes only, SEC-2)', () => {
    const out = html(reading('ATIS YSSY A 010000\n  RWY: 34L FOR ARRS. RWY 16R FOR DEPS <b>x</b>'));
    expect(out).not.toContain('<b>x</b>');
    expect(out).not.toMatch(/\b(penalty|penalties|cost|score)\b/i);
  });
});

describe('the agreed style (no border, blue 8px dot, white text, dot aligned 10px in)', () => {
  const css = readFileSync(join(here, '..', '..', 'src', 'v2', 'v2.css'), 'utf8').replace(/\r/g, '');
  const rule = (sel: string): string => new RegExp(`\\n${sel.replace('.', '\\.')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  it('the chip has no border, no divider and always-white text, and its dot lines up with the Also suitable dots', () => {
    const chip = rule('.atis-chip');
    expect(chip).not.toMatch(/border/);
    expect(chip).toMatch(/color: #fff;/);
    expect(chip).toMatch(/padding: 4px 0 4px 10px;/);
    // the Also suitable chip: 1px border + 9px padding = 10px to its dot
    expect(rule('.alt-chip')).toMatch(/border: 1px solid/);
    expect(rule('.alt-chip')).toMatch(/padding: 4px 9px;/);
  });
  it('PHONE: at 640px and below the chip sits beside the Also suitable label and takes no row (the closed screen must not grow at 375 x 812)', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    const rule375 = /\n  \.alt \.atis-chip \{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(rule375).toMatch(/position: absolute;/);
    expect(rule375).toMatch(/margin: 0;/);
    // outside the group that is named "Also suitable"
    const html = renderToStaticMarkup(<Dashboard model={screenModel({ view: realView(syd, YSSY_PACK), feed: EMPTY_FEED, displayNowMs: NOW, audit: [], notices: [], reload: { status: 'idle', message: null }, autoWeather: NO_AUTO_WEATHER, atis: reading(sample('real-sydney.txt')) })} pack={syd} onDismissNotice={() => undefined} detailOpen={false} onToggleDetail={() => undefined} />);
    const group = /<div role="group" aria-label="Also suitable"[\s\S]*?<\/div><\/div>/.exec(html)?.[0] ?? '';
    expect(group).not.toContain('atis-chip');
    expect(html).toContain('class="atis-chip"');
  });
  it('the dot is 8px and the accent blue', () => {
    const dot = rule('.atis-dot');
    expect(dot).toMatch(/width: 8px;/);
    expect(dot).toMatch(/height: 8px;/);
    expect(dot).toMatch(/background: var\(--accent\);/);
  });
});

const pack = packWith(YSSY_PACK, { weatherStation: 'ZZZZ' });
const EARLY = Date.UTC(2026, 9, 23, 14, 5, 0);
const ATIS_MS = pack.settings.atisPollMinutes * MIN + ATIS_POLL_MARGIN_MS;
const answer = (r: ReturnType<typeof rig>): string => JSON.stringify({ atis: sample('real-sydney.txt'), fetchedAt: r.clock.now });

describe('the controller polls the local route', () => {
  it('asks at start and then every atisPollMinutes (30), no sooner (client floor)', async () => {
    const r = rig(pack, EARLY);
    r.atis.body = answer(r);
    r.ctrl.start();
    await r.advance(0);
    expect(r.atis.urls).toEqual([`./api/atis/${pack.airport.icao}`]);
    await r.advance(ATIS_MS - 1000);
    expect(r.atis.urls).toHaveLength(1);
    await r.advance(1000);
    expect(r.atis.urls).toHaveLength(2);
    r.ctrl.stop();
  });
  it('a good answer is held in the state and nothing else about the plan changes', async () => {
    const plain = rig(pack, EARLY);
    plain.ctrl.start();
    await plain.advance(0);
    plain.ctrl.stop();
    const r = rig(pack, EARLY);
    r.atis.body = answer(r);
    r.ctrl.start();
    await r.advance(0);
    expect(r.ctrl.getState().atis).toEqual({ text: sample('real-sydney.txt'), fetchedAtMs: EARLY });
    // the same view as a run with no ATIS route at all
    expect(JSON.stringify(r.ctrl.getState().view)).toBe(JSON.stringify(plain.ctrl.getState().view));
    r.ctrl.stop();
  });
  it('a failure keeps the last good reading, and the chip hides it once it is over 90 minutes old', async () => {
    const r = rig(pack, EARLY);
    r.atis.body = answer(r);
    r.ctrl.start();
    await r.advance(0);
    r.atis.body = null;
    await r.advance(ATIS_MS);
    expect(r.ctrl.getState().atis?.fetchedAtMs).toBe(EARLY);
    expect(atisChip(r.ctrl.getState().atis, pack, r.clock.now)).not.toBeNull();
    await r.advance(ATIS_MS * 2 + MIN);
    expect(atisChip(r.ctrl.getState().atis, pack, r.clock.now)).toBeNull();
    r.ctrl.stop();
  });
  it('with no route (a static build), the state stays empty and nothing is drawn', async () => {
    const r = rig(pack, EARLY);
    r.ctrl.start();
    await r.advance(0);
    expect(r.ctrl.getState().atis).toBeNull();
    r.ctrl.stop();
  });
});

describe('the page stops asking when the server will never answer, and keeps asking after other failures', () => {
  const NOT_SET_UP = JSON.stringify({ error: 'The real-world ATIS is not set up on this server.', code: ATIS_NOT_SET_UP_CODE });
  async function pollsAfter(setup: (r: ReturnType<typeof rig>) => void): Promise<{ first: number; later: number; timers: number }> {
    const r = rig(pack, EARLY);
    setup(r);
    r.ctrl.start();
    await r.advance(0);
    const first = r.atis.urls.length;
    const timersAfterFirst = r.timerCount();
    await r.advance(ATIS_MS * 3);
    r.ctrl.stop();
    return { first, later: r.atis.urls.length - first, timers: timersAfterFirst };
  }
  it('a 404 (a static host) stops polling for the session: one request, the ATIS timer is gone', async () => {
    const out = await pollsAfter((r) => {
      r.atis.body = 'not found';
      r.atis.status = 404;
    });
    expect(out).toEqual({ first: 1, later: 0, timers: 3 });
  });
  it('the "not set up" 503 stops polling for the session', async () => {
    const out = await pollsAfter((r) => {
      r.atis.body = NOT_SET_UP;
      r.atis.status = 503;
    });
    expect(out).toEqual({ first: 1, later: 0, timers: 3 });
  });
  it('any other 503, a 500 and a network error keep polling at the normal cadence', async () => {
    for (const setup of [
      (r: ReturnType<typeof rig>) => { r.atis.body = '{"error":"x"}'; r.atis.status = 503; },
      (r: ReturnType<typeof rig>) => { r.atis.body = 'boom'; r.atis.status = 500; },
      (r: ReturnType<typeof rig>) => { r.atis.throws = true; },
    ]) {
      const out = await pollsAfter(setup);
      expect(out.first).toBe(1);
      expect(out.later).toBe(3);
      expect(out.timers).toBe(4);
    }
  });
});

describe('fetchAtis refuses bad answers', () => {
  const ask = (res: () => Response | Promise<Response>) => fetchAtis('ZZZA', { fetch: async () => res() });
  it('HTTP errors, non-JSON, wrong shapes, empty text and oversize', async () => {
    expect((await ask(() => new Response('x', { status: 404 }))).ok).toBe(false);
    expect((await ask(() => new Response('<html>'))).ok).toBe(false);
    expect((await ask(() => new Response('[]'))).ok).toBe(false);
    expect((await ask(() => new Response('{"atis":1,"fetchedAt":1}'))).ok).toBe(false);
    expect((await ask(() => new Response('{"atis":"  ","fetchedAt":1}'))).ok).toBe(false);
    expect((await ask(() => new Response('{"atis":"a","fetchedAt":"1"}'))).ok).toBe(false);
    expect((await ask(() => new Response(`{"atis":"${'a'.repeat(20_000)}","fetchedAt":1}`))).ok).toBe(false);
    expect(await ask(() => new Response('{"atis":"a","fetchedAt":5}'))).toEqual({ ok: true, atis: 'a', fetchedAtMs: 5 });
  });
  it('a network error is a failure, not a throw', async () => {
    expect((await fetchAtis('ZZZA', { fetch: () => Promise.reject(new Error('down')) })).ok).toBe(false);
  });
});


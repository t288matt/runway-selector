// The summary screen. There is no DOM in this test setup, so the screen is checked as
// static markup (SummaryView), the routing rules as plain functions, and the
// StrictMode start/stop/start sequence against createSummary with the same
// subscribe/getState calls useSyncExternalStore makes.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePack } from '../../src/refdata';
import { createMemoryStore } from '../../src/store';
import { hasGroups, switchAirportTo, type PackState } from '../../src/v2/App';
import { Header } from '../../src/v2/components/Header';
import { summaryAirports, SummaryView } from '../../src/v2/components/SummaryScreen';
import { createController } from '../../src/v2/controller';
import { summaryCard } from '../../src/v2/model/summaryCard';
import { buildRoute, buildSummaryRoute, parseRoute } from '../../src/v2/route';
import { createSummary, type SummaryEntry } from '../../src/v2/summary';
import { loadPackFrom, readJson, TEST_PACK, toRaw, YSSY_PACK } from '../helpers/packs';
import { fixture, nowOf } from '../weather/helpers';

const NOW = nowOf(fixture('metar-yssy-auto-nodata'));
const pack = loadPackFrom(YSSY_PACK);

/** A real ready entry built from a real pack, with no weather (so it is a noReport card). */
function readyEntry(icao = 'YSSY'): Extract<SummaryEntry, { status: 'ready' }> {
  const c = createController({
    pack,
    fetch: async () => new Response('down', { status: 503 }),
    now: () => NOW,
    store: createMemoryStore(),
    timers: { setInterval: () => 0, clearInterval: () => undefined },
  });
  const card = summaryCard(c.getState());
  return { icao, status: 'ready', card: { ...card, icao } };
}

const groups = [
  { name: 'Group One', airports: ['AAAA', 'BBBB', 'CCCC'] },
  { name: 'Group Two', airports: ['DDDD'] },
];
const text = (m: string): string => m.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('SummaryView', () => {
  const entries: SummaryEntry[] = [readyEntry('AAAA'), { icao: 'BBBB', status: 'error', message: 'pack broke' }, { icao: 'CCCC', status: 'loading' }, readyEntry('DDDD')];
  const html = renderToStaticMarkup(<SummaryView groups={groups} entries={entries} />);

  it('renders one card per group airport in order, under each group name, in an accessibly named section', () => {
    expect(html).toContain('aria-label="All airports"');
    expect(html.indexOf('Group One')).toBeLessThan(html.indexOf('AAAA'));
    expect(html.indexOf('Group Two')).toBeGreaterThan(html.indexOf('CCCC'));
    const hrefs = [...html.matchAll(/class="scard[^"]*" href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['#/AAAA', '#/BBBB', '#/CCCC', '#/DDDD']);
  });

  it('each card links to #/ICAO and has an accessible name', () => {
    for (const icao of ['AAAA', 'BBBB', 'CCCC', 'DDDD']) {
      expect(html).toContain(`href="${buildRoute(icao, false)}"`);
      expect(html).toMatch(new RegExp(`aria-label="${icao}, `));
    }
    expect(html).toMatch(/aria-label="AAAA, mode /);
  });

  it('a noReport card shows "no report", a grey-border class, its mode label and a title, and no wind', () => {
    const e = readyEntry();
    expect(e.card.noReport).toBe(true);
    expect(e.card.windLabel).toBeNull();
    const one = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['YSSY'] }]} entries={[e]} />);
    expect(one).toContain('scard-noreport');
    expect(text(one)).toContain('no report');
    expect(one).toContain('title="');
    expect(text(one)).toContain(e.card.modeLabel);
  });

  it('a card with a report shows the wind and the A and D runways', () => {
    const e = readyEntry();
    const withWind = { ...e, card: { ...e.card, noReport: false, windLabel: '120 at 10 kt', arrivals: '16L', departures: '16R' } };
    const one = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['YSSY'] }]} entries={[withWind]} />);
    expect(text(one)).toContain('A 16L');
    expect(text(one)).toContain('D 16R');
    expect(text(one)).toContain('120 at 10 kt');
    expect(one).not.toContain('scard-noreport');
  });

  it('an error card does not hide the other cards, shows "unavailable" and the message as its title', () => {
    expect(text(html)).toContain('unavailable');
    expect(html).toContain('title="pack broke"');
    expect(text(html)).toContain('loading');
    expect((html.match(/class="scard[ "]/g) ?? []).length).toBe(4);
    expect(html).toContain('<svg');
  });

  it('shows no status chips or legend', () => {
    expect(html).not.toMatch(/chip|legend/i);
  });
});

describe('summaryAirports', () => {
  it('lists each airport once in group order', () => {
    expect(summaryAirports([{ name: 'a', airports: ['X', 'Y'] }, { name: 'b', airports: ['Y', 'Z'] }])).toEqual(['X', 'Y', 'Z']);
  });
});

describe('the header link', () => {
  const props = { icao: 'YSSY', airports: ['YSSY'], pending: null, airportError: null, onSwitch: () => undefined, now: () => NOW, moreOpen: false, onMore: () => undefined, moreRef: { current: null } };
  it('shows "All airports" to #/summary when given a summaryHref, and not otherwise (no groups)', () => {
    expect(renderToStaticMarkup(<Header {...props} summaryHref={buildSummaryRoute()} />)).toContain('href="#/summary"');
    expect(renderToStaticMarkup(<Header {...props} />)).not.toContain('All airports');
  });
  it('hasGroups is false without groups, or with only empty ones', () => {
    expect(hasGroups(undefined)).toBe(false);
    expect(hasGroups([])).toBe(false);
    expect(hasGroups([{ name: 'x', airports: [] }])).toBe(false);
    expect(hasGroups([{ name: 'x', airports: ['A'] }])).toBe(true);
  });
});

describe('routes the summary and the cards use', () => {
  it('#/summary is the summary and a card href is that airport, not the summary', () => {
    expect(parseRoute(buildSummaryRoute()).summary).toBe(true);
    const r = parseRoute(buildRoute('YSSY', false));
    expect(r.summary).toBe(false);
    expect(r.icao).toBe('YSSY');
  });
});

describe('switching airports keeps the groups', () => {
  const yssy = parsePack(toRaw(readJson(YSSY_PACK)));
  const files = toRaw(readJson(TEST_PACK));
  const grp = [{ name: 'G', airports: ['YSSY', 'TEST'] }];
  const fetch = async (url: string) => {
    const path = url.split('?')[0] ?? '';
    if (path.endsWith('/app.json')) return new Response(JSON.stringify({ schemaVersion: 1, airports: ['YSSY', 'TEST'], default: 'YSSY', groups: grp }));
    const name = path.split('/').pop() as keyof typeof files;
    return name in files ? new Response(files[name]) : new Response('missing', { status: 404 });
  };
  it('carries the groups from app.json with the new pack', async () => {
    const base: Extract<PackState, { status: 'ready' }> = { status: 'ready', pack: yssy, airports: ['YSSY', 'TEST'], airportError: null };
    const change = await switchAirportTo(base, 'TEST', { fetch, now: () => NOW, store: createMemoryStore() });
    expect(change?.groups).toEqual(grp);
  });
});

describe('under StrictMode (start, stop, start; React then subscribes)', () => {
  it('ends up with cards, and no timer left after the final stop', async () => {
    const live = new Set<number>();
    let next = 1;
    const timers = {
      setInterval: () => {
        live.add(next);
        return next++;
      },
      clearInterval: (h: unknown) => void live.delete(h as number),
    };
    const raw = toRaw(readJson(YSSY_PACK));
    const fetch = async (url: string) => {
      if (url.startsWith('https://')) return new Response('down', { status: 503 });
      if ((url.split('?')[0] ?? '').endsWith('/app.json')) return new Response(JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'YSSY' }));
      const name = (url.split('?')[0] ?? '').split('/').pop() as keyof typeof raw;
      return name in raw ? new Response(raw[name]) : new Response('missing', { status: 404 });
    };
    const summary = createSummary({ airports: ['YSSY'], fetch, now: () => NOW, store: createMemoryStore(), timers });
    let notified = 0;
    const off = summary.subscribe(() => (notified += 1));
    summary.start();
    summary.stop();
    summary.start();
    for (let i = 0; i < 400 && summary.getState()[0]?.status === 'loading'; i += 1) await new Promise((r) => setTimeout(r, 0));
    expect(summary.getState()[0]?.status).toBe('ready');
    expect(notified).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['YSSY'] }]} entries={summary.getState()} />);
    expect(html).not.toContain('scard-wait');
    summary.stop();
    off();
    expect(live.size).toBe(0);
  });
});

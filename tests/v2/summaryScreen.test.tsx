// The summary screen. There is no DOM in this test setup, so the screen is checked as
// static markup (SummaryView), the routing rules as plain functions, and the
// StrictMode start/stop/start sequence against createSummary with the same
// subscribe/getState calls useSyncExternalStore makes.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parsePack } from '../../src/refdata';
import { createMemoryStore } from '../../src/store';
import { hasGroups, switchAirportTo, type PackState } from '../../src/v2/App';
import { Header } from '../../src/v2/components/Header';
import { summaryAirports, SummarySwitch, SummaryView } from '../../src/v2/components/SummaryScreen';
import { createController } from '../../src/v2/controller';
import { summaryCard } from '../../src/v2/model/summaryCard';
import { buildRoute, buildSummary2Route, buildSummaryRoute, parseRoute } from '../../src/v2/route';
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

  it('a card with a report shows the runway rows with their roles and the wind', () => {
    const e = readyEntry();
    const withWind = { ...e, card: { ...e.card, noReport: false, windLabel: '120 at 10 kt', runways: [{ role: 'ARR', text: '34L/R' }, { role: 'DEP', text: '25' }] } };
    const one = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['YSSY'] }]} entries={[withWind]} />);
    expect(one).toContain('<span class="scard-rwy-text">34L/R</span>');
    expect(one).toContain('<span class="scard-rwy-role">ARR</span>');
    expect(one).toContain('<span class="scard-rwy-text">25</span>');
    expect(one).toContain('<span class="scard-rwy-role">DEP</span>');
    expect(text(one)).not.toMatch(/A 34|D 25/);
    expect(text(one)).toContain('120 at 10 kt');
    expect(one).not.toContain('scard-noreport');
  });

  it('a shared row shows "ARR and DEP"; the mode id and mode wording are not visible but stay in the accessible name and title', () => {
    const e = readyEntry();
    const withMode = { ...e, card: { ...e.card, noReport: false, modeLabel: 'Recommended mode 16AD', windLabel: '120 at 10 kt', runways: [{ role: 'ARR and DEP', text: '16L/R' }] } };
    const one = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['YSSY'] }]} entries={[withMode]} />);
    expect(one).toContain('<span class="scard-rwy-text">16L/R</span>');
    expect(one).toContain('<span class="scard-rwy-role">ARR and DEP</span>');
    expect(text(one)).not.toContain('16AD');
    expect(text(one)).not.toContain('Recommended mode');
    expect(one).not.toContain('scard-mode');
    expect(one).toContain('aria-label="YSSY, mode Recommended mode 16AD, arrivals 16L/R, departures 16L/R, 120 at 10 kt"');
    expect(one).toContain('title="Recommended mode 16AD');
  });

  it('the accessible name separates arrivals and departures when they differ', () => {
    const e = readyEntry();
    const c = { ...e, card: { ...e.card, noReport: false, modeLabel: 'Recommended mode 34AD', windLabel: '030° 9 kt', runways: [{ role: 'ARR', text: '34L/R' }, { role: 'DEP', text: '25' }] } };
    const one = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['YSSY'] }]} entries={[c]} />);
    expect(one).toContain('aria-label="YSSY, mode Recommended mode 34AD, arrivals 34L/R, departures 25, 030° 9 kt"');
  });

  it('with no mode the label shows in the small style and there are no runway rows', () => {
    const e = readyEntry();
    const none = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['YSSY'] }]} entries={[{ ...e, card: { ...e.card, modeLabel: 'No recommended mode', runways: [] } }]} />);
    expect(none).toContain('<span class="scard-nomode">No recommended mode</span>');
    expect(none).not.toContain('scard-rwy');
  });

  it('two groups with the same name do not collide on the React key', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderToStaticMarkup(<SummaryView groups={[{ name: 'Same', airports: ['AAAA'] }, { name: 'Same', airports: ['BBBB'] }]} entries={entries} />);
    expect(spy.mock.calls.filter((c) => String(c[0]).includes('same key'))).toEqual([]);
    spy.mockRestore();
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

describe('SummaryView, large size', () => {
  const e = readyEntry('AAAA');
  const withWind = { ...e, card: { ...e.card, name: 'Alpha Airport', noReport: false, modeLabel: 'Recommended mode 34AD', windLabel: '030° 9 kt', reason: null, runways: [{ role: 'ARR', text: '34L/R' }, { role: 'DEP', text: '25' }] } };
  const entries: SummaryEntry[] = [withWind, { ...readyEntry('BBBB') }, { icao: 'CCCC', status: 'error', message: 'pack broke' }, { icao: 'DDDD', status: 'loading' }];
  const gs = [{ name: 'G', airports: ['AAAA', 'BBBB', 'CCCC', 'DDDD'] }];
  const html = renderToStaticMarkup(<SummaryView groups={gs} entries={entries} size="large" />);
  const compact = renderToStaticMarkup(<SummaryView groups={gs} entries={entries} />);

  it('marks the section, grid and every card as large; the compact view has no large class', () => {
    expect(html).toContain('aria-label="All airports"');
    expect(html).toContain('summary-large');
    expect((html.match(/class="scard[^"]*scard-large/g) ?? []).length).toBe(4);
    expect(compact).not.toContain('scard-large');
    expect(compact).not.toContain('summary-large');
  });

  it('shows the code and name, the picture with its text left in, the runway rows with roles, and the wind', () => {
    const one = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['AAAA'] }]} entries={[withWind]} size="large" />);
    expect(one).toContain('<span class="scard-code">AAAA</span>');
    expect(one).toContain('<span class="scard-name">Alpha Airport</span>');
    expect(one).toContain('<svg');
    expect(one).toContain('<span class="scard-rwy-text">34L/R</span>');
    expect(one).toContain('<span class="scard-rwy-role">ARR</span>');
    expect(one).toContain('<span class="scard-rwy-text">25</span>');
    expect(one).toContain('<span class="scard-rwy-role">DEP</span>');
    expect(one).toContain('<span class="scard-wind">030° 9 kt</span>');
    expect(text(one)).not.toContain('34AD');
    expect(one).not.toMatch(/chip|legend/i);
  });

  it('keeps the compact accessible name and title', () => {
    const one = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['AAAA'] }]} entries={[withWind]} size="large" />);
    const base = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['AAAA'] }]} entries={[withWind]} />);
    expect(one).toContain('aria-label="AAAA, mode Recommended mode 34AD, arrivals 34L/R, departures 25, 030° 9 kt"');
    expect(one).toContain('title="Recommended mode 34AD"');
    expect(/aria-label="[^"]*"/.exec(one)?.[0]).toBe(/aria-label="[^"]*"/.exec(base)?.[0]);
  });

  it('a no-report box keeps the grey border class and says "no report"', () => {
    const one = renderToStaticMarkup(<SummaryView groups={[{ name: 'G', airports: ['BBBB'] }]} entries={[readyEntry('BBBB')]} size="large" />);
    expect(one).toContain('scard-noreport');
    expect(text(one)).toContain('no report');
  });

  it('loading and error boxes are large too, with the same wording and title', () => {
    expect(html).toMatch(/class="scard scard-wait scard-large" href="#\/DDDD" aria-label="DDDD, loading"/);
    expect(html).toMatch(/class="scard scard-wait scard-large" href="#\/CCCC" title="pack broke" aria-label="CCCC, unavailable"/);
  });

  it('each box links to #/ICAO', () => {
    const hrefs = [...html.matchAll(/class="scard[^"]*" href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['#/AAAA', '#/BBBB', '#/CCCC', '#/DDDD']);
  });
});

describe('SummarySwitch', () => {
  it('marks the current size with aria-current and not as a link, the other is a link to its hash', () => {
    const compact = renderToStaticMarkup(<SummarySwitch size="compact" />);
    expect(compact).toMatch(/<span[^>]*aria-current="page"[^>]*>Compact<\/span>/);
    expect(compact).toContain(`<a href="${buildSummary2Route()}">Large</a>`);
    expect(compact).not.toContain('<a href="#/summary">');
    const large = renderToStaticMarkup(<SummarySwitch size="large" />);
    expect(large).toMatch(/<span[^>]*aria-current="page"[^>]*>Large<\/span>/);
    expect(large).toContain(`<a href="${buildSummaryRoute()}">Compact</a>`);
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
  it('shows "Summary 2" to #/summary2 as well when given a summary2Href, and neither without groups', () => {
    const both = renderToStaticMarkup(<Header {...props} summaryHref={buildSummaryRoute()} summary2Href={buildSummary2Route()} />);
    expect(both).toContain('href="#/summary"');
    expect(both).toContain('href="#/summary2"');
    expect(both).toContain('Summary 2');
    expect(both).toContain('class="summary-link summary2-link"');
    const none = renderToStaticMarkup(<Header {...props} />);
    expect(none).not.toContain('Summary 2');
    expect(none).not.toContain('#/summary2');
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
    expect(parseRoute(buildSummary2Route())).toMatchObject({ summary: true, large: true });
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

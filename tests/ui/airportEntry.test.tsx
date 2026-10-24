// The always-visible airport pull-down (amends OD-37, owner 24-10-2026): what it shows, and what choosing an
// option does. Only airports with a reviewed pack are offered, so there is nothing to type or validate.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/store';
import { switchAirportTo, type PackState } from '../../src/ui/App';
import { AirportEntry, Header } from '../../src/ui/components/Frame';
import { NO_AUTO_REPORT, type AutoReportState } from '../../src/ui/controller';
import { WeatherEntry } from '../../src/ui/components/WeatherEntry';
import { TEST_PACK, YSSY_PACK, readJson, toRaw, type PackRef } from '../helpers/packs';
import { fixture, packWith } from '../weather/helpers';

const NOW = Date.UTC(2026, 9, 24, 3, 0, 0);
const yssy = packWith(YSSY_PACK);
const noop = (): void => undefined;

describe('the airport pull-down on screen', () => {
  const html = (props: Partial<Parameters<typeof AirportEntry>[0]> = {}): string =>
    renderToStaticMarkup(<AirportEntry icao="YSSY" airports={['YSSY']} error={null} onSwitch={noop} {...props} />);

  it('offers only the listed packs, with the current airport selected, and no Switch button', () => {
    const one = html();
    expect(one).toMatch(/<select id="airport-icao"[^>]*>/);
    expect(one).toContain('<option value="YSSY"');
    expect(one).not.toContain('>Switch<');
    const two = html({ airports: ['YSSY', 'TEST'] });
    expect(two).toContain('<option value="TEST"');
  });

  it('shows a refusal as plain text, marking the box invalid', () => {
    const shown = html({ error: 'No data pack for EGLL yet.' });
    expect(shown).toContain('No data pack for EGLL yet.');
    expect(shown).toContain('aria-invalid="true"');
    expect(html()).toContain('aria-invalid="false"');
    const hostile = html({ error: '<img src=x onerror=alert(1)>' });
    expect(hostile).not.toContain('<img');
  });

  it('while the chosen airport loads, shows the choice as selected, locks the box and says it is loading', () => {
    const loading = html({ icao: 'TEST', airports: ['YSSY', 'TEST'], loading: true });
    expect(loading).toMatch(/<option value="TEST" selected/);
    expect(loading).toMatch(/<select id="airport-icao"[^>]* disabled/);
    // Out of the flow, under the pull-down (the airport-note position), so Refresh and Settings do not move; an old refusal is hidden meanwhile.
    expect(loading).toMatch(/class="tag airport-note airport-loading"[^>]*>Loading TEST/);
    expect(html({ icao: 'TEST', airports: ['YSSY', 'TEST'], loading: true, error: 'No data pack for EGLL yet.' })).not.toContain('EGLL');
    const idle = html({ airports: ['YSSY', 'TEST'] });
    expect(idle).not.toMatch(/<select id="airport-icao"[^>]* disabled/);
    expect(idle).not.toContain('Loading');
  });

  it('is part of the header whenever the page has an airport, and absent from the loading header', () => {
    const header = renderToStaticMarkup(<Header liveTag="x" onRefresh={noop} onSettings={noop} busy={false} airport={{ icao: 'YSSY', airports: ['YSSY'], error: null, onSwitch: noop }} />);
    expect(header).toContain('id="airport-icao"');
    expect(renderToStaticMarkup(<Header liveTag="x" onRefresh={noop} onSettings={noop} busy={false} />)).not.toContain('airport-icao');
  });
});

/** A fake server for one pack's files, answering for whichever airport folder is asked for. */
function serve(ref: PackRef, airports: string[]): (url: string) => Promise<Response> {
  const files = readJson(ref);
  const raw = toRaw(files);
  const icao = files['airport.json'].icao as string;
  return async (url: string) => {
    const path = url.split('?')[0] ?? '';
    if (path.endsWith('/app.json')) return new Response(JSON.stringify({ schemaVersion: 1, airports, default: icao }));
    const name = path.split('/').pop() as keyof typeof raw;
    return name in raw ? new Response(raw[name]) : new Response('missing', { status: 404 });
  };
}

describe('switchAirportTo (typing a code)', () => {
  const current: Extract<PackState, { status: 'ready' }> = { status: 'ready', pack: yssy, airports: ['YSSY', 'TEST'], airportError: null };
  const deps = { fetch: serve(TEST_PACK, ['YSSY', 'TEST']), now: () => NOW, store: createMemoryStore() };

  it('switches to a listed airport and clears any earlier refusal', async () => {
    const change = await switchAirportTo({ ...current, airportError: 'No data pack for ABCD yet.' }, 'TEST', deps);
    expect(change).not.toBeNull();
    expect(change?.pack?.airport.icao).toBe('TEST');
    expect(change?.airportError).toBeNull();
    expect(change?.airports).toEqual(['YSSY', 'TEST']);
  });

  it.each(['EGLL', 'KJFK', 'ABC', 'ZZZZZZZZ'])('says there is no pack for %s and changes nothing else', async (icao) => {
    const asked: string[] = [];
    const watching = { ...deps, fetch: (url: string) => (asked.push(url), deps.fetch(url)) };
    const change = await switchAirportTo(current, icao, watching);
    expect(change).toEqual({ airportError: `No data pack for ${icao} yet. Available: YSSY, TEST.` });
    // nothing was fetched for an unlisted airport: no pack, no runway or mode data is looked for
    expect(asked).toEqual([]);
  });

  it('keeps the airport in use, with the reason, when a listed pack fails its checks', async () => {
    const broken = { ...deps, fetch: serve(TEST_PACK, ['YSSY', 'TEST', 'BAD1']) };
    const change = await switchAirportTo({ ...current, airports: ['YSSY', 'TEST', 'BAD1'] }, 'BAD1', broken);
    expect(change?.pack).toBeUndefined();
    expect(change?.airportError).toContain('the current one stays in use');
  });

  it('does nothing for the airport already shown', async () => {
    expect(await switchAirportTo(current, 'YSSY', deps)).toBeNull();
    expect(await switchAirportTo({ ...current, airportError: 'No data pack for EGLL yet.' }, 'YSSY', deps)).toEqual({ airportError: null });
  });
});

describe('the weather boxes with automatic fetching (OD-37)', () => {
  const metar = fixture('metar-yssy-auto-nodata');
  const pack = packWith(YSSY_PACK, { weatherStation: metar.station });
  const render = (metarAuto: AutoReportState, tafAuto: AutoReportState = NO_AUTO_REPORT): string =>
    renderToStaticMarkup(
      <WeatherEntry pack={pack} metar={null} taf={null} onApplyMetar={() => ({ ok: true, message: null, warnings: [] })} onApplyTaf={() => ({ ok: true, message: null, warnings: [] })} auto={{ metar: metarAuto, taf: tafAuto }} onResumeAutomatic={noop} />,
    );

  it('hides the paste boxes and Apply until asked for', () => {
    const html = render(NO_AUTO_REPORT);
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('>Apply<');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Use my own weather');
  });

  it('names the station and the interval, and carries the credit NOAA/NWS and Datamask Aviation ask for', () => {
    const html = render(NO_AUTO_REPORT);
    expect(html).toContain(`fetched automatically every ${pack.settings.weatherPollMinutes} minutes`);
    expect(html).toContain('NOAA/NWS');
    expect(html).toContain('Datamask Aviation');
  });

  it('says where a report came from, and offers Resume automatic only after a paste', () => {
    expect(render({ ...NO_AUTO_REPORT, source: 'automatic', fillText: 'x', fillSeq: 1 })).not.toContain('Fetched automatically');
    const pasted = render({ ...NO_AUTO_REPORT, source: 'pasted', paused: true });
    expect(pasted).toContain('automatic METAR updates are paused');
    expect(pasted).toContain('Resume automatic');
    expect(render(NO_AUTO_REPORT)).not.toContain('Resume automatic');
  });

  it('shows why a fetch failed as plain text and says the previous report stays', () => {
    const html = render({ ...NO_AUTO_REPORT, error: 'The METAR could not be fetched: HTTP 503 <img src=x>' });
    expect(html).toContain('HTTP 503');
    expect(html).toContain('stays in use');
    expect(html).not.toContain('<img');
  });
});

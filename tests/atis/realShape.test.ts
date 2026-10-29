// The real NAIPS response shape (captured by the owner 29-10-2026; the account name is replaced with TESTUSER). The hand-made
// fixtures used one space between the ATIS letter and the time; the real text has three, and the indents differ by airport.
// These cases feed the middleware a full SOAP answer built from that structure, then parse and chip the extracted block.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractAtisBlock } from '../../scripts/atisMiddleware';
import { createAtisService } from '../../scripts/atisMiddleware';
import { matchMode, rawRunwayText } from '../../src/atis/matchMode';
import { parseAtisRunways } from '../../src/atis/parseAtis';
import { atisChip } from '../../src/v2/model/atis';
import { YSSY_PACK, loadPackFrom, type PackRef } from '../helpers/packs';

const REAL = (icao: string): PackRef => ({ name: icao, dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', icao) });

const SYDNEY = [
  '1353 UTC 29/10/26             AIRSERVICES AUSTRALIA',
  '                                LOCATION BRIEFING',
  '',
  '',
  'PREPARED FOR: TESTUSER',
  'VALID FROM 1353 UTC OCT 29, 2026 TO 1353 UTC OCT 30, 2026',
  '',
  '                               WEATHER INFORMATION',
  '                               -------------------',
  '',
  'SYDNEY (YSSY)',
  '    TAF YSSY 291112Z 2912/3018',
  '    12008KT 9999 BKN030',
  '    FM291300 33003KT 9999 BKN025',
  '    RMK',
  '    T 18 17 15 18 Q 1025 1024 1024 1025',
  '    TAF3 ',
  '',
  '    METAR YSSY 291330Z AUTO 12005KT 9999 // OVC042 19/12 Q1025 RMK',
  '    RF00.0/000.0',
  '',
  '    ATIS YSSY K   291327',
  '      APCH: EXP INSTR APCH',
  '      RWY: 34L FOR ARRS. RWY 16R FOR DEPS',
  '      OPR INFO: CURFEW RWY NOMINATION.',
  '                CURFEW IN OPERATION UNTIL TIME 1900.',
  '                REDUCED RWY LEN IN OPERATION.',
  '                RWY 34L THR NML, SEE NOTAM C3245.',
  '                LAST AVBL EXIT TWY B8',
  '    + WIND: 080/6.',
  '            MAX TW 2 RUNWAY 34L',
  '      VIS: GT 10KM',
  '      CLD: BKN035',
  '      TMP: 18',
  '      QNH: 1025',
  '',
].join('\n');

const MELBOURNE = [
  'MELBOURNE (YMML)',
  '    METAR YMML 291330Z 15010KT 9999 FEW040 20/10 Q1015',
  '',
  '    ATIS YMML W   291333',
  '       APCH: EXP ILS',
  '       RWY: 16 FOR ARR. RWY 27 FOR DEP.',
  '    + VIS: GT 10KM',
  '       QNH: 1015',
  '',
  'NEXT SECTION',
].join('\n');

const PERTH = [
  'PERTH (YPPH)',
  '    ATIS YPPH N   291223',
  '       APCH: EXP ILS',
  '       RWY: 21 AND 24 FOR ARR. RWY 21 FOR DEP.',
  '    + OPR INFO: ',
  '       QNH: 1012',
  '',
].join('\n');

const soap = (content: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>' +
  `<loc-brief-rsp xmlns="http://www.airservicesaustralia.com/naips/xsd" status="SUCCESS"><content>${content}</content></loc-brief-rsp></soapenv:Body></soapenv:Envelope>`;

const NOW = Date.UTC(2026, 9, 29, 13, 55, 0);

async function viaMiddleware(icao: string, content: string) {
  const service = createAtisService({
    getCredentials: () => ({ username: 'testuser', password: 'x' }),
    fetch: async () => new Response(soap(content)),
    now: () => NOW,
    isKnownAirport: () => true,
  });
  return service('GET', icao);
}

describe('real-shape NAIPS answers', () => {
  it('Sydney: the three-space header is found, the block ends at the blank line, runways 34L / 16R, no mode matches', async () => {
    const out = await viaMiddleware('YSSY', SYDNEY);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    const lines = out.body.atis.split('\n');
    expect(lines[0]).toBe('ATIS YSSY K   291327');
    expect(lines).toContain('RWY: 34L FOR ARRS. RWY 16R FOR DEPS');
    expect(lines).toContain('+ WIND: 080/6.');
    expect(lines.at(-1)).toBe('QNH: 1025');
    expect(out.body.atis).not.toContain('METAR');
    const pack = loadPackFrom(YSSY_PACK);
    const parsed = parseAtisRunways(out.body.atis, pack.atisWording);
    expect(parsed).toEqual({ arrivals: ['34L'], departures: ['16R'] });
    expect(matchMode(parsed!, pack.modes)).toBeNull();
    expect(rawRunwayText(parsed!)).toBe('34L arr, 16R dep');
    expect(atisChip({ text: out.body.atis, fetchedAtMs: out.body.fetchedAt }, pack, NOW)?.text).toBe('RW: 34L arr, 16R dep');
  });
  it('Melbourne (7-space indent, a "+ VIS:" line): 16A27D', async () => {
    const out = await viaMiddleware('YMML', MELBOURNE);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    const pack = loadPackFrom(REAL('YMML'));
    expect(out.body.atis.split('\n')[0]).toBe('ATIS YMML W   291333');
    expect(out.body.atis).not.toContain('NEXT SECTION');
    expect(atisChip({ text: out.body.atis, fetchedAtMs: out.body.fetchedAt }, pack, NOW)?.text).toBe('RW: 16A27D');
  });
  it('Perth (a "+ OPR INFO: " line with nothing after it): 24A21AD', async () => {
    const out = await viaMiddleware('YPPH', PERTH);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    const pack = loadPackFrom(REAL('YPPH'));
    expect(atisChip({ text: out.body.atis, fetchedAtMs: out.body.fetchedAt }, pack, NOW)?.text).toBe('RW: 24A21AD');
  });
  it('MULTI-SPACE header tolerance: one, three and many spaces all find the block', () => {
    for (const gap of [' ', '   ', '        ']) {
      expect(extractAtisBlock(`    ATIS YSSY K${gap}291327\n      RWY: 34L FOR ARRS. RWY 16R FOR DEPS\n`, 'YSSY')).toBe('ATIS YSSY K' + gap + '291327\nRWY: 34L FOR ARRS. RWY 16R FOR DEPS');
    }
  });
  it('runs of spaces inside the RWY entry do not break the parser', () => {
    const w = loadPackFrom(YSSY_PACK).atisWording;
    expect(parseAtisRunways('ATIS YSSY K   291327\nRWY:   34L  FOR   ARRS.   RWY  16R FOR   DEPS', w)).toEqual({ arrivals: ['34L'], departures: ['16R'] });
  });
});

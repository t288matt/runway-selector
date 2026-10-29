// The real-world ATIS parser and mode matcher (issue 159). The three real samples are the owner's
// (29-10-2026). The TEST pack carries invented wording and an invented ATIS so the parser is shown
// not to be tuned to any real airport. Each test names the rule it fails without.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchMode, rawRunwayText } from '../../src/atis/matchMode';
import { parseAtisRunways, type AtisParseWords } from '../../src/atis/parseAtis';
import type { AirportPack } from '../../src/refdata';
import { TEST_PACK, YSSY_PACK, loadPackFrom, type PackRef } from '../helpers/packs';

const REAL = (icao: string): PackRef => ({ name: icao, dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', icao) });
const sample = (name: string): string => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

const WORDS: AtisParseWords = { rwyWord: 'RWY', forWord: 'FOR', arrWord: 'ARR', depWord: 'DEPS', andWord: 'AND' };

describe('parseAtisRunways: the real samples', () => {
  it('Sydney: ARRS and DEPS (the pack says ARR; a trailing S on either word is the same word)', () => {
    const p = loadPackFrom(YSSY_PACK);
    expect(parseAtisRunways(sample('real-sydney.txt'), p.atisWording)).toEqual({ arrivals: ['34L'], departures: ['16R'] });
  });
  it('Melbourne: ARR and DEP (the pack says DEPS)', () => {
    expect(parseAtisRunways(sample('real-melbourne.txt'), loadPackFrom(REAL('YMML')).atisWording)).toEqual({ arrivals: ['16'], departures: ['27'] });
  });
  it('Perth: two arrival runways', () => {
    expect(parseAtisRunways(sample('real-perth.txt'), loadPackFrom(REAL('YPPH')).atisWording)).toEqual({ arrivals: ['21', '24'], departures: ['21'] });
  });
  it('"16L AND R FOR ARRS AND DEPS": both runways for both, "AND R" is the same number', () => {
    expect(parseAtisRunways('ATIS XXXX A 010000\n  RWY: 16L AND R FOR ARRS AND DEPS\n', WORDS)).toEqual({ arrivals: ['16L', '16R'], departures: ['16L', '16R'] });
  });
});

describe('parseAtisRunways: the wording comes from the pack, not the code', () => {
  const test = loadPackFrom(TEST_PACK);
  it('an invented airport with invented words (STRIP, TO, LANDING, TAKEOFF, PLUS) parses', () => {
    expect(parseAtisRunways(sample('synthetic-test.txt'), test.atisWording)).toEqual({ arrivals: ['18'], departures: ['9', '18'] });
  });
  it('the real Sydney words do not parse the invented text, and the invented words do not parse Sydney text', () => {
    expect(parseAtisRunways(sample('synthetic-test.txt'), loadPackFrom(YSSY_PACK).atisWording)).toBeNull();
    expect(parseAtisRunways(sample('real-sydney.txt'), test.atisWording)).toBeNull();
  });
  it('a shared role clause with the invented "and" word', () => {
    expect(parseAtisRunways('STRIP: 9 TO LANDING PLUS TAKEOFF', test.atisWording)).toEqual({ arrivals: ['9'], departures: ['9'] });
  });
});

describe('parseAtisRunways: refuses rather than guesses', () => {
  const bad = [
    '',
    'no runway line here',
    'RWY:',
    'RWY: 34L',
    'RWY: 34L FOR ARRS',
    'RWY: 34L FOR DEPS',
    'RWY: 34L FOR ARRS. RWY 16R FOR TAXI',
    'RWY: 34X FOR ARRS. RWY 16R FOR DEPS',
    'RWY: 134L FOR ARRS. RWY 16R FOR DEPS',
    'RWY: R FOR ARRS. RWY 16R FOR DEPS',
    'RWY: 34L FOR FOR ARRS. RWY 16R FOR DEPS',
    'RWY: 34L FOR ARRS AND DEPS AND ARRS. RWY 16R FOR DEPS',
    'RWY: 1. RWY 2. RWY 3. RWY 4. RWY 5 FOR ARRS',
  ];
  it.each(bad)('null for %j', (text) => {
    expect(parseAtisRunways(text, WORDS)).toBeNull();
  });
  it('null for an oversize text', () => {
    expect(parseAtisRunways(`RWY: 34L FOR ARRS. RWY 16R FOR DEPS${' '.repeat(9000)}`, WORDS)).toBeNull();
  });
  it('random junk never throws and returns null or well-formed runways', () => {
    const alphabet = ['RWY', 'RWY:', 'FOR', 'ARR', 'ARRS', 'DEPS', 'AND', '.', ',', ':', '34L', '16', 'R', 'L', '\n', ' ', '(', '[', '*', '\\', '??'];
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed;
    };
    for (let i = 0; i < 3000; i += 1) {
      const n = next() % 14;
      const text = Array.from({ length: n }, () => alphabet[next() % alphabet.length]).join(next() % 2 === 0 ? ' ' : '');
      const r = parseAtisRunways(text, WORDS);
      if (r !== null) {
        expect(r.arrivals.length).toBeGreaterThan(0);
        expect(r.departures.length).toBeGreaterThan(0);
        for (const rw of [...r.arrivals, ...r.departures]) expect(rw).toMatch(/^\d{1,2}[LCR]?$/);
      }
    }
  });
  it('wording with regular-expression characters does not break the parser', () => {
    const odd: AtisParseWords = { rwyWord: 'R(W)Y', forWord: 'F.R', arrWord: 'A+RR', depWord: 'D*EP', andWord: 'A|ND' };
    expect(() => parseAtisRunways('R(W)Y: 34L F.R A+RR. 16R F.R D*EP', odd)).not.toThrow();
    expect(parseAtisRunways('R(W)Y: 34L F.R A+RR. 16R F.R D*EP', odd)).toBeNull();
  });
});

describe('parseAtisRunways: an entry that wraps onto continuation lines', () => {
  const wording = loadPackFrom(YSSY_PACK).atisWording;
  it('joins the continuation lines before parsing (wrap rule)', () => {
    expect(parseAtisRunways(sample('real-wrapped.txt'), wording)).toEqual({ arrivals: ['34L'], departures: ['16R'] });
  });
  it('LONGEST-FIRST: a wrapped second clause is not lost (16L for both, then 16R on the next line)', () => {
    expect(parseAtisRunways('ATIS XXXX A 010000\n  RWY: 16L FOR ARRS AND DEPS.\n  RWY 16R FOR DEPS\n  WIND: 340/10', wording)).toEqual({ arrivals: ['16L'], departures: ['16L', '16R'] });
  });
  it('real single-line samples followed by field lines are unchanged: a longer candidate that swallows a field fails, the shorter is used (not null)', () => {
    for (const field of ['OPR INFO: ILS 34L CAT 1', 'APCH: EXP ILS RWY 34L', 'WIND: 340/10']) {
      expect(parseAtisRunways(`ATIS XXXX A 010000\n  RWY: 34L FOR ARRS. RWY 16R FOR DEPS\n  ${field}\n  ${field}`, wording)).toEqual({ arrivals: ['34L'], departures: ['16R'] });
    }
    expect(parseAtisRunways(sample('real-sydney.txt'), wording)).toEqual({ arrivals: ['34L'], departures: ['16R'] });
  });
  it('if the joined text does not fit, it is null', () => {
    expect(parseAtisRunways('ATIS XXXX A 010000\n  RWY: 34L FOR ARRS.\n  WIND: 340/10', wording)).toBeNull();
    expect(parseAtisRunways('ATIS XXXX A 010000\n  RWY: 34L FOR ARRS.\n\n  RWY 16R FOR DEPS', wording)).toBeNull();
  });
});

describe('matchMode', () => {
  const pack = (icao: string): AirportPack => loadPackFrom(REAL(icao));
  it('Melbourne sample matches 16A27D', () => {
    const p = pack('YMML');
    expect(matchMode(parseAtisRunways(sample('real-melbourne.txt'), p.atisWording)!, p.modes)).toBe('16A27D');
  });
  it('Perth sample matches 24A21AD, whatever the order of the runways', () => {
    const p = pack('YPPH');
    expect(matchMode(parseAtisRunways(sample('real-perth.txt'), p.atisWording)!, p.modes)).toBe('24A21AD');
    expect(matchMode({ arrivals: ['21', '24'], departures: ['21'] }, p.modes)).toBe('24A21AD');
  });
  it('Sydney sample is a non-standard combination: no match, the raw text is shown', () => {
    const p = loadPackFrom(YSSY_PACK);
    const parsed = parseAtisRunways(sample('real-sydney.txt'), p.atisWording)!;
    expect(matchMode(parsed, p.modes)).toBeNull();
    expect(rawRunwayText(parsed)).toBe('34L arr, 16R dep');
  });
  it('the invented airport matches its split mode', () => {
    const p = loadPackFrom(TEST_PACK);
    expect(matchMode(parseAtisRunways(sample('synthetic-test.txt'), p.atisWording)!, p.modes)).toBe('TST_SPLIT');
  });
  it('a disabled mode never matches (an enabled-only rule)', () => {
    const modes = [
      { id: 'OFF', enabled: false, arrivals: ['09'], departures: ['09'] },
      { id: 'ON', enabled: true, arrivals: ['27'], departures: ['27'] },
    ];
    expect(matchMode({ arrivals: ['09'], departures: ['09'] }, modes)).toBeNull();
  });
  it('arrivals and departures are not interchangeable', () => {
    const modes = [{ id: 'M', enabled: true, arrivals: ['16'], departures: ['27'] }];
    expect(matchMode({ arrivals: ['27'], departures: ['16'] }, modes)).toBeNull();
  });
});

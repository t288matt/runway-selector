// The ATIS-style copy text (issue 150): the formatter on its own, over every mode of every real pack, and the answer model's copy fields.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atisText } from '../../src/v2/model/atisText';
import { answerModel } from '../../src/v2/model/answer';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { PACKS } from '../helpers/packs';
import { viewOf } from './helpers';

const AIRPORTS = resolve(import.meta.dirname, '..', '..', 'refdata', 'airports');
interface RawMode {
  id: string;
  arrivals: string[];
  departures: string[];
}
const REAL: [string, RawMode[]][] = readdirSync(AIRPORTS).map((icao) => [icao, (JSON.parse(readFileSync(join(AIRPORTS, icao, 'modes.json'), 'utf8')) as { modes: RawMode[] }).modes]);

/** Every runway name an ATIS string mentions, number plus letter: "34L and R" is 34L and 34R. */
function runwaysIn(part: string): string[] {
  const out: string[] = [];
  let num = '';
  for (const word of part.replace(/,/g, ' ').split(/\s+/)) {
    const m = /^(\d{2})([LCR]?)$/.exec(word);
    if (m !== null) {
      num = m[1] ?? '';
      out.push(`${num}${m[2] ?? ''}`);
    } else if (/^[LCR]$/.test(word)) out.push(`${num}${word}`);
  }
  return out;
}
const sortedUnique = (xs: readonly string[]): string[] => [...new Set(xs)].sort();

describe('atisText: the wording', () => {
  it.each([
    [['07'], ['16L', '16R'], '07 ARR. RWY 16L and R DEPS'],
    [['16L', '16R'], ['16L', '16R'], '16L and R for ARR and DEP'],
    [['16'], ['16'], '16 for ARR and DEP'],
    [['16'], ['27'], '16 ARR. RWY 27 DEPS'],
    [['34', '27'], ['27'], '34 and 27 ARR. RWY 27 DEPS'],
    [['34L', '34R'], ['25', '34L', '34R'], '34L and R ARR. RWY 25, 34L and R DEPS'],
    [['16L', '16C', '16R'], ['16L', '16C', '16R'], '16L, C and R for ARR and DEP'],
  ])('%j / %j -> %s', (arr, dep, expected) => {
    expect(atisText(arr, dep)).toBe(expected);
  });

  it('does not merge a lone L or R and does not drop or add a runway', () => {
    expect(atisText(['16L'], ['16L'])).toBe('16L for ARR and DEP');
    expect(atisText(['16R'], ['16L', '16R'])).toBe('16R ARR. RWY 16L and R DEPS');
  });

  it('keeps a name it does not understand, as it is', () => {
    expect(atisText(['H1'], ['H1'])).toBe('H1 for ARR and DEP');
  });
});

describe.each(REAL)('every mode of %s (real modes.json)', (_icao, modes) => {
  it.each(modes.map((m) => [m.id, m] as const))('%s: the text names exactly the runways in the arrays, with no mode name', (_id, m) => {
    const text = atisText(m.arrivals, m.departures);
    const both = text.endsWith(' for ARR and DEP');
    const arrPart = both ? text.replace(' for ARR and DEP', '') : (text.split(' ARR. ')[0] ?? '');
    const depPart = both ? arrPart : (text.split(' ARR. ')[1] ?? '').replace(/^RWY /, '').replace(' DEPS', '');
    expect(sortedUnique(runwaysIn(arrPart))).toEqual(sortedUnique(m.arrivals));
    expect(sortedUnique(runwaysIn(depPart))).toEqual(sortedUnique(m.departures));
    expect(both).toBe(sortedUnique(m.arrivals).join() === sortedUnique(m.departures).join());
    if (!both) expect(text).toContain(' ARR. RWY ');
    expect(text).not.toContain(m.id);
  });
});

describe('the same mode name reads differently on different packs (no airport knowledge in code)', () => {
  const find = (icao: string, id: string): RawMode => {
    const m = REAL.find(([i]) => i === icao)?.[1].find((x) => x.id === id);
    if (m === undefined) throw new Error(`${icao} ${id} missing`);
    return m;
  };
  it('16AD at the parallel-runway airport merges, at the single-runway airport does not', () => {
    const parallel = find('YSSY', '16AD');
    const single = find('YMML', '16AD');
    expect(atisText(parallel.arrivals, parallel.departures)).toBe('16L and R for ARR and DEP');
    expect(atisText(single.arrivals, single.departures)).toBe('16 for ARR and DEP');
  });
  it('the owner examples from the real packs', () => {
    const a = find('YSSY', '07A16D');
    expect(atisText(a.arrivals, a.departures)).toBe('07 ARR. RWY 16L and R DEPS');
    const b = find('YMML', '16A27D');
    expect(atisText(b.arrivals, b.departures)).toBe('16 ARR. RWY 27 DEPS');
    const c = find('YMML', '34A27AD');
    expect(atisText(c.arrivals, c.departures)).toBe('34 and 27 ARR. RWY 27 DEPS');
    const d = find('YSSY', '34AD25');
    expect(atisText(d.arrivals, d.departures)).toBe('34L and R ARR. RWY 25, 34L and R DEPS');
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('answer model copy fields [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  it('the main mode and every alternative carry the text built from the pack arrays', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light'));
    const a = answerModel(view);
    const mode = pack.modes.find((m) => m.id === a.modeId);
    expect(mode).toBeDefined();
    expect(a.copyText).toBe(atisText(mode?.arrivals ?? [], mode?.departures ?? []));
    for (const alt of a.alternatives) {
      const m = pack.modes.find((x) => x.id === alt.modeId);
      expect(alt.copyText).toBe(atisText(m?.arrivals ?? [], m?.departures ?? []));
    }
  });
  it('has no copy text with no recommendation', () => {
    const a = answerModel(viewOf(pack, rig, ['badBoth', 'badBoth'], same(2, 'medium')));
    expect(a.copyText).toBeNull();
  });
});

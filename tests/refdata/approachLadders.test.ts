// Approach ladders in modes.json (issue 99, OD-83): optional, validated, and absent means null so every existing pack is
// unchanged. Each check has its own test, so reverting the check makes that test fail.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_FILE_NAMES, PackValidationError, parsePack, type PackIssue } from '../../src/refdata';
import { TEST_PACK, YSSY_PACK, loadPackFrom, readJson, toRaw, type JsonFiles, type RawFiles } from '../helpers/packs';

function expectRefused(raw: RawFiles, path: string, text = ''): void {
  let caught: unknown;
  try {
    parsePack(raw);
  } catch (e) {
    caught = e;
  }
  expect(caught, 'the pack should have been refused').toBeInstanceOf(PackValidationError);
  const issues: readonly PackIssue[] = (caught as PackValidationError).issues;
  const hit = issues.find((i) => i.file === 'modes.json' && i.path.startsWith(path) && i.message.toLowerCase().includes(text.toLowerCase()));
  expect(hit, `no issue for modes.json ${path} "${text}" in: ${(caught as Error).message}`).toBeDefined();
}

const rows = (): Record<string, unknown>[] => [
  { id: 'r1', description: 'Top.', cloudBase: { above: 3000 }, visibility: { atLeast: 5000 }, chipText: 'TOP', hoverText: 'TOP ROW' },
  { id: 'r2', description: 'Middle.', cloudBase: { atLeast: 2000, atMost: 3000 }, chipText: 'MID', hoverText: 'MID ROW' },
  { id: 'r3', description: 'Rest.', chipText: 'REST', hoverText: 'REST ROW' },
];
const ladder = (over: Record<string, unknown> = {}) => ({ id: 'lad', description: 'A ladder.', rows: rows(), ...over });
function withLadders(ladders: unknown, modeLadder: string | undefined = 'lad'): RawFiles {
  const f: JsonFiles = readJson(TEST_PACK);
  if (ladders !== undefined) f['modes.json'].approachLadders = ladders;
  if (modeLadder !== undefined) f['modes.json'].modes[0].approachLadder = modeLadder;
  return toRaw(f);
}
const withRows = (r: unknown) => withLadders([ladder({ rows: r })]);

describe('approach ladders: loading', () => {
  it('every other pack under refdata/airports and the fixture loads with no ladder', () => {
    const root = resolve(import.meta.dirname, '..', '..', 'refdata', 'airports');
    const ids = readdirSync(root);
    expect(ids).toHaveLength(15);
    for (const id of ids) {
      const raw = {} as RawFiles;
      for (const n of PACK_FILE_NAMES) raw[n] = readFileSync(join(root, id, n), 'utf8');
      const pack = parsePack(raw);
      if (id === 'YSSY') continue;
      expect(pack.approachLadders, id).toEqual([]);
      for (const m of pack.modes) expect(m.approachLadder, `${id} ${m.id}`).toBeNull();
    }
    expect(loadPackFrom(TEST_PACK).approachLadders).toEqual([]);
  });

  it('maps a ladder, fills missing keys with null and freezes it', () => {
    const pack = parsePack(withLadders([ladder()]));
    expect(pack.modes[0]?.approachLadder).toBe('lad');
    expect(pack.modes[1]?.approachLadder).toBeNull();
    const l = pack.approachLadders[0]!;
    expect(l.rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(l.rows[0]?.cloudBase).toEqual({ above: 3000, atLeast: null, below: null, atMost: null });
    expect(l.rows[0]?.visibility).toEqual({ above: null, atLeast: 5000, below: null, atMost: null });
    expect(l.rows[1]?.visibility).toBeNull();
    expect(l.rows[2]).toMatchObject({ cloudBase: null, visibility: null, chipText: 'REST', hoverText: 'REST ROW' });
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(l.rows[0]?.cloudBase)).toBe(true);
    // The description is kept out of the engine-facing pack, like every other description.
    expect(JSON.stringify(pack.approachLadders)).not.toContain('"description"');
  });

  it('a source on a ladder or row is kept as provenance', () => {
    const r = rows();
    r[0] = { ...r[0], source: 'row src' };
    const pack = parsePack(withLadders([ladder({ source: 'guide', rows: r })]));
    expect(pack.approachLadders[0]?.source).toBe('guide');
    expect(pack.approachLadders[0]?.rows[0]?.source).toBe('row src');
    expect(pack.approachLadders[0]?.rows[1]?.source).toBeNull();
  });
});

describe('approach ladders: the Sydney pack', () => {
  const pack = loadPackFrom(YSSY_PACK);
  it('names the ladder on 34AD, 16AD, 34A25D and 34AD25 only', () => {
    expect(
      pack.modes
        .filter((m) => m.approachLadder !== null)
        .map((m) => m.id)
        .sort(),
    ).toEqual(['16AD', '34A25D', '34AD', '34AD25']);
    for (const id of ['SODPROPS', '25A16D', '07A16D', '07AD', '25AD']) expect(pack.modes.find((m) => m.id === id)?.approachLadder, id).toBeNull();
  });
  it('holds the three rows with the owner limits and words (OD-83)', () => {
    const [iva, then, instr] = pack.approachLadders[0]!.rows;
    expect([iva?.chipText, iva?.hoverText]).toEqual(['IVA', 'INDEP VISUAL APCH']);
    expect(iva?.cloudBase).toEqual({ above: 3000, atLeast: null, below: null, atMost: null });
    expect(iva?.visibility).toEqual({ above: null, atLeast: 5000, below: null, atMost: null });
    expect([then?.chipText, then?.hoverText]).toEqual(['INSTR THEN IVA', 'INSTR APCH THEN INDEP VISUAL APCH']);
    expect(then?.cloudBase).toEqual({ above: null, atLeast: 2000, below: null, atMost: 3000 });
    expect(then?.visibility).toEqual({ above: null, atLeast: 5000, below: null, atMost: null });
    expect([instr?.chipText, instr?.hoverText]).toEqual(['INSTRUMENT', 'INSTR APCH']);
    expect(instr?.cloudBase).toBeNull();
    expect(instr?.visibility).toBeNull();
  });
});

describe('approach ladders: refused', () => {
  it('a mode naming a ladder that does not exist', () => {
    expectRefused(withLadders([ladder()], 'nope'), 'modes[0].approachLadder', 'not in approachLadders');
    expectRefused(withLadders(undefined, 'lad'), 'modes[0].approachLadder', 'not in approachLadders');
  });
  it('duplicate ladder ids and duplicate row ids', () => {
    expectRefused(withLadders([ladder(), ladder()]), 'approachLadders[1].id', 'duplicate');
    const r = rows();
    r[1]!.id = 'r1';
    expectRefused(withRows(r), 'approachLadders[0].rows[1].id', 'duplicate');
  });
  it('a lower limit above the upper limit, on cloud base and on visibility', () => {
    const r = rows();
    r[1]!.cloudBase = { atLeast: 3001, atMost: 3000 };
    expectRefused(withRows(r), 'approachLadders[0].rows[1].cloudBase', 'exceeds');
    const v = rows();
    v[0]!.visibility = { atLeast: 6000, below: 5000 };
    expectRefused(withRows(v), 'approachLadders[0].rows[0].visibility', 'exceeds');
  });
  it('a range that holds no value (above and atMost the same number), but accepts atLeast equal to atMost', () => {
    const r = rows();
    r[1]!.cloudBase = { above: 3000, atMost: 3000 };
    expectRefused(withRows(r), 'approachLadders[0].rows[1].cloudBase', 'exceeds');
    r[1]!.cloudBase = { atLeast: 3000, atMost: 3000 };
    expect(() => parsePack(withRows(r))).not.toThrow();
  });
  it('two lower limits or two upper limits on one side, and an empty bound', () => {
    const r = rows();
    r[1]!.cloudBase = { above: 1000, atLeast: 2000 };
    expectRefused(withRows(r), 'approachLadders[0].rows[1].cloudBase', 'one lower limit');
    r[1]!.cloudBase = { below: 4000, atMost: 3000 };
    expectRefused(withRows(r), 'approachLadders[0].rows[1].cloudBase', 'one upper limit');
    r[1]!.cloudBase = {};
    expectRefused(withRows(r), 'approachLadders[0].rows[1].cloudBase', 'at least one');
  });
  it('a last row that has a limit', () => {
    const r = rows();
    r[2]!.visibility = { atLeast: 1 };
    expectRefused(withRows(r), 'approachLadders[0].rows[2]', 'last row');
  });
  it('a row with no limit that is not last (so the rows after it are dead)', () => {
    const r = rows();
    r.splice(1, 0, { id: 'catch', description: 'All.', chipText: 'ALL', hoverText: 'ALL ROWS' });
    expectRefused(withRows(r), 'approachLadders[0].rows[1]', 'not the last row');
  });
  it('a ladder with no rows, an unknown key, a missing or blank description', () => {
    expectRefused(withRows([]), 'approachLadders[0].rows');
    expectRefused(withLadders([ladder({ extra: 1 })]), 'approachLadders[0]');
    const noDesc = rows();
    delete noDesc[0]!.description;
    expectRefused(withRows(noDesc), 'approachLadders[0].rows[0].description');
    expectRefused(withLadders([ladder({ description: '  ' })]), 'approachLadders[0].description');
    const blank = rows();
    blank[2]!.description = '';
    expectRefused(withRows(blank), 'approachLadders[0].rows[2].description');
  });
  it('chip or hover text that is empty, too long or has control or direction characters', () => {
    for (const [key, limit] of [
      ['chipText', 24],
      ['hoverText', 80],
    ] as const) {
      const ok = rows();
      ok[2]![key] = 'X'.repeat(limit);
      expect(() => parsePack(withRows(ok))).not.toThrow();
      for (const value of ['', 'X'.repeat(limit + 1), 'A\nB', 'A‮B', 7]) {
        const r = rows();
        r[2]![key] = value;
        expectRefused(withRows(r), `approachLadders[0].rows[2].${key}`);
      }
    }
  });
  it('a bound outside the minima ranges or not a whole number', () => {
    const r = rows();
    r[0]!.cloudBase = { above: 15001 };
    expectRefused(withRows(r), 'approachLadders[0].rows[0].cloudBase.above');
    r[0]!.cloudBase = { above: 100.5 };
    expectRefused(withRows(r), 'approachLadders[0].rows[0].cloudBase.above');
    r[0]!.cloudBase = { above: 1000 };
    r[0]!.visibility = { atLeast: 10001 };
    expectRefused(withRows(r), 'approachLadders[0].rows[0].visibility.atLeast');
  });
});

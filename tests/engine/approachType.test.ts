// The approach-type picker (issue 99), pure. The ladder under test is a made-up one with Sydney's limits; the engine reads only
// the data. Each test fails if the rule it names is removed.
import { describe, expect, it } from 'vitest';
import { approachRowFor, approachTypeFor } from '../../src/engine';
import type { ApproachBound, ApproachRow } from '../../src/refdata';
import { loadPackFrom, YSSY_PACK, TEST_PACK } from '../helpers/packs';

const none: ApproachBound = { above: null, atLeast: null, below: null, atMost: null };
const row = (id: string, cloudBase: Partial<ApproachBound> | null, visibility: Partial<ApproachBound> | null): ApproachRow => ({
  id,
  cloudBase: cloudBase === null ? null : { ...none, ...cloudBase },
  visibility: visibility === null ? null : { ...none, ...visibility },
  chipText: `chip-${id}`,
  hoverText: `hover-${id}`,
  source: null,
});
const LADDER: readonly ApproachRow[] = [
  row('top', { above: 3000 }, { atLeast: 5000 }),
  row('mid', { atLeast: 2000, atMost: 3000 }, { atLeast: 5000 }),
  row('last', null, null),
];
const pick = (cloud: number | null | undefined, vis: number | undefined) => approachRowFor(LADDER, cloud, vis)?.id ?? null;

describe('approachRowFor: boundaries', () => {
  it('cloud base above 3000 is the top row; exactly 3000 is the middle row', () => {
    expect(pick(3001, 9999)).toBe('top');
    expect(pick(3000, 9999)).toBe('mid');
  });
  it('exactly 2000 is still the middle row; 1999 is the last row', () => {
    expect(pick(2001, 9999)).toBe('mid');
    expect(pick(2000, 9999)).toBe('mid');
    expect(pick(1999, 9999)).toBe('last');
  });
  it('visibility 5000 qualifies; 4999 does not', () => {
    expect(pick(4000, 5000)).toBe('top');
    expect(pick(4000, 4999)).toBe('last');
    expect(pick(2500, 5000)).toBe('mid');
    expect(pick(2500, 4999)).toBe('last');
  });
  it('visibility 9999 (read as 10 km) and CAVOK (10 km, no cloud) are the top row', () => {
    expect(pick(4000, 10_000)).toBe('top');
    expect(pick(null, 10_000)).toBe('top');
  });
  it('no cloud (null) is above every lower limit and never under an upper one', () => {
    expect(pick(null, 9000)).toBe('top');
    expect(approachRowFor([row('r', { below: 1000 }, null), row('z', null, null)], null, 9000)?.id).toBe('z');
  });
  it('a low base (vertical visibility 200 ft, FEW015) is the last row', () => {
    expect(pick(200, 800)).toBe('last');
    expect(pick(1500, 9999)).toBe('last');
  });
});

describe('approachRowFor: unknown weather shows nothing unless the unknown cannot change the result', () => {
  it('unknown visibility with a known cloud base that fits a row is undecided', () => {
    expect(pick(4000, undefined)).toBeNull();
    expect(pick(2500, undefined)).toBeNull();
  });
  it('unknown visibility with a cloud base under every row that needs it falls to the last row', () => {
    expect(pick(1000, undefined)).toBe('last');
  });
  it('unknown cloud base with known visibility under the limit is the last row', () => {
    expect(pick(undefined, 4999)).toBe('last');
  });
  it('unknown cloud base with visibility at or over the limit is undecided', () => {
    expect(pick(undefined, 5000)).toBeNull();
    expect(pick(undefined, 10_000)).toBeNull();
  });
  it('both unknown is undecided', () => {
    expect(pick(undefined, undefined)).toBeNull();
  });
});

describe('approachTypeFor', () => {
  it('a mode with no ladder shows nothing, whatever the weather (the fictional TEST pack has no ladder)', () => {
    const pack = loadPackFrom(TEST_PACK);
    for (const m of pack.modes) expect(approachTypeFor(pack, m.id, 4000, 9999)).toBeNull();
  });
  it('an unknown mode id shows nothing', () => {
    expect(approachTypeFor(loadPackFrom(YSSY_PACK), 'NOPE', 4000, 9999)).toBeNull();
  });
});

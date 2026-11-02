// Runway text for the summary cards: merged parallel runways and the ARR/DEP rows.
import { describe, expect, it } from 'vitest';
import { formatRunways, runwayRows } from '../../src/v2/model/runwayText';

describe('formatRunways', () => {
  it.each([
    [['16L', '16R'], '16L/R'],
    [['34R', '34L'], '34R/L'],
    [['16L', '16C', '16R'], '16L/C/R'],
    [['07'], '07'],
    [['29', '36'], '29, 36'],
    [['24', '21'], '24, 21'],
    [['34L', '34R', '25'], '34L/R, 25'],
    [['34L', '25', '34R'], '34L/R, 25'],
    [['16L', '16L', '16R'], '16L/R'],
    [['25', '25'], '25'],
    [[], ''],
  ] as const)('%j -> %s', (names, expected) => {
    expect(formatRunways(names)).toBe(expected);
  });
});

describe('runwayRows', () => {
  it('one row when the sets are the same', () => {
    expect(runwayRows(['16L', '16R'], ['16L', '16R'])).toEqual([{ role: 'ARR and DEP', text: '16L/R' }]);
  });
  it('equality ignores order', () => {
    expect(runwayRows(['16L', '16R'], ['16R', '16L'])).toEqual([{ role: 'ARR and DEP', text: '16L/R' }]);
  });
  it('two rows when the sets differ', () => {
    expect(runwayRows(['34L', '34R'], ['25'])).toEqual([
      { role: 'ARR', text: '34L/R' },
      { role: 'DEP', text: '25' },
    ]);
  });
  it('omits a side with no runways', () => {
    expect(runwayRows(['16L'], [])).toEqual([{ role: 'ARR', text: '16L' }]);
    expect(runwayRows([], ['16L'])).toEqual([{ role: 'DEP', text: '16L' }]);
    expect(runwayRows([], [])).toEqual([]);
  });
});

// classifyLevel against every pack's own bands (inclusive ranges, open top).
import { describe, expect, it } from 'vitest';
import { classifyLevel } from '../../src/traffic/level';
import { describeForEachPack } from '../helpers/packs';

describeForEachPack('classifyLevel', (pack) => {
  const { light, medium, busy } = pack.settings.trafficBands;
  const lightHi = light[1]!;
  const mediumLo = medium[0]!;
  const mediumHi = medium[1]!;
  const busyLo = busy[0]!;

  it('values exactly on each band boundary', () => {
    expect(classifyLevel(pack, light[0]!, null)).toBe('light');
    expect(classifyLevel(pack, lightHi, null)).toBe('light');
    expect(classifyLevel(pack, mediumLo, null)).toBe('medium');
    expect(classifyLevel(pack, mediumHi, null)).toBe('medium');
    expect(classifyLevel(pack, busyLo, null)).toBe('busy');
  });

  it('the one above a boundary is the next band', () => {
    expect(lightHi + 1).toBe(mediumLo);
    expect(mediumHi + 1).toBe(busyLo);
  });

  it('the busy band is open ended', () => {
    expect(busy[1]).toBeNull();
    expect(classifyLevel(pack, 500, null)).toBe('busy');
  });

  it('zero is light', () => {
    expect(classifyLevel(pack, 0, 0)).toBe('light');
  });

  it('arrivals and departures are classified separately and the higher wins', () => {
    expect(classifyLevel(pack, lightHi, busyLo)).toBe('busy');
    expect(classifyLevel(pack, busyLo, lightHi)).toBe('busy');
    expect(classifyLevel(pack, lightHi, mediumLo)).toBe('medium');
    expect(classifyLevel(pack, mediumHi, lightHi)).toBe('medium');
  });

  it('the two counts are not added together', () => {
    // Each is light, but their sum would be medium.
    expect(classifyLevel(pack, lightHi, lightHi)).toBe('light');
  });

  it('one unknown count uses the other; both unknown is unknown', () => {
    expect(classifyLevel(pack, null, mediumLo)).toBe('medium');
    expect(classifyLevel(pack, mediumLo, null)).toBe('medium');
    expect(classifyLevel(pack, null, null)).toBeNull();
  });

  it('a count that is not a whole non-negative number is unknown', () => {
    expect(classifyLevel(pack, -1, null)).toBeNull();
    expect(classifyLevel(pack, 2.5, null)).toBeNull();
    expect(classifyLevel(pack, Number.NaN, null)).toBeNull();
  });

  it('reads the bands from the pack, not from code', () => {
    const shifted = { ...pack, settings: { ...pack.settings, trafficBands: { light: [0, 1], medium: [2, 3], busy: [4, null] } } };
    expect(classifyLevel(shifted as typeof pack, 4, null)).toBe('busy');
    expect(classifyLevel(shifted as typeof pack, 3, null)).toBe('medium');
    expect(classifyLevel(shifted as typeof pack, 1, null)).toBe('light');
  });
});

describe('classifyLevel: the packs differ', () => {
  it('has a boundary that is light in one pack and medium in another (guards a hard-coded band)', async () => {
    const { PACKS, loadPackFrom } = await import('../helpers/packs');
    const levels = PACKS.map((r) => classifyLevel(loadPackFrom(r), 4, null));
    expect(new Set(levels).size).toBeGreaterThan(1);
  });
});

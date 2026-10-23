import { expect, it } from 'vitest';
import { classifyTraffic, levelOfCount } from '../../src/engine';
import { describeEachPack } from './helpers';

describeEachPack('traffic level', (pack) => {
  const b = pack.settings.trafficBands;
  const lightTop = b.light[1] ?? 0;
  const mediumTop = b.medium[1] ?? 0;
  it('uses inclusive band edges from the pack', () => {
    expect(levelOfCount(pack, 0)).toBe('light');
    expect(levelOfCount(pack, lightTop)).toBe('light');
    expect(levelOfCount(pack, lightTop + 1)).toBe('medium');
    expect(levelOfCount(pack, mediumTop)).toBe('medium');
    expect(levelOfCount(pack, mediumTop + 1)).toBe('busy');
    expect(levelOfCount(pack, 100000)).toBe('busy');
  });
  it('takes the higher of arrivals and departures', () => {
    expect(classifyTraffic(pack, 0, mediumTop + 1)).toBe('busy');
    expect(classifyTraffic(pack, mediumTop + 1, 0)).toBe('busy');
    expect(classifyTraffic(pack, 0, lightTop + 1)).toBe('medium');
  });
  it('an unknown count is ignored; both unknown is unknown', () => {
    expect(classifyTraffic(pack, null, lightTop + 1)).toBe('medium');
    expect(classifyTraffic(pack, mediumTop + 1, null)).toBe('busy');
    expect(classifyTraffic(pack, null, null)).toBeNull();
  });
});

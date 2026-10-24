import { describe, expect, it } from 'vitest';
import { YSSY_PACK } from '../helpers/packs';
import { DAY_START_MS, inputFor, packFrom } from '../engine/helpers';
import { timelineModel } from '../../src/ui/model/timeline';
import { viewFromInput } from './helpers';

describe('weather events row', () => {
  const pack = packFrom(YSSY_PACK);
  const eventsOf = (precip: boolean) => {
    const v = viewFromInput(pack, inputFor(DAY_START_MS, [{ gov: 'METAR', ...(precip ? { precip: { prevailing: true } } : {}) }]));
    return timelineModel(v, v.calcNowMs).slots[0]?.events;
  };

  it('writes WET in capitals for a wet slot', () => {
    expect(eventsOf(true)).toContain('WET');
    expect(eventsOf(true)).not.toContain('wet');
  });

  it('shows no wet event for a dry slot', () => {
    expect(eventsOf(false)).not.toContain('WET');
  });
});

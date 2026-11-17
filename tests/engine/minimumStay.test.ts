// OD-74: a short stay in a mode costs shortStayPenalty, so the plan does not change mode and change again soon after.
import { describe, expect, it } from 'vitest';
import { decodeMetar, decodeTaf } from '../../src/weather';
import { calculate, EMPTY_FEED } from '../../src/v2/model/dashboard';
import { YSSY_PACK } from '../helpers/packs';
import { packWith } from '../weather/helpers';

const NOW = Date.UTC(2026, 9, 24, 13, 24);

function planFor(minimumStayMinutes: number) {
  const pack = packWith(YSSY_PACK, { weatherStation: 'YSSY', settings: { minimumStayMinutes } });
  const m = decodeMetar('METAR YSSY 241300Z AUTO 20006KT 9999 // SCT015 20/17 Q1016', { pack, nowMs: NOW });
  const t = decodeTaf('TAF AMD YSSY 241117Z 2412/2518 02012KT CAVOK FM241400 34007KT CAVOK FM242200 35014KT CAVOK FM250200 02020KT 9999 SCT045', { pack, nowMs: NOW });
  if (m.kind !== 'ok' || t.kind !== 'ok') throw new Error('decode');
  return calculate({ pack, nowMs: NOW, metar: m.report, taf: t.report, windowChoice: 'full', feed: EMPTY_FEED }).result.plan;
}

describe('minimum stay in a mode', () => {
  it('with a 60 minute minimum, does not recommend a mode (such as 25A16D for the 36 minutes left in two slots) that is left again within the hour', () => {
    // With no minimum the plan starts in 25A16D for the 36 minutes left in slots 0 and 1, then changes to 34AD.
    const free = planFor(0);
    expect(free.recommendedModeId).toBe('25A16D');
    expect(free.changes[0]).toMatchObject({ slotIndex: 2, fromModeId: '25A16D', toModeId: '34AD' });
    // With a 60 minute minimum that short stay costs more than it saves, so the plan stays in 34AD.
    const plan = planFor(60);
    expect(plan.recommendedModeId).toBe('34AD');
    expect(plan.changes).toHaveLength(0);
  });
});

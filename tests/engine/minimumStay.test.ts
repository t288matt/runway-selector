// OD-74: a short stay in a mode costs shortStayPenalty, so the plan does not change mode and change again soon after.
import { describe, expect, it } from 'vitest';
import { decodeMetar, decodeTaf } from '../../src/weather';
import { calculate, EMPTY_FEED } from '../../src/ui/model/dashboard';
import { YSSY_PACK } from '../helpers/packs';
import { packWith } from '../weather/helpers';

const NOW = Date.UTC(2026, 9, 24, 13, 24);

function planFor(minimumStayMinutes: number) {
  const pack = packWith(YSSY_PACK, { weatherStation: 'YSSY', settings: { minimumStayMinutes } });
  const m = decodeMetar('METAR YSSY 241300Z AUTO 05007KT 9999 // SCT015 20/17 Q1016', { pack, nowMs: NOW });
  const t = decodeTaf('TAF AMD YSSY 241117Z 2412/2518 02012KT CAVOK FM241400 34007KT CAVOK FM242200 35014KT CAVOK FM250200 02020KT 9999 SCT045', { pack, nowMs: NOW });
  if (m.kind !== 'ok' || t.kind !== 'ok') throw new Error('decode');
  return calculate({ pack, nowMs: NOW, metar: m.report, taf: t.report, windowChoice: 'full', currentMode: '07AD', feed: EMPTY_FEED }).result.plan;
}

describe('minimum stay in a mode', () => {
  it('with a 60 minute minimum, does not recommend a mode (such as SODPROPS for the 6 minutes left in the slot) that is left again within the hour', () => {
    const plan = planFor(60);
    expect(plan.recommendedModeId).not.toBe('SODPROPS');
    const firstChange = plan.changes[0];
    expect(firstChange?.toModeId).toBe(plan.recommendedModeId);
    const second = plan.changes[1];
    expect(second === undefined || second.startMs - (firstChange?.startMs ?? 0) >= 60 * 60000).toBe(true);
  });
});

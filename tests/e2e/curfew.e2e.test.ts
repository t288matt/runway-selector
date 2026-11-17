// CURFEW mode (30-10-2026, owner decision): the real-world Sydney Curfew Act 1995 Mode 1 configuration
// (arrivals 34L, departures 16R), restricted to the curfew band (23:00-06:00 local, crosses midnight) and
// forbidden in the day band (06:00-23:00). Sydney is UTC+11 (AEDT) on these dates.
import { describe, expect, it } from 'vitest';
import { YSSY_PACK } from '../helpers/packs';
import { cell, kt, run, type RunOptions } from './pipeline';

const go = (o: Omit<RunOptions, 'ref' | 'windowMinutes'>) => run({ ref: YSSY_PACK, windowMinutes: 60, ...o });
const calm = kt(0, 0);

describe('CURFEW is restricted to the curfew band', () => {
  it('is eligible (no PLAN cause) at 01:10 local, inside the curfew band', () => {
    // 2026-10-23T14:10:00Z = 01:10 AEDT.
    const r = go({ nowIso: '2026-10-23T14:10:00Z', metar: `METAR YSSY 231410Z ${calm} 9999 FEW020 20/10 Q1015` });
    const c = cell(r, 'CURFEW', 0);
    expect(c.reasons.some((x) => x.code === 'PLAN')).toBe(false);
    expect(c.status).toBe('SUITABLE');
  });

  it('is UNSUITABLE with cause PLAN at 14:10 local, inside the day band', () => {
    // 2026-10-23T03:10:00Z = 14:10 AEDT.
    const r = go({ nowIso: '2026-10-23T03:10:00Z', metar: `METAR YSSY 230310Z ${calm} 9999 FEW020 20/10 Q1015` });
    const c = cell(r, 'CURFEW', 0);
    expect(c.status).toBe('UNSUITABLE');
    expect(c.reasons.some((x) => x.code === 'PLAN')).toBe(true);
  });

  it('ranks at the same priority as 25A16D inside the curfew band (both penalty 2)', () => {
    const r = go({ nowIso: '2026-10-23T14:10:00Z', metar: `METAR YSSY 231410Z ${calm} 9999 FEW020 20/10 Q1015` });
    const curfewPenalty = r.pack.plan.find((b) => b.id === 'curfew')?.rows.find((row) => row.mode === 'CURFEW')?.penalty;
    const otherPenalty = r.pack.plan.find((b) => b.id === 'curfew')?.rows.find((row) => row.mode === '25A16D')?.penalty;
    expect(curfewPenalty).toBe(otherPenalty);
  });
});

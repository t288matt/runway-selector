import { describe, expect, it } from 'vitest';
import { plan, EARLY_CHANGE_TITLE, NO_SUITABLE_TITLE, explanationStrings, type PlanResult, type TrafficLevel } from '../../src/engine';
import { PACKS } from '../helpers/packs';
import { BASE, WORKED, modesOf, packOf, rigFor, run, same, specsFor, trafficFor, type Rig, type Weights, type Wx } from './planHelpers';
import { inputFor } from './helpers';

const seen: string[] = [];
function deepFreeze(o: unknown): void {
  if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return;
  Object.freeze(o);
  for (const v of Object.values(o)) deepFreeze(v);
}
function go(...args: Parameters<typeof run>): PlanResult {
  const r = run(...args);
  seen.push(...explanationStrings(r.explanation));
  return r;
}

// Eight slots: A usable in slots 1-4 only, B throughout (DESIGN 6D worked example).
const WX8: Wx[] = ['ok', 'ok', 'ok', 'ok', 'badA', 'badA', 'badA', 'badA'];
const med = same<TrafficLevel | null>(8, 'medium');

describe.each(PACKS.map((p) => [p.name, p] as const))('optimiser [%s]', (_n, ref) => {
  const rig: Rig = rigFor(ref);
  const pack = packOf(rig);
  const { a, b } = rig;
  const seq = (n: number, first: string, rest: string, firstCount: number): string[] => Array.from({ length: n }, (_, i) => (i < firstCount ? first : rest));

  it('(i) worked example: A for four slots then B, total 13 against 16', () => {
    const r = go(pack, rig, WX8, med);
    expect(modesOf(r)).toEqual(seq(8, a, b, 4));
    expect(r.plan.totalScore).toBe(13);
    expect(r.plan.changes).toHaveLength(1);
    expect(r.plan.changes[0]?.slotIndex).toBe(4);
    expect(r.plan.recommendedModeId).toBe(a);
    expect(r.changeovers[0]?.early).toBeNull();
    // B throughout is 16: make A dearer and the plan becomes that.
    expect(go(packOf(rig, { ...WORKED, prefA: 3 }), rig, WX8, med).plan.totalScore).toBe(16);
  });

  it('(ii) busy slot 5: early change at slot 4, total 15 (waiting 33, staying in B 16)', () => {
    const levels = [...med];
    levels[4] = 'busy';
    const r = go(pack, rig, WX8, levels);
    expect(modesOf(r)).toEqual(seq(8, a, b, 3));
    expect(r.plan.totalScore).toBe(15);
    const early = r.changeovers[0]?.early;
    expect(early).not.toBeNull();
    expect(early?.internal.planScore).toBe(15);
    // The best plan with no change before the failure slot is B throughout (16); starting in A and waiting is 33.
    expect(early?.internal.waitingScore).toBe(16);
    expect(early?.changeSlot).toBe(3);
    expect(early?.forcedSlot).toBe(4);
    expect(early?.trafficAtChange).toBe('medium');
    expect(early?.trafficAtForced).toBe('busy');
    expect(r.explanation.earlyChange?.title).toBe(EARLY_CHANGE_TITLE);
    expect(r.explanation.earlyChange?.trafficAtForced).toBe('busy');
  });

  it('(ii) with A as the current mode the best plan that waits is 0 + 25 + 8 = 33', () => {
    const levels = [...med];
    levels[4] = 'busy';
    const r = go(pack, rig, WX8, levels, a);
    expect(r.plan.totalScore).toBe(15);
    expect(r.changeovers[0]?.early?.internal.waitingScore).toBe(33);
  });

  it('(ii) no early banner when waiting is no worse: a tie is not an improvement', () => {
    const levels = [...med];
    levels[4] = 'busy';
    const tied = packOf(rig, { ...WORKED, medium: 6 });
    const r = go(tied, rig, WX8, levels);
    expect(r.plan.totalScore).toBe(16); // early change 6 + 10, equal to B throughout
    expect(r.plan.changes[0]?.slotIndex).toBe(3);
    expect(r.changeovers[0]?.early).toBeNull();
    expect(r.explanation.earlyChange).toBeNull();
  });

  it('(iii) current mode B: staying in B (16) beats 13 plus the cost of leaving B (18)', () => {
    const r = go(pack, rig, WX8, med, b);
    expect(modesOf(r)).toEqual(same(8, b));
    expect(r.plan.totalScore).toBe(16);
    expect(r.plan.changes).toHaveLength(0);
    expect(r.changeovers).toHaveLength(0);
  });

  it('(iii) current mode B in light traffic: leaving B now is worth it (1 + 0 + 1 + 8 = 10)', () => {
    const r = go(pack, rig, WX8, same(8, 'light'), b);
    expect(modesOf(r)).toEqual(seq(8, a, b, 4));
    expect(r.plan.totalScore).toBe(10);
    expect(r.plan.changes[0]).toMatchObject({ slotIndex: 0, fromModeId: b, toModeId: a });
    expect(r.changeovers[0]?.trigger).toBeNull();
    expect(r.changeovers[0]?.early).toBeNull();
    expect(r.explanation.earlyChange).toBeNull();
  });

  it('(iii) current mode A in medium traffic costs nothing extra', () => {
    expect(go(pack, rig, WX8, med, a).plan.totalScore).toBe(13);
  });

  it('(iv) an UNSUITABLE cell is never entered, even when staying is far cheaper', () => {
    const dear = packOf(rig, { ...WORKED, medium: 1000 });
    const r = go(dear, rig, WX8, med, a);
    expect(modesOf(r)).toEqual(seq(8, a, b, 4));
    expect(r.plan.totalScore).toBe(1000 + 8);
    r.plan.slots.forEach((s, t) => {
      const m = dear.modes.findIndex((x) => x.id === s.modeId);
      expect(r.evaluation.cells[m]?.[t]?.status).not.toBe('UNSUITABLE');
    });
  });

  it('(v) a slot where every mode is UNSUITABLE is NO_MODE at the no-mode weight, with no change weight in or out', () => {
    const r = go(pack, rig, ['ok', 'ok', 'badBoth', 'badA', 'badA'], same(5, 'medium'));
    expect(modesOf(r)).toEqual([a, a, null, b, b]);
    expect(r.plan.totalScore).toBe(1000 + 2 + 2);
    expect(r.plan.changes).toHaveLength(0);
    expect(r.plan.recommendedModeId).toBe(a);
  });

  it('(v) NO_MODE in slot 0 gives no recommendation and the required message', () => {
    const r = go(pack, rig, ['badBoth', 'ok'], same(2, 'medium'), a);
    expect(r.plan.slots[0]?.modeId).toBeNull();
    expect(r.plan.recommendedModeId).toBeNull();
    expect(r.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
    expect(r.plan.totalScore).toBe(1000);
    expect(r.plan.slots[1]?.modeId).toBe(a);
  });

  it('(vi) UNKNOWN slots are planned through with no extra weight and the plan is marked uncertain', () => {
    const r = go(pack, rig, ['ok', 'none', 'none', 'ok'], same(4, 'medium'));
    expect(modesOf(r)).toEqual(same(4, a));
    expect(r.plan.totalScore).toBe(0);
    expect(r.plan.uncertainSlots).toBe(2);
    expect(r.plan.uncertain).toBe(true);
    expect(r.explanation.uncertaintyLine).toBe('Based on 2 uncertain slots');
    expect(r.plan.recommendedModeId).toBe(a);
  });

  it('(vi) unknown weather in slot 0 gives no recommendation and says why', () => {
    const r = go(pack, rig, ['none', 'ok', 'ok'], same(3, 'medium'));
    expect(r.plan.recommendedModeId).toBeNull();
    expect(r.plan.noRecommendation).toBe('WEATHER_UNKNOWN');
    expect(r.explanation.headline).toMatch(/weather .* not known/);
    expect(r.explanation.noSuitableMode).toBeNull();
    expect(r.explanation.lines).toHaveLength(0);
  });

  it('(vi) the uncertainty line says there are none when nothing is uncertain', () => {
    expect(go(pack, rig, same(4, 'ok'), same(4, 'medium')).explanation.uncertaintyLine).toBe('No uncertain inputs');
    expect(go(pack, rig, ['none', 'ok'], same(2, 'medium')).explanation.uncertaintyLine).toBe('Based on 1 uncertain slot');
  });

  it('(vii) ties: lower total preference first, then the mode first in the pack', () => {
    const tie = packOf(rig, { ...WORKED, prefA: 3, prefB: 3 });
    expect(modesOf(go(tie, rig, same(4, 'ok'), same(4, 'medium')))).toEqual(same(4, a));
    // Equal totals (4 each); A is first in the pack but B has the lower preference total, so B wins.
    const t2 = packOf(rig, { ...WORKED, prefA: 2, prefB: 0, light: 4 });
    const r = go(t2, rig, same(2, 'ok'), same(2, 'light'), a);
    expect(r.plan.totalScore).toBe(4);
    expect(modesOf(r)).toEqual(same(2, b));
  });

  it('(vii) the same input gives the same output twice', () => {
    const levels = [...med];
    levels[4] = 'busy';
    expect(JSON.stringify(run(pack, rig, WX8, levels, b))).toBe(JSON.stringify(run(pack, rig, WX8, levels, b)));
  });

  it('(viii) stable weather keeps the mode; small wind changes cause no repeated changes', () => {
    expect(run(pack, rig, same(12, 'ok'), same(12, 'medium')).plan.changes).toHaveLength(0);
    const flicker: Wx[] = ['ok', 'marginalA', 'ok', 'marginalA', 'ok', 'marginalA', 'ok', 'marginalA'];
    const r = go(pack, rig, flicker, same(8, 'medium'));
    expect(r.plan.changes).toHaveLength(0);
    expect(modesOf(r)).toEqual(same(8, a));
    expect(r.plan.totalScore).toBe(4 * 3);
  });

  it('(ix) a preference that lasts one hour loses to a mode lasting longer; four hours wins', () => {
    const wx = (k: number): Wx[] => Array.from({ length: 10 }, (_, i) => (i < k ? 'ok' : 'badA'));
    const short = go(pack, rig, wx(2), same(10, 'medium'));
    expect(modesOf(short)).toEqual(same(10, b));
    expect(short.plan.totalScore).toBe(20);
    expect(short.explanation.lines.some((l) => l.includes(a) && l.includes('first preference'))).toBe(true);
    const long = go(pack, rig, wx(8), same(10, 'medium'));
    expect(modesOf(long)).toEqual(seq(10, a, b, 8));
    expect(long.plan.totalScore).toBe(0 + 5 + 4);
    expect(long.explanation.lines.some((l) => l.includes('first preference'))).toBe(false);
  });

  it('(x) capacity rejects a mode', () => {
    const small = packOf(rig, WORKED, undefined, 1);
    const r = go(small, rig, same(4, 'ok'), same(4, 'medium'));
    const ai = small.modes.findIndex((m) => m.id === a);
    expect(r.evaluation.cells[ai]?.[0]?.cause).toBe('CAP');
    expect(modesOf(r)).toEqual(same(4, b));
  });

  it('(xi) no eligible mode: the required message, causes per mode, never a least bad mode', () => {
    const r = go(pack, rig, ['badBoth', 'badBoth'], same(2, 'medium'));
    expect(r.plan.recommendedModeId).toBeNull();
    expect(r.explanation.noSuitableMode?.title).toBe(NO_SUITABLE_TITLE);
    expect(r.explanation.headline).toBe(NO_SUITABLE_TITLE);
    const per = r.explanation.noSuitableMode?.perMode ?? [];
    expect(per.map((p) => p.modeId)).toEqual(pack.modes.filter((m) => m.enabled).map((m) => m.id));
    expect(per.every((p) => p.cause !== null && p.text.length > 0)).toBe(true);
    const all = explanationStrings(r.explanation).join(' ').toLowerCase();
    expect(all).not.toMatch(/least|best of|better of|recommended mode/);
  });

  it('(xii) no early change when traffic at the change is unknown; it is raised when known', () => {
    const cheap = packOf(rig, { ...WORKED, unknown: 1 });
    const levels: (TrafficLevel | null)[] = ['medium', 'medium', 'medium', null, 'busy', 'medium', 'medium', 'medium'];
    const r = go(cheap, rig, WX8, levels);
    expect(r.plan.changes[0]?.slotIndex).toBe(3);
    expect(r.plan.totalScore).toBe(11);
    expect(r.changeovers[0]?.trigger?.slotIndex).toBe(4);
    expect(r.changeovers[0]?.early).toBeNull();
    expect(r.explanation.earlyChange).toBeNull();
    const known = go(cheap, rig, WX8, ['medium', 'medium', 'medium', 'light', 'busy', 'medium', 'medium', 'medium']);
    expect(known.changeovers[0]?.early).not.toBeNull();
  });

  it('(xii) no early change for a change made only for preference', () => {
    // B is current and never fails; the plan moves to A for preference in light traffic.
    const r = go(pack, rig, same(6, 'ok'), same(6, 'light'), b);
    expect(r.plan.changes).toHaveLength(1);
    expect(r.changeovers[0]?.trigger).toBeNull();
    expect(r.changeovers[0]?.early).toBeNull();
    expect(r.explanation.earlyChange).toBeNull();
  });

  it('review 1: no early banner unless the forced change is in strictly busier traffic', () => {
    // Current mode B fails at slot 6 (A fine), light traffic throughout: the change is not to avoid anything worse.
    const wx: Wx[] = [...same<Wx>(6, 'ok'), 'badB', 'badB'];
    const light = go(pack, rig, wx, same(8, 'light'), b);
    expect(light.changeovers[0]?.trigger?.slotIndex).toBe(6);
    expect(light.changeovers[0]?.early).toBeNull();
    expect(light.explanation.earlyChange).toBeNull();
    // Forced slot busier than the change slot: raised (the 6D example is the main case above).
    const lv: (TrafficLevel | null)[] = same(8, 'light');
    lv[6] = 'busy';
    const busier = go(pack, rig, wx, lv, b);
    expect(busier.changeovers.some((c) => c.early !== null)).toBe(true);
    // Forced slot equally busy, or unknown: not raised.
    lv[6] = 'light';
    expect(go(pack, rig, wx, lv, b).explanation.earlyChange).toBeNull();
    const west: (TrafficLevel | null)[] = same(8, 'medium');
    west[4] = null;
    expect(go(pack, rig, WX8, west).explanation.earlyChange).toBeNull();
  });

  it('review 2: a gap is reported with its own line and never as "no mode change"', () => {
    const r = go(pack, rig, ['ok', 'ok', 'badBoth', 'badA', 'badA'], same(5, 'medium'));
    expect(r.plan.gaps).toHaveLength(1);
    const gap = r.plan.gaps[0];
    expect(gap).toMatchObject({ startSlot: 2, endSlot: 2, afterMode: a, beforeMode: b });
    expect(gap?.endMs).toBe(BASE + 3 * 30 * 60000);
    const lines = r.explanation.lines.join('\n');
    expect(lines).toContain('No suitable mode from 01:00 UTC to 01:30 UTC');
    expect(lines).toContain(`recommended again: ${b} from 01:30 UTC`);
    expect(lines).not.toContain('No mode change is planned');
    // A gap with no change after it.
    const same2 = go(pack, rig, ['ok', 'badBoth', 'ok'], same(3, 'medium'));
    expect(same2.explanation.lines.join('\n')).not.toContain('No mode change is planned');
    expect(same2.plan.changes).toHaveLength(0);
    // A gap to the end of the window.
    const tail = go(pack, rig, ['ok', 'badBoth', 'badBoth'], same(3, 'medium'));
    expect(tail.plan.gaps[0]).toMatchObject({ startSlot: 1, endSlot: 2, beforeMode: null });
    expect(tail.explanation.lines.join('\n')).toContain('no mode is expected to be suitable again');
  });

  it('review 3: a disabled or unknown current mode is treated as not set', () => {
    const withOff = packOf(rig, WORKED, (files) => {
      files['modes.json'].modes.push({ id: 'XOFF', description: 'Disabled', enabled: false, arrivals: [], departures: [] });
    });
    const r = go(withOff, rig, WX8, med, 'XOFF');
    expect(r.plan.startModeId).toBeNull();
    expect(r.plan.totalScore).toBe(13);
  });

  it('review 3: the early check uses the stint start after the first change', () => {
    // Current B; A is good to slot 5 and fails from slot 6 (medium there); light elsewhere.
    const wx: Wx[] = [...same<Wx>(6, 'ok'), 'badA', 'badA', 'badA', 'badA'];
    const lv: (TrafficLevel | null)[] = same(10, 'light');
    lv[6] = 'medium';
    const r = go(pack, rig, wx, lv, b);
    // B to A now (1), A to slot 4, A to B at slot 5 in light traffic (1), B for five slots (10): 12.
    expect(r.plan.totalScore).toBe(12);
    expect(r.plan.changes.map((c) => c.slotIndex)).toEqual([0, 5]);
    const second = r.changeovers[1];
    expect(second?.early).not.toBeNull();
    // The plan that waits may still make the first change (slot 0): 1 + 5 (medium, slot 6) + 8 = 14. With the
    // first change wrongly forbidden it would be B throughout, 20.
    expect(second?.early?.internal.waitingScore).toBe(14);
  });

  it('review 3: current mode B with slot 5 busy in the worked example stays in B (total 16)', () => {
    const levels = [...med];
    levels[4] = 'busy';
    const r = go(pack, rig, WX8, levels, b);
    // Hand count: B throughout 8 x 2 = 16. Leaving B now and changing back in slot 4 costs 5 + 5 + 10 = 20;
    // leaving B now and waiting costs 5 + 25 + 8 = 38.
    expect(modesOf(r)).toEqual(same(8, b));
    expect(r.plan.totalScore).toBe(16);
    expect(r.explanation.earlyChange).toBeNull();
  });

  it('review 3: the engine does not change its inputs and gives the same output twice', () => {
    const input = { ...inputFor(BASE, specsFor(rig, WX8), trafficFor(pack, med)), currentMode: b };
    deepFreeze(input);
    const before = JSON.stringify(input);
    const one = JSON.stringify(plan(pack, input));
    const two = JSON.stringify(plan(pack, input));
    expect(two).toBe(one);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('review 4: weather unknown needs every enabled mode unknown in slot 0; known weather with nothing suitable is the other case', () => {
    const unknown = go(pack, rig, ['none', 'ok'], same(2, 'medium'));
    expect(unknown.plan.noRecommendation).toBe('WEATHER_UNKNOWN');
    expect(unknown.explanation.noSuitableMode).toBeNull();
    const failing = go(pack, rig, ['badBoth', 'ok'], same(2, 'medium'));
    expect(failing.plan.noRecommendation).toBe('NO_SUITABLE_MODE');
    expect(failing.explanation.noSuitableMode?.perMode.length).toBeGreaterThan(0);
  });

  it('review 5: a change in slot 0 says "Change now" once and no "Next change" for it', () => {
    const r = go(pack, rig, WX8, same(8, 'light'), b);
    expect(r.explanation.headline).toBe(`Change now to ${a}.`);
    expect(r.explanation.lines.some((l) => l.startsWith(`Change now to ${a}`))).toBe(true);
    expect(r.explanation.lines.filter((l) => l.startsWith('Next change')).length).toBe(1);
    expect(r.explanation.lines.find((l) => l.startsWith('Next change'))).toContain(`to ${b}`);
  });

  it('(xiii) a changed weight in pack data changes the plan with no code change', () => {
    expect(modesOf(go(pack, rig, WX8, med))).toEqual(seq(8, a, b, 4));
    expect(modesOf(go(packOf(rig, { ...WORKED, medium: 100 }), rig, WX8, med))).toEqual(same(8, b));
    expect(modesOf(go(packOf(rig, { ...WORKED, prefA: 9 }), rig, WX8, med))).toEqual(same(8, b));
  });

  it('changeover: preparation start, traffic and replacement survival', () => {
    const r = go(pack, rig, WX8, med);
    const c = r.changeovers[0];
    expect(c?.preparationStartMs).toBe(BASE + 4 * 30 * 60000 - pack.settings.changeoverPreparationMinutes * 60000);
    expect(c?.trigger?.slotIndex).toBe(4);
    expect(c?.trafficLevel).toBe('medium');
    expect(c?.replacementModeId).toBe(b);
    expect(c?.replacementSurvival?.endsInFailure).toBe(false);
    expect(c?.replacementSurvival?.viableSlots).toBe(4);
  });

  it('an unknown current mode is treated as not set', () => {
    const r = go(pack, rig, WX8, med, 'no-such-mode');
    expect(r.plan.startModeId).toBeNull();
    expect(r.plan.totalScore).toBe(13);
  });

  it('matches a brute-force search on small pseudo-random scenarios', () => {
    let seed = 12345;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 65536) % n;
    };
    const wxs: Wx[] = ['ok', 'badA', 'badB', 'marginalA', 'none', 'badBoth'];
    const lvls: (TrafficLevel | null)[] = ['light', 'medium', 'busy', null];
    for (let k = 0; k < 40; k += 1) {
      const w: Weights = { prefA: next(4), prefB: next(4), light: next(3), medium: 1 + next(6), busy: 3 + next(30), unknown: next(9), marginal: next(5), noMode: 50 + next(50) };
      const p = packOf(rig, w);
      const n = 5;
      const wx = Array.from({ length: n }, () => wxs[next(wxs.length)] ?? 'ok');
      const lv = Array.from({ length: n }, () => lvls[next(lvls.length)] ?? null);
      const cur = [null, a, b][next(3)] ?? null;
      const r = run(p, rig, wx, lv, cur);
      const cellOf = (id: string, t: number) => r.evaluation.cells[p.modes.findIndex((m) => m.id === id)]?.[t];
      const pen = (l: TrafficLevel | null): number => (l === null ? w.unknown : l === 'light' ? w.light : l === 'medium' ? w.medium : w.busy);
      let best = Infinity;
      const states: (string | null)[] = [a, b, null];
      const walk = (t: number, prev: string | null, total: number): void => {
        if (t === n) {
          best = Math.min(best, total);
          return;
        }
        const anyOk = [a, b].some((id) => cellOf(id, t)?.status !== 'UNSUITABLE');
        for (const s of states) {
          let c = 0;
          if (s === null) {
            if (anyOk) continue;
            c = w.noMode;
          } else {
            const cell = cellOf(s, t);
            if (cell === undefined || cell.status === 'UNSUITABLE') continue;
            c = (s === a ? w.prefA : w.prefB) + (cell.status === 'MARGINAL' ? w.marginal : 0);
            if (prev !== null && prev !== s) c += pen(lv[t] ?? null);
          }
          walk(t + 1, s, total + c);
        }
      };
      walk(0, cur, 0);
      expect(r.plan.totalScore).toBe(best);
    }
  });
});

describe('explanations', () => {
  it('never contain the words penalty, cost, points or score', () => {
    expect(seen.length).toBeGreaterThan(50);
    expect(seen).toContain(EARLY_CHANGE_TITLE);
    expect(seen).toContain(NO_SUITABLE_TITLE);
    for (const text of seen) expect(text).not.toMatch(/penalt|cost|point|score/i);
  });
});

// The engine's public face (DESIGN section 4c, 6). evaluate() is a pure,
// deterministic function of (pack, input): no clock, no randomness, no network.
import type { AirportPack } from '../refdata/types';
import type { EngineInput, TrafficSlot } from './inputs';
import { evaluateCell, runwaysOfMode } from './eligibility';
import { makeBandFinder } from './plan';
import { runwayConditions } from './runwayCondition';
import { survivalOf } from './survival';
import { isUsableWind } from './wind';
import type { Cell, EngineResult, SlotInfo } from './types';
import { planChangeovers, type Changeover } from './changeover';
import { explain, type Explanation } from './explain';
import { optimise, type Plan } from './optimiser';

export function evaluate(pack: AirportPack, input: EngineInput): EngineResult {
  const conditions = runwayConditions(pack, input.weather);
  const findBand = makeBandFinder(pack);
  const trafficByStart = new Map<number, TrafficSlot>();
  for (const t of input.traffic) {
    if (!trafficByStart.has(t.startMs)) trafficByStart.set(t.startMs, t);
  }

  const bands = input.weather.map((slot) => findBand(slot.startMs));
  const slots: SlotInfo[] = input.weather.map((slot, i) => {
    const condition = conditions[i];
    const state = condition?.state ?? 'DRY';
    return {
      startMs: slot.startMs,
      endMs: slot.endMs,
      governedBy: slot.governedBy,
      runwayState: state,
      runwayStateCause: condition?.cause ?? 'NONE',
      uncertain: state === 'WET_POSSIBLE' || slot.governedBy === 'NONE' || !isUsableWind(slot.weather.wind),
      bandId: bands[i]?.id ?? null,
    };
  });

  const cells: Cell[][] = pack.modes.map((mode) => {
    const used = runwaysOfMode(pack, mode);
    return input.weather.map((slot, i) =>
      evaluateCell({
        pack,
        mode,
        used,
        slotIndex: i,
        slot,
        runwayState: conditions[i]?.state ?? 'DRY',
        tafState: conditions[i]?.tafState ?? null,
        band: bands[i] ?? null,
        traffic: trafficByStart.get(slot.startMs) ?? null,
      }),
    );
  });

  const survival = pack.modes.map((mode, m) => survivalOf(mode.id, cells[m] ?? [], slots));
  return { slots, cells, survival };
}

/** Everything the UI needs from one calculation (DESIGN section 6). */
export interface PlanResult {
  readonly evaluation: EngineResult;
  readonly plan: Plan;
  readonly changeovers: readonly Changeover[];
  readonly explanation: Explanation;
}

/** evaluate, then optimise, plan the changeovers and explain: one deterministic output. */
export function plan(pack: AirportPack, input: EngineInput): PlanResult {
  const evaluation = evaluate(pack, input);
  const chosen = optimise(pack, input, evaluation);
  const changeovers = planChangeovers(pack, input, evaluation, chosen);
  const explanation = explain(pack, input, evaluation, chosen, changeovers);
  return { evaluation, plan: chosen, changeovers, explanation };
}

export type * from './types';
export type * from './inputs';
export { runwayConditions } from './runwayCondition';
export { effectiveSpeedKt, runwayWind, worstInRange, withinLimit, nearLimit } from './wind';
export type * from './optimiser';
export type * from './changeover';
export type * from './explain';
export { NO_MODE } from './optimiser';
export { EARLY_CHANGE_TITLE, NO_SUITABLE_TITLE, explanationStrings } from './explain';
export { classifyTraffic, levelOfCount, trafficLevelsFor } from './trafficLevel';

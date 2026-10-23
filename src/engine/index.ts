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

export type * from './types';
export type * from './inputs';
export { runwayConditions } from './runwayCondition';
export { effectiveSpeedKt, runwayWind, worstInRange, withinLimit, nearLimit } from './wind';

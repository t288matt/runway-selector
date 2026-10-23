// Changeover planning (DESIGN section 6E, REQUIREMENTS OP-7, OP-8). Changes are
// read from the chosen plan, not searched separately. EARLY MODE CHANGE
// RECOMMENDED needs a second optimiser pass with changes forbidden before the
// failure slot. Scores are used only to compare the two plans and are kept in
// `internal`; they never reach user-facing text.
import type { AirportPack } from '../refdata/types';
import type { EngineInput, TrafficLevel } from './inputs';
import { optimiseConstrained } from './optimiser';
import type { Plan, PlanChange } from './optimiser';
import { survivalOf } from './survival';
import type { EngineResult, Reason, ReasonCode, Survival } from './types';

const MS_PER_MINUTE = 60_000;

export interface ChangeTrigger {
  /** First slot, at or after the change, in which the mode being left is UNSUITABLE. */
  readonly slotIndex: number;
  readonly startMs: number;
  readonly cause: ReasonCode | null;
  readonly reason: Reason | null;
}

export interface EarlyChange {
  /** The early change (same as the changeover's slot). */
  readonly changeSlot: number;
  readonly changeStartMs: number;
  readonly trafficAtChange: TrafficLevel;
  /** The slot at which waiting would force the change: the failure slot of the mode being left. */
  readonly forcedSlot: number;
  readonly forcedStartMs: number;
  /** Traffic at the forced time, or null when unknown. */
  readonly trafficAtForced: TrafficLevel | null;
  /** INTERNAL. Scores of the two plans. Never shown to users. */
  readonly internal: { readonly planScore: number; readonly waitingScore: number };
}

export interface Changeover {
  readonly change: PlanChange;
  /** null when the mode being left never fails in the window (a preference or stability change). */
  readonly trigger: ChangeTrigger | null;
  /** The change time minus changeoverPreparationMinutes. */
  readonly preparationStartMs: number;
  /** The preparation start is at or before the time of the calculation. */
  readonly preparationDue: boolean;
  readonly trafficLevel: TrafficLevel | null;
  /** The replacement mode. Its survival is counted from the change slot, with window slot numbers. */
  readonly replacementModeId: string;
  readonly replacementSurvival: Survival | null;
  /** Present only when EARLY MODE CHANGE RECOMMENDED applies. */
  readonly early: EarlyChange | null;
}

/** Survival of a mode counted from `fromSlot`, with slot numbers kept as window slot numbers. */
export function survivalFrom(result: EngineResult, modeIndex: number, fromSlot: number): Survival | null {
  const cells = result.cells[modeIndex];
  const mode = cells?.[0]?.modeId;
  if (cells === undefined || mode === undefined) return null;
  const s = survivalOf(mode, cells.slice(fromSlot), result.slots.slice(fromSlot));
  const shift = (n: number | null): number | null => (n === null ? null : n + fromSlot);
  return { ...s, firstMarginalSlot: shift(s.firstMarginalSlot), firstUnsuitableSlot: shift(s.firstUnsuitableSlot) };
}

export function planChangeovers(pack: AirportPack, input: EngineInput, result: EngineResult, plan: Plan): Changeover[] {
  const indexOf = (id: string): number => pack.modes.findIndex((m) => m.id === id);
  const out: Changeover[] = [];
  const prepMs = pack.settings.changeoverPreparationMinutes * MS_PER_MINUTE;

  plan.changes.forEach((change, n) => {
    const fromIndex = indexOf(change.fromModeId);
    const toIndex = indexOf(change.toModeId);
    const fromCells = result.cells[fromIndex] ?? [];

    let trigger: ChangeTrigger | null = null;
    for (let t = change.slotIndex; t < fromCells.length; t += 1) {
      const cell = fromCells[t];
      if (cell !== undefined && cell.status === 'UNSUITABLE') {
        trigger = {
          slotIndex: t,
          startMs: result.slots[t]?.startMs ?? change.startMs,
          cause: cell.cause,
          reason: cell.reasons.find((r) => r.severity === 'FAIL') ?? null,
        };
        break;
      }
    }

    let early: EarlyChange | null = null;
    if (trigger !== null && trigger.slotIndex > change.slotIndex && change.trafficLevel !== null) {
      // Where this stint in the mode being left began: after the previous change, else the start of the window.
      const stintStart = n === 0 ? 0 : (plan.changes[n - 1]?.slotIndex ?? 0) + 1;
      const waiting = optimiseConstrained(pack, input, result, { forbidChangeFrom: stintStart, forbidChangeBefore: trigger.slotIndex });
      if (waiting !== null && plan.totalScore < waiting.totalScore) {
        early = {
          changeSlot: change.slotIndex,
          changeStartMs: change.startMs,
          trafficAtChange: change.trafficLevel,
          forcedSlot: trigger.slotIndex,
          forcedStartMs: trigger.startMs,
          trafficAtForced: plan.slots[trigger.slotIndex]?.trafficLevel ?? null,
          internal: { planScore: plan.totalScore, waitingScore: waiting.totalScore },
        };
      }
    }

    const preparationStartMs = change.startMs - prepMs;
    out.push({
      change,
      trigger,
      preparationStartMs,
      preparationDue: preparationStartMs <= input.nowMs,
      trafficLevel: change.trafficLevel,
      replacementModeId: change.toModeId,
      replacementSurvival: toIndex < 0 ? null : survivalFrom(result, toIndex, change.slotIndex),
      early,
    });
  });
  return out;
}

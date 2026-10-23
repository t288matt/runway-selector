// Survival per mode from slot 0 (REQUIREMENTS OP-3; DESIGN section 6C).
// Continuous viable duration stops at the first UNSUITABLE slot. UNKNOWN slots
// are counted as viable and marked uncertain; they are not failures. The
// replacement mode comes in a later step.
import type { Cell, Survival } from './types';

export function survivalOf(modeId: string, cells: readonly Cell[], slotLengthsMs: readonly { startMs: number; endMs: number }[]): Survival {
  let viableSlots = 0;
  let viableMs = 0;
  let unknownSlots = 0;
  let uncertainSlots = 0;
  let firstMarginalSlot: number | null = null;
  let firstUnsuitableSlot: number | null = null;
  let firstUnsuitableReason: Cell['reasons'][number] | null = null;
  let firstUnsuitableCause: Survival['firstUnsuitableCause'] = null;
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const span = slotLengthsMs[i];
    if (cell === undefined || span === undefined) break;
    if (cell.status === 'UNSUITABLE') {
      firstUnsuitableSlot = i;
      firstUnsuitableCause = cell.cause;
      firstUnsuitableReason = cell.reasons.find((r) => r.severity === 'FAIL') ?? null;
      break;
    }
    if (cell.status === 'MARGINAL' && firstMarginalSlot === null) firstMarginalSlot = i;
    if (cell.status === 'UNKNOWN') unknownSlots += 1;
    if (cell.uncertain) uncertainSlots += 1;
    viableSlots += 1;
    viableMs += span.endMs - span.startMs;
  }
  const last = slotLengthsMs[slotLengthsMs.length - 1];
  const failing = firstUnsuitableSlot === null ? undefined : slotLengthsMs[firstUnsuitableSlot];
  return {
    modeId,
    viableSlots,
    viableMs,
    viableUntilMs: failing !== undefined ? failing.startMs : last === undefined ? null : last.endMs,
    endsInFailure: firstUnsuitableSlot !== null,
    firstMarginalSlot,
    firstUnsuitableSlot,
    firstUnsuitableCause,
    firstUnsuitableReason,
    unknownSlots,
    uncertainSlots,
  };
}

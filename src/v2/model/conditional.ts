// The conditional-operation note (OD-79), shared by the answer band and the Why section of the drawer.
// Pure: plain data from one view. The note's name comes from the pack; no airport fact is written here.
import { conditionalOperationCheck } from '../../engine';
import { hhmmZRel } from '../format';
import type { ViewData } from './dashboard';

export interface WhyBanner {
  readonly tone: 'red' | 'amber' | 'ok';
  readonly title: string;
  readonly text: string;
}

/**
 * The conditional-operation note: "<name> conditions met" for the recommended mode, when it has a conditional operation,
 * along the recommended path, on slots where its cell is SUITABLE and the check is MET. "until HH:MMZ" when the first
 * slot qualifies, "from HH:MMZ" when only a later one does, else none. Advisory only.
 */
export function conditionalBanner(view: ViewData, modeIndex: number): WhyBanner | null {
  const op = view.pack.modes[modeIndex]?.conditionalOperation ?? null;
  const recId = view.result.plan.recommendedModeId;
  if (op === null || recId === null) return null;
  const { evaluation, plan } = view.result;
  const qualifies = (i: number): boolean => {
    const slot = view.weather.slots[i];
    return slot !== undefined && plan.slots[i]?.modeId === recId && evaluation.cells[modeIndex]?.[i]?.status === 'SUITABLE' && conditionalOperationCheck(op, slot, evaluation.slots[i]?.runwayState ?? 'DRY') === 'MET';
  };
  const count = Math.min(plan.slots.length, view.weather.slots.length);
  const title = `${op.name} conditions met`;
  if (count > 0 && qualifies(0)) {
    let last = 0;
    while (last + 1 < count && qualifies(last + 1)) last += 1;
    return { tone: 'ok', title, text: `until ${hhmmZRel(view.weather.slots[last]?.endMs ?? 0, view.calcNowMs)}` };
  }
  for (let i = 1; i < count; i += 1) if (qualifies(i)) return { tone: 'ok', title, text: `from ${hhmmZRel(view.weather.slots[i]?.startMs ?? 0, view.calcNowMs)}` };
  return null;
}


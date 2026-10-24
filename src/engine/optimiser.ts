// Sequence optimiser (DESIGN section 6D, REQUIREMENTS OP-1, OP-5, OP-6, OP-13,
// OD-17, OD-18). Dynamic programming over (slot, mode) that minimises the
// total score of the plan. Hard rules are never scored: an UNSUITABLE cell is
// forbidden. All weights come from the pack. Pure and deterministic.
//
// Scores are internal. They are returned for the second pass in changeover.ts
// and for tests, and must never reach end-user text.
import type { AirportPack } from '../refdata/types';
import type { EngineInput, TrafficLevel } from './inputs';
import { trafficLevelsFor } from './trafficLevel';
import type { Cell, EngineResult, Status } from './types';

/** The chosen mode of a slot in which every mode is UNSUITABLE. */
export const NO_MODE = null;
export type ChosenMode = string | typeof NO_MODE;

export type NoRecommendation =
  /** The weather for slot 0 is unknown (OP-13). */
  | 'WEATHER_UNKNOWN'
  /** Every mode is UNSUITABLE in slot 0 (OD-13). */
  | 'NO_SUITABLE_MODE'
  /** The window has no slots. */
  | 'NO_SLOTS';

export interface PlanSlot {
  readonly slotIndex: number;
  readonly startMs: number;
  /** The chosen mode id, or NO_MODE (null). */
  readonly modeId: ChosenMode;
  /** Status of the chosen cell, or null for NO_MODE. */
  readonly status: Status | null;
  /** Traffic level of the slot, or null when unknown. */
  readonly trafficLevel: TrafficLevel | null;
  /** The chosen cell is UNKNOWN or uncertain (for NO_MODE: the slot weather is uncertain). */
  readonly uncertain: boolean;
}

/** A change between two real modes, including leaving the current mode in slot 0. */
export interface PlanChange {
  readonly slotIndex: number;
  readonly startMs: number;
  readonly fromModeId: string;
  readonly toModeId: string;
  /** Traffic level of the slot in which the new mode starts. */
  readonly trafficLevel: TrafficLevel | null;
}

/**
 * A run of NO_MODE slots. startSlot and endSlot are inclusive window slot numbers. `afterMode` is the mode
 * in force before the gap (null at the start of the window); `beforeMode` is the mode that follows it
 * (null when the gap runs to the end of the window).
 */
export interface PlanGap {
  readonly startSlot: number;
  readonly endSlot: number;
  readonly startMs: number;
  /** The end of the last NO_MODE slot. */
  readonly endMs: number;
  readonly afterMode: string | null;
  readonly beforeMode: string | null;
}

export interface Plan {
  readonly slots: readonly PlanSlot[];
  readonly changes: readonly PlanChange[];
  /** Runs of slots with no suitable mode. A change across a gap is not listed in `changes`. */
  readonly gaps: readonly PlanGap[];
  /** The starting mode that was used (the current mode, if it is known and enabled), else null. */
  readonly startModeId: string | null;
  /** INTERNAL. Total of preference, marginal, change and no-mode scores. Never shown to users. */
  readonly totalScore: number;
  /** INTERNAL. The preference part of totalScore (the first tie-break). */
  readonly preferenceScore: number;
  /** Number of slots on the chosen path that are UNKNOWN or uncertain (DB-2). */
  readonly uncertainSlots: number;
  /** The plan runs through at least one uncertain slot (OP-13). */
  readonly uncertain: boolean;
  /** The recommended mode for now (slot 0), or null when there is none. */
  readonly recommendedModeId: string | null;
  /** Why there is no recommendation, or null when there is one. */
  readonly noRecommendation: NoRecommendation | null;
}

export interface OptimiserOptions {
  /**
   * Forbid a change of mode when entering any slot t with forbidChangeFrom <= t < forbidChangeBefore.
   * Used by the second pass that finds the best plan that waits (DESIGN 6E). Moves into or out of
   * NO_MODE are never forbidden: they are forced by the cells.
   */
  readonly forbidChangeFrom?: number;
  readonly forbidChangeBefore?: number;
}

/** The preference penalty of a mode in a band: its plan row, else the pack default. */
export function preferencePenalty(pack: AirportPack, bandId: string | null, modeId: string): number {
  if (bandId !== null) {
    const band = pack.plan.find((b) => b.id === bandId);
    const row = band?.rows.find((r) => r.mode === modeId);
    if (row !== undefined) return row.penalty;
  }
  return pack.settings.preferenceDefaultPenalty;
}

export function changePenaltyFor(pack: AirportPack, level: TrafficLevel | null): number {
  const s = pack.settings;
  if (level === null) return s.unknownDemandChangePenalty;
  if (level === 'light') return s.changePenaltyLight;
  if (level === 'medium') return s.changePenaltyMedium;
  return s.changePenaltyBusy;
}

/** The starting mode index: the current mode when it is an enabled mode of the pack, else -1. */
export function startModeIndex(pack: AirportPack, currentMode: string | null): number {
  if (currentMode === null) return -1;
  return pack.modes.findIndex((m) => m.id === currentMode && m.enabled);
}

const NONE = -1;

interface Pair {
  readonly total: number;
  readonly pref: number;
}
const INF: Pair = { total: Number.POSITIVE_INFINITY, pref: Number.POSITIVE_INFINITY };
const add = (a: Pair, b: Pair): Pair => ({ total: a.total + b.total, pref: a.pref + b.pref });
/** Lower total first, then lower preference total. */
const less = (a: Pair, b: Pair): boolean => a.total < b.total || (a.total === b.total && a.pref < b.pref);

/** The plan, or null when the options make it impossible. Without options it always exists. */
export function optimiseConstrained(pack: AirportPack, input: EngineInput, result: EngineResult, options: OptimiserOptions = {}): Plan | null {
  const slotCount = result.slots.length;
  const modeCount = pack.modes.length;
  const noModeState = modeCount;
  const startIndex = startModeIndex(pack, input.currentMode);
  const levels = trafficLevelsFor(
    pack,
    result.slots.map((s) => s.startMs),
    input.traffic,
  );
  const forbidFrom = options.forbidChangeFrom ?? 0;
  const forbidBefore = options.forbidChangeBefore ?? 0;

  const cellAt = (mode: number, t: number): Cell | undefined => result.cells[mode]?.[t];

  /** Own score of state s in slot t, or INF when the state is not allowed there. */
  const own = (t: number, s: number): Pair => {
    if (s === noModeState) {
      for (let m = 0; m < modeCount; m += 1) {
        const c = cellAt(m, t);
        if (c !== undefined && c.status !== 'UNSUITABLE') return INF;
      }
      return { total: pack.settings.noModePenalty, pref: 0 };
    }
    const mode = pack.modes[s];
    const cell = cellAt(s, t);
    if (mode === undefined || cell === undefined || !mode.enabled || cell.status === 'UNSUITABLE') return INF;
    const pref = preferencePenalty(pack, cell.bandId, mode.id);
    return { total: pref + (cell.status === 'MARGINAL' ? pack.settings.marginalPenalty : 0), pref };
  };

  /** Change score for entering slot t in state cur from state prev (NONE = no starting mode). */
  const move = (t: number, prev: number, cur: number): Pair => {
    if (prev === cur || prev === NONE || prev === noModeState || cur === noModeState) return { total: 0, pref: 0 };
    if (t >= forbidFrom && t < forbidBefore) return INF;
    return { total: changePenaltyFor(pack, levels[t] ?? null), pref: 0 };
  };

  if (slotCount === 0) {
    return emptyPlan(startIndex < 0 ? null : (pack.modes[startIndex]?.id ?? null));
  }

  const stateCount = modeCount + 1;

  // Minimum stay (owner, 24-10-2026, OD-74). A run of slots in one mode shorter than minimumStayMinutes costs
  // shortStayPenalty when it ends in a change to another mode. The run's length is counted in minutes and capped at
  // the minimum, so the state is small. Slot 0 counts only the time left in it. The mode in use now, and the last
  // run in the window, are never penalised; a move into or out of NO_MODE is forced by the cells and not penalised.
  const stayCap = pack.settings.minimumStayMinutes;
  const stayPenalty = stayCap > 0 ? pack.settings.shortStayPenalty : 0;
  const slotMinutes = (t: number): number => {
    const info = result.slots[t];
    if (info === undefined) return 30;
    const full = (info.endMs - info.startMs) / 60000;
    return t === 0 ? Math.max(1, Math.min(full, Math.ceil((info.endMs - input.nowMs) / 60000))) : full;
  };
  const stayLevels: number[] = [];
  for (const base of new Set([slotMinutes(0), slotMinutes(1), 30])) {
    for (let m = base; ; m += 30) {
      const c = Math.min(m, stayCap);
      if (!stayLevels.includes(c)) stayLevels.push(c);
      if (c >= stayCap) break;
    }
  }
  if (!stayLevels.includes(stayCap)) stayLevels.push(stayCap);
  const levelOf = (minutes: number): number => stayLevels.indexOf(Math.min(minutes, stayCap));
  const levelCount = stayLevels.length;
  const capLevel = levelOf(stayCap);
  /** The run level after one more slot t in the same mode. */
  const extend = (r: number, t: number): number => levelOf((stayLevels[r] ?? stayCap) + slotMinutes(t));
  /** The cost of leaving state s, after a run at level r, for state n. */
  const leave = (r: number, s: number, n: number): number => (s === n || s === noModeState || n === noModeState || r === capLevel ? 0 : stayPenalty);

  // value[t][s][r]: best score of slots t to the end when slot t is in state s with its run at level r (own score of slot t included).
  const value: Pair[][][] = Array.from({ length: slotCount }, () => Array.from({ length: stateCount }, () => Array.from({ length: levelCount }, () => INF)));
  for (let t = slotCount - 1; t >= 0; t -= 1) {
    for (let s = 0; s < stateCount; s += 1) {
      const o = own(t, s);
      if (o.total === Number.POSITIVE_INFINITY) continue;
      for (let r = 0; r < levelCount; r += 1) {
        const row = value[t]?.[s];
        if (row === undefined) continue;
        if (t === slotCount - 1) {
          row[r] = o;
          continue;
        }
        let best = INF;
        for (let n = 0; n < stateCount; n += 1) {
          const nr = n === s ? extend(r, t + 1) : levelOf(slotMinutes(t + 1));
          const cand = add(add(move(t + 1, s, n), { total: leave(r, s, n), pref: 0 }), value[t + 1]?.[n]?.[nr] ?? INF);
          if (less(cand, best)) best = cand;
        }
        row[r] = best.total === Number.POSITIVE_INFINITY ? INF : add(o, best);
      }
    }
  }

  // Forward pass: the lowest-index state among the equal best, so ties go to the mode first in the pack.
  const path: number[] = [];
  let prev = startIndex < 0 ? NONE : startIndex;
  let prevLevel = capLevel;
  let totals: Pair = { total: 0, pref: 0 };
  for (let t = 0; t < slotCount; t += 1) {
    let bestState = -2;
    let bestLevel = capLevel;
    let best = INF;
    for (let s = 0; s < stateCount; s += 1) {
      const r = s === prev ? (t === 0 ? capLevel : extend(prevLevel, t)) : levelOf(slotMinutes(t));
      const cand = add(add(move(t, prev, s), { total: prev === NONE ? 0 : leave(prevLevel, prev, s), pref: 0 }), value[t]?.[s]?.[r] ?? INF);
      if (less(cand, best)) {
        best = cand;
        bestState = s;
        bestLevel = r;
      }
    }
    if (bestState < 0) return null;
    if (t === 0) totals = best;
    path.push(bestState);
    prev = bestState;
    prevLevel = bestLevel;
  }
  return buildPlan(pack, result, levels, path, startIndex, totals);
}

/** The best plan with no extra rules. Always exists, because NO_MODE covers a slot where nothing fits. */
export function optimise(pack: AirportPack, input: EngineInput, result: EngineResult): Plan {
  const plan = optimiseConstrained(pack, input, result);
  return plan ?? emptyPlan(null);
}

function emptyPlan(startModeId: string | null): Plan {
  return {
    slots: [],
    changes: [],
    gaps: [],
    startModeId,
    totalScore: 0,
    preferenceScore: 0,
    uncertainSlots: 0,
    uncertain: false,
    recommendedModeId: null,
    noRecommendation: 'NO_SLOTS',
  };
}

function buildPlan(
  pack: AirportPack,
  result: EngineResult,
  levels: readonly (TrafficLevel | null)[],
  path: readonly number[],
  startIndex: number,
  totals: Pair,
): Plan {
  const modeCount = pack.modes.length;
  const slots: PlanSlot[] = [];
  const changes: PlanChange[] = [];
  let uncertainSlots = 0;
  let previousModeId: string | null = startIndex < 0 ? null : (pack.modes[startIndex]?.id ?? null);

  path.forEach((state, t) => {
    const info = result.slots[t];
    if (info === undefined) return;
    const level = levels[t] ?? null;
    if (state === modeCount) {
      const uncertain = info.uncertain;
      if (uncertain) uncertainSlots += 1;
      slots.push({ slotIndex: t, startMs: info.startMs, modeId: NO_MODE, status: null, trafficLevel: level, uncertain });
      previousModeId = null;
      return;
    }
    const mode = pack.modes[state];
    const cell = result.cells[state]?.[t];
    if (mode === undefined || cell === undefined) return;
    const uncertain = cell.status === 'UNKNOWN' || cell.uncertain;
    if (uncertain) uncertainSlots += 1;
    if (previousModeId !== null && previousModeId !== mode.id) {
      changes.push({ slotIndex: t, startMs: info.startMs, fromModeId: previousModeId, toModeId: mode.id, trafficLevel: level });
    }
    slots.push({ slotIndex: t, startMs: info.startMs, modeId: mode.id, status: cell.status, trafficLevel: level, uncertain });
    previousModeId = mode.id;
  });

  const gaps: PlanGap[] = [];
  slots.forEach((slot, t) => {
    if (slot.modeId !== NO_MODE) return;
    const previous = slots[t - 1];
    const last = gaps[gaps.length - 1];
    const endMs = result.slots[t]?.endMs ?? slot.startMs;
    if (previous !== undefined && previous.modeId === NO_MODE && last !== undefined) {
      gaps[gaps.length - 1] = { ...last, endSlot: t, endMs };
      return;
    }
    gaps.push({ startSlot: t, endSlot: t, startMs: slot.startMs, endMs, afterMode: previous?.modeId ?? null, beforeMode: null });
  });
  for (let g = 0; g < gaps.length; g += 1) {
    const gap = gaps[g];
    if (gap !== undefined) gaps[g] = { ...gap, beforeMode: slots[gap.endSlot + 1]?.modeId ?? null };
  }

  const first = slots[0];
  const weatherUnknown = isWeatherUnknownNow(pack, result);
  let recommendedModeId: string | null = null;
  let noRecommendation: NoRecommendation | null = null;
  if (weatherUnknown) noRecommendation = 'WEATHER_UNKNOWN';
  else if (first === undefined || first.modeId === NO_MODE) noRecommendation = 'NO_SUITABLE_MODE';
  else recommendedModeId = first.modeId;

  return {
    slots,
    changes,
    gaps,
    startModeId: startIndex < 0 ? null : (pack.modes[startIndex]?.id ?? null),
    totalScore: totals.total,
    preferenceScore: totals.pref,
    uncertainSlots,
    uncertain: uncertainSlots > 0,
    recommendedModeId,
    noRecommendation,
  };
}

/**
 * The weather for slot 0 is unknown (OP-13): every enabled mode's slot-0 cell reports that no wind is available.
 * This is read from the NO_WIND reason, which is kept even when a plan rule also forbids the mode, so a curfew
 * that forbids some modes does not hide missing weather. With known weather and every mode UNSUITABLE the answer
 * is NO_SUITABLE_MODE instead.
 */
export function isWeatherUnknownNow(pack: AirportPack, result: EngineResult): boolean {
  let enabled = 0;
  for (let m = 0; m < pack.modes.length; m += 1) {
    if (pack.modes[m]?.enabled !== true) continue;
    enabled += 1;
    const cell = result.cells[m]?.[0];
    if (cell === undefined || !cell.reasons.some((r) => r.code === 'NO_WIND')) return false;
  }
  return enabled > 0;
}

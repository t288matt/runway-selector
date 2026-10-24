// Plain-language explanations by template (DESIGN section 6, "Explanations";
// REQUIREMENTS OP-10, OP-11, OD-13, DB-2). Text is built only from stored cell
// reasons, the plan and the changeovers, so it always matches the numbers.
// End users never see the internal scores: no template names them and the
// tests scan every string for the banned words. British English. Times are
// UTC. Airport wording is never written here; mode ids come from the pack.
import type { AirportPack } from '../refdata/types';
import type { EngineInput, TrafficLevel } from './inputs';
import type { Changeover } from './changeover';
import { preferencePenalty } from './optimiser';
import type { NoRecommendation, Plan } from './optimiser';
import type { Cell, EngineResult, Reason, ReasonCode, Survival } from './types';

export const EARLY_CHANGE_TITLE = 'EARLY MODE CHANGE RECOMMENDED';
export const NO_SUITABLE_TITLE = 'NO SUITABLE STANDARD MODE IDENTIFIED';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export interface EarlyChangeBanner {
  readonly title: string;
  readonly text: string;
  readonly changeStartMs: number;
  readonly forcedStartMs: number;
  readonly trafficAtChange: TrafficLevel;
  readonly trafficAtForced: TrafficLevel | null;
}

export interface BlockedMode {
  readonly modeId: string;
  readonly cause: ReasonCode | null;
  /** The blocking cause in words. */
  readonly text: string;
  /** When the mode is next not blocked inside the window, or null. */
  readonly availableFromMs: number | null;
  /** What would restore the mode, in words (OP-11). */
  readonly restoreText: string;
}

export interface NoSuitableMode {
  readonly title: string;
  readonly perMode: readonly BlockedMode[];
}

export interface Explanation {
  /** One-line answer: the recommended mode, or why there is none. */
  readonly headline: string;
  /** Why this mode, why it lasts, next change, why not the top preference. Empty when there is no recommendation. */
  readonly lines: readonly string[];
  readonly earlyChange: EarlyChangeBanner | null;
  readonly noSuitableMode: NoSuitableMode | null;
  /** 'No uncertain inputs' or 'Based on N uncertain slots' (DB-2). */
  readonly uncertaintyLine: string;
  /** Rank of the recommended mode in the operating plan for slot 0 (1 is the top preference), or null. */
  readonly operatingPlanRank: number | null;
}

/** Every user-facing string of an explanation, for scans and tests. */
export function explanationStrings(e: Explanation): string[] {
  const out: string[] = [e.headline, ...e.lines, e.uncertaintyLine];
  if (e.earlyChange !== null) out.push(e.earlyChange.title, e.earlyChange.text);
  if (e.noSuitableMode !== null) {
    out.push(e.noSuitableMode.title);
    for (const m of e.noSuitableMode.perMode) out.push(m.text, m.restoreText);
  }
  return out;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "HH:MM UTC", with "(+1 day)" when the instant is on a later UTC day than `nowMs`. */
export function formatTime(ms: number, nowMs: number): string {
  const minuteOfDay = Math.floor((((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_MINUTE);
  const text = `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)} UTC`;
  const days = Math.floor(ms / MS_PER_DAY) - Math.floor(nowMs / MS_PER_DAY);
  if (days <= 0) return text;
  return days === 1 ? `${text} (+1 day)` : `${text} (+${days} days)`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MS_PER_MINUTE);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(h === 1 ? '1 hour' : `${h} hours`);
  if (m > 0) parts.push(m === 1 ? '1 minute' : `${m} minutes`);
  return parts.length === 0 ? '0 minutes' : parts.join(' ');
}

function trafficWords(level: TrafficLevel | null): string {
  return level === null ? 'traffic is not known' : `${level} traffic`;
}

function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

function uncertaintyLineFor(count: number): string {
  if (count === 0) return 'No uncertain inputs';
  return count === 1 ? 'Based on 1 uncertain slot' : `Based on ${count} uncertain slots`;
}

function whyThisMode(pack: AirportPack, modeId: string, cell: Cell): string {
  if (cell.status === 'MARGINAL') {
    const reason = cell.reasons.find((r) => r.severity === 'MARGINAL');
    return `${modeId} passes every limit now, with a caution. ${reason === undefined ? 'It relies on an uncertain input.' : sentence(reason.text)}`;
  }
  if (cell.status === 'UNKNOWN') {
    return `${modeId} is planned through, but the weather for this period is not known.`;
  }
  if (cell.runways.length === 0) return `${modeId} meets every limit.`;
  const state = cell.runwayState;
  const tail = Math.max(...cell.runways.map((r) => r.tailwindKt));
  const cross = Math.max(...cell.runways.map((r) => r.crosswindKt));
  const first = cell.runways[0];
  const tailLimit =
    first === undefined ? 0 : state === 'DRY' ? first.tailwindLimitDryKt : state === 'WET' ? first.tailwindLimitWetKt : Math.min(first.tailwindLimitDryKt, first.tailwindLimitWetKt);
  const crossLimit = first?.crosswindLimitKt ?? pack.settings.defaultCrosswindKt;
  const runwayWord = state === 'DRY' ? 'dry' : state === 'WET' ? 'wet' : 'possibly wet';
  // Whole knots (owner decision 24-10-2026, amending WC-3); the numbers above keep full precision.
  const r1 = (n: number): string => Math.round(n).toString();
  return `${modeId} meets every limit on the runways it uses (${runwayWord} runway): tailwind up to ${r1(tail)} kt against a limit of ${r1(tailLimit)} kt, crosswind up to ${r1(cross)} kt against a limit of ${r1(crossLimit)} kt.`;
}

function whyItLasts(modeId: string, survival: Survival | undefined, nowMs: number): string {
  if (survival === undefined) return `${modeId} is expected to stay in use.`;
  if (!survival.endsInFailure) {
    const until = survival.viableUntilMs;
    return `${modeId} is expected to stay suitable for the whole forecast window${until === null ? '' : `, to ${formatTime(until, nowMs)}`}.`;
  }
  const cause = survival.firstUnsuitableReason;
  const at = survival.viableUntilMs;
  return `${modeId} is expected to stay suitable for ${formatDuration(survival.viableMs)}${at === null ? '' : `, until ${formatTime(at, nowMs)}`}${cause === null ? '' : `, when ${lowerFirst(cause.text)}`}.`;
}

function lowerFirst(text: string): string {
  const first = text.charAt(0);
  return first.toLowerCase() + text.slice(1);
}

function nextChangeLine(c: Changeover | undefined, nowMs: number): string {
  if (c === undefined) return 'No mode change is planned in the forecast window.';
  const when = formatTime(c.change.startMs, nowMs);
  const traffic = trafficWords(c.trafficLevel);
  const prep = c.preparationDue ? 'Preparation should start now.' : `Preparation should start at ${formatTime(c.preparationStartMs, nowMs)}.`;
  const after = c.replacementSurvival === null ? '' : ` ${c.replacementModeId} is then expected to stay suitable ${c.replacementSurvival.endsInFailure ? `for ${formatDuration(c.replacementSurvival.viableMs)}` : 'for the rest of the forecast window'}.`;
  if (c.trigger === null) {
    return `Next change: to ${c.change.toModeId} at ${when}, with ${traffic}, because the operating plan prefers it from then. ${c.change.fromModeId} stays suitable. ${prep}${after}`;
  }
  const trigger = c.trigger;
  const why = trigger.reason === null ? `${c.change.fromModeId} would no longer be suitable` : `${c.change.fromModeId} would no longer be suitable: ${lowerFirst(trigger.reason.text)}`;
  if (trigger.slotIndex === c.change.slotIndex) {
    return `Next change: to ${c.change.toModeId} at ${when}, with ${traffic}, because ${why}. ${prep}${after}`;
  }
  return `Next change: to ${c.change.toModeId} at ${when}, with ${traffic}, ahead of ${formatTime(trigger.startMs, nowMs)} when ${why}. ${prep}${after}`;
}

function gapLines(plan: Plan, nowMs: number): string[] {
  return plan.gaps.map((g) => {
    const head = `No suitable mode from ${formatTime(g.startMs, nowMs)} to ${formatTime(g.endMs, nowMs)}`;
    return g.beforeMode === null
      ? `${head}; no mode is expected to be suitable again within the forecast window.`
      : `${head}; recommended again: ${g.beforeMode} from ${formatTime(g.endMs, nowMs)}.`;
  });
}

/** The line for a change that starts in slot 0: said once, as "Change now". */
function changeNowLine(c: Changeover, nowMs: number): string {
  const traffic = trafficWords(c.trafficLevel);
  const prep = 'Preparation should start now.';
  const after = c.replacementSurvival === null ? '' : ` ${c.replacementModeId} is then expected to stay suitable ${c.replacementSurvival.endsInFailure ? `for ${formatDuration(c.replacementSurvival.viableMs)}` : 'for the rest of the forecast window'}.`;
  const from = c.change.fromModeId;
  let why: string;
  if (c.trigger === null) why = `the operating plan prefers it, and ${from} stays suitable`;
  else if (c.trigger.slotIndex === c.change.slotIndex) why = `${from} is no longer suitable${c.trigger.reason === null ? '' : `: ${lowerFirst(c.trigger.reason.text)}`}`;
  else why = `${from} would no longer be suitable from ${formatTime(c.trigger.startMs, nowMs)}${c.trigger.reason === null ? '' : `: ${lowerFirst(c.trigger.reason.text)}`}`;
  return `Change now to ${c.change.toModeId}, with ${traffic}, because ${why}. ${prep}${after}`;
}

/** Index and penalty of the operating plan's top immediate preference among the modes allowed in slot 0. */
function topPreference(pack: AirportPack, result: EngineResult): { index: number; penalty: number } | null {
  let best: { index: number; penalty: number } | null = null;
  pack.modes.forEach((mode, m) => {
    const cell = result.cells[m]?.[0];
    if (!mode.enabled || cell === undefined) return;
    if (cell.reasons.some((r) => r.code === 'PLAN' && r.severity === 'FAIL')) return;
    const penalty = preferencePenalty(pack, cell.bandId, mode.id);
    if (best === null || penalty < best.penalty) best = { index: m, penalty };
  });
  return best;
}

function rankOf(pack: AirportPack, result: EngineResult, modeId: string): number | null {
  const m = pack.modes.findIndex((x) => x.id === modeId);
  const cell = result.cells[m]?.[0];
  if (cell === undefined) return null;
  const own = preferencePenalty(pack, cell.bandId, modeId);
  let better = 0;
  pack.modes.forEach((mode, k) => {
    const c = result.cells[k]?.[0];
    if (!mode.enabled || c === undefined || k === m) return;
    if (c.reasons.some((r) => r.code === 'PLAN' && r.severity === 'FAIL')) return;
    if (preferencePenalty(pack, c.bandId, mode.id) < own) better += 1;
  });
  return better + 1;
}

function whyNotTop(pack: AirportPack, result: EngineResult, plan: Plan, chosen: string, nowMs: number): string | null {
  const top = topPreference(pack, result);
  if (top === null) return null;
  const chosenIndex = pack.modes.findIndex((m) => m.id === chosen);
  const chosenCell = result.cells[chosenIndex]?.[0];
  if (chosenCell === undefined) return null;
  if (preferencePenalty(pack, chosenCell.bandId, chosen) <= top.penalty) return null;
  const topMode = pack.modes[top.index];
  const topCell = result.cells[top.index]?.[0];
  if (topMode === undefined || topCell === undefined) return null;
  const prefix = `${topMode.id} is the operating plan's first preference now, but ${chosen} is recommended`;
  if (topCell.status === 'UNSUITABLE') {
    const reason: Reason | undefined = topCell.reasons.find((r) => r.severity === 'FAIL');
    return `${prefix} because ${topMode.id} is not suitable: ${reason === undefined ? 'it fails a mandatory rule' : lowerFirst(reason.text)}.`;
  }
  const topSurvival = result.survival[top.index];
  const chosenSurvival = result.survival[chosenIndex];
  if (topSurvival !== undefined && chosenSurvival !== undefined && topSurvival.endsInFailure && topSurvival.viableMs < chosenSurvival.viableMs) {
    const reason = topSurvival.firstUnsuitableReason;
    return `${prefix} because ${topMode.id} would stay suitable only for ${formatDuration(topSurvival.viableMs)}, until ${formatTime(topSurvival.viableUntilMs ?? 0, nowMs)}${reason === null ? '' : `, when ${lowerFirst(reason.text)}`}, whereas ${chosen} lasts longer.`;
  }
  if (topCell.status === 'MARGINAL' && chosenCell.status === 'SUITABLE') {
    return `${prefix} because ${topMode.id} relies on an uncertain input and ${chosen} does not.`;
  }
  if (plan.startModeId === chosen) {
    const level = plan.slots[0]?.trafficLevel ?? null;
    return `${prefix} because you are in ${chosen} now, and a change to ${topMode.id} would disturb ${level === null ? 'traffic' : `${level} traffic`} without a lasting gain.`;
  }
  return `${prefix} because it gives a steadier sequence of modes over the forecast window.`;
}

function blockedModes(pack: AirportPack, result: EngineResult, nowMs: number): BlockedMode[] {
  const out: BlockedMode[] = [];
  pack.modes.forEach((mode, m) => {
    if (!mode.enabled) return;
    const cells = result.cells[m] ?? [];
    const first = cells[0];
    if (first === undefined) return;
    const reason = first.reasons.find((r) => r.severity === 'FAIL');
    let availableFromMs: number | null = null;
    for (let t = 1; t < cells.length; t += 1) {
      if (cells[t]?.status !== 'UNSUITABLE') {
        availableFromMs = result.slots[t]?.startMs ?? null;
        break;
      }
    }
    const text = reason === undefined ? `${mode.id} is not available` : sentence(`${mode.id}: ${reason.text}`);
    const restoreText =
      availableFromMs === null ? `${mode.id} is not expected to become suitable within the forecast window.` : `${mode.id} is expected to become suitable again from ${formatTime(availableFromMs, nowMs)}.`;
    out.push({ modeId: mode.id, cause: first.cause, text, availableFromMs, restoreText });
  });
  return out;
}

function noRecommendationHeadline(why: NoRecommendation): string {
  if (why === 'WEATHER_UNKNOWN') return 'No mode is recommended because the weather for the current period is not known.';
  if (why === 'NO_SLOTS') return 'No mode is recommended because there is no forecast window to plan.';
  return NO_SUITABLE_TITLE;
}

export function explain(pack: AirportPack, input: EngineInput, result: EngineResult, plan: Plan, changeovers: readonly Changeover[]): Explanation {
  const nowMs = input.nowMs;
  const uncertaintyLine = uncertaintyLineFor(plan.uncertainSlots);
  const early = changeovers.find((c) => c.early !== null);

  const earlyChange: EarlyChangeBanner | null =
    early === undefined || early.early === null || early.trigger === null
      ? null
      : {
          title: EARLY_CHANGE_TITLE,
          text: `Change to ${early.change.toModeId} at ${formatTime(early.early.changeStartMs, nowMs)} (${trafficWords(early.early.trafficAtChange)}) rather than wait until ${formatTime(early.early.forcedStartMs, nowMs)} (${trafficWords(early.early.trafficAtForced)}), when ${early.change.fromModeId} would no longer be suitable${early.trigger.reason === null ? '' : `: ${lowerFirst(early.trigger.reason.text)}`}. Preparation ${early.preparationDue ? 'should start now' : `should start at ${formatTime(early.preparationStartMs, nowMs)}`}.`,
          changeStartMs: early.early.changeStartMs,
          forcedStartMs: early.early.forcedStartMs,
          trafficAtChange: early.early.trafficAtChange,
          trafficAtForced: early.early.trafficAtForced,
        };

  if (plan.recommendedModeId === null) {
    const why = plan.noRecommendation ?? 'NO_SUITABLE_MODE';
    const noSuitableMode: NoSuitableMode | null = why === 'NO_SUITABLE_MODE' ? { title: NO_SUITABLE_TITLE, perMode: blockedModes(pack, result, nowMs) } : null;
    return {
      headline: noRecommendationHeadline(why),
      lines: why === 'NO_SUITABLE_MODE' ? gapLines(plan, nowMs) : [],
      earlyChange: null,
      noSuitableMode,
      uncertaintyLine,
      operatingPlanRank: null,
    };
  }

  const modeId = plan.recommendedModeId;
  const modeIndex = pack.modes.findIndex((m) => m.id === modeId);
  const cell = result.cells[modeIndex]?.[0];
  const lines: string[] = [];
  const nowChange = changeovers[0]?.change.slotIndex === 0 ? changeovers[0] : undefined;
  if (cell !== undefined) lines.push(whyThisMode(pack, modeId, cell));
  lines.push(whyItLasts(modeId, result.survival[modeIndex], nowMs));
  if (nowChange !== undefined) lines.push(changeNowLine(nowChange, nowMs));
  const upcoming = nowChange === undefined ? changeovers[0] : changeovers[1];
  const gaps = gapLines(plan, nowMs);
  if (upcoming !== undefined || gaps.length === 0) lines.push(nextChangeLine(upcoming, nowMs));
  lines.push(...gaps);
  const notTop = whyNotTop(pack, result, plan, modeId, nowMs);
  if (notTop !== null) lines.push(notTop);

  return {
    headline: nowChange === undefined ? `Recommended mode now: ${modeId}.` : `Change now to ${modeId}.`,
    lines,
    earlyChange,
    noSuitableMode: null,
    uncertaintyLine,
    operatingPlanRank: rankOf(pack, result, modeId),
  };
}

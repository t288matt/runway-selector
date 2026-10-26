// The answer band of the v2 screen: the state (a glyph AND a word), the mode,
// and the next change. Pure: plain data from one view.
// Wording about the recommendation comes from the engine's explanation or from
// the pack; no airport fact is written here.
//
// PROVISIONAL STATE RULE (owner, 25-10-2026; issue 96 refines it later). It uses
// v1's own conditions and no time threshold of its own:
//   CHANGE NOW   when v1 would show the red banner "CURRENT MODE UNSUITABLE"
//                (the mode the operator is on fails a mandatory rule now);
//   CHANGE SOON  when v1 would show the amber banner "EARLY MODE CHANGE
//                RECOMMENDED" (the engine's explanation carries an early change);
//   HOLD         otherwise (shown as RECOMMENDED).
// v2 has no current mode (owner, 26-10-2026, issue 104), so CHANGE NOW is not reachable from the screen; the rule stays.
// A plain planned change ("Forecasting: ... at ...") does not make the state CHANGE SOON.
import { NO_SUITABLE_TITLE } from '../../engine';
import { hhmmZRel } from '../format';
import { approachChip, type ApproachChip } from './approach';
import { conditionalBanner } from './conditional';
import type { ViewData } from './dashboard';
import { planRank } from './evaluation';

/** How many half-hour slots from now an alternative must stay suitable to be listed (60 minutes; issue 122). A display rule. */
export const ALSO_SUITABLE_SLOTS = 2;

export type BandId = 'HOLD' | 'CHANGE_SOON' | 'CHANGE_NOW' | 'NO_SUITABLE' | 'NO_DATA';
export type Glyph = 'tick' | 'triangle' | 'cross' | 'question';
export type Tone = 'ok' | 'warn' | 'bad' | 'unk';

export interface Band {
  readonly id: BandId;
  /** The word shown with the glyph. */
  readonly word: string;
  readonly glyph: Glyph;
  readonly tone: Tone;
}

export const BANDS: Readonly<Record<BandId, Band>> = {
  // The internal id stays HOLD; the word shown is RECOMMENDED (owner, 26-10-2026, issue 104).
  HOLD: { id: 'HOLD', word: 'RECOMMENDED', glyph: 'tick', tone: 'ok' },
  CHANGE_SOON: { id: 'CHANGE_SOON', word: 'CHANGE SOON', glyph: 'triangle', tone: 'warn' },
  CHANGE_NOW: { id: 'CHANGE_NOW', word: 'CHANGE NOW', glyph: 'cross', tone: 'bad' },
  NO_SUITABLE: { id: 'NO_SUITABLE', word: NO_SUITABLE_TITLE, glyph: 'cross', tone: 'bad' },
  NO_DATA: { id: 'NO_DATA', word: 'NO DATA', glyph: 'question', tone: 'unk' },
};

/** The text of v1's red banner (same words as v1), or null when the operator's mode is not unsuitable now. */
function currentModeUnsuitableText(view: ViewData): string | null {
  const recId = view.result.plan.recommendedModeId;
  if (recId === null || view.currentMode === null) return null;
  const index = view.pack.modes.findIndex((m) => m.id === view.currentMode);
  const cell0 = index < 0 ? undefined : view.result.evaluation.cells[index]?.[0];
  if (cell0 === undefined || cell0.status !== 'UNSUITABLE') return null;
  const why = cell0.reasons.find((r) => r.severity === 'FAIL')?.text ?? 'it fails a mandatory rule';
  return `Current mode ${view.currentMode} is unsuitable: ${why}. Change to Mode ${recId}.`;
}

/** The state of the screen. See the provisional rule at the top of this file. */
export function bandOf(view: ViewData): Band {
  const { plan, explanation } = view.result;
  if (plan.recommendedModeId === null) return explanation.noSuitableMode !== null ? BANDS.NO_SUITABLE : BANDS.NO_DATA;
  if (currentModeUnsuitableText(view) !== null) return BANDS.CHANGE_NOW;
  if (explanation.earlyChange !== null) return BANDS.CHANGE_SOON;
  return BANDS.HOLD;
}

export interface AnswerModel {
  readonly band: Band;
  readonly modeId: string | null;
  /** 'long' and 'xlong' let a long mode id use a smaller type size so it never overflows. */
  readonly modeSize: 'normal' | 'long' | 'xlong';
  readonly modeLabel: string;
  /** "Arr 03 · Dep 03, 06" parts, or null with no recommendation. */
  readonly arrivals: string | null;
  readonly departures: string | null;
  /** "Forecasting: 21AD at 22:00Z", "No change planned", or '' with no recommendation. */
  readonly next: string;
  /** The recommended mode's rank in the operating plan (1 is the most preferred), or null. */
  readonly rank: number | null;
  /** Other modes SUITABLE in every one of the next ALSO_SUITABLE_SLOTS slots, most preferred first (issue 122). */
  readonly alternatives: readonly { readonly modeId: string; readonly rank: number }[];
  /** The popover text behind the info mark and the "Also suitable" label: every enabled, allowed mode in plan order with its rank and whether it is recommended, suitable or unsuitable. Null with no recommendation (issue 122). */
  readonly priorityText: string | null;
  /** The same ranking as rows, for the coloured popover. */
  readonly priorityRows: readonly { readonly rank: number; readonly modeId: string; readonly state: 'recommended' | 'suitable' | 'unsuitable' }[];
  readonly nextChange: { readonly modeId: string; readonly atMs: number } | null;
  /** The short line under the mode: the v1 banner text for CHANGE NOW and CHANGE SOON, what is missing for NO DATA. */
  readonly why: string | null;
  /** The conditional-operation note (OD-79), for example "LAHSO conditions met" with "until 1530Z" or "from 1530Z"; null when the recommended mode has none or its conditions are not met. */
  readonly conditional: { readonly title: string; readonly text: string } | null;
  /** The approach-type chip beside the mode (issue 99): the pack's chip and hover words for the current cloud base and visibility; null when the mode has no ladder, there is no report, or the weather cannot decide it. */
  readonly approach: ApproachChip | null;
}

/** Longer mode ids use a smaller type so they stay inside the answer column. A display rule, not an airport fact. */
export function modeSizeFor(id: string | null): AnswerModel['modeSize'] {
  const n = id?.length ?? 0;
  return n > 7 ? 'xlong' : n > 5 ? 'long' : 'normal';
}

export function answerModel(view: ViewData): AnswerModel {
  const { pack, result } = view;
  const { plan, explanation } = result;
  const band = bandOf(view);
  const recId = plan.recommendedModeId;

  if (recId === null) {
    const missing =
      band.id === 'NO_DATA'
        ? [explanation.headline, ...view.weather.banners.filter((b) => b.code === 'no-weather' || b.code === 'no-metar' || b.code === 'no-taf' || b.code === 'taf-ended' || b.code === 'metar-outside-window').map((b) => b.message)].join(' ')
        : null;
    return { band, modeId: null, modeSize: 'normal', modeLabel: 'No recommended mode', arrivals: null, departures: null, next: '', rank: null, alternatives: [], priorityText: null, priorityRows: [], nextChange: null, why: missing, conditional: null, approach: null };
  }

  const mode = pack.modes.find((m) => m.id === recId);
  const upcoming = result.changeovers.find((c) => c.change.slotIndex > 0);
  const recIndex = pack.modes.findIndex((m) => m.id === recId);
  const alternatives: { modeId: string; rank: number; index: number }[] = [];
  const ranked: { modeId: string; rank: number; index: number; state: 'recommended' | 'suitable' | 'unsuitable' }[] = [];
  pack.modes.forEach((m, index) => {
    if (!m.enabled) return;
    const rank = planRank(view, index, 0);
    if (rank === null) return;
    const window = (result.evaluation.cells[index] ?? []).slice(0, ALSO_SUITABLE_SLOTS);
    const suitable = window.length === ALSO_SUITABLE_SLOTS && window.every((c) => c.status === 'SUITABLE');
    if (index !== recIndex && suitable) alternatives.push({ modeId: m.id, rank, index });
    ranked.push({ modeId: m.id, rank, index, state: index === recIndex ? 'recommended' : suitable ? 'suitable' : 'unsuitable' });
  });
  alternatives.sort((a, b) => a.rank - b.rank || a.index - b.index);
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  const priorityText = ['Runway mode priority (1 is the most preferred)', ...ranked.map((r) => `${r.rank}. ${r.modeId}: ${r.state}`)].join('\n');
  return {
    band,
    modeId: recId,
    modeSize: modeSizeFor(recId),
    modeLabel: `Recommended mode ${recId}`,
    arrivals: mode === undefined ? null : mode.arrivals.join(', ') || 'none',
    departures: mode === undefined ? null : mode.departures.join(', ') || 'none',
    next: upcoming === undefined ? 'No change planned' : `Forecasting: ${upcoming.change.toModeId} at ${hhmmZRel(upcoming.change.startMs, view.calcNowMs)}`,
    rank: planRank(view, recIndex, 0),
    alternatives: alternatives.map(({ modeId, rank }) => ({ modeId, rank })),
    priorityText,
    priorityRows: ranked.map(({ rank, modeId, state }) => ({ rank, modeId, state })),
    nextChange: upcoming === undefined ? null : { modeId: upcoming.change.toModeId, atMs: upcoming.change.startMs },
    why: band.id === 'CHANGE_NOW' ? currentModeUnsuitableText(view) : band.id === 'CHANGE_SOON' ? (explanation.earlyChange?.text ?? null) : null,
    conditional: conditionalBanner(view, recIndex),
    approach: approachChip(view, recId),
  };
}

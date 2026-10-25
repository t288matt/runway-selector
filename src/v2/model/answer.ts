// The answer band of the v2 screen: the state (a glyph AND a word), the mode,
// the next change and the "I am on" choices. Pure: plain data from one view.
// Wording about the recommendation comes from the engine's explanation or from
// the pack; no airport fact is written here.
//
// PROVISIONAL STATE RULE (owner, 25-10-2026; issue 96 refines it later). It uses
// v1's own conditions and no time threshold of its own:
//   CHANGE NOW   when v1 would show the red banner "CURRENT MODE UNSUITABLE"
//                (the mode the operator is on fails a mandatory rule now);
//   CHANGE SOON  when v1 would show the amber banner "EARLY MODE CHANGE
//                RECOMMENDED" (the engine's explanation carries an early change);
//   HOLD         otherwise.
// A plain planned change ("Next: ... at ...") does not make the state CHANGE SOON.
import { NO_SUITABLE_TITLE } from '../../engine';
import { hhmmZRel } from '../format';
import type { ViewData } from './dashboard';

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
  HOLD: { id: 'HOLD', word: 'HOLD', glyph: 'tick', tone: 'ok' },
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

export interface ModeChoice {
  readonly value: string;
  readonly label: string;
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
  /** "Next: 21AD at 22:00Z", "No change planned", or '' with no recommendation. */
  readonly next: string;
  readonly nextChange: { readonly modeId: string; readonly atMs: number } | null;
  /** The short line under the mode: the v1 banner text for CHANGE NOW and CHANGE SOON, what is missing for NO DATA. */
  readonly why: string | null;
  readonly choices: readonly ModeChoice[];
  /** The operator's mode ('' for Not set). */
  readonly current: string;
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
  const choices: ModeChoice[] = [{ value: '', label: 'Not set' }, ...pack.modes.filter((m) => m.enabled).map((m) => ({ value: m.id, label: m.id }))];
  const current = view.currentMode ?? '';
  const recId = plan.recommendedModeId;

  if (recId === null) {
    const missing =
      band.id === 'NO_DATA'
        ? [explanation.headline, ...view.weather.banners.filter((b) => b.code === 'no-weather' || b.code === 'no-metar' || b.code === 'no-taf' || b.code === 'taf-ended' || b.code === 'metar-outside-window').map((b) => b.message)].join(' ')
        : null;
    return { band, modeId: null, modeSize: 'normal', modeLabel: 'No recommended mode', arrivals: null, departures: null, next: '', nextChange: null, why: missing, choices, current };
  }

  const mode = pack.modes.find((m) => m.id === recId);
  const upcoming = result.changeovers.find((c) => c.change.slotIndex > 0);
  return {
    band,
    modeId: recId,
    modeSize: modeSizeFor(recId),
    modeLabel: `Recommended mode ${recId}`,
    arrivals: mode === undefined ? null : mode.arrivals.join(', ') || 'none',
    departures: mode === undefined ? null : mode.departures.join(', ') || 'none',
    next: upcoming === undefined ? 'No change planned' : `Next: ${upcoming.change.toModeId} at ${hhmmZRel(upcoming.change.startMs, view.calcNowMs)}`,
    nextChange: upcoming === undefined ? null : { modeId: upcoming.change.toModeId, atMs: upcoming.change.startMs },
    why: band.id === 'CHANGE_NOW' ? currentModeUnsuitableText(view) : band.id === 'CHANGE_SOON' ? (explanation.earlyChange?.text ?? null) : null,
    choices,
    current,
  };
}

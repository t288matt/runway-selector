// The one mapping from an engine cell to what the expanded grid draws. v2's own
// copy of v1's rule (v2 imports nothing from src/ui). Colour comes from
// `cell.status` and from nothing else, so a cell is drawn green only when the
// engine said SUITABLE or MARGINAL (DB-3, UD-3, OD-81). A MARGINAL cell is green
// but has no tick: it keeps its cause word, the white uncertain corner and the
// hover text; the engine status stays MARGINAL.
import type { Cell, Status } from '../../engine';
import { hhmmZRel } from '../format';

export interface StatusStyle {
  /** CSS class that carries colour and pattern. */
  readonly className: string;
  /** Text glyph: tick, cross, question mark; none for marginal (a marginal cell is the suitable green; its cause word says it, OD-81). */
  readonly icon: string;
  /** The status in a word, lower case. */
  readonly word: string;
}

export const STATUS_STYLE: Readonly<Record<Status, StatusStyle>> = {
  SUITABLE: { className: 'cs-suitable', icon: '✓', word: 'suitable' },
  MARGINAL: { className: 'cs-suitable', icon: '', word: 'marginal' },
  UNSUITABLE: { className: 'cs-unsuitable', icon: '✕', word: 'unsuitable' },
  UNKNOWN: { className: 'cs-unknown', icon: '?', word: 'unknown' },
};

/** What the short cause code means, in words for the accessible name, the hover text and the Key. */
export const CAUSE_WORDS: Readonly<Record<string, string>> = {
  TW: 'tailwind',
  XW: 'crosswind',
  MIN: 'weather minima',
  CAP: 'capacity',
  PLAN: 'operating plan',
  VRB: 'variable wind',
  TEMPO: 'temporary forecast change',
  INTER: 'intermittent forecast change',
  PROB: 'probability forecast',
  'WET?': 'runway may be wet',
  TAF: 'forecast would make it worse',
  'NO TAF': 'no forecast coverage',
  'NO MET': 'no weather entered',
  MODE: 'mode not enabled',
};

/** Which missing report an UNKNOWN cell should name. */
export type MissingWeather = 'NO TAF' | 'NO MET';

/**
 * The short cause code for a cell, or '' for SUITABLE. `missing` names what is
 * absent when the cell is UNKNOWN: the TAF (a report ends or is not entered) or
 * everything (nothing entered).
 */
export function causeCode(cell: Cell, missing: MissingWeather): string {
  if (cell.status === 'SUITABLE') return '';
  if (cell.status === 'UNKNOWN') return missing;
  const severity = cell.status === 'UNSUITABLE' ? 'FAIL' : 'MARGINAL';
  const reason = cell.reasons.find((r) => r.severity === severity);
  const code = reason?.code ?? cell.cause;
  if (code === null || code === undefined) return '';
  if (code === 'TW' && reason !== undefined && reason.severity === 'MARGINAL' && reason.figures.case === 'wet' && reason.figures.uncertain === true) return 'WET?';
  if (code === 'OVERLAY') {
    const kind = reason?.figures.overlayKind;
    return kind === 'INTER' ? 'INTER' : kind === 'PROB' ? 'PROB' : 'TEMPO';
  }
  return code;
}

export interface CellView {
  readonly status: Status;
  readonly className: string;
  readonly icon: string;
  readonly word: string;
  /** '' for SUITABLE. */
  readonly code: string;
  /** The white corner: the status depends on an uncertain input. */
  readonly uncertain: boolean;
  /** Accessible name, "Mode 12, 00:30Z, marginal, cause capacity". */
  readonly label: string;
}

export function cellView(cell: Cell, slotStartMs: number, missing: MissingWeather, refMs: number = slotStartMs): CellView {
  const style = STATUS_STYLE[cell.status];
  const code = causeCode(cell, missing);
  const cause = code === '' ? '' : `, cause ${CAUSE_WORDS[code] ?? code}`;
  const uncertain = cell.uncertain ? ', depends on an uncertain input' : '';
  return {
    status: cell.status,
    className: style.className,
    icon: style.icon,
    word: style.word,
    code,
    uncertain: cell.uncertain,
    label: `Mode ${cell.modeId}, ${hhmmZRel(slotStartMs, refMs)}, ${style.word}${cause}${uncertain}`,
  };
}

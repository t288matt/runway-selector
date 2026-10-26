// The wind rules shared by the Evaluation and TAF grid, and the forecast in words that names the Evaluation and TAF toggle.
// (The slim bar this file once modelled was removed, issue 104.) The wind-change threshold and the group handling are v2's
// own copy of v1's timeline rules (OD-43, OD-51).
import { trafficLevelsFor, type TrafficLevel, type WindObservation } from '../../engine';
import { dir3, hhmmZRel, kt1 } from '../format';
import type { ViewData } from './dashboard';
import { levelWord } from './tiles';

// ------------------------------------------------------------------- wind
/** A wind change smaller than both of these is not worth a label (display only; the same as v1). */
export const WIND_SHIFT_MIN_DEGREES = 10;
export const WIND_SHIFT_MIN_KT = 5;

/** Wind as reported: "340/10", "020/12G22", "VRB/05". A variable direction range replaces the single direction. */
export function windText(w: WindObservation): string {
  const gust = w.gustKt === null ? '' : `G${kt1(w.gustKt)}`;
  const direction = w.kind === 'variable' ? 'VRB' : w.variableRangeDegrees === null ? dir3(w.directionDegrees) : `${dir3(w.variableRangeDegrees[0])}V${dir3(w.variableRangeDegrees[1])}`;
  return `${direction}/${kt1(w.speedKt).padStart(2, '0')}${gust}`;
}

const turnDegrees = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.round(d > 180 ? 360 - d : d);
};

/** The label and hover text for a wind change between two slots, or null when there is none worth showing. */
export function windShift(prev: WindObservation | null, cur: WindObservation | null): { readonly label: string; readonly title: string } | null {
  if (cur === null || prev === null) return null;
  const speedMove = Math.max(Math.abs(cur.speedKt - prev.speedKt), Math.abs((cur.gustKt ?? cur.speedKt) - (prev.gustKt ?? prev.speedKt)));
  const bothSteady = prev.kind === 'steady' && cur.kind === 'steady';
  const turn = prev.kind === 'steady' && cur.kind === 'steady' ? turnDegrees(prev.directionDegrees, cur.directionDegrees) : null;
  const small = turn === null ? prev.kind === cur.kind && speedMove < WIND_SHIFT_MIN_KT : turn < WIND_SHIFT_MIN_DEGREES && speedMove < WIND_SHIFT_MIN_KT;
  if (small) return null;
  const turnText = bothSteady && turn !== null && turn > 0 ? `, turn of ${turn} degrees` : '';
  return { label: windText(cur), title: `Wind ${windText(prev)} to ${windText(cur)}${turnText}` };
}

export interface Run {
  readonly startSlot: number;
  /** Inclusive. */
  readonly endSlot: number;
  readonly label: string;
  readonly title: string;
}

/**
 * The wind bars. A bar starts at the first slot with a wind and runs until the wind changes enough to be worth a
 * label (measured from the wind the bar started with, so slow drift cannot creep past the threshold), or until a
 * slot has no wind.
 */
export function windRuns(winds: readonly (WindObservation | null)[]): Run[] {
  const out: Run[] = [];
  let start = -1;
  let from: WindObservation | null = null;
  let title = '';
  const close = (end: number): void => {
    if (start >= 0 && from !== null) out.push({ startSlot: start, endSlot: end, label: windText(from), title });
    start = -1;
    from = null;
  };
  winds.forEach((w, i) => {
    if (w === null) {
      close(i - 1);
      return;
    }
    if (from === null) {
      start = i;
      from = w;
      title = `Wind ${windText(w)}`;
      return;
    }
    const shift = windShift(from, w);
    if (shift !== null) {
      close(i - 1);
      start = i;
      from = w;
      title = shift.title;
    }
  });
  close(winds.length - 1);
  return out;
}

// ------------------------------------------------------------- the words
/** Run-length groups of equal keys, as [start, end] slot pairs (end inclusive). */
function groups<T>(items: readonly T[], key: (item: T) => string | null): { start: number; end: number; key: string }[] {
  const out: { start: number; end: number; key: string }[] = [];
  items.forEach((item, i) => {
    const k = key(item);
    if (k === null) return;
    const last = out[out.length - 1];
    if (last !== undefined && last.key === k && last.end === i - 1) last.end = i;
    else out.push({ start: i, end: i, key: k });
  });
  return out;
}

export interface ForecastSummary {
  /** "19:00Z to 01:00Z". */
  readonly rangeText: string;
  /** The forecast in words: the path, the wind, the wet runway and the traffic. The accessible name of the toggle. */
  readonly summary: string;
}

export function forecastSummary(view: ViewData): ForecastSummary {
  const { pack, result } = view;
  const slots = view.weather.slots;
  const n = slots.length;
  const first = slots[0];
  const last = slots[n - 1];
  const rel = (ms: number): string => hhmmZRel(ms, view.calcNowMs);
  const startOf = (i: number): number => slots[i]?.startMs ?? 0;
  const endOf = (i: number): number => slots[i]?.endMs ?? 0;
  const plan = result.plan.slots;
  const wind = windRuns(slots.map((s) => s.weather.wind));
  const wet = groups(result.evaluation.slots, (s) => (s.runwayState === 'DRY' ? null : s.runwayState)).map((g) => ({ ...g, possible: g.key === 'WET_POSSIBLE' }));
  const levels = trafficLevelsFor(pack, slots.map((s) => s.startMs), view.liveDemand?.slots ?? []);
  const modeRuns = groups(plan, (p) => p.modeId ?? 'no mode');
  const pathText = modeRuns.map((g, k) => `${k === 0 ? '' : 'then '}${plan[g.start]?.modeId ?? 'no mode'} ${g.end === n - 1 ? 'to the end' : `until ${rel(endOf(g.end))}`}`).join(', ');
  const wetText = wet.length === 0 ? 'Runway dry throughout.' : `Runway ${wet.map((w) => `${w.possible ? 'possibly wet' : 'wet'} ${rel(startOf(w.start))} to ${rel(endOf(w.end))}`).join(', ')}.`;
  const windSentence = wind.length === 0 ? 'Wind unknown.' : `Wind ${wind.map((w) => w.label).join(', then ')}.`;
  const levelRuns = groups(levels, (l) => l ?? 'unknown');
  const trafficText = `Traffic ${levelRuns.map((g, k) => `${k === 0 ? '' : 'then '}${g.key === 'unknown' ? 'unknown' : levelWord(g.key as TrafficLevel)}${k === 0 ? '' : ` from ${rel(startOf(g.start))}`}`).join(', ')}.`;
  const summary = n === 0 || first === undefined || last === undefined ? 'No forecast window.' : `Forecast ${rel(first.startMs)} to ${rel(last.endMs)}. Path: ${pathText}. ${windSentence} ${wetText} ${trafficText}`;
  return { rangeText: first === undefined || last === undefined ? '' : `${rel(first.startMs)} to ${rel(last.endMs)}`, summary };
}

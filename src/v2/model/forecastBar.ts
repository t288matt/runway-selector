// The slim forecast bar (phase 1: one closed state, not expandable): the
// recommended path across the window with the change line, the wind, the
// forecast-group risk, the wet runway and the traffic micro-bars. Pure view
// model from one view. The wind-change threshold and the group handling are
// v2's own copy of v1's timeline rules (OD-43, OD-51).
import { trafficLevelsFor, type TrafficLevel, type WindObservation } from '../../engine';
import { dir3, hh, hhmmZRel, kt1 } from '../format';
import { SLOT_MS, type ViewData } from './dashboard';
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

// ------------------------------------------------------------ model types
export type SegmentTone = 'ok' | 'mg' | 'bd' | 'un';

export interface PathSegment {
  readonly startSlot: number;
  readonly endSlot: number;
  readonly tone: SegmentTone;
  /** "03AD06D ✓" style text drawn on the segment. */
  readonly label: string;
  /** The white corner: a slot in it depends on an uncertain input. */
  readonly uncertain: boolean;
  readonly title: string;
}

export interface WetRun {
  readonly startSlot: number;
  readonly endSlot: number;
  readonly possible: boolean;
  readonly label: string;
}

export interface TrafficCell {
  readonly level: TrafficLevel | null;
}

export interface AxisLabel {
  readonly label: string;
  readonly leftPct: number;
}

export interface ForecastBarModel {
  readonly slotCount: number;
  readonly rangeText: string;
  readonly axis: readonly AxisLabel[];
  readonly nowPct: number;
  readonly changePct: readonly number[];
  readonly path: readonly PathSegment[];
  readonly wind: readonly Run[];
  /** TEMPO, INTER and PROB groups, one bar per stretch of slots with the same kinds. */
  readonly risk: readonly Run[];
  readonly riskLabel: string;
  readonly wet: readonly WetRun[];
  readonly traffic: readonly TrafficCell[];
  /** The whole bar in words, for its accessible name. */
  readonly summary: string;
}

const TONE_MARK: Readonly<Record<SegmentTone, string>> = { ok: '✓', mg: '▲', bd: '✕', un: '?' };
const TONE_WORD: Readonly<Record<SegmentTone, string>> = { ok: 'suitable', mg: 'marginal', bd: 'unsuitable', un: 'unknown' };

function toneOf(status: string | null): SegmentTone {
  return status === 'SUITABLE' ? 'ok' : status === 'MARGINAL' ? 'mg' : status === 'UNKNOWN' ? 'un' : 'bd';
}

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

export function forecastBarModel(view: ViewData, displayNowMs: number): ForecastBarModel {
  const { pack, result } = view;
  const slots = view.weather.slots;
  const n = slots.length;
  const first = slots[0];
  const last = slots[n - 1];
  const rel = (ms: number): string => hhmmZRel(ms, view.calcNowMs);
  const startOf = (i: number): number => slots[i]?.startMs ?? 0;
  const endOf = (i: number): number => slots[i]?.endMs ?? 0;
  const pct = (slot: number): number => (n === 0 ? 0 : (slot / n) * 100);

  // The recommended path, as stretches of one mode with one status.
  const plan = result.plan.slots;
  const path: PathSegment[] = groups(plan, (p) => `${p.modeId ?? ''}|${toneOf(p.status)}`).map((g) => {
    const p = plan[g.start];
    const tone = toneOf(p?.status ?? null);
    const id = p?.modeId ?? null;
    const word = id === null ? 'NO MODE' : id;
    const uncertain = plan.slice(g.start, g.end + 1).some((s) => s.uncertain);
    return {
      startSlot: g.start,
      endSlot: g.end,
      tone: id === null ? 'bd' : tone,
      label: `${word} ${id === null ? TONE_MARK.bd : TONE_MARK[tone]}`,
      uncertain,
      title: `${word}${id === null ? ', no suitable mode' : `, ${TONE_WORD[tone]}`}, ${rel(startOf(g.start))} to ${rel(endOf(g.end))}${uncertain ? ', depends on an uncertain input' : ''}`,
    };
  });

  // The hour labels along the top, thinned so they never crowd, with NOW first.
  const nowPct = n === 0 || first === undefined ? 0 : Math.min(100, Math.max(0, ((displayNowMs - first.startMs) / (n * SLOT_MS)) * 100));
  const hours = slots.map((s, i) => ({ i, onHour: s.startMs % 3_600_000 === 0 })).filter((s) => s.onHour && s.i > 0);
  const stride = Math.max(1, Math.ceil(hours.length / 7));
  const axis: AxisLabel[] = [{ label: 'NOW', leftPct: nowPct }];
  hours.forEach((h, k) => {
    if (k % stride === 0 && Math.abs(pct(h.i) - nowPct) > 5) axis.push({ label: hh(startOf(h.i)), leftPct: pct(h.i) });
  });

  const changePct = result.changeovers.filter((c) => c.change.slotIndex > 0).map((c) => pct(c.change.slotIndex));
  const wind = windRuns(slots.map((s) => s.weather.wind));

  // Forecast groups: stretches of slots that carry the same kinds of group.
  const kindsAt = slots.map((s) => [...new Set(s.weather.overlays.map((o) => o.kind))].sort());
  const risk: Run[] = groups(kindsAt, (k) => (k.length === 0 ? null : k.join('/'))).map((g) => {
    const texts = [...new Set(slots.slice(g.start, g.end + 1).flatMap((s) => s.weather.overlays.map((o) => o.text)))];
    return { startSlot: g.start, endSlot: g.end, label: g.key, title: `${g.key}: ${texts.join('; ')}` };
  });
  const allKinds = [...new Set(kindsAt.flat())];
  const riskLabel = allKinds.length === 0 ? '' : allKinds.length > 2 ? 'Risk' : allKinds.join('/');

  const evalSlots = result.evaluation.slots;
  const wet: WetRun[] = groups(evalSlots, (s) => (s.runwayState === 'DRY' ? null : s.runwayState)).map((g) => {
    const possible = g.key === 'WET_POSSIBLE';
    return { startSlot: g.start, endSlot: g.end, possible, label: possible ? '▼ wet?' : '▼ wet' };
  });

  const levels = trafficLevelsFor(pack, slots.map((s) => s.startMs), view.liveDemand?.slots ?? []);
  const traffic: TrafficCell[] = slots.map((_s, i) => ({ level: levels[i] ?? null }));

  // The summary in words.
  const modeRuns = groups(plan, (p) => p.modeId ?? 'no mode');
  const pathText = modeRuns.map((g, k) => `${k === 0 ? '' : 'then '}${plan[g.start]?.modeId ?? 'no mode'} ${g.end === n - 1 ? 'to the end' : `until ${rel(endOf(g.end))}`}`).join(', ');
  const wetText = wet.length === 0 ? 'Runway dry throughout.' : `Runway ${wet.map((w) => `${w.possible ? 'possibly wet' : 'wet'} ${rel(startOf(w.startSlot))} to ${rel(endOf(w.endSlot))}`).join(', ')}.`;
  const windText2 = wind.length === 0 ? 'Wind unknown.' : `Wind ${wind.map((w) => w.label).join(', then ')}.`;
  const levelRuns = groups(traffic, (t) => t.level ?? 'unknown');
  const trafficText = `Traffic ${levelRuns.map((g, k) => `${k === 0 ? '' : 'then '}${g.key === 'unknown' ? 'unknown' : levelWord(g.key as TrafficLevel)}${k === 0 ? '' : ` from ${rel(startOf(g.start))}`}`).join(', ')}.`;
  const summary = n === 0 || first === undefined || last === undefined ? 'No forecast window.' : `Forecast ${rel(first.startMs)} to ${rel(last.endMs)}. Path: ${pathText}. ${windText2} ${wetText} ${trafficText}`;

  return { slotCount: n, rangeText: first === undefined || last === undefined ? '' : `${rel(first.startMs)} to ${rel(last.endMs)}`, axis, nowPct, changePct, path, wind, risk, riskLabel, wet, traffic, summary };
}

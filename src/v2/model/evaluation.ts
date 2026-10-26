// The view model of the expanded "Evaluation and TAF" section: v1's timeline
// block as plain data, from one engine result. v2's own copy of v1's timeline
// model (v2 imports nothing from src/ui); tests/v2/evaluationParity.test.ts
// proves it matches v1's on the same fixtures: which rows are hidden, every cell
// status, cause word and uncertain flag, the recommended path, the change
// positions, the wind and group bars and the busy runs.
//
// Nothing here knows an airport. Every threshold comes from the pack or from the
// engine's own cells; the only numbers written here are display rules (the wind
// label thresholds, shared with the slim bar).
import { trafficLevelsFor, type Cell, type TrafficLevel, type WindObservation } from '../../engine';
import { preferencePenalty } from '../../engine/optimiser';
import { dir3, ddmm, durationText, hhmm, hhmmZ, hhmmZRel, kt1, minimaText } from '../format';
import { SLOT_MS, type ViewData } from './dashboard';
import { windRuns, type Run } from './forecastBar';
import { cellView, CAUSE_WORDS, STATUS_STYLE, type CellView, type MissingWeather } from './status';
import { levelWord } from './tiles';

// ------------------------------------------------------------------- words
/** The short word in the narrow traffic row, where MEDIUM does not fit as well. */
export function levelShortWord(level: TrafficLevel | null): string {
  return level === null ? '?' : level === 'light' ? 'LOW' : level === 'medium' ? 'MED' : 'HIGH';
}

export function runwaysText(arrivals: readonly string[], departures: readonly string[]): string {
  const a = arrivals.length === 0 ? 'none' : arrivals.join(', ');
  const d = departures.length === 0 ? 'none' : departures.join(', ');
  return `Arr ${a}; Dep ${d}`;
}

export function missingWeather(view: ViewData): MissingWeather {
  return view.metar === null && view.taf === null ? 'NO MET' : 'NO TAF';
}

// -------------------------------------------------------------------- rows
export interface ModeRow {
  /** Index into pack.modes (and into the engine's cells). */
  readonly index: number;
  readonly modeId: string;
  readonly isRecommended: boolean;
  readonly isCurrent: boolean;
  /** Every slot in the window is UNSUITABLE for this mode (a fully red row). */
  readonly allUnsuitable: boolean;
  /** Second line of the row header, from the mode's runways. */
  readonly runwaysText: string;
  /** Hover text for the row label. */
  readonly title: string;
}

/** Rank of a mode in the operating plan for one slot: 1 is the top preference. Allowed modes only. */
export function planRank(view: ViewData, modeIndex: number, slotIndex = 0): number | null {
  const { pack, result } = view;
  const mode = pack.modes[modeIndex];
  const cell = result.evaluation.cells[modeIndex]?.[slotIndex];
  if (mode === undefined || cell === undefined) return null;
  const allowed = (idx: number): boolean => {
    const m = pack.modes[idx];
    const c = result.evaluation.cells[idx]?.[slotIndex];
    return m !== undefined && c !== undefined && m.enabled && !c.reasons.some((r) => r.code === 'PLAN' && r.severity === 'FAIL');
  };
  if (!allowed(modeIndex)) return null;
  const own = preferencePenalty(pack, cell.bandId, mode.id);
  let better = 0;
  pack.modes.forEach((m, k) => {
    const c = result.evaluation.cells[k]?.[slotIndex];
    if (k === modeIndex || c === undefined || !allowed(k)) return;
    if (preferencePenalty(pack, c.bandId, m.id) < own) better += 1;
  });
  return better + 1;
}

/** Rows in operating-plan priority order for the first slot; the recommended and current modes are badged, not moved. Enabled modes only. */
export function modeRows(view: ViewData): ModeRow[] {
  const { pack, result } = view;
  const rec = result.plan.recommendedModeId;
  const rows: (ModeRow & { readonly sort: number; readonly order: number })[] = [];
  pack.modes.forEach((mode, index) => {
    if (!mode.enabled) return;
    const cell0 = result.evaluation.cells[index]?.[0];
    const cellsOfMode = result.evaluation.cells[index] ?? [];
    const penalty = cell0 === undefined ? Number.MAX_SAFE_INTEGER : preferencePenalty(pack, cell0.bandId, mode.id);
    const cap = mode.capacity === null ? 'no capacity set' : `capacity ${mode.capacity} per hour`;
    rows.push({
      index,
      modeId: mode.id,
      isRecommended: mode.id === rec,
      isCurrent: mode.id === view.currentMode,
      allUnsuitable: cellsOfMode.length > 0 && cellsOfMode.every((c) => c.status === 'UNSUITABLE'),
      runwaysText: runwaysText(mode.arrivals, mode.departures),
      title: `Mode ${mode.id}: ${runwaysText(mode.arrivals, mode.departures)}; ${cap}; crosswind limit ${kt1(mode.maxCrosswindKt)} kt${mode.minima === null ? '' : `; minima: ${minimaText(mode.minima)}`}`,
      sort: penalty,
      order: index,
    });
  });
  rows.sort((a, b) => a.sort - b.sort || a.order - b.order);
  return rows.map(({ sort: _sort, order: _order, ...row }) => row);
}

/**
 * The rows to draw (v1's rule, with no reveal button in v2). A fully red row (UNSUITABLE in every slot) is hidden
 * unless it is the recommended or the current mode. When every row is fully red all are shown, so the grid is
 * never empty. Returns the positions in `rows` to keep.
 */
export function visibleRowIndexes(rows: readonly ModeRow[]): number[] {
  const hide = (r: ModeRow): boolean => r.allUnsuitable && !r.isRecommended && !r.isCurrent;
  const hidden = rows.filter(hide).length;
  if (hidden === 0 || hidden === rows.length) return rows.map((_r, i) => i);
  return rows.map((r, i) => (hide(r) ? -1 : i)).filter((i) => i >= 0);
}

// ------------------------------------------------------- group bars (TEMPO and so on)
/** One TEMPO, INTER or PROB group drawn as a bar under the wind bars, over the slots its window covers. */
export interface OverlayBar {
  readonly startSlot: number;
  readonly endSlot: number;
  /** Which line of bars it sits on, from 0; groups that overlap in time take separate lines. */
  readonly lane: number;
  /** The group's own text, "PROB30 TEMPO 2511/2519 VRB30G40KT 1000 TSRA BKN010". Identity and hover text. */
  readonly label: string;
  /** The text drawn on the bar: the group text without its validity token. */
  readonly displayLabel: string;
  /** True when the group is a probability group, which is shown but never changes a cell. */
  readonly probability: boolean;
}

/** The group text with its validity token (DDHH/DDHH) removed: the bar's length and position already show the period. */
export function overlayDisplayLabel(text: string): string {
  return text.replace(/\b\d{4}\/\d{4}\b/, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * The TEMPO, INTER and PROB groups over the slots as bars. One bar per distinct group text, from the first slot it
 * covers to the last; a METAR-governed slot carries no groups, so a bar starts after it. Overlapping groups go on
 * separate lanes.
 */
export function overlayBars(slots: readonly { readonly weather: { readonly overlays: readonly { readonly text: string; readonly probabilityPct: number | null }[] } }[]): { bars: OverlayBar[]; lanes: number } {
  const open = new Map<string, { label: string; start: number; end: number; probability: boolean }>();
  const found: { label: string; start: number; end: number; probability: boolean }[] = [];
  slots.forEach((s, i) => {
    for (const o of s.weather.overlays) {
      const seen = open.get(o.text);
      // A gap in coverage (a METAR-governed slot in the middle) ends the bar; the next slot starts a new one.
      if (seen !== undefined && seen.end >= i - 1) seen.end = i;
      else {
        const g = { label: o.text, start: i, end: i, probability: o.probabilityPct !== null };
        open.set(o.text, g);
        found.push(g);
      }
    }
  });
  const laneEnds: number[] = [];
  const bars: OverlayBar[] = [];
  for (const g of [...found].sort((a, b) => a.start - b.start || b.end - a.end)) {
    let lane = laneEnds.findIndex((end) => end < g.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = g.end;
    bars.push({ startSlot: g.start, endSlot: g.end, lane, label: g.label, displayLabel: overlayDisplayLabel(g.label), probability: g.probability });
  }
  return { bars, lanes: laneEnds.length };
}

function runsOf(flags: readonly boolean[]): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  let start = -1;
  flags.forEach((f, i) => {
    if (f && start < 0) start = i;
    if (!f && start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, flags.length - 1]);
  return out;
}

// -------------------------------------------------------------- slot columns
export interface EvaluationSlot {
  readonly index: number;
  readonly startMs: number;
  /** "22:30". */
  readonly time: string;
  /** Bold hour label. */
  readonly onTheHour: boolean;
  /** "23-10" on the first column and at midnight, else null. */
  readonly dateLabel: string | null;
  readonly level: TrafficLevel | null;
  /** "LOW", "MED", "HIGH" or "?". */
  readonly levelShort: string;
  readonly levelTitle: string;
  readonly busy: boolean;
  readonly wet: 'none' | 'possible' | 'wet';
  /** Short words for the event row, in order: TS, low vis, wet risk, WET, no TAF, NO MODE. */
  readonly events: readonly string[];
  /** Full text for the event row's hover. */
  readonly eventTitle: string;
  readonly isChange: boolean;
  readonly noMode: boolean;
  readonly noTaf: boolean;
}

// ------------------------------------------------------------ cell detail text
export interface CellDetail {
  readonly title: string;
  readonly statusWord: string;
  readonly icon: string;
  readonly code: string;
  readonly reason: string;
  /** The wind group behind a MARGINAL or UNSUITABLE cell, e.g. "TEMPO PROB30 VRB20G30KT"; '' when the cause is not a forecast group. */
  readonly trigger: string;
  readonly runways: readonly { name: string; roles: string; tailwind: string; crosswind: string; tailLimit: string; crossLimit: string; overTailwind: boolean; overCrosswind: boolean }[];
  readonly wind: string;
  readonly overlays: readonly string[];
  readonly runwayAssumption: string;
  readonly traffic: string;
  readonly operatingPlan: string;
  readonly survival: string;
  readonly notes: readonly string[];
}

function windOf(wind: WindObservation | null): string {
  if (wind === null) return 'No wind available';
  const gust = wind.gustKt === null ? '' : `, gusting ${kt1(wind.gustKt)} kt`;
  if (wind.kind === 'variable') return `Variable at ${kt1(wind.speedKt)} kt${gust}`;
  return `${dir3(wind.directionDegrees)} degrees at ${kt1(wind.speedKt)} kt${gust}`;
}

const WIND_GROUP = /\b(?:VRB|\d{3})\d{2}(?:G\d{2,3})?KT\b/;

function triggerText(cell: Cell): string {
  if (cell.status !== 'MARGINAL' && cell.status !== 'UNSUITABLE') return '';
  const severity = cell.status === 'UNSUITABLE' ? 'FAIL' : 'MARGINAL';
  const r = cell.reasons.find((x) => x.severity === severity);
  if (r === undefined || r.code !== 'OVERLAY') return '';
  const group = r.figures.group;
  const wind = typeof group === 'string' ? WIND_GROUP.exec(group)?.[0] : undefined;
  if (wind === undefined) return '';
  const prob = r.figures.probabilityPct;
  const kind = r.figures.overlayKind;
  return `${typeof kind === 'string' ? kind : 'Forecast group'}${typeof prob === 'number' ? ` PROB${prob}` : ''} ${wind}`;
}

function primaryReason(cell: Cell): string {
  const severity = cell.status === 'UNSUITABLE' ? 'FAIL' : cell.status === 'MARGINAL' ? 'MARGINAL' : cell.status === 'UNKNOWN' ? 'UNKNOWN' : null;
  if (severity === null) return '';
  return cell.reasons.find((x) => x.severity === severity)?.text ?? 'No further detail';
}

export function cellDetail(view: ViewData, modeIndex: number, slotIndex: number): CellDetail | null {
  const { pack, result } = view;
  const mode = pack.modes[modeIndex];
  const slot = view.weather.slots[slotIndex];
  const info = result.evaluation.slots[slotIndex];
  const cell = result.evaluation.cells[modeIndex]?.[slotIndex];
  if (mode === undefined || slot === undefined || info === undefined || cell === undefined) return null;
  const cv = cellView(cell, slot.startMs, missingWeather(view), view.calcNowMs);
  const level = trafficLevelsFor(pack, [slot.startMs], view.demand?.slots ?? [])[0] ?? null;
  const tailLimitFor = (r: Cell['runways'][number]): number => (info.runwayState === 'WET' ? r.tailwindLimitWetKt : info.runwayState === 'DRY' ? r.tailwindLimitDryKt : Math.min(r.tailwindLimitDryKt, r.tailwindLimitWetKt));

  const runways = (cell.status === 'SUITABLE' ? [] : cell.runways).map((r) => ({
    name: r.runway,
    roles: r.roles.map((x) => (x === 'ARRIVAL' ? 'ARR' : 'DEP')).join(' '),
    tailwind: kt1(r.tailwindKt),
    crosswind: kt1(r.crosswindKt),
    tailLimit: kt1(tailLimitFor(r)),
    crossLimit: kt1(r.crosswindLimitKt),
    overTailwind: r.tailwindKt > (info.runwayState === 'WET' ? r.tailwindLimitWetKt : r.tailwindLimitDryKt) + pack.settings.limitToleranceKt,
    overCrosswind: r.crosswindKt > r.crosswindLimitKt + pack.settings.limitToleranceKt,
  }));

  const overlaySource = slot.governedBy === 'METAR' ? (slot.tafView?.overlays ?? []) : slot.weather.overlays;
  const overlays = overlaySource.map((o) => `${o.kind}${o.probabilityPct === null ? '' : ` PROB${o.probabilityPct}`}: ${o.text}`);
  const assumption = info.runwayState === 'WET_POSSIBLE' ? 'WET POSSIBLE: both dry and wet are evaluated' : info.runwayState === 'WET' ? 'WET' : 'DRY';

  // Owner decision (26-10-2026): v2 shows no per-slot arrivals, departures, movements or capacity figures. The popover
  // names the traffic class of the slot (the Traffic row says the same); a capacity reason, when capacity is the cause,
  // is the engine's own reason text and stays.
  const trafficText = levelWord(level);

  const band = cell.bandId;
  const planFail = cell.reasons.some((r) => r.code === 'PLAN' && r.severity === 'FAIL');
  const rank = planRank(view, modeIndex, slotIndex);
  const operatingPlan = planFail ? `Not allowed in time band ${band ?? 'unknown'}` : `Allowed${band === null || pack.plan.find((b) => b.id === band)?.allDay === true ? '' : ` in time band ${band}`}${rank === null ? '' : `, priority ${rank}`}`;

  const s = result.evaluation.survival[modeIndex];
  const parts: string[] = [];
  if (s !== undefined && s.viableUntilMs !== null) {
    parts.push(s.viableSlots === 0 ? 'Not suitable now' : s.endsInFailure ? `Viable for ${durationText(s.viableUntilMs - view.calcNowMs)}, to ${hhmmZRel(s.viableUntilMs, view.calcNowMs)}` : `Viable for the whole window, to ${hhmmZRel(s.viableUntilMs, view.calcNowMs)}`);
    if (s.firstMarginalSlot !== null) parts.push(`first marginal slot ${hhmmZRel(view.weather.slots[s.firstMarginalSlot]?.startMs ?? 0, view.calcNowMs)}`);
    if (s.firstUnsuitableSlot !== null) parts.push(`first unsuitable slot ${hhmmZRel(view.weather.slots[s.firstUnsuitableSlot]?.startMs ?? 0, view.calcNowMs)}${s.firstUnsuitableReason === null ? '' : ` (${s.firstUnsuitableReason.text})`}`);
  }
  const replacement = result.changeovers.find((c) => c.change.fromModeId === mode.id);
  if (replacement !== undefined) parts.push(`replacement Mode ${replacement.change.toModeId} from ${hhmmZRel(replacement.change.startMs, view.calcNowMs)}`);

  const primary = primaryReason(cell);
  const others = cell.reasons.map((r) => r.text).filter((t) => t !== primary);
  const code = cv.code;
  return {
    title: `Mode ${mode.id}, ${hhmmZRel(slot.startMs, view.calcNowMs)} to ${hhmmZRel(slot.endMs, view.calcNowMs)}`,
    statusWord: cv.word.toUpperCase(),
    icon: cv.icon,
    code: code === '' ? '' : `${code}: ${CAUSE_WORDS[code] ?? code}`,
    reason: primary,
    trigger: triggerText(cell),
    runways,
    wind: windOf(slot.weather.wind),
    overlays,
    runwayAssumption: assumption,
    traffic: trafficText,
    operatingPlan,
    survival: parts.join('; '),
    notes: [...(cell.uncertain ? ['This status depends on an uncertain input.'] : []), ...others],
  };
}

/** The detail as plain text, one fact per line, for the shared popover. Text only (SEC-2). */
export function cellDetailText(d: CellDetail): string {
  const lines: string[] = [`${d.title}: ${d.icon === '' ? '' : `${d.icon} `}${d.statusWord}${d.code === '' || d.trigger !== '' ? '' : `, ${d.code}`}`];
  if (d.reason !== '') {
    if (d.trigger !== '') lines.push(d.trigger);
    lines.push(d.reason);
  }
  for (const r of d.runways) lines.push(`Runway ${r.name} ${r.roles}: tailwind ${r.tailwind} kt (limit ${r.tailLimit})${r.overTailwind ? ' over' : ''}, crosswind ${r.crosswind} kt (limit ${r.crossLimit})${r.overCrosswind ? ' over' : ''}`);
  lines.push(`Wind used: ${d.wind}`);
  for (const o of d.overlays) lines.push(`Forecast: ${o}`);
  lines.push(`Runway condition: ${d.runwayAssumption}.`);
  lines.push(`Traffic: ${d.traffic}.`);
  lines.push(`Operating plan: ${d.operatingPlan}.`);
  if (d.survival !== '') lines.push(`Outlook: ${d.survival}.`);
  for (const n of d.notes) lines.push(n);
  return lines.join('\n');
}

// -------------------------------------------------------------------- model
export interface EvaluationCell extends CellView {
  /** This cell lies on the recommended path. */
  readonly onPath: boolean;
  /** The hover and focus text. */
  readonly detail: string;
}

export interface EvaluationRow extends ModeRow {
  readonly cells: readonly EvaluationCell[];
}

export interface LegendItem {
  readonly key: 'suitable' | 'unsuitable' | 'unknown' | 'green-word' | 'path' | 'change' | 'busy' | 'uncertain';
  readonly text: string;
}

/** v1's legend, in v1's order. */
export const FORECAST_GREEN_LEGEND = 'Green with a word: passes, but see the word (forecast change, near a limit, variable wind)';
export const LEGEND: readonly LegendItem[] = [
  { key: 'suitable', text: 'Suitable' },
  { key: 'unsuitable', text: 'Unsuitable' },
  { key: 'unknown', text: 'Unknown' },
  { key: 'green-word', text: FORECAST_GREEN_LEGEND },
  { key: 'path', text: 'Recommended path' },
  { key: 'change', text: 'Dashed blue line: planned change' },
  { key: 'busy', text: 'Amber band: HIGH traffic' },
  { key: 'uncertain', text: 'White corner: depends on an uncertain input' },
];

/** The glyph in a legend swatch, from the same table the cells use. */
export const LEGEND_GLYPH: Readonly<Record<'suitable' | 'unsuitable' | 'unknown', string>> = {
  suitable: STATUS_STYLE.SUITABLE.icon,
  unsuitable: STATUS_STYLE.UNSUITABLE.icon,
  unknown: STATUS_STYLE.UNKNOWN.icon,
};

export interface RawReport {
  readonly label: 'METAR' | 'TAF';
  /** The raw text in use, or null when none is entered. */
  readonly text: string | null;
  /** What to say when there is none. */
  readonly empty: string;
}

export interface EvaluationModel {
  readonly slotCount: number;
  readonly rangeText: string;
  readonly slots: readonly EvaluationSlot[];
  readonly windRuns: readonly Run[];
  readonly overlayBars: readonly OverlayBar[];
  readonly overlayLanes: number;
  /** True when any slot has an event word to show; when false that row is not drawn. */
  readonly hasEventText: boolean;
  /** The rows to draw: fully red rows are left out unless recommended or current. */
  readonly rows: readonly EvaluationRow[];
  readonly hiddenCount: number;
  readonly missing: MissingWeather;
  /** Runs [first, last] of consecutive HIGH-traffic slots. */
  readonly busyRuns: readonly (readonly [number, number])[];
  readonly changeSlots: readonly number[];
  /** Where now falls, in slots from the start of the first (can be outside 0..n). */
  readonly nowSlotFraction: number;
  readonly showNow: boolean;
  /** The column that holds now, or null when now is outside the window. */
  readonly nowCol: number | null;
  readonly nowText: string;
  readonly legend: readonly LegendItem[];
  readonly metar: RawReport;
  readonly taf: RawReport;
}

export function evaluationModel(view: ViewData, displayNowMs: number): EvaluationModel {
  const { pack, result } = view;
  const slotsIn = view.weather.slots;
  const levels = trafficLevelsFor(pack, slotsIn.map((s) => s.startMs), view.demand?.slots ?? []);
  const changes = result.changeovers;
  const missing = missingWeather(view);
  const allRows = modeRows(view);

  const gapSlots = new Set<number>();
  for (const g of result.plan.gaps) for (let i = g.startSlot; i <= g.endSlot; i += 1) gapSlots.add(i);

  const slots: EvaluationSlot[] = slotsIn.map((s, i) => {
    const info = result.evaluation.slots[i];
    const wetState = info?.runwayState ?? 'DRY';
    const wet = wetState === 'WET' ? 'wet' : wetState === 'WET_POSSIBLE' ? 'possible' : 'none';
    const events: string[] = [];
    const titles: string[] = [];
    if (s.weather.thunderstorm === true) {
      events.push('TS');
      titles.push('Thunderstorm at the airport');
    }
    if (s.weather.lowVisibility === true) {
      events.push('low vis');
      titles.push(`Visibility below ${pack.settings.lowVisibilityMetres} m`);
    }
    // The TEMPO, INTER and PROB groups are drawn as bars, not as words here. A METAR-governed slot carries none.
    if (wet === 'possible') events.push('wet risk');
    if (wet === 'wet') events.push('WET');
    if (s.governedBy === 'NONE') events.push(missing === 'NO MET' ? 'no weather' : 'no TAF');
    const change = changes.find((c) => c.change.slotIndex === i);
    if (change !== undefined) {
      const prep = hhmmZRel(change.preparationStartMs, view.calcNowMs);
      titles.push(`${change.change.fromModeId} to ${change.change.toModeId}, ${hhmmZRel(change.change.startMs, view.calcNowMs)}, traffic ${levelWord(change.trafficLevel)}, prepare from ${prep}`);
    }
    if (gapSlots.has(i)) events.push('NO MODE');
    const minute = ((s.startMs % 3_600_000) + 3_600_000) % 3_600_000;
    const midnight = ((s.startMs % 86_400_000) + 86_400_000) % 86_400_000 === 0;
    const level = levels[i] ?? null;
    return {
      index: i,
      startMs: s.startMs,
      time: hhmm(s.startMs),
      onTheHour: minute === 0,
      dateLabel: i === 0 || midnight ? ddmm(s.startMs) : null,
      level,
      levelShort: levelShortWord(level),
      levelTitle: `Traffic ${levelWord(level)}`,
      busy: level === 'busy',
      wet,
      events,
      eventTitle: titles.length === 0 ? `${events.join(', ')} (${hhmmZ(s.startMs)})` : titles.join('; '),
      isChange: change !== undefined,
      noMode: gapSlots.has(i),
      noTaf: s.governedBy === 'NONE',
    };
  });

  const path = result.plan.slots.map((p) => p.modeId);
  const keep = visibleRowIndexes(allRows);
  const rows: EvaluationRow[] = keep.map((k) => {
    const row = allRows[k] as ModeRow;
    const cells: EvaluationCell[] = slotsIn.map((s, i) => {
      const cell = result.evaluation.cells[row.index]?.[i];
      if (cell === undefined) throw new Error(`No cell for mode ${row.index} slot ${i}`);
      const detail = cellDetail(view, row.index, i);
      return { ...cellView(cell, s.startMs, missing, view.calcNowMs), onPath: path[i] === row.modeId, detail: detail === null ? '' : cellDetailText(detail) };
    });
    return { ...row, cells };
  });

  const first = slotsIn[0];
  const last = slotsIn[slotsIn.length - 1];
  const n = slotsIn.length;
  const nowSlotFraction = first === undefined ? 0 : (displayNowMs - first.startMs) / SLOT_MS;
  const showNow = nowSlotFraction >= 0 && nowSlotFraction < n;
  const drawn = overlayBars(slotsIn);
  return {
    slotCount: n,
    rangeText: first === undefined || last === undefined ? '' : `${hhmmZRel(first.startMs, view.calcNowMs)} to ${hhmmZRel(last.endMs, view.calcNowMs)}`,
    slots,
    windRuns: windRuns(slotsIn.map((s) => s.weather.wind)),
    overlayBars: drawn.bars,
    overlayLanes: drawn.lanes,
    hasEventText: slots.some((sl) => sl.events.length > 0),
    rows,
    hiddenCount: allRows.length - rows.length,
    missing,
    busyRuns: runsOf(slots.map((s) => s.busy)),
    changeSlots: changes.map((c) => c.change.slotIndex),
    nowSlotFraction,
    showNow,
    nowCol: showNow ? Math.floor(nowSlotFraction) : null,
    nowText: `NOW ${hhmmZ(displayNowMs)}`,
    legend: LEGEND,
    metar: { label: 'METAR', text: view.metar?.raw ?? null, empty: `Station ${pack.airport.weatherStation}. No METAR entered.` },
    taf: { label: 'TAF', text: view.taf?.raw ?? null, empty: `Station ${pack.airport.weatherStation}. No TAF entered.` },
  };
}

// ------------------------------------------------------------ keyboard
export interface GridPosition {
  readonly row: number;
  readonly col: number;
}

/**
 * The next focus position for a key in the grid, or null when the key is not a
 * grid key. N and C need the column of now and of the first changeover.
 */
export function moveFocus(key: string, at: GridPosition, rows: number, cols: number, nowCol: number | null, changeCol: number | null): GridPosition | null {
  const clampRow = (r: number): number => Math.max(0, Math.min(rows - 1, r));
  const clampCol = (c: number): number => Math.max(0, Math.min(cols - 1, c));
  switch (key) {
    case 'ArrowRight':
      return { row: at.row, col: clampCol(at.col + 1) };
    case 'ArrowLeft':
      return { row: at.row, col: clampCol(at.col - 1) };
    case 'ArrowDown':
      return { row: clampRow(at.row + 1), col: at.col };
    case 'ArrowUp':
      return { row: clampRow(at.row - 1), col: at.col };
    case 'Home':
      return { row: at.row, col: 0 };
    case 'End':
      return { row: at.row, col: cols - 1 };
    case 'PageDown':
      return { row: at.row, col: clampCol(at.col + 4) };
    case 'PageUp':
      return { row: at.row, col: clampCol(at.col - 4) };
    case 'n':
    case 'N':
      return nowCol === null ? null : { row: at.row, col: clampCol(nowCol) };
    case 'c':
    case 'C':
      return changeCol === null ? null : { row: at.row, col: clampCol(changeCol) };
    default:
      return null;
  }
}

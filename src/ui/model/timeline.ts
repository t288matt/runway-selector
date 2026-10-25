// The view model of Panel B, the optimal mode timeline (UI_DESIGN section 6). Plain
// data from one engine result: rows, columns, cell views, overlays. No colour
// is chosen here except through cellView (status.ts).
import { trafficLevelsFor, type Cell, type TrafficLevel, type WindObservation } from '../../engine';
import { preferencePenalty } from '../../engine/optimiser';
import { dir3, ddmm, hhmm, hhmmZ, hhmmZRel, kt1, minimaText } from '../format';
import { SLOT_MS, levelWord, type ViewData } from './dashboard';
import { cellView, type CellView, type MissingWeather } from './status';

/** Layout constants, in pixels. They match the mockup and the CSS. */
export const LAYOUT = { label: 176, column: 56, rowHeight: 36, timeStrip: 34, eventBase: 22, eventLine: 20, trafficStrip: 26 } as const;

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

export function runwaysText(arrivals: readonly string[], departures: readonly string[]): string {
  const a = arrivals.length === 0 ? 'none' : arrivals.join(', ');
  const d = departures.length === 0 ? 'none' : departures.join(', ');
  return `Arr ${a}; Dep ${d}`;
}

/** Rank of a mode in the operating plan for the first slot: 1 is the top preference. Allowed modes only. */
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

/** Rows in operating-plan priority order for the first slot (owner, 24-10-2026); the recommended and current modes are badged, not moved. Enabled modes only. */
export function modeRows(view: ViewData): ModeRow[] {
  const { pack, result } = view;
  const rec = result.plan.recommendedModeId;
  const rows: (ModeRow & { readonly sort: number; readonly order: number })[] = [];
  pack.modes.forEach((mode, index) => {
    if (!mode.enabled) return;
    const isRecommended = mode.id === rec;
    const isCurrent = mode.id === view.currentMode;
    const cell0 = result.evaluation.cells[index]?.[0];
    const cellsOfMode = result.evaluation.cells[index] ?? [];
    const allUnsuitable = cellsOfMode.length > 0 && cellsOfMode.every((c) => c.status === 'UNSUITABLE');
    const penalty = cell0 === undefined ? Number.MAX_SAFE_INTEGER : preferencePenalty(pack, cell0.bandId, mode.id);
    const cap = mode.capacity === null ? 'no capacity set' : `capacity ${mode.capacity} per hour`;
    rows.push({
      index,
      modeId: mode.id,
      isRecommended,
      isCurrent,
      allUnsuitable,
      runwaysText: runwaysText(mode.arrivals, mode.departures),
      title: `Mode ${mode.id}: ${runwaysText(mode.arrivals, mode.departures)}; ${cap}; crosswind limit ${kt1(mode.maxCrosswindKt)} kt${mode.minima === null ? '' : `; minima: ${minimaText(mode.minima)}`}`,
      sort: penalty,
      order: index,
    });
  });
  rows.sort((a, b) => a.sort - b.sort || a.order - b.order);
  return rows.map(({ sort: _sort, order: _order, ...row }) => row);
}

export interface TimelineSlot {
  readonly index: number;
  readonly startMs: number;
  /** "22:30". */
  readonly time: string;
  /** Bold hour label. */
  readonly onTheHour: boolean;
  /** "23-10" on the first column and at midnight, else null. */
  readonly dateLabel: string | null;
  readonly level: TrafficLevel | null;
  readonly busy: boolean;
  readonly wet: 'none' | 'possible' | 'wet';
  /** Short labels for the event strip, in order. */
  readonly events: readonly string[];
  /** Full text for the event strip hover. */
  readonly eventTitle: string;
  readonly isChange: boolean;
  readonly noMode: boolean;
  readonly noTaf: boolean;
}

/** One stretch of slots over which the wind stays as shown (OD-51): drawn as a bar on the first line of the event strip. */
export interface WindRun {
  readonly startSlot: number;
  readonly endSlot: number;
  /** "340/07". */
  readonly label: string;
  readonly title: string;
}

/** One TEMPO, INTER or PROB group drawn as a bar under the wind bars, over the slots its window covers. */
export interface OverlayBar {
  readonly startSlot: number;
  readonly endSlot: number;
  /** Which line of bars it sits on, from 0; groups that overlap in time take separate lines. */
  readonly lane: number;
  /** The group's own text, e.g. "PROB30 TEMPO 2511/2519 VRB30G40KT 1000 TSRA BKN010". */
  readonly label: string;
  /** True when the group is a probability group, which is shown but never changes a cell. */
  readonly probability: boolean;
}

export interface TimelineModel {
  /** The wind bars of the event strip's first line. */
  readonly windRuns: readonly WindRun[];
  /** The TEMPO, INTER and PROB bars; empty when the window has none, and then no line is drawn. */
  readonly overlayBars: readonly OverlayBar[];
  /** How many lines the overlay bars need (0 when there are none). */
  readonly overlayLanes: number;
  /** True when any slot has an event word to show (WET, TS, no TAF and so on); when false that line is not drawn. */
  readonly hasEventText: boolean;
  readonly rows: readonly ModeRow[];
  readonly slots: readonly TimelineSlot[];
  /** cells[rowIndex][slotIndex] */
  readonly cells: readonly (readonly CellView[])[];
  /** recommendedByRow[rowIndex][slotIndex]: this cell lies on the recommended path. */
  readonly onPath: readonly (readonly boolean[])[];
  readonly missing: MissingWeather;
  /** Runs [first, last] of consecutive HIGH-traffic slots. */
  readonly busyRuns: readonly (readonly [number, number])[];
  readonly changeSlots: readonly number[];
  readonly nowSlotFraction: number;
  readonly rangeText: string;
}

/** Height of the weather events strip: the wind line, plus a line for each overlay lane and one for the event words, only when they have something to show. */
export function eventStripHeight(model: Pick<TimelineModel, 'overlayLanes' | 'hasEventText'>): number {
  return LAYOUT.eventBase + LAYOUT.eventLine * (model.overlayLanes + (model.hasEventText ? 1 : 0));
}

/**
 * The TEMPO, INTER and PROB groups over the slots as bars. One bar per distinct group text, from the first slot it
 * covers to the last; a METAR-governed slot carries no overlays, so a bar starts after it. Overlapping groups go on
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
    const label = g.label;
    let lane = laneEnds.findIndex((end) => end < g.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = g.end;
    bars.push({ startSlot: g.start, endSlot: g.end, lane, label, probability: g.probability });
  }
  return { bars, lanes: laneEnds.length };
}

/**
 * The rows to draw (OD-39). A fully red row (UNSUITABLE in every slot) is hidden unless the user asks to see it.
 * The recommended and current-mode rows are never hidden, and when every row is fully red all are shown so the
 * grid is never empty. `hiddenCount` is how many rows the user can reveal.
 */
export function visibleRows(model: Pick<TimelineModel, 'rows' | 'cells' | 'onPath'>, showAll: boolean): Pick<TimelineModel, 'rows' | 'cells' | 'onPath'> & { readonly hiddenCount: number } {
  const hide = (r: ModeRow): boolean => r.allUnsuitable && !r.isRecommended && !r.isCurrent;
  const hidden = model.rows.filter(hide).length;
  if (showAll || hidden === 0 || hidden === model.rows.length) return { rows: model.rows, cells: model.cells, onPath: model.onPath, hiddenCount: showAll || hidden === model.rows.length ? 0 : hidden };
  const keep = model.rows.map((r, i) => (hide(r) ? -1 : i)).filter((i) => i >= 0);
  return { rows: keep.map((i) => model.rows[i] as ModeRow), cells: keep.map((i) => model.cells[i] ?? []), onPath: keep.map((i) => model.onPath[i] ?? []), hiddenCount: hidden };
}

/** A wind change smaller than both of these is not worth a label in the event strip (display only). */
export const WIND_SHIFT_MIN_DEGREES = 10;
export const WIND_SHIFT_MIN_KT = 5;

/**
 * Wind as reported: "340/10", "020/12G22", "VRB/05". A variable direction range (160V220) replaces the single
 * direction, since the engine's crosswind and tailwind figures use the worst case across that range (WC-11),
 * not the mean direction shown alone.
 */
export function windText(w: WindObservation): string {
  const gust = w.gustKt === null ? '' : `G${kt1(w.gustKt)}`;
  const direction =
    w.kind === 'variable' ? 'VRB' : w.variableRangeDegrees === null ? dir3(w.directionDegrees) : `${dir3(w.variableRangeDegrees[0])}V${dir3(w.variableRangeDegrees[1])}`;
  return `${direction}/${kt1(w.speedKt).padStart(2, '0')}${gust}`;
}

const turnDegrees = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.round(d > 180 ? 360 - d : d);
};

/**
 * The event-strip label and hover text for a wind change between two slots, or null when there is none worth
 * showing: the direction moved by less than WIND_SHIFT_MIN_DEGREES and neither the speed nor the gust moved by
 * WIND_SHIFT_MIN_KT. The first slot has no earlier wind to compare with, so it never has a label.
 */
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

function runs(flags: readonly boolean[]): (readonly [number, number])[] {
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

export function missingWeather(view: ViewData): MissingWeather {
  return view.metar === null && view.taf === null ? 'NO MET' : 'NO TAF';
}

/**
 * The wind bars (OD-51). A bar starts at the first slot with a wind and runs until the wind changes enough to be
 * worth a label (windShift, measured from the wind the bar started with, so slow drift cannot creep past the
 * threshold), or until a slot has no wind. The first bar is the wind now.
 */
export function windRuns(winds: readonly (WindObservation | null)[]): WindRun[] {
  const out: WindRun[] = [];
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

export function timelineModel(view: ViewData, displayNowMs: number): TimelineModel {
  const { pack, result } = view;
  const slotsIn = view.weather.slots;
  const levels = trafficLevelsFor(pack, slotsIn.map((s) => s.startMs), view.demand?.slots ?? []);
  const changes = result.changeovers;
  const missing = missingWeather(view);
  const rows = modeRows(view);

  const gapSlots = new Set<number>();
  for (const g of result.plan.gaps) for (let i = g.startSlot; i <= g.endSlot; i += 1) gapSlots.add(i);

  const slots: TimelineSlot[] = slotsIn.map((s, i) => {
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
    // The TEMPO, INTER and PROB groups are drawn as bars (overlayBars), not as words here. A METAR-governed
    // slot carries none (owner, 24-10-2026), matching runwayCondition.ts.
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
    return {
      index: i,
      startMs: s.startMs,
      time: hhmm(s.startMs),
      onTheHour: minute === 0,
      dateLabel: i === 0 || midnight ? ddmm(s.startMs) : null,
      level: levels[i] ?? null,
      busy: levels[i] === 'busy',
      wet,
      events,
      eventTitle: titles.length === 0 ? `${events.join(', ')} (${hhmmZ(s.startMs)})` : titles.join('; '),
      isChange: change !== undefined,
      noMode: gapSlots.has(i),
      noTaf: s.governedBy === 'NONE',
    };
  });

  const path = result.plan.slots.map((p) => p.modeId);
  const cells = rows.map((row) => slotsIn.map((s, i) => cellView(cellAt(view, row.index, i), s.startMs, missing, view.calcNowMs)));
  const onPath = rows.map((row) => slotsIn.map((_s, i) => path[i] === row.modeId));
  const first = slotsIn[0];
  const last = slotsIn[slotsIn.length - 1];
  const drawn = overlayBars(slotsIn);
  return {
    windRuns: windRuns(slotsIn.map((s) => s.weather.wind)),
    overlayBars: drawn.bars,
    overlayLanes: drawn.lanes,
    hasEventText: slots.some((sl) => sl.events.length > 0),
    rows,
    slots,
    cells,
    onPath,
    missing,
    busyRuns: runs(slots.map((s) => s.busy)),
    changeSlots: changes.map((c) => c.change.slotIndex),
    nowSlotFraction: first === undefined ? 0 : (displayNowMs - first.startMs) / SLOT_MS,
    rangeText: first === undefined || last === undefined ? '' : `${hhmmZRel(first.startMs, view.calcNowMs)} to ${hhmmZRel(last.endMs, view.calcNowMs)}`,
  };
}

export function cellAt(view: ViewData, modeIndex: number, slotIndex: number): Cell {
  const cell = view.result.evaluation.cells[modeIndex]?.[slotIndex];
  if (cell === undefined) throw new Error(`No cell for mode ${modeIndex} slot ${slotIndex}`);
  return cell;
}

// ------------------------------------------------------------ keyboard
export interface GridPosition {
  readonly row: number;
  readonly col: number;
}

/**
 * The next focus position for a key in the timeline grid (UI_DESIGN section 9,
 * point 4), or null when the key is not a grid key. N and C need the now and
 * the first changeover column.
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

// -------------------------------------------------------------- tiles
export interface Tile {
  readonly label: string;
  readonly value: string;
}

/** The time the runway next becomes wet or possibly wet, for the Next wet runway tile (OD-59). */
function nextWetRunwayText(view: ViewData): string {
  const slots = view.result.evaluation.slots;
  const first = slots[0];
  if (first === undefined || view.weather.slots[0]?.governedBy === 'NONE') return 'Unknown';
  if (first.runwayState !== 'DRY') return 'Now';
  const next = slots.findIndex((s, i) => i > 0 && s.runwayState !== 'DRY');
  return next < 0 ? 'Not in forecast' : hhmmZRel(slots[next]?.startMs ?? 0, view.calcNowMs);
}

/** The summary tiles above the grid: the recommended mode, the next change, and the next wet runway (OD-49, OD-50, OD-59). */
export function summaryTiles(view: ViewData): Tile[] {
  const change = view.result.changeovers[0];
  const next = view.result.plan.recommendedModeId === null ? '-' : change === undefined ? 'No change planned' : `${change.change.toModeId} at ${hhmmZRel(change.change.startMs, view.calcNowMs)}`;
  return [
    { label: 'Recommended', value: view.result.plan.recommendedModeId ?? 'None' },
    { label: 'Next change', value: next },
    { label: 'Next wet runway', value: nextWetRunwayText(view) },
  ];
}

/** The legend entries, in order. Icon and pattern come from STATUS_STYLE. */
export const LEGEND: readonly { readonly status: 'SUITABLE' | 'MARGINAL' | 'UNSUITABLE' | 'UNKNOWN'; readonly text: string }[] = [
  { status: 'SUITABLE', text: 'Suitable' },
  { status: 'MARGINAL', text: 'Marginal or uncertain' },
  { status: 'UNSUITABLE', text: 'Unsuitable' },
  { status: 'UNKNOWN', text: 'Unknown' },
];

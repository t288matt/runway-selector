// The view model of Panel B, the optimal mode timeline (UI_DESIGN section 6). Plain
// data from one engine result: rows, columns, cell views, overlays. No colour
// is chosen here except through cellView (status.ts).
import { trafficLevelsFor, type Cell, type TrafficLevel, type WindObservation } from '../../engine';
import { preferencePenalty } from '../../engine/optimiser';
import { dir3, ddmm, hhmm, hhmmZ, hhmmZRel, kt1 } from '../format';
import { SLOT_MS, levelWord, type ViewData } from './dashboard';
import { cellView, type CellView, type MissingWeather } from './status';

/** Layout constants, in pixels. They match the mockup and the CSS. */
export const LAYOUT = { label: 176, column: 56, rowHeight: 36, timeStrip: 34, eventStrip: 26, trafficStrip: 26 } as const;

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

/** Rows: recommended first, then the current mode if different, then by operating-plan rank. Enabled modes only. */
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
      title: `Mode ${mode.id}: ${runwaysText(mode.arrivals, mode.departures)}; ${cap}; crosswind limit ${kt1(mode.maxCrosswindKt)} kt`,
      sort: (isRecommended ? 0 : isCurrent ? 1 : 2) * 1e9 + penalty,
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

export interface TimelineModel {
  readonly rows: readonly ModeRow[];
  readonly slots: readonly TimelineSlot[];
  /** cells[rowIndex][slotIndex] */
  readonly cells: readonly (readonly CellView[])[];
  /** recommendedByRow[rowIndex][slotIndex]: this cell lies on the recommended path. */
  readonly onPath: readonly (readonly boolean[])[];
  readonly missing: MissingWeather;
  /** Runs [first, last] of consecutive HIGH-traffic slots. */
  readonly busyRuns: readonly (readonly [number, number])[];
  readonly wetRuns: readonly (readonly [number, number])[];
  readonly changeSlots: readonly number[];
  readonly nowSlotFraction: number;
  readonly rangeText: string;
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

/** Wind as reported: "340/10", "020/12G22", "VRB/05". */
export function windText(w: WindObservation): string {
  const gust = w.gustKt === null ? '' : `G${kt1(w.gustKt)}`;
  return `${w.kind === 'variable' ? 'VRB' : dir3(w.directionDegrees)}/${kt1(w.speedKt).padStart(2, '0')}${gust}`;
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
    const shift = windShift(i === 0 ? null : (slotsIn[i - 1]?.weather.wind ?? null), s.weather.wind);
    if (shift !== null) {
      events.push(shift.label);
      titles.push(shift.title);
    }
    if (s.weather.thunderstorm === true) {
      events.push('TS');
      titles.push('Thunderstorm at the airport');
    }
    if (s.weather.lowVisibility === true) {
      events.push('low vis');
      titles.push(`Visibility below ${pack.settings.lowVisibilityMetres} m`);
    }
    const overlays = s.governedBy === 'METAR' ? (s.tafView?.overlays ?? []) : s.weather.overlays;
    const kinds = [...new Set(overlays.map((o) => o.kind))];
    for (const k of kinds) events.push(k);
    for (const o of overlays) titles.push(o.text);
    if (wet === 'possible') events.push('wet risk');
    if (wet === 'wet') events.push('wet');
    if (s.governedBy === 'NONE') events.push(missing === 'NO MET' ? 'no weather' : 'no TAF');
    const change = changes.find((c) => c.change.slotIndex === i);
    if (change !== undefined) {
      events.push('CHANGE');
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
  return {
    rows,
    slots,
    cells,
    onPath,
    missing,
    busyRuns: runs(slots.map((s) => s.busy)),
    wetRuns: runs(slots.map((s) => s.wet !== 'none')),
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

/** The summary tile above the grid: the recommended mode (OD-49 removed Survives, Next constraint and Traffic at changeover). */
export function summaryTiles(view: ViewData): Tile[] {
  return [{ label: 'Recommended', value: view.result.plan.recommendedModeId ?? 'None' }];
}

/** The legend entries, in order. Icon and pattern come from STATUS_STYLE. */
export const LEGEND: readonly { readonly status: 'SUITABLE' | 'MARGINAL' | 'UNSUITABLE' | 'UNKNOWN'; readonly text: string }[] = [
  { status: 'SUITABLE', text: 'Suitable' },
  { status: 'MARGINAL', text: 'Marginal or uncertain' },
  { status: 'UNSUITABLE', text: 'Unsuitable' },
  { status: 'UNKNOWN', text: 'Unknown' },
];

// View models of Panels A, C and D and of the cell detail (UI_DESIGN section 5,
// 6.4). Text for the recommendation comes from the engine's explanation or from
// the pack; the words penalty, cost, points and score never appear (plain-language
// rule, UI_DESIGN section 13).
import { runwayWind, trafficLevelsFor, withinLimit, type Cell, type TrafficLevel, type WindObservation } from '../../engine';
import { dir3, durationText, hhmmZRel, kt1 } from '../format';
import { RUNWAY_STATE_WORDS, levelWord, type ViewData } from './dashboard';
import { missingWeather, planRank } from './timeline';
import type { DecodedConditions } from '../../weather';
import { cellView, CAUSE_WORDS, STATUS_STYLE } from './status';

// ------------------------------------------------------------------ Panel A
export interface BannerModel {
  readonly tone: 'red' | 'amber' | 'note';
  readonly title: string;
  readonly text: string;
}

export interface BlockedModeModel {
  readonly modeId: string;
  readonly text: string;
  readonly restoreText: string;
}

export interface PanelAModel {
  readonly kind: 'recommended' | 'no-suitable' | 'no-data';
  readonly headline: string;
  readonly modeId: string | null;
  readonly arrivalsText: string;
  readonly departuresText: string;
  readonly nextChange: string;
  readonly weather: { readonly word: string; readonly icon: string; readonly className: string; readonly text: string } | null;
  readonly traffic: string;
  readonly rank: string;
  readonly uncertainty: string;
  readonly runwayState: string;
  readonly ceiling: string;
  readonly banners: readonly BannerModel[];
  readonly whyLines: readonly string[];
  readonly noSuitable: { readonly title: string; readonly perMode: readonly BlockedModeModel[] } | null;
  /** What is missing, for the no-data state. */
  readonly missing: readonly string[];
  /** The note under the current-mode pull-down. */
}

function trafficSentence(view: ViewData): string {
  const starts = view.weather.slots.map((s) => s.startMs);
  const levels = trafficLevelsFor(view.pack, starts, view.demand?.slots ?? []);
  const rank = (l: TrafficLevel | null): number => (l === 'light' ? 0 : l === 'medium' ? 1 : l === 'busy' ? 2 : -1);
  const now = levels[0] ?? null;
  const base = levelWord(now);
  let later = -1;
  for (let i = 1; i < levels.length; i += 1) {
    if (rank(levels[i] ?? null) > rank(now)) {
      later = i;
      break;
    }
  }
  if (later >= 0) return `${base}, ${levelWord(levels[later] ?? null)} by ${hhmmZRel(starts[later] ?? 0, view.calcNowMs)}`;
  // Demand that becomes unknown later in the window is not mentioned (owner, 24-10-2026, OD-45); when it is
  // unknown in every slot, base is already UNKNOWN.
  return base;
}

/**
 * The raw METAR text for the Weather row in Panel A (owner, 24-10-2026, OD-65, then METAR only), or null with no
 * METAR. The TAF is never shown here, even when it governs the slot. Replaces the derived "is suitable on the
 * runways it uses ..." sentence that used to open the Weather row.
 */
function currentReportText(view: ViewData): string | null {
  const raw = view.metar?.raw;
  if (raw === undefined) return null;
  // The airport is already chosen at the top of the page, so the station code is dropped (owner, 24-10-2026).
  return raw.replace(/^(\s*(?:METAR|SPECI)\s+)?(?:COR\s+)?[A-Z]{4}\s+/i, '$1').trim();
}

/**
 * The decoded conditions (clouds, CAVOK, vertical visibility) of whichever report governs the current slot: the
 * METAR, or the TAF's prevailing period at this time when the METAR does not govern. Mirrors the period choice
 * in weather/slots.ts's tafWeather, so it names the same period that decides the slot's weather.
 */
function currentConditions(view: ViewData): DecodedConditions | null {
  const governedBy = view.weather.slots[0]?.governedBy;
  if (governedBy === 'METAR') return view.metar;
  if (governedBy === 'TAF' && view.taf !== null) {
    const endMs = view.weather.slots[0]?.endMs ?? view.calcNowMs;
    let period = view.taf.periods[0];
    for (const p of view.taf.periods) if (p.startMs < endMs) period = p;
    return period ?? null;
  }
  return null;
}

const thousands = (n: number): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Ceiling (owner, 24-10-2026, OD-66): the lowest BKN or OVC base, or the vertical visibility if lower or if no cloud base is reported. CAVOK and a clear sky both mean no ceiling. */
function ceilingText(c: DecodedConditions | null): string {
  if (c === null) return 'Unknown';
  if (c.cavok) return 'CAVOK (no ceiling)';
  const bases = c.clouds.filter((cl) => (cl.quantity === 'BKN' || cl.quantity === 'OVC') && cl.baseFt !== null).map((cl) => cl.baseFt as number);
  const lowestCloud = bases.length === 0 ? null : Math.min(...bases);
  const ceilingFt = c.verticalVisibilityFt !== null && (lowestCloud === null || c.verticalVisibilityFt < lowestCloud) ? c.verticalVisibilityFt : lowestCloud;
  return ceilingFt === null ? 'No ceiling' : `${thousands(ceilingFt)} ft`;
}

function runwayStateSentence(view: ViewData): string {
  const slots = view.result.evaluation.slots;
  const first = slots[0];
  if (first === undefined || view.weather.slots[0]?.governedBy === 'NONE') return 'Unknown';
  const word = RUNWAY_STATE_WORDS[first.runwayState];
  const next = slots.findIndex((s, i) => i > 0 && s.runwayState !== 'DRY' && slots[i - 1]?.runwayState === 'DRY');
  if (first.runwayState === 'DRY') {
    if (next < 0) return word;
    let end = next;
    while (end + 1 < slots.length && slots[end + 1]?.runwayState !== 'DRY') end += 1;
    const w = RUNWAY_STATE_WORDS[slots[next]?.runwayState ?? 'WET'].toLowerCase();
    return `${word}. ${w.charAt(0).toUpperCase()}${w.slice(1)} ${hhmmZRel(slots[next]?.startMs ?? 0, view.calcNowMs)} to ${hhmmZRel(slots[end]?.endMs ?? 0, view.calcNowMs)}`;
  }
  return word;
}

export function panelAModel(view: ViewData): PanelAModel {
  const { pack, result } = view;
  const { plan, explanation, evaluation } = result;
  const recId = plan.recommendedModeId;
  const enabledCount = pack.modes.filter((m) => m.enabled).length;
  const empty = {
    modeId: null,
    arrivalsText: '',
    departuresText: '',
    nextChange: 'Unknown',
    weather: null,
    traffic: trafficSentence(view),
    rank: '-',
    uncertainty: explanation.uncertaintyLine,
    runwayState: runwayStateSentence(view),
    ceiling: ceilingText(currentConditions(view)),
    banners: [] as BannerModel[],
    whyLines: explanation.lines,
    noSuitable: null,
    missing: [] as string[],
  };

  if (recId === null) {
    if (explanation.noSuitableMode !== null) {
      return {
        ...empty,
        kind: 'no-suitable',
        headline: explanation.noSuitableMode.title,
        noSuitable: { title: explanation.noSuitableMode.title, perMode: explanation.noSuitableMode.perMode.map((m) => ({ modeId: m.modeId, text: m.text, restoreText: m.restoreText })) },
      };
    }
    return {
      ...empty,
      kind: 'no-data',
      headline: 'No data. Cannot recommend a mode.',
      missing: [explanation.headline, ...view.weather.banners.filter((b) => b.code === 'no-weather' || b.code === 'no-metar' || b.code === 'no-taf' || b.code === 'taf-ended' || b.code === 'metar-outside-window').map((b) => b.message)],
    };
  }

  const modeIndex = pack.modes.findIndex((m) => m.id === recId);
  const mode = pack.modes[modeIndex];
  const cell0 = evaluation.cells[modeIndex]?.[0];

  const upcoming = result.changeovers.find((c) => c.change.slotIndex > 0);
  const nextChange = upcoming === undefined ? 'No change planned' : `${upcoming.change.fromModeId} to ${upcoming.change.toModeId} at ${hhmmZRel(upcoming.change.startMs, view.calcNowMs)}`;

  const banners: BannerModel[] = [];
  const curIndex = view.currentMode === null ? -1 : pack.modes.findIndex((m) => m.id === view.currentMode);
  const curCell0 = curIndex < 0 ? undefined : evaluation.cells[curIndex]?.[0];
  if (view.currentMode !== null && curCell0 !== undefined && curCell0.status === 'UNSUITABLE') {
    const why = curCell0.reasons.find((r) => r.severity === 'FAIL')?.text ?? 'it fails a mandatory rule';
    banners.push({ tone: 'red', title: 'CURRENT MODE UNSUITABLE', text: `Current mode ${view.currentMode} is unsuitable: ${why}. Change to Mode ${recId}.` });
  }
  if (explanation.earlyChange !== null) {
    banners.push({ tone: 'amber', title: explanation.earlyChange.title, text: explanation.earlyChange.text });
  }
  if (banners.length === 0 && view.currentMode !== null && view.currentMode !== recId) {
    banners.push({ tone: 'note', title: 'NOTE', text: 'Recommended differs from current. See the timeline (B).' });
  }

  const style = cell0 === undefined ? null : STATUS_STYLE[cell0.status];
  const rank = explanation.operatingPlanRank;
  return {
    kind: 'recommended',
    headline: explanation.headline,
    modeId: recId,
    arrivalsText: mode === undefined ? '' : mode.arrivals.join(', ') || 'none',
    departuresText: mode === undefined ? '' : mode.departures.join(', ') || 'none',
    nextChange,
    weather: style === null ? null : { word: style.word.toUpperCase(), icon: style.icon, className: style.className, text: currentReportText(view) ?? explanation.lines[0] ?? '' },
    traffic: trafficSentence(view),
    rank: rank === null ? '-' : `${recId} is priority ${rank} of ${enabledCount}`,
    uncertainty: explanation.uncertaintyLine,
    runwayState: runwayStateSentence(view),
    ceiling: ceilingText(currentConditions(view)),
    banners,
    whyLines: explanation.lines,
    noSuitable: null,
    missing: [],
  };
}

/** Options of the current-mode pull-down: enabled modes, then Not set. */
export function currentModeOptions(view: ViewData): { value: string; label: string }[] {
  return [{ value: '', label: 'Not set' }, ...view.pack.modes.filter((m) => m.enabled).map((m) => ({ value: m.id, label: `Mode ${m.id}` }))];
}

// ------------------------------------------------------------------ Panel C
export interface RunwayComponentRow {
  readonly name: string;
  /** null = unknown wind or variable direction. */
  readonly headwind: string;
  readonly tailwind: string;
  readonly crosswind: string;
  readonly tailLimit: number;
  readonly crossLimit: number;
  /** The first limit this end is over, or null. */
  readonly over: 'TW' | 'XW' | null;
  readonly known: boolean;
}

export function currentWind(view: ViewData): WindObservation | null {
  return view.weather.slots[0]?.weather.wind ?? null;
}

/** The tightest crosswind limit among the enabled modes that use the end, else the pack default. */
export function crosswindLimitFor(view: ViewData, runway: string): number {
  const limits = view.pack.modes.filter((m) => m.enabled && (m.arrivals.includes(runway) || m.departures.includes(runway))).map((m) => m.maxCrosswindKt);
  return limits.length === 0 ? view.pack.settings.defaultCrosswindKt : Math.min(...limits);
}

/** Components for every runway end in the pack, against the limits (WX-2, OD-32). */
export function runwayComponentRows(view: ViewData): RunwayComponentRow[] {
  const { pack } = view;
  const s = pack.settings;
  const first = view.result.evaluation.slots[0];
  const state = first?.runwayState ?? 'DRY';
  const tailLimit = state === 'DRY' ? s.tailwindDryKt : state === 'WET' ? s.tailwindWetKt : Math.min(s.tailwindDryKt, s.tailwindWetKt);
  const wind = currentWind(view);
  const usable = wind !== null && Number.isFinite(wind.speedKt) && wind.speedKt >= 0;
  return pack.runways.map((r) => {
    const crossLimit = crosswindLimitFor(view, r.name);
    if (!usable || wind === null) {
      return { name: r.name, headwind: 'Unknown', tailwind: 'Unknown', crosswind: 'Unknown', tailLimit, crossLimit, over: null, known: false };
    }
    const w = runwayWind(wind, r.headingDegrees, s.calmWindKt);
    const over = !withinLimit(w.tailwindKt, tailLimit, s.limitToleranceKt) ? 'TW' : !withinLimit(w.crosswindKt, crossLimit, s.limitToleranceKt) ? 'XW' : null;
    return {
      name: r.name,
      headwind: w.headwindKt === null ? '-' : kt1(Math.max(0, w.headwindKt)),
      tailwind: kt1(w.tailwindKt),
      crosswind: kt1(w.crosswindKt),
      tailLimit,
      crossLimit,
      over,
      known: true,
    };
  });
}

export function windSentence(wind: WindObservation | null): string {
  if (wind === null) return 'Wind unknown';
  const gust = wind.gustKt === null ? '' : ` gusting ${Math.round(wind.gustKt)}`;
  if (wind.kind === 'variable') return `Wind variable at ${Math.round(wind.speedKt)} kt${gust}`;
  const range = wind.variableRangeDegrees === null ? '' : ` (varying ${dir3(wind.variableRangeDegrees[0])} to ${dir3(wind.variableRangeDegrees[1])})`;
  return `Wind from ${dir3(wind.directionDegrees)} degrees at ${Math.round(wind.speedKt)} kt${gust}${range}`;
}

// ------------------------------------------------------------------ Panel D
export interface TrafficColumn {
  readonly label: string;
  readonly arrivals: string;
  readonly departures: string;
  readonly movements: string;
  readonly level: TrafficLevel | null;
  readonly known: boolean;
}

export interface PanelDModel {
  readonly state: 'none' | 'ok';
  readonly columns: readonly TrafficColumn[];
  readonly connectedArrivals: number | null;
  readonly connectedDepartures: number | null;
  readonly groundElsewhere: number | null;
  readonly elevationMissing: boolean;
  /** Time from which demand is unknown, or null when every shown slot is known. */
  readonly unknownFrom: string | null;
  readonly levelNow: TrafficLevel | null;
}

export function panelDModel(view: ViewData): PanelDModel {
  const slots = view.liveDemand?.slots ?? [];
  const weatherSlots = view.weather.slots;
  const count = Math.min(4, weatherSlots.length);
  const levels = trafficLevelsFor(view.pack, weatherSlots.map((s) => s.startMs), slots);
  const columns: TrafficColumn[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = slots[i];
    const arrivals = t?.arrivals ?? null;
    const departures = t?.departures ?? null;
    const label = i === 0 ? 'Next 30 mins' : `+${i * 30} min`;
    columns.push({
      label,
      arrivals: arrivals === null ? 'Unknown' : String(arrivals),
      departures: departures === null ? 'not est.' : String(departures),
      // The raw count for this 30-minute slot, never doubled to an hourly rate (owner, 24-10-2026, OD-63,
      // amending OD-41 and OD-61, which still doubled the known case).
      movements: arrivals === null ? 'Unknown' : departures === null ? `${arrivals} (arrivals only)` : String(arrivals + departures),
      level: levels[i] ?? null,
      known: arrivals !== null,
    });
  }
  const unknownIndex = slots.findIndex((t) => t.arrivals === null);
  const summary = view.liveDemand?.summary ?? null;
  return {
    state: view.liveDemand === null ? 'none' : 'ok',
    columns,
    connectedArrivals: summary?.connectedArrivals ?? null,
    connectedDepartures: summary?.connectedDepartures ?? null,
    groundElsewhere: summary?.groundElsewhere ?? null,
    elevationMissing: summary?.elevationMissing ?? false,
    unknownFrom: view.liveDemand !== null && unknownIndex >= 0 ? hhmmZRel(slots[unknownIndex]?.startMs ?? 0, view.calcNowMs) : null,
    levelNow: levels[0] ?? null,
  };
}

// -------------------------------------------------------------- cell detail
export interface CellDetailModel {
  readonly title: string;
  readonly statusWord: string;
  readonly icon: string;
  readonly className: string;
  readonly code: string;
  readonly reason: string;
  /** The wind group that caused a MARGINAL or UNSUITABLE cell, e.g. "TEMPO PROB30 VRB20G30KT"; '' when the cause is not a forecast group. Drawn large at the top. */
  readonly trigger: string;
  readonly runways: readonly { name: string; roles: string; tailwind: string; crosswind: string; tailLimit: string; crossLimit: string; overTailwind: boolean; overCrosswind: boolean }[];
  readonly wind: string;
  readonly source: string;
  readonly overlays: readonly string[];
  readonly runwayAssumption: string;
  readonly traffic: string;
  readonly operatingPlan: string;
  readonly survival: string;
  readonly notes: readonly string[];
}

function windText(wind: WindObservation | null): string {
  if (wind === null) return 'No wind available';
  const gust = wind.gustKt === null ? '' : `, gusting ${kt1(wind.gustKt)} kt`;
  if (wind.kind === 'variable') return `Variable at ${kt1(wind.speedKt)} kt${gust}`;
  return `${dir3(wind.directionDegrees)} degrees at ${kt1(wind.speedKt)} kt${gust}`;
}

const WIND_GROUP = /\b(?:VRB|\d{3})\d{2}(?:G\d{2,3})?KT\b/;

/** The forecast group behind the first MARGINAL or FAIL reason, when that reason came from a TEMPO, PROB or similar group (owner, 24-10-2026, OD-71). */
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
  if (severity !== null) {
    const r = cell.reasons.find((x) => x.severity === severity);
    if (r !== undefined) return r.text;
    return 'No further detail';
  }
  // A suitable cell has nothing to explain: no summary line and no runway table (owner, 24-10-2026, OD-44).
  return '';
}

export function cellDetailModel(view: ViewData, modeIndex: number, slotIndex: number): CellDetailModel | null {
  const { pack, result } = view;
  const mode = pack.modes[modeIndex];
  const slot = view.weather.slots[slotIndex];
  const info = result.evaluation.slots[slotIndex];
  const cell = result.evaluation.cells[modeIndex]?.[slotIndex];
  if (mode === undefined || slot === undefined || info === undefined || cell === undefined) return null;
  const cv = cellView(cell, slot.startMs, missingWeather(view), view.calcNowMs);
  const level = trafficLevelsFor(pack, [slot.startMs], view.demand?.slots ?? [])[0] ?? null;

  const runways = (cell.status === 'SUITABLE' ? [] : cell.runways).map((r) => ({
    name: r.runway,
    roles: r.roles.map((x) => (x === 'ARRIVAL' ? 'ARR' : 'DEP')).join(' '),
    tailwind: kt1(r.tailwindKt),
    crosswind: kt1(r.crosswindKt),
    tailLimit: kt1(info.runwayState === 'WET' ? r.tailwindLimitWetKt : info.runwayState === 'DRY' ? r.tailwindLimitDryKt : Math.min(r.tailwindLimitDryKt, r.tailwindLimitWetKt)),
    crossLimit: kt1(r.crosswindLimitKt),
    overTailwind: r.tailwindKt > (info.runwayState === 'WET' ? r.tailwindLimitWetKt : r.tailwindLimitDryKt) + pack.settings.limitToleranceKt,
    overCrosswind: r.crosswindKt > r.crosswindLimitKt + pack.settings.limitToleranceKt,
  }));

  const source = slot.governedBy === 'METAR' ? 'Decided by the METAR' : slot.governedBy === 'TAF' ? 'Decided by the TAF (prevailing group)' : 'No report covers this slot';
  const overlaySource = slot.governedBy === 'METAR' ? (slot.tafView?.overlays ?? []) : slot.weather.overlays;
  const overlays = overlaySource.map((o) => `${o.kind}${o.probabilityPct === null ? '' : ` PROB${o.probabilityPct}`}: ${o.text}`);

  const assumption = info.runwayState === 'WET_POSSIBLE' ? 'WET POSSIBLE: both dry and wet are evaluated' : info.runwayState === 'WET' ? 'WET' : 'DRY';

  let trafficText = `${levelWord(level)}`;
  const d = cell.demand;
  if (d.knownDemand === null) trafficText += '; demand unknown';
  else trafficText += `; known demand ${d.knownDemand} in the slot${d.arrivals !== null && d.departures === null ? ' (arrivals only; departures are not estimated beyond the next slot)' : ''}`;
  trafficText += d.capacityPerHour === null ? '; no capacity set' : `; capacity ${d.capacityPerHour} per hour (${kt1(d.capacityInSlot ?? 0)} in the slot)`;

  const band = cell.bandId;
  const planFail = cell.reasons.some((r) => r.code === 'PLAN' && r.severity === 'FAIL');
  const rank = planRank(view, modeIndex, slotIndex);
  const operatingPlan = planFail
    ? `Not allowed in time band ${band ?? 'unknown'}`
    : `Allowed${band === null || pack.plan.find((b) => b.id === band)?.allDay === true ? '' : ` in time band ${band}`}${rank === null ? '' : `, priority ${rank}`}`;

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
    className: cv.className,
    code: code === '' ? '' : `${code}: ${CAUSE_WORDS[code] ?? code}`,
    reason: primary,
    trigger: triggerText(cell),
    runways,
    wind: windText(slot.weather.wind),
    source,
    overlays,
    runwayAssumption: assumption,
    traffic: trafficText,
    operatingPlan,
    survival: parts.join('; '),
    notes: [...(cell.uncertain ? ['This status depends on an uncertain input.'] : []), ...others],
  };
}


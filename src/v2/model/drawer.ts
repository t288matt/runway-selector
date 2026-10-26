// What the More drawer shows, as plain data: the Settings values (read only, from
// the pack), the audit trail rows, the Why text and the Key. v2's own copy of v1's
// drawer model (v2 imports nothing from src/ui). Every string is shown as a text
// node (SEC-2). The words penalty, cost, points and score never appear: the
// operating plan is shown as a rank derived from the pack numbers.
import { conditionalOperationCheck } from '../../engine';
import type { AirportPack, PlanBand, SettingName } from '../../refdata';
import { formatClock } from '../../refdata';
import type { AuditEntry, AuditValue } from '../../store';
import { hhmmZ, hhmmZRel, kt1, minimaText } from '../format';
import { BANDS, type Band } from './answer';
import { WINDOW_OPTIONS, type ViewData } from './dashboard';
import { LEGEND, type LegendItem } from './evaluation';
import { CAUSE_WORDS } from './status';
import { levelWord } from './tiles';

// ----------------------------------------------------------------- settings
/** One labelled value with its pack description as help text. */
export interface DrawerRow {
  readonly label: string;
  readonly value: string;
  /** The pack's description of the value, or null. Plain text. */
  readonly help: string | null;
}

export interface DrawerSection {
  readonly id: string;
  readonly title: string;
  /** Shows the "Simulation setting" label beside the title. */
  readonly simulation: boolean;
  readonly rows: readonly DrawerRow[];
}

export interface RankGroup {
  /** 1 is the most preferred. Equal numbers share a rank; the next rank skips (the same rule as the rank on the timeline). */
  readonly rank: number;
  readonly word: string;
  readonly modes: readonly string[];
}

export interface PlanBandModel {
  readonly id: string;
  readonly times: string;
  /** The band covers the whole day, so it is the only band and needs no heading of its own. */
  readonly allDay: boolean;
  readonly groups: readonly RankGroup[];
  readonly notAllowed: readonly string[];
  readonly allEqual: boolean;
}

export interface SettingsModel {
  readonly sections: readonly DrawerSection[];
  readonly plan: readonly PlanBandModel[];
  readonly planNote: string;
  readonly zone: readonly DrawerRow[];
  readonly airportNote: string;
  readonly reloadNote: string;
  readonly auditNote: string;
  readonly auditEmpty: string;
}

export const SIMULATION_LABEL = 'Simulation setting';
export const READ_ONLY_NOTE = 'Everything here is read only: it is edited in the pack files, then use Reload data.';

const help = (pack: AirportPack, name: SettingName): string | null => {
  const d = pack.descriptions[name];
  return d === '' ? null : d;
};
const row = (pack: AirportPack, name: SettingName, label: string, value: string): DrawerRow => ({ label, value, help: help(pack, name) });

/** 120 -> "2 hours"; 90 -> "90 minutes"; 150 -> "2 hours 30 minutes"; 60 -> "1 hour". */
export function limitText(minutes: number): string {
  const unit = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (minutes < 120 && minutes !== 60) return unit(minutes, 'minute');
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? unit(h, 'hour') : `${unit(h, 'hour')} ${unit(rest, 'minute')}`;
}

function bandTimes(band: PlanBand): string {
  return band.allDay ? 'all day (local time)' : `${formatClock(band.startMinute)} to ${formatClock(band.endMinute)} local time`;
}

/** The operating plan for one band as ranks (lower number = more preferred). Enabled modes only. */
export function planBandModel(pack: AirportPack, band: PlanBand): PlanBandModel {
  const entries: { id: string; value: number }[] = [];
  const notAllowed: string[] = [];
  for (const mode of pack.modes) {
    if (!mode.enabled) continue;
    const r = band.rows.find((x) => x.mode === mode.id);
    if (r !== undefined && !r.allowed) notAllowed.push(mode.id);
    else entries.push({ id: mode.id, value: r === undefined ? pack.settings.preferenceDefaultPenalty : r.penalty });
  }
  const values = [...new Set(entries.map((e) => e.value))].sort((a, b) => a - b);
  const groups: RankGroup[] = values.map((value, i) => ({
    rank: 1 + entries.filter((e) => e.value < value).length,
    word: i === 0 ? (values.length === 1 ? 'all equal' : 'preferred') : 'less preferred',
    modes: entries.filter((e) => e.value === value).map((e) => e.id),
  }));
  return { id: band.id, times: bandTimes(band), allDay: band.allDay, groups, notAllowed, allEqual: values.length === 1 };
}

function trafficBandsText(pack: AirportPack): string {
  const b = pack.settings.trafficBands;
  const span = (band: readonly (number | null)[]): string => ((band[1] ?? null) === null ? `${band[0]} or more` : `${band[0]} to ${band[1]}`);
  return `${levelWord('light')} ${span(b.light)}; ${levelWord('medium')} ${span(b.medium)}; ${levelWord('busy')} ${span(b.busy)}`;
}

export function settingsModel(pack: AirportPack, nowMs: number): SettingsModel {
  const s = pack.settings;
  const enabled = pack.modes.filter((m) => m.enabled);
  const limits: DrawerSection = {
    id: 'limits',
    title: 'Limits',
    simulation: true,
    rows: [
      row(pack, 'tailwindDryKt', 'Tailwind limit, dry runway', `${kt1(s.tailwindDryKt)} kt`),
      row(pack, 'tailwindWetKt', 'Tailwind limit, wet runway', `${kt1(s.tailwindWetKt)} kt`),
      row(pack, 'defaultCrosswindKt', 'Default crosswind limit', `${kt1(s.defaultCrosswindKt)} kt`),
      ...enabled.map((m): DrawerRow => ({ label: `Crosswind limit, Mode ${m.id}`, value: `${kt1(m.maxCrosswindKt)} kt`, help: null })),
      ...enabled.flatMap((m): DrawerRow[] => (m.minima === null ? [] : [{ label: `Minima, Mode ${m.id}`, value: minimaText(m.minima), help: null }])),
      row(pack, 'calmWindKt', 'Calm wind threshold', `${kt1(s.calmWindKt)} kt`),
      row(pack, 'limitToleranceKt', 'Limit tolerance', `${s.limitToleranceKt} kt`),
      row(pack, 'nearLimitMarginKt', 'Near-limit margin', `${kt1(s.nearLimitMarginKt)} kt`),
    ],
  };
  const wetness: DrawerSection = {
    id: 'wetness',
    title: 'Runway wetness',
    simulation: true,
    rows: [row(pack, 'wetRunwayProbabilityPct', 'Wet if PROB at or above', `${s.wetRunwayProbabilityPct} %`), row(pack, 'dryingTimeMinutes', 'Drying time', `${s.dryingTimeMinutes} min`)],
  };
  const traffic: DrawerSection = {
    id: 'traffic',
    title: 'Traffic and timing',
    simulation: true,
    rows: [
      row(pack, 'trafficBands', 'Traffic bands (movements per 30 minutes)', trafficBandsText(pack)),
      ...enabled.map((m): DrawerRow => ({ label: `Capacity, Mode ${m.id}`, value: m.capacity === null ? 'no limit' : `${m.capacity} movements per hour`, help: null })),
      row(pack, 'changeoverPreparationMinutes', 'Changeover preparation time', `${s.changeoverPreparationMinutes} min`),
      row(pack, 'demandHorizonMinutes', 'Forecast horizon for traffic', `${s.demandHorizonMinutes} min`),
      row(pack, 'forecastWindowMinutes', 'Default forecast window in the pack', s.forecastWindowMinutes === null ? 'Full TAF' : `${s.forecastWindowMinutes} min`),
    ],
  };
  const modes: DrawerSection = {
    id: 'modes',
    title: 'Enabled modes',
    simulation: false,
    rows: enabled.map((m): DrawerRow => ({ label: `Mode ${m.id}`, value: `Arr ${m.arrivals.join(', ')}; Dep ${m.departures.join(', ')}`, help: null })),
  };
  return {
    sections: [limits, wetness, traffic, modes],
    plan: pack.plan.map((b) => planBandModel(pack, b)),
    planNote: 'Priority 1 is the most preferred. Modes with the same priority are equally preferred. The recommendation also weighs weather and traffic.',
    zone: [
      { label: 'Time zone', value: pack.airport.timeZone, help: "The airport's own time zone. Used only to work out the operating plan's time bands; every time on screen is UTC." },
      { label: 'Now', value: hhmmZ(nowMs), help: 'Times on screen are UTC.' },
    ],
    airportNote: 'Choose the airport at the top of the screen. Only airports with a reviewed data pack can be shown. Each airport keeps its own current mode, window and audit trail.',
    reloadNote: 'Reload data re-reads and re-checks the airport files. A file that fails the check is refused and the previous valid data stays in use.',
    auditNote: `Kept in this browser. It records changes to the current mode and the window only, newest first, and keeps the last ${s.auditMaxEntries} entries. Changes to the airport data files are not recorded here.`,
    auditEmpty: 'No changes yet. Change the current mode to see an entry.',
  };
}

// -------------------------------------------------------------- audit trail
export interface AuditRowModel {
  readonly key: string;
  readonly time: string;
  readonly what: string;
  readonly old: string;
  readonly new: string;
}

const WHAT: Readonly<Record<string, string>> = { currentMode: 'Current mode', forecastWindow: 'Forecast window' };

function auditValue(path: string, value: AuditValue): string {
  if (value === null) return 'Not set';
  if (path === 'currentMode') return `Mode ${value}`;
  if (path === 'forecastWindow') return WINDOW_OPTIONS.find((o) => o.id === value)?.label ?? String(value);
  return String(value);
}

/** Newest first. */
export function auditRows(entries: readonly AuditEntry[]): AuditRowModel[] {
  return [...entries]
    .map((e, i) => ({ e, i }))
    .reverse()
    .map(({ e, i }) => ({ key: `${i}-${e.timeMs}`, time: hhmmZ(e.timeMs), what: WHAT[e.path] ?? e.path, old: auditValue(e.path, e.old), new: auditValue(e.path, e.new) }));
}

// ---------------------------------------------------------------------- why
export interface WhyBanner {
  readonly tone: 'red' | 'amber' | 'ok';
  readonly title: string;
  readonly text: string;
}

export interface WhyModel {
  readonly kind: 'recommended' | 'no-suitable' | 'no-data';
  /** The engine's one-line headline (the whole answer when there is nothing more to say). */
  readonly headline: string;
  readonly banners: readonly WhyBanner[];
  /** The reasons, one paragraph each: v1's "More about the recommendation". */
  readonly lines: readonly string[];
  readonly noSuitable: { readonly title: string; readonly perMode: readonly { readonly modeId: string; readonly text: string; readonly restoreText: string }[] } | null;
  /** What is missing, for the no-data state. */
  readonly missing: readonly string[];
}

/**
 * The conditional-operation note: "<name> conditions met" for the recommended mode, when it has a conditional operation,
 * along the recommended path, on slots where its cell is SUITABLE and the check is MET. "until HH:MMZ" when the first
 * slot qualifies, "from HH:MMZ" when only a later one does, else none. Advisory only.
 */
function conditionalBanner(view: ViewData, modeIndex: number): WhyBanner | null {
  const op = view.pack.modes[modeIndex]?.conditionalOperation ?? null;
  const recId = view.result.plan.recommendedModeId;
  if (op === null || recId === null) return null;
  const { evaluation, plan } = view.result;
  const qualifies = (i: number): boolean => {
    const slot = view.weather.slots[i];
    return slot !== undefined && plan.slots[i]?.modeId === recId && evaluation.cells[modeIndex]?.[i]?.status === 'SUITABLE' && conditionalOperationCheck(op, slot, evaluation.slots[i]?.runwayState ?? 'DRY') === 'MET';
  };
  const count = Math.min(plan.slots.length, view.weather.slots.length);
  const title = `${op.name} conditions met`;
  if (count > 0 && qualifies(0)) {
    let last = 0;
    while (last + 1 < count && qualifies(last + 1)) last += 1;
    return { tone: 'ok', title, text: `until ${hhmmZRel(view.weather.slots[last]?.endMs ?? 0, view.calcNowMs)}` };
  }
  for (let i = 1; i < count; i += 1) if (qualifies(i)) return { tone: 'ok', title, text: `from ${hhmmZRel(view.weather.slots[i]?.startMs ?? 0, view.calcNowMs)}` };
  return null;
}

export function whyModel(view: ViewData): WhyModel {
  const { pack, result } = view;
  const { plan, explanation, evaluation } = result;
  const recId = plan.recommendedModeId;
  if (recId === null) {
    if (explanation.noSuitableMode !== null) {
      return {
        kind: 'no-suitable',
        headline: explanation.noSuitableMode.title,
        banners: [],
        lines: explanation.lines,
        noSuitable: { title: explanation.noSuitableMode.title, perMode: explanation.noSuitableMode.perMode.map((m) => ({ modeId: m.modeId, text: m.text, restoreText: m.restoreText })) },
        missing: [],
      };
    }
    return {
      kind: 'no-data',
      headline: 'No data. Cannot recommend a mode.',
      banners: [],
      lines: explanation.lines,
      noSuitable: null,
      missing: [explanation.headline, ...view.weather.banners.filter((b) => b.code === 'no-weather' || b.code === 'no-metar' || b.code === 'no-taf' || b.code === 'taf-ended' || b.code === 'metar-outside-window').map((b) => b.message)],
    };
  }
  const banners: WhyBanner[] = [];
  const curIndex = view.currentMode === null ? -1 : pack.modes.findIndex((m) => m.id === view.currentMode);
  const curCell0 = curIndex < 0 ? undefined : evaluation.cells[curIndex]?.[0];
  if (view.currentMode !== null && curCell0 !== undefined && curCell0.status === 'UNSUITABLE') {
    const why = curCell0.reasons.find((r) => r.severity === 'FAIL')?.text ?? 'it fails a mandatory rule';
    banners.push({ tone: 'red', title: 'CURRENT MODE UNSUITABLE', text: `Current mode ${view.currentMode} is unsuitable: ${why}. Change to Mode ${recId}.` });
  }
  if (explanation.earlyChange !== null) banners.push({ tone: 'amber', title: explanation.earlyChange.title, text: explanation.earlyChange.text });
  const conditional = conditionalBanner(
    view,
    pack.modes.findIndex((m) => m.id === recId),
  );
  if (conditional !== null) banners.push(conditional);
  // The first line is the weather in use, which the METAR tile and the Evaluation section show; it is not said twice.
  return { kind: 'recommended', headline: explanation.headline, banners, lines: explanation.lines.slice(1), noSuitable: null, missing: [] };
}

// ---------------------------------------------------------------------- key
export interface KeyModel {
  readonly states: readonly { readonly band: Band; readonly meaning: string }[];
  readonly legend: readonly LegendItem[];
  readonly causes: readonly { readonly code: string; readonly word: string }[];
  readonly runwayKey: readonly string[];
}

const STATE_MEANING: Readonly<Record<Band['id'], string>> = {
  HOLD: 'this mode is advised',
  CHANGE_SOON: 'an early change is advised',
  CHANGE_NOW: 'the current mode is unsuitable now',
  NO_SUITABLE: 'no standard mode fits',
  NO_DATA: 'there is not enough weather to say',
};

/**
 * The states the v2 screen can show. v2 has no current mode (issue 104), so CHANGE NOW (the operator's mode is unsuitable)
 * cannot appear; the Key does not list it. CHANGE SOON can, because the engine's own planned early change needs no current mode.
 */
export const REACHABLE_STATES = ['HOLD', 'CHANGE_SOON', 'NO_SUITABLE', 'NO_DATA'] as const;

export function keyModel(): KeyModel {
  return {
    states: (REACHABLE_STATES).map((id) => ({ band: BANDS[id], meaning: STATE_MEANING[id] })),
    legend: LEGEND,
    causes: Object.entries(CAUSE_WORDS).map(([code, word]) => ({ code, word })),
    runwayKey: ['Blue runways are used by the recommended mode; ARR is arrivals and DEP is departures.'],
  };
}

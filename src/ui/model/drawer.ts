// The settings drawer as plain data (UI_DESIGN "Settings", DB-9, OD-27). Pure:
// everything comes from the pack, the stored current mode, the audit entries
// and the clock. Every string is shown as a text node (SEC-2). The words
// penalty, cost, points and score never appear: the operating plan is shown as
// a rank, derived from the pack numbers (UI_DESIGN plain-language rule).
import type { AirportPack, PlanBand, SettingName } from '../../refdata';
import { formatClock } from '../../refdata';
import type { AuditEntry, AuditValue, CurrentModeRecord } from '../../store';
import { ddmmyyyy, hhmm, kt1, localStamp, safeHttpsLink, utcAndLocal, zoneOffsetLabel } from '../format';
import { isCurrentModeStale } from '../../store';
import { levelWord, WINDOW_OPTIONS } from './dashboard';

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
  readonly groups: readonly RankGroup[];
  readonly notAllowed: readonly string[];
  readonly allEqual: boolean;
}

export interface ProvenanceRow {
  readonly label: string;
  readonly status: string;
  readonly source: string | null;
  /** Set only when the source starts with https: (SEC-2). */
  readonly link: string | null;
}

export interface DrawerModel {
  readonly title: string;
  readonly onScreenNote: string;
  readonly sections: readonly DrawerSection[];
  readonly plan: readonly PlanBandModel[];
  readonly planNote: string;
  readonly zone: readonly DrawerRow[];
  readonly provenance: readonly ProvenanceRow[];
}

export const SIMULATION_LABEL = 'Simulation setting';
export const ON_SCREEN_NOTE = 'On screen you can change only the current mode and the window. Everything else here is read only: it is edited in the pack files, then use Reload data.';

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
  return { id: band.id, times: bandTimes(band), groups, notAllowed, allEqual: values.length === 1 };
}

function trafficBandsText(pack: AirportPack): string {
  const b = pack.settings.trafficBands;
  const span = (band: readonly (number | null)[]): string => ((band[1] ?? null) === null ? `${band[0]} or more` : `${band[0]} to ${band[1]}`);
  return `${levelWord('light')} ${span(b.light)}; ${levelWord('medium')} ${span(b.medium)}; ${levelWord('busy')} ${span(b.busy)}`;
}

export function drawerModel(pack: AirportPack, nowMs: number): DrawerModel {
  const s = pack.settings;
  const enabled = pack.modes.filter((m) => m.enabled);
  const tz = pack.airport.timeZone;
  const limits: DrawerSection = {
    id: 'limits',
    title: 'Limits',
    simulation: true,
    rows: [
      row(pack, 'tailwindDryKt', 'Tailwind limit, dry runway', `${kt1(s.tailwindDryKt)} kt`),
      row(pack, 'tailwindWetKt', 'Tailwind limit, wet runway', `${kt1(s.tailwindWetKt)} kt`),
      row(pack, 'defaultCrosswindKt', 'Default crosswind limit', `${kt1(s.defaultCrosswindKt)} kt`),
      ...enabled.map((m): DrawerRow => ({ label: `Crosswind limit, Mode ${m.id}`, value: `${kt1(m.maxCrosswindKt)} kt`, help: null })),
      row(pack, 'calmWindKt', 'Calm wind threshold', `${kt1(s.calmWindKt)} kt`),
      row(pack, 'limitToleranceKt', 'Limit tolerance', `${s.limitToleranceKt} kt`),
      row(pack, 'nearLimitMarginKt', 'Near-limit margin', `${kt1(s.nearLimitMarginKt)} kt`),
    ],
  };
  const wetness: DrawerSection = {
    id: 'wetness',
    title: 'Runway wetness',
    simulation: true,
    rows: [
      row(pack, 'wetRunwayProbabilityPct', 'Wet if PROB at or above', `${s.wetRunwayProbabilityPct} %`),
      row(pack, 'dryingTimeMinutes', 'Drying time', `${s.dryingTimeMinutes} min`),
    ],
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

  const prov = (label: string, p: { status: string | null; source: string | null }): ProvenanceRow => ({
    label,
    status: p.status ?? 'not stated',
    source: p.source,
    link: p.source === null ? null : safeHttpsLink(p.source),
  });
  const m = pack.meta;
  return {
    title: 'Settings',
    onScreenNote: ON_SCREEN_NOTE,
    sections: [limits, wetness, traffic, modes],
    plan: pack.plan.map((b) => planBandModel(pack, b)),
    planNote: 'Rank 1 is the most preferred. Modes with the same rank are equally preferred. The recommendation also weighs weather and traffic.',
    zone: [
      { label: 'Time zone', value: `${tz}, ${zoneOffsetLabel(nowMs, tz)} now`, help: null },
      { label: 'Now', value: utcAndLocal(nowMs, tz), help: 'Times on screen are UTC, with the airport local time beside.' },
    ],
    provenance: [prov('Airport', m.airport), prov('Runways', m.runways), prov('Modes', m.modes), prov('Operating plan', m.operatingPlan), prov('Settings', m.settings)],
  };
}

// ------------------------------------------------------------ current mode
export interface CurrentModeStatus {
  /** null when no mode is set. */
  readonly modeId: string | null;
  /** "set 10:15 UTC (21:15 local)", or null when no mode is set. */
  readonly setText: string | null;
  readonly stale: boolean;
  /** "set more than 2 hours ago", from the pack value; null when not stale. */
  readonly staleWords: string | null;
  /** The Still current button is shown only when a mode is set. */
  readonly canConfirm: boolean;
}

export function currentModeStatus(record: CurrentModeRecord | null, nowMs: number, pack: AirportPack): CurrentModeStatus {
  if (record === null || record.modeId === null) return { modeId: null, setText: null, stale: false, staleWords: null, canConfirm: false };
  const sameDay = ddmmyyyy(record.setAtMs) === ddmmyyyy(nowMs);
  const when = `${sameDay ? '' : `${ddmmyyyy(record.setAtMs)} `}${hhmm(record.setAtMs)} UTC`;
  const stale = isCurrentModeStale(record, nowMs, pack);
  return {
    modeId: record.modeId,
    setText: `set ${when} (${localStamp(record.setAtMs, pack.airport.timeZone)} local)`,
    stale,
    staleWords: stale ? `set more than ${limitText(pack.settings.currentModeStaleMinutes)} ago` : null,
    canConfirm: true,
  };
}

// --------------------------------------------------------------- audit trail
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
export function auditRows(entries: readonly AuditEntry[], pack: AirportPack): AuditRowModel[] {
  const tz = pack.airport.timeZone;
  return [...entries]
    .map((e, i) => ({ e, i }))
    .reverse()
    .map(({ e, i }) => ({
      key: `${i}-${e.timeMs}`,
      time: utcAndLocal(e.timeMs, tz),
      what: WHAT[e.path] ?? e.path,
      old: auditValue(e.path, e.old),
      new: auditValue(e.path, e.new),
    }));
}

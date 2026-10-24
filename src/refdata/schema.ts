// Pack schemas (DESIGN section 5a, REQUIREMENTS SEC-3, RD-7).
//
// Valibot checks shape, types, ranges and caps. Cross-references between files
// (a mode naming a missing runway, gaps in time bands) are our own code in
// crossCheck.ts. Every object here is STRICT: an unknown key is refused.
import * as v from 'valibot';
import type { DeepReadonly } from './types';

export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;

/**
 * THE ONE BOUNDS TABLE. Every numeric range, size cap, length cap and depth
 * cap used by the loader is here, and nowhere else (SEC-3).
 *
 * The values are PROPOSED simulation bounds, chosen to be wide enough for any
 * real airport and narrow enough to refuse nonsense (a 500 kt tailwind limit).
 * They are not airport facts. They are owner-reviewable: change a number here
 * and the tests that name it follow.
 */
export const BOUNDS = {
  /** Inclusive numeric ranges. */
  range: {
    latitudeDeg: { min: -90, max: 90 },
    longitudeDeg: { min: -180, max: 180 },
    elevationFt: { min: -1500, max: 20000 },
    trafficAreaNm: { min: 0.5, max: 100 },
    groundMaxSpeedKt: { min: 1, max: 100 },
    groundAltitudeMarginFt: { min: 0, max: 2000 },
    arrivalSpeedFloorKt: { min: 1, max: 400 },
    headingDegrees: { min: 0, max: 360 },
    crosswindKt: { min: 0, max: 40 },
    capacityPerHour: { min: 1, max: 200 },
    tailwindKt: { min: 0, max: 15 },
    limitToleranceKt: { min: 0, max: 1 },
    calmWindKt: { min: 0, max: 10 },
    nearLimitMarginKt: { min: 0, max: 10 },
    probabilityPct: { min: 0, max: 100 },
    dryingMinutes: { min: 0, max: 720 },
    metarValidityMinutes: { min: 0, max: 360 },
    forecastWindowMinutes: { min: 30, max: 2160 },
    demandHorizonMinutes: { min: 30, max: 1440 },
    departureSpreadMinutes: { min: 1, max: 180 },
    groundSpeedKt: { min: 50, max: 700 },
    trafficBandCount: { min: 0, max: 500 },
    penalty: { min: 0, max: 1000 },
    planRowPenalty: { min: 0, max: 100000 },
    noModePenalty: { min: 0, max: 1000000 },
    changeoverPreparationMinutes: { min: 0, max: 120 },
    staleMinutes: { min: 1, max: 2880 },
    lowVisibilityMetres: { min: 50, max: 10000 },
    weatherPollMinutes: { min: 1, max: 120 },
    // No enforced minimum (OD/UP-2): 1 is the smallest positive whole number of seconds.
    vatsimPollSeconds: { min: 1, max: 3600 },
    auditMaxEntries: { min: 10, max: 5000 },
  },
  /** Size, length, count and depth caps. */
  cap: {
    packFileBytes: 256 * 1024,
    appFileBytes: 16 * 1024,
    maxJsonDepth: 10,
    maxAirports: 50,
    maxRunways: 40,
    maxModes: 100,
    maxBands: 48,
    maxRowsPerBand: 100,
    maxRunwaysPerMode: 40,
    maxPrecipitationCodes: 30,
    maxLabels: 50,
    nameChars: 80,
    descriptionChars: 1000,
    sourceChars: 300,
    labelKeyChars: 40,
    labelValueChars: 300,
    timeZoneChars: 64,
    maxReportedIssues: 20,
  },
} as const;

const R = BOUNDS.range;
const C = BOUNDS.cap;

// ---------------------------------------------------------------- helpers
const num = (r: { min: number; max: number }) =>
  v.pipe(v.number('Expected a number'), v.finite(), v.minValue(r.min), v.maxValue(r.max));
const int = (r: { min: number; max: number }) =>
  v.pipe(v.number('Expected a whole number'), v.integer(), v.minValue(r.min), v.maxValue(r.max));
const text = (max: number) => v.pipe(v.string('Expected text'), v.minLength(1), v.maxLength(max));
const note = v.pipe(v.string('Expected text'), v.trim(), v.nonEmpty('A description must not be empty'), v.maxLength(C.descriptionChars));
const status = v.picklist(['verified', 'provisional'], 'status must be "verified" or "provisional"');

/** Optional free-text and provenance fields that any record may carry. */
const meta = {
  description: v.optional(note),
  source: v.optional(text(C.sourceChars)),
  status: v.optional(status),
};

const version = v.picklist(SUPPORTED_SCHEMA_VERSIONS, (issue) => {
  const got = typeof issue.input === 'number' ? String(issue.input) : typeof issue.input;
  return `Unsupported schemaVersion ${got}; this app supports: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`;
});

const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;
const isKnownZone = (zone: string): boolean => {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return formatter.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

/** The shape of an airport code and of an airport folder id. */
export const AIRPORT_ID = /^[A-Z0-9]{3,8}$/;
const runwayName = v.pipe(v.string('Expected text'), v.regex(/^[A-Za-z0-9]{1,8}$/, 'A runway name is 1 to 8 letters or digits'));
const modeId = v.pipe(
  v.string('Expected text'),
  v.regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/, 'An id is 1 to 16 letters, digits, "_" or "-", starting with a letter or digit (a leading "_" marks a note)'),
);
export const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const clock = v.pipe(v.string('Expected a time as HH:MM'), v.regex(HHMM, 'Expected a time as HH:MM (00:00 to 23:59)'));

// ------------------------------------------------------------ airport.json
export const AirportFileSchema = v.strictObject({
  schemaVersion: version,
  ...meta,
  icao: v.pipe(v.string('Expected text'), v.regex(AIRPORT_ID, 'An airport code is 3 to 8 capital letters or digits')),
  name: text(C.nameChars),
  latitude: num(R.latitudeDeg),
  longitude: num(R.longitudeDeg),
  elevationFt: v.optional(num(R.elevationFt)),
  timeZone: v.pipe(
    v.string('Expected an IANA time zone name'),
    v.maxLength(C.timeZoneChars),
    v.regex(ZONE_SHAPE, 'Expected an IANA time zone name'),
    v.check(isKnownZone, 'Not a time zone this browser or Node knows'),
  ),
  weatherStation: v.pipe(v.string('Expected text'), v.regex(/^[A-Z0-9]{3,8}$/, 'A station is 3 to 8 capital letters or digits')),
  trafficAreaNm: num(R.trafficAreaNm),
  groundMaxSpeedKt: num(R.groundMaxSpeedKt),
  groundAltitudeMarginFt: num(R.groundAltitudeMarginFt),
  arrivalSpeedFloorKt: num(R.arrivalSpeedFloorKt),
  labels: v.optional(
    v.pipe(
      v.record(v.pipe(v.string(), v.regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'A label key is 1 to 40 letters, digits or "_", starting with a letter (keys starting with "_" are notes and are not allowed here)')), text(C.labelValueChars)),
      v.check((o) => Object.keys(o).length <= C.maxLabels, `At most ${C.maxLabels} labels`),
    ),
  ),
});

// ------------------------------------------------------------ runways.json
const RunwaySchema = v.strictObject({
  name: runwayName,
  headingDegrees: num(R.headingDegrees),
  threshold: v.optional(v.strictObject({ latitude: num(R.latitudeDeg), longitude: num(R.longitudeDeg) })),
  ...meta,
});
export const RunwaysFileSchema = v.strictObject({
  schemaVersion: version,
  ...meta,
  runways: v.pipe(v.array(RunwaySchema), v.minLength(1, 'At least one runway end is required'), v.maxLength(C.maxRunways)),
});

// --------------------------------------------------------------- modes.json
const runwayList = v.pipe(v.array(runwayName), v.maxLength(C.maxRunwaysPerMode));
const ModeSchema = v.strictObject({
  id: modeId,
  enabled: v.boolean('Expected true or false'),
  arrivals: runwayList,
  departures: runwayList,
  maxCrosswindKt: v.optional(num(R.crosswindKt)),
  capacity: v.optional(v.nullable(int(R.capacityPerHour))),
  ...meta,
});
export const ModesFileSchema = v.strictObject({
  schemaVersion: version,
  ...meta,
  modes: v.pipe(v.array(ModeSchema), v.minLength(1, 'At least one mode is required'), v.maxLength(C.maxModes)),
});

// ------------------------------------------------------ operating_plan.json
const PlanRowSchema = v.strictObject({
  mode: modeId,
  allowed: v.boolean('Expected true or false'),
  penalty: num(R.planRowPenalty),
  ...meta,
});
const PlanBandSchema = v.strictObject({
  id: modeId,
  start: clock,
  end: clock,
  /** true marks a whole-day band; then start and end must be equal. */
  allDay: v.optional(v.boolean('Expected true or false')),
  rows: v.pipe(v.array(PlanRowSchema), v.maxLength(C.maxRowsPerBand)),
  ...meta,
});
export const OperatingPlanFileSchema = v.strictObject({
  schemaVersion: version,
  ...meta,
  bands: v.pipe(v.array(PlanBandSchema), v.minLength(1, 'At least one time band is required'), v.maxLength(C.maxBands)),
});

// ------------------------------------------------------------ settings.json
const trafficBands = v.strictObject({
  light: v.strictTuple([int(R.trafficBandCount), int(R.trafficBandCount)]),
  medium: v.strictTuple([int(R.trafficBandCount), int(R.trafficBandCount)]),
  busy: v.strictTuple([int(R.trafficBandCount), v.null_()]),
});

/** The value schema of every tunable. This list IS the tunable inventory. */
export const SETTING_VALUE_SCHEMAS = {
  tailwindDryKt: num(R.tailwindKt),
  tailwindWetKt: num(R.tailwindKt),
  defaultCrosswindKt: num(R.crosswindKt),
  limitToleranceKt: num(R.limitToleranceKt),
  calmWindKt: num(R.calmWindKt),
  nearLimitMarginKt: num(R.nearLimitMarginKt),
  wetRunwayProbabilityPct: num(R.probabilityPct),
  dryingTimeMinutes: int(R.dryingMinutes),
  precipitationCodes: v.pipe(
    v.array(v.pipe(v.string('Expected text'), v.regex(/^[A-Z]{2}$/, 'A precipitation code is two capital letters'))),
    v.minLength(1),
    v.maxLength(C.maxPrecipitationCodes),
  ),
  metarValidityMinutes: int(R.metarValidityMinutes),
  lowVisibilityMetres: int(R.lowVisibilityMetres),
  forecastWindowMinutes: v.nullable(int(R.forecastWindowMinutes)),
  demandHorizonMinutes: int(R.demandHorizonMinutes),
  assumedDepartureWindowMinutes: int(R.departureSpreadMinutes),
  assumedGroundSpeedKt: num(R.groundSpeedKt),
  trafficBands,
  preferenceDefaultPenalty: num(R.penalty),
  marginalPenalty: num(R.penalty),
  changePenaltyLight: num(R.penalty),
  changePenaltyMedium: num(R.penalty),
  changePenaltyBusy: num(R.penalty),
  unknownDemandChangePenalty: num(R.penalty),
  noModePenalty: num(R.noModePenalty),
  changeoverPreparationMinutes: int(R.changeoverPreparationMinutes),
  metarStaleMinutes: int(R.staleMinutes),
  tafStaleMinutes: int(R.staleMinutes),
  vatsimStaleMinutes: int(R.staleMinutes),
  weatherPollMinutes: int(R.weatherPollMinutes),
  vatsimPollSeconds: int(R.vatsimPollSeconds),
  currentModeStaleMinutes: int(R.staleMinutes),
  auditMaxEntries: int(R.auditMaxEntries),
} as const;

/** The engine-facing settings: plain values, no descriptions. */
export type Settings = DeepReadonly<{ [K in keyof typeof SETTING_VALUE_SCHEMAS]: v.InferOutput<(typeof SETTING_VALUE_SCHEMAS)[K]> }>;
export type SettingName = keyof Settings;
export const SETTING_NAMES = Object.keys(SETTING_VALUE_SCHEMAS) as SettingName[];

/** A tunable is { value, description } and the description must not be empty (RD-7). */
const tunable = <T extends v.GenericSchema>(value: T) =>
  v.strictObject({ value, description: note, source: v.optional(text(C.sourceChars)), status: v.optional(status) });

const tunableEntries = Object.fromEntries(
  Object.entries(SETTING_VALUE_SCHEMAS).map(([name, schema]) => [name, tunable(schema)]),
) as { [K in SettingName]: ReturnType<typeof tunable<(typeof SETTING_VALUE_SCHEMAS)[K]>> };

export const SettingsFileSchema = v.strictObject({
  schemaVersion: version,
  ...meta,
  ...tunableEntries,
});

// ------------------------------------------------------------------ app.json
export const AppFileSchema = v.strictObject({
  schemaVersion: version,
  description: v.optional(note),
  airports: v.pipe(
    v.array(v.pipe(v.string('Expected text'), v.regex(AIRPORT_ID, 'An airport id is 3 to 8 capital letters or digits'))),
    v.minLength(1, 'At least one airport is required'),
    v.maxLength(C.maxAirports),
  ),
  default: v.pipe(v.string('Expected text'), v.regex(AIRPORT_ID, 'An airport id is 3 to 8 capital letters or digits')),
});

export type AirportFile = v.InferOutput<typeof AirportFileSchema>;
export type RunwaysFile = v.InferOutput<typeof RunwaysFileSchema>;
export type ModesFile = v.InferOutput<typeof ModesFileSchema>;
export type OperatingPlanFile = v.InferOutput<typeof OperatingPlanFileSchema>;
export type SettingsFile = v.InferOutput<typeof SettingsFileSchema>;
export type AppFile = v.InferOutput<typeof AppFileSchema>;

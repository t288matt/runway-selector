// The pure loader pipeline (DESIGN section 4c, run-time sequence 3 and 4):
//   raw text -> size cap -> depth cap -> JSON -> forbidden keys -> strip `_` notes
//   -> schema -> cross-references -> strip descriptions, unwrap {value}
//   -> deep-freeze -> AirportPack.
// No fetch, no clock, no storage: it runs under Node and in the page.
import * as v from 'valibot';
import { crossCheck } from './crossCheck';
import { checkDepth, checkSize, findDuplicateKeys, findForbiddenKeys, stripNoteKeys } from './guards';
import type { PackIssue } from './issues';
import { PackValidationError, pathToString } from './issues';
import { parseClock } from './planTime';
import {
  AirportFileSchema,
  AppFileSchema,
  BOUNDS,
  ModesFileSchema,
  OperatingPlanFileSchema,
  RunwaysFileSchema,
  SETTING_NAMES,
  SettingsFileSchema,
  type AppFile,
  type SettingName,
  type Settings,
} from './schema';
import type { AirportPack, Provenance } from './types';

export const PACK_FILE_NAMES = ['airport.json', 'runways.json', 'modes.json', 'operating_plan.json', 'settings.json'] as const;
export type PackFileName = (typeof PACK_FILE_NAMES)[number];
/** The raw text of each pack file, keyed by file name. */
export type RawPackText = Readonly<Record<PackFileName, string>>;

/** Raw text -> JSON value, after the size cap, the depth cap and the forbidden-key check. */
function readJson(file: string, text: unknown, maxBytes: number, issues: PackIssue[], keepAt: readonly string[] = []): unknown {
  if (typeof text !== 'string') {
    issues.push({ file, path: '', message: 'The file is missing' });
    return undefined;
  }
  const tooBig = checkSize(file, text, maxBytes);
  if (tooBig) {
    issues.push(tooBig);
    return undefined;
  }
  const tooDeep = checkDepth(file, text, BOUNDS.cap.maxJsonDepth);
  if (tooDeep) {
    issues.push(tooDeep);
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    issues.push({ file, path: '', message: `Not valid JSON: ${e instanceof Error ? e.message : 'parse error'}` });
    return undefined;
  }
  const bad = [...findForbiddenKeys(file, value), ...findDuplicateKeys(file, text)];
  if (bad.length > 0) {
    issues.push(...bad);
    return undefined;
  }
  return stripNoteKeys(value, keepAt);
}

function schemaIssues(file: string, issues: readonly v.BaseIssue<unknown>[]): PackIssue[] {
  return issues.map((i) => ({
    file,
    path: pathToString((i.path ?? []).map((p) => p.key as string | number)),
    message: i.message,
  }));
}

function parseWith<S extends v.GenericSchema>(file: string, schema: S, value: unknown, issues: PackIssue[]): v.InferOutput<S> | undefined {
  const result = v.safeParse(schema, value);
  if (result.success) return result.output;
  issues.push(...schemaIssues(file, result.issues));
  return undefined;
}

/** Validate app.json (the cross-airport file). Throws PackValidationError. */
export function parseAppConfig(rawText: string): AppFile {
  const issues: PackIssue[] = [];
  const json = readJson('app.json', rawText, BOUNDS.cap.appFileBytes, issues);
  const app = json === undefined ? undefined : parseWith('app.json', AppFileSchema, json, issues);
  if (app) {
    const seen = new Set<string>();
    app.airports.forEach((id, i) => {
      if (seen.has(id.toLowerCase())) issues.push({ file: 'app.json', path: `airports[${i}]`, message: `Duplicate airport "${id}"` });
      seen.add(id.toLowerCase());
    });
    if (!app.airports.includes(app.default)) {
      issues.push({ file: 'app.json', path: 'default', message: `The default airport "${app.default}" is not in the airports list` });
    }
  }
  if (issues.length > 0 || !app) throw new PackValidationError(issues);
  return deepFreeze(app);
}

const prov = (o: { status?: 'verified' | 'provisional' | undefined; source?: string | undefined }): Provenance => ({
  status: o.status ?? null,
  source: o.source ?? null,
});

/**
 * Validate and build an AirportPack from the raw text of the five files.
 * Throws PackValidationError (listing every problem) and never returns a
 * partly valid pack.
 */
export function parsePack(raw: Readonly<Record<string, string>>): AirportPack {
  const issues: PackIssue[] = [];
  for (const name of Object.keys(raw)) {
    if (!(PACK_FILE_NAMES as readonly string[]).includes(name)) {
      issues.push({ file: name, path: '', message: 'Not a pack file' });
    }
  }
  const json: Record<PackFileName, unknown> = {
    'airport.json': readJson('airport.json', raw['airport.json'], BOUNDS.cap.packFileBytes, issues, ['labels']),
    'runways.json': readJson('runways.json', raw['runways.json'], BOUNDS.cap.packFileBytes, issues),
    'modes.json': readJson('modes.json', raw['modes.json'], BOUNDS.cap.packFileBytes, issues),
    'operating_plan.json': readJson('operating_plan.json', raw['operating_plan.json'], BOUNDS.cap.packFileBytes, issues),
    'settings.json': readJson('settings.json', raw['settings.json'], BOUNDS.cap.packFileBytes, issues),
  };
  if (issues.length > 0) throw new PackValidationError(issues);

  const airport = parseWith('airport.json', AirportFileSchema, json['airport.json'], issues);
  const runways = parseWith('runways.json', RunwaysFileSchema, json['runways.json'], issues);
  const modes = parseWith('modes.json', ModesFileSchema, json['modes.json'], issues);
  const operatingPlan = parseWith('operating_plan.json', OperatingPlanFileSchema, json['operating_plan.json'], issues);
  const settings = parseWith('settings.json', SettingsFileSchema, json['settings.json'], issues);
  if (!airport || !runways || !modes || !operatingPlan || !settings || issues.length > 0) throw new PackValidationError(issues);

  const crossIssues = crossCheck({ airport, runways, modes, operatingPlan, settings });
  if (crossIssues.length > 0) throw new PackValidationError(crossIssues);

  // Unwrap every tunable to its value; keep the descriptions apart.
  const values: Record<string, unknown> = {};
  const descriptions: Record<string, string> = {};
  for (const name of SETTING_NAMES) {
    const entry = settings[name];
    values[name] = entry.value;
    descriptions[name] = entry.description;
  }
  const defaultCrosswindKt = settings.defaultCrosswindKt.value;

  const pack: AirportPack = {
    airport: {
      icao: airport.icao,
      name: airport.name,
      latitude: airport.latitude,
      longitude: airport.longitude,
      elevationFt: airport.elevationFt ?? null,
      timeZone: airport.timeZone,
      weatherStation: airport.weatherStation,
      trafficAreaNm: airport.trafficAreaNm,
      groundMaxSpeedKt: airport.groundMaxSpeedKt,
      groundAltitudeMarginFt: airport.groundAltitudeMarginFt,
      arrivalSpeedFloorKt: airport.arrivalSpeedFloorKt,
      labels: { ...(airport.labels ?? {}) },
    },
    runways: runways.runways.map((r) => ({
      name: r.name,
      headingDegrees: r.headingDegrees,
      threshold: r.threshold ? { latitude: r.threshold.latitude, longitude: r.threshold.longitude } : null,
      ...prov(r),
    })),
    modes: modes.modes.map((m) => ({
      id: m.id,
      enabled: m.enabled,
      arrivals: [...m.arrivals],
      departures: [...m.departures],
      maxCrosswindKt: m.maxCrosswindKt ?? defaultCrosswindKt,
      capacity: m.capacity ?? null,
      ...prov(m),
    })),
    plan: operatingPlan.bands.map((b) => ({
      id: b.id,
      allDay: b.allDay ?? false,
      startMinute: parseClock(b.start),
      endMinute: parseClock(b.end),
      rows: b.rows.map((row) => ({ mode: row.mode, allowed: row.allowed, penalty: row.penalty, ...prov(row) })),
      ...prov(b),
    })),
    settings: values as unknown as Settings,
    descriptions: descriptions as Record<SettingName, string>,
    meta: {
      schemaVersion: airport.schemaVersion,
      airport: prov(airport),
      runways: prov(runways),
      modes: prov(modes),
      operatingPlan: prov(operatingPlan),
      settings: prov(settings),
    },
  };
  return deepFreeze(pack);
}

/** Freeze an object and everything inside it. Returns the same object. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

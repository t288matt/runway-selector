// Parses the VATSIM data feed (SEC-3, SEC-6). Only six fields of each pilot and
// four of each prefile are kept. The output type has no field for a name, member number, callsign or
// anything else, so personal data cannot survive the parse.
import { checkDepth, checkSize, findForbiddenKeys } from '../refdata/guards';
import { FEED_MAX_BYTES, FEED_MAX_DEPTH, FEED_MAX_PILOTS, ICAO_MAX_LENGTH } from './config';

/** One aircraft with a flight plan. The complete list of what is kept. */
export interface Aircraft {
  readonly latitude: number;
  readonly longitude: number;
  /** Feet. */
  readonly altitude: number;
  /** Knots. */
  readonly groundspeed: number;
  /** Filed origin, upper case, possibly empty. */
  readonly departure: string;
  /** Filed destination, upper case, possibly empty. */
  readonly arrival: string;
}

/** A filed plan that has not connected yet. The complete list of what is kept; it has no position. */
export interface Prefile {
  /** Filed origin, upper case. */
  readonly departure: string;
  /** Filed destination, upper case. */
  readonly arrival: string;
  /** Filed departure time, in minutes after 00:00 UTC (0 to 1439), or null when missing or malformed. */
  readonly departureMinuteOfDay: number | null;
  /** Filed time en route, in minutes (at most one day), or null when missing or malformed. */
  readonly enrouteMinutes: number | null;
}

export interface ParsedFeed {
  readonly aircraft: readonly Aircraft[];
  readonly prefiles: readonly Prefile[];
  /** The feed's own update time (UTC ms), or null when it is missing or unreadable. */
  readonly feedTimestampMs: number | null;
  /** Pilot entries skipped because they were malformed (a count only). */
  readonly skippedPilots: number;
}

export type ParseResult = { readonly ok: true; readonly feed: ParsedFeed } | { readonly ok: false; readonly message: string };

const refuse = (message: string): ParseResult => ({ ok: false, message: `VATSIM feed refused: ${message}` });

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const ICAO_SHAPE = /^[A-Z0-9]*$/;

function icao(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase();
  return s.length <= ICAO_MAX_LENGTH && ICAO_SHAPE.test(s) ? s : null;
}

/** A VATSIM time such as "0930" (hours and minutes), as minutes; null when it is not that shape. */
function hhmm(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\d{4}$/.test(v)) return null;
  const hours = Number(v.slice(0, 2));
  const minutes = Number(v.slice(2));
  return minutes < 60 ? hours * 60 + minutes : null;
}

/** A prefile with a usable filed time and ends; anything else is ignored (no count: prefiles are not pilots). */
function readPrefile(p: unknown): Prefile | null {
  if (!isRecord(p) || !isRecord(p['flight_plan'])) return null;
  const plan = p['flight_plan'];
  const departure = icao(plan['departure']);
  const arrival = icao(plan['arrival']);
  if (departure === null || arrival === null) return null;
  // A bad time does not drop the plan: a departure from here still counts (its take-off time is not used).
  const deptime = hhmm(plan['deptime']);
  const enroute = hhmm(plan['enroute_time']);
  const departureMinuteOfDay = deptime !== null && deptime < 1440 ? deptime : null;
  const enrouteMinutes = enroute !== null && enroute <= 1440 ? enroute : null;
  return { departure, arrival, departureMinuteOfDay, enrouteMinutes };
}

/** null = no flight plan (ignored); 'bad' = malformed (skipped and counted). */
function readPilot(p: unknown): Aircraft | null | 'bad' {
  if (!isRecord(p)) return 'bad';
  const plan = p['flight_plan'];
  if (plan === null || plan === undefined) return null;
  if (!isRecord(plan)) return 'bad';
  const latitude = p['latitude'];
  const longitude = p['longitude'];
  const altitude = p['altitude'];
  const groundspeed = p['groundspeed'];
  const departure = icao(plan['departure']);
  const arrival = icao(plan['arrival']);
  if (!inRange(latitude, -90, 90) || !inRange(longitude, -180, 180)) return 'bad';
  if (!inRange(altitude, -2000, 150000) || !inRange(groundspeed, 0, 5000)) return 'bad';
  if (departure === null || arrival === null) return 'bad';
  return { latitude, longitude, altitude, groundspeed, departure, arrival };
}

function readTimestamp(general: unknown): number | null {
  if (!isRecord(general)) return null;
  const t = general['update_timestamp'];
  if (typeof t !== 'string' || t.length > 64) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

/** Validates the feed text and keeps only the allowed fields. Never throws. */
export function parseFeed(text: string): ParseResult {
  const file = 'VATSIM feed';
  const sizeIssue = checkSize(file, text, FEED_MAX_BYTES);
  if (sizeIssue) return refuse(sizeIssue.message);
  const depthIssue = checkDepth(file, text, FEED_MAX_DEPTH);
  if (depthIssue) return refuse(depthIssue.message);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse('it is not valid JSON');
  }
  const forbidden = findForbiddenKeys(file, raw)[0];
  if (forbidden) return refuse(forbidden.message);
  if (!isRecord(raw) || !Array.isArray(raw['pilots'])) return refuse('it has no pilots list');
  const pilots: unknown[] = raw['pilots'];
  if (pilots.length > FEED_MAX_PILOTS) return refuse(`it lists more than ${FEED_MAX_PILOTS} pilots`);
  const aircraft: Aircraft[] = [];
  let skippedPilots = 0;
  for (const p of pilots) {
    const a = readPilot(p);
    if (a === 'bad') skippedPilots += 1;
    else if (a !== null) aircraft.push(a);
  }
  const prefiles: Prefile[] = [];
  const rawPrefiles = raw['prefiles'];
  if (Array.isArray(rawPrefiles)) {
    // Prefiles beyond the limit are dropped, not a reason to refuse the whole feed: they carry no position.
    for (const p of rawPrefiles.slice(0, FEED_MAX_PILOTS)) {
      const f = readPrefile(p);
      if (f !== null) prefiles.push(f);
    }
  }
  return { ok: true, feed: { aircraft, prefiles, feedTimestampMs: readTimestamp(raw['general']), skippedPilots } };
}

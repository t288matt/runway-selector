// Parses the VATSIM data feed (SEC-3, SEC-6). Only six fields of each pilot are
// kept. The output type has no field for a name, member number, callsign or
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

export interface ParsedFeed {
  readonly aircraft: readonly Aircraft[];
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
  return { ok: true, feed: { aircraft, feedTimestampMs: readTimestamp(raw['general']), skippedPilots } };
}

// Reading the first groups of a report (type, station, time) with our own code,
// before the library sees the text. This is where wrong-box pastes, several
// reports in one box, NIL reports and the station check are caught.

const STATION = /^[A-Z][A-Z0-9]{3}$/;
const TIME = /^(\d{2})(\d{2})(\d{2})Z?$/;
const TIME_STRICT = /^\d{6}Z$/;
const VALIDITY = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/;

export interface MetarHeader {
  readonly reportType: 'METAR' | 'SPECI';
  readonly station: string;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly corrected: boolean;
  /** Index of the first token after the time group. */
  readonly bodyStart: number;
}

export type HeaderResult<T> = { readonly ok: true; readonly header: T } | { readonly ok: false; readonly message: string };

/** Another report starts inside the text: a second METAR/SPECI/TAF keyword, or a station followed by a time group. */
function secondReportAt(tokens: readonly string[], from: number): string | null {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i] as string;
    if (t === 'METAR' || t === 'SPECI' || t === 'TAF') return t;
    if (STATION.test(t) && TIME_STRICT.test(tokens[i + 1] ?? '')) return `${t} ${tokens[i + 1] as string}`;
  }
  return null;
}

export function parseMetarHeader(tokens: readonly string[]): HeaderResult<MetarHeader> {
  let i = 0;
  let reportType: 'METAR' | 'SPECI' = 'METAR';
  if (tokens[0] === 'TAF') return { ok: false, message: 'This is a TAF, not a METAR. Paste it into the TAF box.' };
  if (tokens[0] === 'METAR' || tokens[0] === 'SPECI') {
    reportType = tokens[0];
    i = 1;
  }
  let corrected = false;
  if (tokens[i] === 'COR') {
    corrected = true;
    i++;
  }
  const station = tokens[i];
  if (station === undefined || !STATION.test(station)) {
    return { ok: false, message: `The METAR must start with a four-character station code; found "${station ?? ''}".` };
  }
  const timeToken = tokens[i + 1];
  const m = timeToken === undefined ? null : TIME.exec(timeToken);
  if (m === null) {
    return { ok: false, message: `The METAR has no observation time group (such as 231400Z) after the station ${station}; found "${timeToken ?? ''}".` };
  }
  const second = secondReportAt(tokens, i + 2);
  if (second !== null) {
    return { ok: false, message: `Found more than one report in the METAR box (a second one starts at "${second}"). Paste one report.` };
  }
  if (tokens.slice(i + 2).some((t) => /^\d{4}\/\d{4}$/.test(t))) {
    return { ok: false, message: 'This looks like a TAF (it has a validity period such as 2312/2418), not a METAR. Paste it into the TAF box.' };
  }
  const day = Number(m[1]);
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) {
    return { ok: false, message: `The observation time group ${timeToken as string} is not a valid day, hour and minute.` };
  }
  const bodyStart = i + 2;
  if (tokens[bodyStart] === 'COR') corrected = true;
  return { ok: true, header: { reportType, station, day, hour, minute, corrected, bodyStart } };
}

export interface TafHeader {
  readonly amended: boolean;
  readonly corrected: boolean;
  readonly station: string;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /** Validity period as written, or null when the report has none (a NIL TAF). */
  readonly validity: { readonly startDay: number; readonly startHour: number; readonly endDay: number; readonly endHour: number } | null;
  /** Token after the validity (or after the time when there is no validity), for NIL and CNL. */
  readonly next: string | null;
}

export function parseTafHeader(tokens: readonly string[]): HeaderResult<TafHeader> {
  let i = 0;
  if (tokens[0] === 'METAR' || tokens[0] === 'SPECI') return { ok: false, message: 'This is a METAR, not a TAF. Paste it into the METAR box.' };
  while (tokens[i] === 'TAF') i++;
  let amended = false;
  let corrected = false;
  if (tokens[i] === 'AMD') {
    amended = true;
    i++;
  } else if (tokens[i] === 'COR') {
    corrected = true;
    i++;
  }
  const station = tokens[i];
  if (station === undefined || !STATION.test(station)) {
    return { ok: false, message: `The TAF must start with a four-character station code; found "${station ?? ''}".` };
  }
  const timeToken = tokens[i + 1];
  const m = timeToken !== undefined && TIME_STRICT.test(timeToken) ? TIME.exec(timeToken) : null;
  if (m === null) {
    return { ok: false, message: `The TAF has no issue time group (such as 231100Z) after the station ${station}; found "${timeToken ?? ''}".` };
  }
  const second = secondReportAt(tokens, i + 2);
  if (second !== null) {
    return { ok: false, message: `Found more than one report in the TAF box (a second one starts at "${second}"). Paste one TAF.` };
  }
  const day = Number(m[1]);
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) {
    return { ok: false, message: `The issue time group ${timeToken as string} is not a valid day, hour and minute.` };
  }
  const v = VALIDITY.exec(tokens[i + 2] ?? '');
  const validity = v === null ? null : { startDay: Number(v[1]), startHour: Number(v[2]), endDay: Number(v[3]), endHour: Number(v[4]) };
  const next = tokens[i + (validity === null ? 2 : 3)] ?? null;
  return { ok: true, header: { amended, corrected, station, day, hour, minute, validity, next } };
}

/**
 * The library reads "11/2SM" as the fraction 11/2 (5.5 miles). In Canadian and
 * US reports it means 1 and a half miles. A one-digit whole number followed by
 * a fraction written without a space is split ("1 1/2SM") so the library
 * reads it correctly. Real fractions below one mile (1/2SM, 1/4SM) are not
 * touched.
 */
export function splitMixedFractions(text: string): string {
  return text.replace(/(^| )(\d)(\d\/\d{1,2}SM)(?= |$)/g, '$1$2 $3');
}

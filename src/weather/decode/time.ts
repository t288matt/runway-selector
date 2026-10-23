// Resolving "day of month + hour + minute" to a real instant (DESIGN section 6,
// "Report entry and selection"). Pure: the clock is the `nowMs` argument.
// Everything is UTC. Hour 24 means 00:00 of the next day.

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

/** UTC instant of day `day` of the month `monthIndex` (0-based, may be out of 0..11) of `year`, or null if the month has no such day. */
function dateOrNull(year: number, monthIndex: number, day: number): number | null {
  const ms = Date.UTC(year, monthIndex, day);
  return new Date(ms).getUTCDate() === day ? ms : null;
}

/** Candidate dates for `day` in the months around the month containing `refMs`, from `monthsBack` before to `monthsForward` after. */
function candidateDates(refMs: number, day: number, monthsBack: number, monthsForward: number): number[] {
  const ref = new Date(refMs);
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const out: number[] = [];
  for (let k = -monthsBack; k <= monthsForward; k++) {
    const ms = dateOrNull(y, m + k, day);
    if (ms !== null) out.push(ms);
  }
  return out;
}

export function validDayHourMinute(day: number, hour: number, minute: number, allowHour24: boolean): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  if (day < 1 || day > 31 || minute < 0 || minute > 59) return false;
  return hour >= 0 && (allowHour24 ? hour <= 24 : hour <= 23) && !(hour === 24 && minute !== 0);
}

function atTime(dateMs: number, hour: number, minute: number): number {
  return dateMs + hour * HOUR_MS + minute * MIN_MS;
}

/**
 * The most recent calendar date at or before today (UTC) whose day of month is
 * `day`, combined with the time of day. A report time a few minutes ahead of
 * the clock on today's date stays on today's date (clock skew must not turn a
 * fresh report into one a month old). Returns null if no date matches.
 */
export function resolveRecent(day: number, hour: number, minute: number, nowMs: number): number | null {
  if (!validDayHourMinute(day, hour, minute, false)) return null;
  const now = new Date(nowMs);
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // Months back 0..2 always contain a match for any day 1..31 (two consecutive 30-day months never occur).
  const found = candidateDates(nowMs, day, 2, 0)
    .filter((ms) => ms <= todayMs)
    .sort((a, b) => b - a)[0];
  return found === undefined ? null : atTime(found, hour, minute);
}

/** The instant with that day, hour and minute nearest to `refMs` (months before, same and after the reference). Null if invalid. */
export function resolveNearest(day: number, hour: number, minute: number, refMs: number, allowHour24: boolean): number | null {
  if (!validDayHourMinute(day, hour, minute, allowHour24)) return null;
  let best: number | null = null;
  for (const ms of candidateDates(refMs, day, 1, 1)) {
    const t = atTime(ms, hour, minute);
    if (best === null || Math.abs(t - refMs) < Math.abs(best - refMs)) best = t;
  }
  return best;
}

/** The earliest instant at or after `afterMs` with that day, hour and minute (looking up to two months ahead). Null if none. */
export function resolveOnOrAfter(day: number, hour: number, minute: number, afterMs: number, allowHour24: boolean): number | null {
  if (!validDayHourMinute(day, hour, minute, allowHour24)) return null;
  let best: number | null = null;
  for (const ms of candidateDates(afterMs, day, 1, 2)) {
    const t = atTime(ms, hour, minute);
    if (t >= afterMs && (best === null || t < best)) best = t;
  }
  return best;
}

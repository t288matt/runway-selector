// Time-of-day helpers for operating-plan bands (minutes of the local day).
export const MINUTES_PER_DAY = 1440;

export function parseClock(hhmm: string): number {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3, 5));
  return h * 60 + m;
}

export function formatClock(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Does the band [start, end) contain this minute of the day? Equal start and end means the whole day. */
export function bandContains(startMinute: number, endMinute: number, minute: number): boolean {
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) return minute >= startMinute && minute < endMinute;
  return minute >= startMinute || minute < endMinute;
}

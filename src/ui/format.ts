// Plain-text formatting helpers for the screen. UTC first, the airport's local
// time beside it (owner answer Q7). Every function returns a string; nothing
// here produces markup (SEC-2).
const MS_MINUTE = 60_000;
const MS_DAY = 86_400_000;

export const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

function utcParts(ms: number): { h: number; m: number; s: number } {
  const inDay = ((ms % MS_DAY) + MS_DAY) % MS_DAY;
  return { h: Math.floor(inDay / 3_600_000), m: Math.floor((inDay % 3_600_000) / MS_MINUTE), s: Math.floor((inDay % MS_MINUTE) / 1000) };
}

/** "22:30Z". */
export function hhmmZ(ms: number): string {
  const p = utcParts(ms);
  return `${pad2(p.h)}:${pad2(p.m)}Z`;
}

/** "22:30Z", with " (+1 day)" when the instant is on a later UTC day than the reference instant. */
export function hhmmZRel(ms: number, refMs: number): string {
  const days = Math.floor(ms / MS_DAY) - Math.floor(refMs / MS_DAY);
  if (days <= 0) return hhmmZ(ms);
  return `${hhmmZ(ms)} (+${days} ${days === 1 ? 'day' : 'days'})`;
}

/** "22:11:40Z". */
export function hhmmssZ(ms: number): string {
  const p = utcParts(ms);
  return `${pad2(p.h)}:${pad2(p.m)}:${pad2(p.s)}Z`;
}

/** "HH:MM" without the suffix, for column headers. */
export function hhmm(ms: number): string {
  const p = utcParts(ms);
  return `${pad2(p.h)}:${pad2(p.m)}`;
}

/** DD-MM-YYYY (UTC). */
export function ddmmyyyy(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getUTCDate())}-${pad2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** DD-MM (UTC). */
export function ddmm(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getUTCDate())}-${pad2(d.getUTCMonth() + 1)}`;
}

const localFormats = new Map<string, Intl.DateTimeFormat>();

/** The airport's local clock time, "HH:MM". Falls back to UTC if the zone is unknown to the browser. */
export function localHhmm(ms: number, timeZone: string): string {
  let f = localFormats.get(timeZone);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    } catch {
      return `${hhmm(ms)} UTC`;
    }
    localFormats.set(timeZone, f);
  }
  return f.format(new Date(ms));
}

/** "22:30Z (09:30 local)". */
export function utcAndLocal(ms: number, timeZone: string): string {
  return `${hhmmZ(ms)} (${localHhmm(ms, timeZone)} local)`;
}

/** 12 -> "12 min"; 135 -> "2 h 15 min"; negative values read as 0. */
export function ageText(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 120) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Duration in milliseconds as "9 h 18 min". */
export function durationText(ms: number): string {
  const total = Math.max(0, Math.round(ms / MS_MINUTE));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** One decimal place, the display rule for every component (WC-3). */
export const kt1 = (n: number): string => n.toFixed(1);

/** Three-digit direction, "090". */
export const dir3 = (degrees: number): string => String(Math.round(((degrees % 360) + 360) % 360) || 360).padStart(3, '0');

/** https only (SEC-2): returns the address when it may be shown as a link, else null. */
export function safeHttpsLink(address: string): string | null {
  try {
    const u = new URL(address);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// v2's own plain-text formatting helpers (a copy of the few v1 ones it needs;
// v2 imports nothing from src/ui). UTC only (OD-36). Every function returns a
// string; nothing here produces markup (SEC-2).
import type { ModeMinima } from '../refdata';

const MS_MINUTE = 60_000;
const MS_DAY = 86_400_000;

export const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

function utcParts(ms: number): { h: number; m: number; s: number } {
  const inDay = ((ms % MS_DAY) + MS_DAY) % MS_DAY;
  return { h: Math.floor(inDay / 3_600_000), m: Math.floor((inDay % 3_600_000) / MS_MINUTE), s: Math.floor((inDay % MS_MINUTE) / 1000) };
}

/** "2230Z": four digits, no colon (owner, 26-10-2026, issue 130). */
export function hhmmZ(ms: number): string {
  const p = utcParts(ms);
  return `${pad2(p.h)}${pad2(p.m)}Z`;
}

/** "2230Z". The day is never shown (owner, 26-10-2026, issue 129): the forecast never looks far enough ahead for it to matter. `_refMs` is kept so callers are unchanged. */
export function hhmmZRel(ms: number, _refMs: number): string {
  return hhmmZ(ms);
}

/** "221140Z". */
export function hhmmssZ(ms: number): string {
  const p = utcParts(ms);
  return `${pad2(p.h)}${pad2(p.m)}${pad2(p.s)}Z`;
}

/** The hour as two digits, for an axis label. */
export function hh(ms: number): string {
  return pad2(utcParts(ms).h);
}

/** 12 -> "12 min"; 135 -> "2 h 15 min"; negative values read as 0. */
export function ageText(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 120) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** The short age on a chip: "59s", "27m", "2h13". */
export function shortAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 120) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 120) return `${m}m`;
  return `${Math.floor(m / 60)}h${pad2(m % 60)}`;
}

/** Whole knots (WC-3). Display only; the calculation keeps full precision. */
export const kt1 = (n: number): string => Math.round(n).toString();

/** Three-digit direction, "090". */
export const dir3 = (degrees: number): string => String(Math.round(((degrees % 360) + 360) % 360) || 360).padStart(3, '0');

/** 3200 -> "3,200". */
export const thousands = (n: number): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "HHMM" without the suffix, for column headers. */
export function hhmm(ms: number): string {
  const p = utcParts(ms);
  return `${pad2(p.h)}${pad2(p.m)}`;
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

/** Duration in milliseconds as "9 h 18 min". */
export function durationText(ms: number): string {
  const total = Math.max(0, Math.round(ms / MS_MINUTE));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A mode's weather minima in plain words, e.g. "ceiling 4,500 ft or higher; visibility 8 km or more; dry runway". */
export function minimaText(minima: ModeMinima): string {
  const parts: string[] = [];
  if (minima.ceilingFt !== null) parts.push(`ceiling ${minima.ceilingFt.toLocaleString('en-GB')} ft or higher`);
  if (minima.visibilityMetres !== null) parts.push(`visibility ${Number((minima.visibilityMetres / 1000).toFixed(1))} km or more`);
  if (minima.requiresDrySurface) parts.push('dry runway');
  return parts.join('; ');
}

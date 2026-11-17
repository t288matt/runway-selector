// The fixed flight-simulation notice (SEC-1): a constant of the application. A
// pack cannot reword, replace or hide it; it can only add one further line.
// The wording is the same as v1's (tests/v2 compares the two strings).
import type { AirportPack } from '../../refdata';
import { ddmmyyyy, pad2 } from '../format';

export const FLIGHT_SIM_NOTICE = 'Flight simulation only. Never for real-world navigation, flight planning or operations.';

/** The pack label key that carries the optional further line. */
export const EXTRA_NOTICE_LABEL = 'extraNotice';

export function extraNoticeOf(pack: AirportPack | null): string | null {
  const line = pack?.airport.labels[EXTRA_NOTICE_LABEL];
  return line === undefined || line === '' ? null : line;
}

const REFUSAL_MAX_CHARS = 160;

/**
 * The quiet line shown while a saved pack is on screen because the latest pack was refused by validation (issue 183).
 * `refusal` is the loader's own text for its first issue; it is only shortened here, never reworded. The date is
 * given only when the saved copy is not from today (UTC).
 */
export function savedDataNotice(savedAtMs: number, refusal: string, nowMs: number): string {
  const d = new Date(savedAtMs);
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
  const when = ddmmyyyy(savedAtMs) === ddmmyyyy(nowMs) ? time : `${ddmmyyyy(savedAtMs)} ${time}`;
  const reason = refusal.length > REFUSAL_MAX_CHARS ? `${refusal.slice(0, REFUSAL_MAX_CHARS - 3).trimEnd()}...` : refusal;
  return `Showing saved data from ${when}. The latest data was refused: ${reason}`;
}

/** The line for the screen, or null: none without a refusal, and none once Reload data has succeeded (fresh data is in). */
export function savedNoticeFor(refusal: { readonly savedAt: number; readonly text: string } | null, reloadStatus: string, nowMs: number): string | null {
  if (refusal === null || reloadStatus === 'changed' || reloadStatus === 'unchanged') return null;
  return savedDataNotice(refusal.savedAt, refusal.text, nowMs);
}

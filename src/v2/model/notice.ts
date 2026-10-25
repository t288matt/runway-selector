// The fixed flight-simulation notice (SEC-1): a constant of the application. A
// pack cannot reword, replace or hide it; it can only add one further line.
// The wording is the same as v1's (tests/v2 compares the two strings).
import type { AirportPack } from '../../refdata';

export const FLIGHT_SIM_NOTICE = 'Flight simulation only. Never for real-world navigation, flight planning or operations.';

/** The pack label key that carries the optional further line. */
export const EXTRA_NOTICE_LABEL = 'extraNotice';

export function extraNoticeOf(pack: AirportPack | null): string | null {
  const line = pack?.airport.labels[EXTRA_NOTICE_LABEL];
  return line === undefined || line === '' ? null : line;
}

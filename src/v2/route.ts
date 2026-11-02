// Deep links for v2, carried in the URL hash so the site stays pure static files
// (GitHub Pages has no server-side routing): #/ICAO opens that airport, and
// #/ICAO/detail also opens the Detail section. Owner, 29-10-2026. #/summary opens
// the all-airports summary when app.json has groups (see SummaryScreen.tsx).
import { AIRPORT_ID } from '../refdata';

export interface Route {
  /** The airport the hash names, or null when the hash has none or it is not a valid-shaped code. */
  readonly icao: string | null;
  readonly detail: boolean;
  /** True for #/summary, the all-airports summary screen. */
  readonly summary: boolean;
}

export function parseRoute(hash: string): Route {
  const segments = hash
    .replace(/^#/, '')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const first = segments[0]?.toUpperCase() ?? '';
  // Check the summary keyword before the airport-id shape: "SUMMARY" matches AIRPORT_ID.
  if (first === 'SUMMARY') return { icao: null, detail: false, summary: true };
  return {
    icao: AIRPORT_ID.exec(first) !== null ? first : null,
    detail: segments[1]?.toLowerCase() === 'detail',
    summary: false,
  };
}

export function buildRoute(icao: string, detail: boolean): string {
  return detail ? `#/${icao}/detail` : `#/${icao}`;
}

export function buildSummaryRoute(): string {
  return '#/summary';
}

/**
 * The hash to put in the address bar so it names the view on screen (an airport, with or without the Detail section),
 * or null when it already does. Compared without regard to case, as parseRoute reads it.
 */
export function hashToShow(currentHash: string, icao: string, detail: boolean): string | null {
  const target = buildRoute(icao, detail);
  return currentHash.toLowerCase() === target.toLowerCase() ? null : target;
}

export interface AfterSwitch {
  /** True when the summary should stop being shown. */
  readonly leaveSummary: boolean;
  /** A hash to put in the address bar without a history entry, or null to leave it. */
  readonly replaceHash: string | null;
}

/**
 * What to do when an airport switch started from a Back/Forward or a card click settles. The CURRENT hash decides: if
 * the user has gone back to the summary meanwhile it stays on screen and the hash is left alone. Otherwise the summary
 * is left, and if the switch did not happen (failed, refused or skipped) the address bar is put back to the airport
 * that is actually shown.
 */
export function afterSwitch(currentHash: string, switched: boolean, shown: { readonly icao: string; readonly detail: boolean }): AfterSwitch {
  if (parseRoute(currentHash).summary) return { leaveSummary: false, replaceHash: null };
  return { leaveSummary: true, replaceHash: switched ? null : hashToShow(currentHash, shown.icao, shown.detail) };
}

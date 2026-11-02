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

// Deep links for v2, carried in the URL hash so the site stays pure static files
// (GitHub Pages has no server-side routing): #/ICAO opens that airport, and
// #/ICAO/detail also opens the Detail section. Owner, 29-10-2026.
import { AIRPORT_ID } from '../refdata';

export interface Route {
  /** The airport the hash names, or null when the hash has none or it is not a valid-shaped code. */
  readonly icao: string | null;
  readonly detail: boolean;
}

export function parseRoute(hash: string): Route {
  const segments = hash
    .replace(/^#/, '')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const icao = segments[0]?.toUpperCase() ?? '';
  return {
    icao: AIRPORT_ID.exec(icao) !== null ? icao : null,
    detail: segments[1]?.toLowerCase() === 'detail',
  };
}

export function buildRoute(icao: string, detail: boolean): string {
  return detail ? `#/${icao}/detail` : `#/${icao}`;
}

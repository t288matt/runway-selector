// Where the weather is fetched from (OD-37). None of this is airport data: the
// station comes from the pack. Both TAF services are small free third-party
// relays with no uptime guarantee (NOAA's own servers send no CORS header, so a
// browser page cannot read them). HTTPS only. CORS was checked on 24-10-2026.

/** METAR as plain text: `{base}{station}`. Sends Access-Control-Allow-Origin: *. Empty body when the station is unknown. */
export const METAR_URL_BASE = 'https://metar.vatsim.net/';
/** TAF, first choice: JSON with the report in `raw`. Sends Access-Control-Allow-Origin: *. */
export const TAF_PRIMARY_URL_BASE = 'https://datamask.org/api/v1/taf/';
/** TAF, fallback: a JSON array with the report in `rawText`. Reflects the request's origin; use GET (it refuses HEAD). */
export const TAF_FALLBACK_URL_BASE = 'https://metars.eu/api/tafs/';

/** Largest response body accepted, in decoded bytes. A real report is a few hundred; the decoder's own limit is tighter still. */
export const WEATHER_MAX_BYTES = 64 * 1024;
/** Time allowed for one request, including reading the body. Short: the page never waits on these services. */
export const WEATHER_TIMEOUT_MS = 10_000;

/** The credit Datamask's terms ask for, shown in the app. */
export const WEATHER_CREDIT = 'TAF courtesy of NOAA/NWS via Datamask Aviation. METAR from VATSIM.';

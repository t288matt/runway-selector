// Traffic module constants. None of these is airport data: they describe the
// public VATSIM feed and the parser's safety limits (SEC-3). Everything that
// depends on the airport is read from the pack.

/**
 * The one place the feed address is written. HTTPS only (S-08). It is the
 * official VATSIM v3 data feed; an alternative (a proxy) is passed to
 * fetchFeed as an option, never by editing code elsewhere.
 * CORS was checked on 23-10-2026: the feed answers with
 * Access-Control-Allow-Origin: * (see DESIGN section 4, Data sources).
 */
export const VATSIM_FEED_URL = 'https://data.vatsim.net/v3/vatsim-data.json';

/** Largest response body accepted, counted in decoded bytes (SEC-3). The live feed was about 2 MB on 23-10-2026. */
export const FEED_MAX_BYTES = 10 * 1024 * 1024;
/** Deepest JSON nesting accepted. The live feed nests 4 levels. */
export const FEED_MAX_DEPTH = 10;
/** Most pilot entries accepted; a feed with more is refused whole. */
export const FEED_MAX_PILOTS = 50_000;
/** Longest origin or destination code kept. */
export const ICAO_MAX_LENGTH = 8;
/** Default time allowed for one fetch, including reading the body. */
export const FEED_TIMEOUT_MS = 20_000;

/** Slot length in minutes: the clock-aligned half hour of the engine input contract. */
export const SLOT_MINUTES = 30;

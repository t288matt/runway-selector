// Where the real-world ATIS comes from and how long it is trusted (issue 159).
// None of this is airport data: the airport comes from the pack. The browser never
// talks to NAIPS and never holds credentials; it asks the local server (the Vite
// dev-server middleware in scripts/atisMiddleware.ts), which does.

/** The local endpoint: `{base}{ICAO}`. Relative to the page, like the pack files, so a static host simply answers 404 and the indicator stays hidden. */
export const ATIS_URL_BASE = './api/atis/';
/** Largest local answer accepted, in decoded bytes. A real ATIS block is a few hundred. */
export const ATIS_MAX_BYTES = 16 * 1024;
/** Time allowed for one local request. The server itself waits for NAIPS up to its own timeout. */
export const ATIS_TIMEOUT_MS = 30_000;
/** A result older than this (by the server's own fetch time) is never shown as current (owner, 29-10-2026). */
export const ATIS_STALE_MINUTES = 90;
/**
 * Added to the page's poll interval (atisPollMinutes). The server's 30-minute floor runs from the start of its own call, which
 * begins a little after the page's request; without this margin the page's second poll could land just inside the floor and be
 * served the same cached reading, so the chip would often be an hour old. One minute is far more than a request takes.
 */
export const ATIS_POLL_MARGIN_MS = 60_000;

# Security review of the design: condensed record

Status: record of a review on 23-10-2026 by an independent agent, documents only (no code exists yet), read-only. Condensed from its report. "Resolution" notes what the owner has decided since. Proposed wording is the reviewer's, offered for the owner to adopt or reject.
Language: British English. Dates DD-MM-YYYY.

Headline: the design had no security section. The most serious weakness is that data (packs, stored settings) decides the limits, the "verified" label and the notice wording, and a one-field change can pass as a documents-only change.

## High
| ID | Finding | Proposed fix | Resolution |
|---|---|---|---|
| S-01 | The simulation-only notice and the provisional or verified labels are controlled by pack data; a tampered pack could rewrite the notice or mark every rule verified. | Compile the notice into the app so pack data cannot replace or suppress it (a pack may add a further line); show "verified" only if the pack manifest carries a reviewer-attested hash. | Open. Note OD-10 now treats every pack mode as approved. |
| S-02 | Output encoding is never specified: `description`, `source`, raw METAR text and pack labels are routes for injected markup or `javascript:` links. | Text-only rendering; lint rule banning `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` and Markdown or HTML rendering of data; `source` shown as text or as a link only for `https:`, with `rel="noopener noreferrer"`; raw reports in a length-capped text node. | Open. |
| S-03 | No input-hardening requirement: no size, depth, unknown-key or number-range limits; prototype pollution; out-of-range limits (a tailwind limit of 500) would turn cells green; regex-heavy report lines. | A strict schema for every external input: no unknown keys, min and max on every number (for example tailwind 0 to 15 kt, crosswind 0 to 40 kt), string length caps, byte-size caps (pack 256 KB, imported state 1 MB, feed 10 MB, one report 4 KB), reject `__proto__`, `constructor` and `prototype`, linear-time parsers with property tests. | Partly adopted: a schema library with strict ranges is approved (DESIGN.md, "Dependencies"). Exact bounds still to be written. |
| S-04 | Packs are the control plane for safety limits with no provenance, integrity or change-review process; a data-only diff triggers no code review and may pass the documents-only exemption. | Treat `refdata/` changes as High-tier: independent review, field-by-field check against the cited source, owner's go; a SHA-256 manifest checked in CI; pack hash and version in the footer; a change log. | Owner decided not to: pack changes follow the document process. Risk accepted and recorded in DESIGN.md. |

## Medium
| ID | Finding | Proposed fix |
|---|---|---|
| S-05 | The browser audit trail promises more than a browser can give: no identity, file edits not observed, log editable, quota eviction. | Label it "local, editable, not tamper-evident"; hash-chain entries; log pack changes as "pack hash changed at load"; treat git history as the authoritative pack record. |
| S-06 | Stored and imported state can mislead and has no integrity, version or reset handling (edited limits survive reload; stale active mode; corrupt JSON crashes boot). | Re-validate on every load; discard invalid or foreign-version values visibly; flag any value that differs from the pack default as "modified"; clear a stored active mode that is not enabled; wrap storage access in try and catch. |
| S-07 | No content-security-policy, hosting-header or embedding requirement. | A strict policy (own-origin scripts and styles, `connect-src` limited to the feed origins and any proxy, `frame-ancestors 'none'`); `nosniff`, no-referrer and HSTS; own origin or namespaced storage; no third-party scripts; a header test in CI. |
| S-08 | Third-party feeds are trusted blindly: no station match, age or range check; a fallback source might be substituted silently. | HTTPS only; accept a report only if the station matches the pack, its time is plausible and values are in physical bounds, otherwise treat as missing; label any fallback on screen; bound and length-cap VATSIM data. |
| S-09 | Personal data in the VATSIM feed (name, member number, callsign) is not addressed. | Drop those fields at the parse boundary and never store, log, export or show them; trend snapshots hold counts only; anonymise fixtures; a privacy note and owner approval before any server recording. |
| S-10 | Thin supply-chain policy; `package.json` has caret ranges, no lockfile, audit or no-scripts policy, names ESLint but omits it, and its `private` field is a string. | Commit the lockfile; `npm ci --ignore-scripts`; `npm audit` in CI; a dependency gate recording maintainers, licence and install scripts; pin CI actions by commit SHA with minimal permissions. |
| S-11 | A relay or proxy is mentioned only as a hosting cost; risks include open proxy or server-side request forgery, cache poisoning, abuse, wildcard CORS and secrets in the bundle. | Fixed endpoints only (never a URL parameter), hard-coded upstream hosts, station allowlist, cache key including endpoint and station, rate limits, CORS limited to the app origin, size caps, no secrets in the bundle. Applies if a proxy is built. |
| S-12 | Licence and terms-of-use exposure of data sources is open; a commercial page is named in the requirements; the VATSIM poll has no floor. | Record terms per feed and document in the pack's `sources`; paraphrase official text with a citation; enforce a poll floor (for example 15 s) in the schema bounds; show required attribution. |

## Low
- S-13 Exports of history and settings carry no notice: embed the notice, pack hash, version and modified settings; no pilot data; validate and show a diff on import.
- S-14 The settings UI can weaken hard limits without a guard: bound by the pack's min and max, confirm and flag any non-default limit.
- S-15 Local serving is unspecified: bind the dev server to localhost; say to serve over HTTP, not `file://`.
- S-16 Fixture or demonstration mode could be mistaken for live: force a non-removable banner and do not persist the active mode. (The owner has since dropped training mode.)
- S-17 No secret scanning and no code-owner review of `refdata/` and `.github/`.

## Missing security requirements proposed (SEC-1 to SEC-14)
Input schema (S-03); output encoding (S-02); pack integrity (S-04, not adopted); fixed notice (S-01); browser state (S-06); local, honestly labelled audit (S-05); hosting headers (S-07); feed plausibility and poll floors (S-08, S-12); personal data (S-09); supply chain (S-10); relay (S-11); licences (S-12); export (S-13); CI secrets and code-owner review (S-17).

## Reviewer's summary
1. No security section existed. 2. The most serious weakness is data controlling limits, the verified label and the notice. 3. The audit trail and verified labels promise integrity a browser-only app cannot give; relabel honestly. 4. Personal data must be dropped at parse; any relay needs fixed endpoints from its first line. 5. `package.json` needs a lockfile, audit and no-scripts policy and a match with the design's dependency list before the skeleton.

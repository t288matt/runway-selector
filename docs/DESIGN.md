# Runway Mode Planner (first airport: Sydney, YSSY): design and architecture

Status: current. First written 22-10-2026 and amended as the owner decides (decisions are numbered in REQUIREMENTS.md). It describes the application as built and released; the build is in `src/`, the airport packs in `refdata/`.
Language: British English. Dates DD-MM-YYYY, times UTC. Plain words; no emoji.

## 1. Purpose and intent
A decision-support tool for VATSIM controllers working an airport, first Sydney (YSSY). It is built to serve other airports later without code changes (section 4c). It recommends a runway mode that is likely to stay suitable through the forecast, not just the best mode for the latest METAR. It also avoids mode changes during busy traffic. It is a simulation aid and has no real-world operational standing.

**Goals**
1. Recommend a sequence of the airport's standard modes across a forecast window (default: the full TAF validity), using METAR, TAF, live VATSIM traffic and the operating-plan preference order.
2. Show a runway-mode survival timeline: every mode against every 30-minute slot, with the reason for each red, amber or grey cell.
3. Plan changeovers: when, why, to which mode, and at what traffic level.
4. Keep every tunable value (limits, traffic bands, mode order, penalties, window) in editable reference data, never in code.
5. Make every recommendation deterministic, explainable and testable.
6. **Airport-agnostic by construction (key requirement, OD-9).** The code knows nothing about YSSY. Every airport fact comes from that airport's reference-data pack. A new airport is a new pack, not new code.

**Non-goals**
- No language model chooses the mode.
- No real-world operational claims. Capacities and thresholds are labelled simulation assumptions.
- The only controller input is the optional current mode, chosen from a pull-down menu (OD-21). There is no runway-condition control (OD-14). The tool only advises and never changes anything.
- No arbitrary runway combinations; only listed standard modes.

**Anti-goals (a failure even if it runs):** a green cell that breaks a tailwind limit; an unverified rule presented as official; a silent assumption of a dry runway; a hard limit overridden by a change penalty.

## 2. Where the design choices are recorded
Each design choice and open point sits in the section it belongs to:
- Stack, relay, data sources: section 4 (Architecture).
- Airport-agnostic rule, per-mode crosswind: sections 4c and 5.
- Future server: section 4a. Local first, publication later: section 4b.
- Provenance of rules, self-describing values, traffic bands: section 5.
- Report formats from other countries: section 7.
- Sydney-specific choices and open points: section 3.

## 3. Sydney (YSSY) pack: decisions and reference research
Everything in this section is specific to Sydney and lives in the YSSY pack as data. Nothing here is built into the code (section 4c). Sydney's operating plan is the Long Term Operating Plan (LTOP); elsewhere in this document the generic term is operating plan.

**Sydney pack design choices**
- **Reference rules start from the 2015 Airservices table.** All of them are provisional until the owner supplies the current LTOP. If the 2015 table and the current LTOP differ, the owner decides.
- **Mode names follow runway use (24-10-2026, owner edit).** The pack ids are SODPROPS, 25A16D, 34A25D, 34AD25, 34AD, 16AD, 07AD, 25AD and 07A16D (A = arrivals, D = departures), all enabled. The curfew mode and Mode 4 were removed, and the operating plan is one all-day band (modes.json and operating_plan.json are authoritative). The table below is the 2015 source research and uses the old numbers; the pack's runway sets for 25A16D (old 5), 34A25D (old 7) and 07A16D (old 14A) were changed by the owner.
- **Simulation limits.** Tailwind is 5 kt on a dry runway and 0 kt on a wet one. Crosswind is 20 kt for every mode. These are labelled simulation settings, not official limits.

**Phase 1 reference research**
Best readable source: Airservices "Sydney Airport Operational Statistics", September 2015 (Preferred Runway Selection effective 01-07-2010, LOA 3181 V1). The LTOP pages on airservicesaustralia.com and sacf.infrastructure.gov.au are indexes; their PDFs were not readable and the SACF fetch timed out. Everything below is therefore **unchecked against the current LTOP**.

| Mode | Departures | Arrivals |
|---|---|---|
| 1 (curfew) | 16R | 34L |
| SODPROPS | 16L, 16R(h) | 34L |
| 5 | 16L, 16R | 25, 16R(h) |
| 7 | 25, 34L(h) | 34L, 34R |
| 8 | 25, 34R, 34L(h) | 34L, 34R |
| 9 | 34L, 34R | 34L, 34R |
| 10 | 16L, 16R | 16L, 16R |
| 12 | 07 | 07 |
| 13 | 25 | 25 |
| 14A | 16L, 16R | 07, 16R(h) |
| 4 | not found | not found |

(h) = long-haul jets only. Wind criteria in the 2015 report: 20 kt crosswind and 5 kt downwind, dry runways only.

**Known gaps:** current LTOP text; official capacities (none found); an official wet-runway limit (0 kt is the owner's simulation rule); VATSIM rate limits (feed regenerates every 15 seconds, no limit published); exact runway headings.

## 4. Architecture
```
refdata/airports/<ICAO>/*.json  -->  loader + validator  -->  engine (pure functions)  -->  UI
                                                ^
 METAR/TAF fetch --> parsers --> forecast slots |
 VATSIM fetch --> traffic model --> demand slots +
```
One TypeScript project. The engine has no network, clock or storage access: it takes (refdata, settings, weather slots, traffic slots, current mode (optional), now) and returns a plan. That makes it deterministic and testable. Fetching, storage and rendering sit around it.

```
refdata/
  app.json          airport list, default airport (the only cross-airport file)
  airports/
    YSSY/           the first pack (section 5); the others are YMML, YPAD, YPPH, YBBN, YSWS, YPDN, YSCB, NFFN, YBCS and YBTL
                    (the fictional TEST airport lives in tests/fixtures/TEST, never here, so it is not listed in app.json and not offered in the airport selector)
src/
  refdata/          loader, schema validation, audit-trail writer
  weather/          fetch, metar parser, taf parser, slot builder
  traffic/          vatsim fetch, classify arrivals and departures, demand model
  engine/
    wind.ts         component maths (any runway end given by data)
    runwayCondition.ts
    eligibility.ts  mode x slot matrix
    survival.ts     continuous viability, failure time and cause
    optimiser.ts    dynamic programming over the matrix
    changeover.ts   trigger, window, replacement
    explain.ts      plain-language rationale
  net/              reads a response with a size cap and a deadline, for the traffic and weather fetchers
  store/            settings, audit trail (browser storage)
  ui/               the main screen (index.html): panels A, B, D and F, timeline, settings drawer
  v2/               the answer-first screen (v2.html), section 8a
tests/              Vitest; scenarios from REQUIREMENTS.md section 11, run against every pack
  fixtures/         saved METAR/TAF strings
scripts/            literal check: fails the build if an airport fact is in src/
docs/
```
Modules: weather ingestion, METAR parsing, TAF parsing, traffic processing, wind components, runway condition, eligibility, operating-plan priorities, survivability, optimisation, explanations, presentation.

**Stack.** We will build the app as one TypeScript project with React, Vite and Tailwind, running in the browser. The engine is plain TypeScript modules with no dependence on the page. Settings, the current mode and the audit trail are kept in browser storage.

**Dependencies.** Runtime (shipped in the page): React, React-DOM, one small schema-validation library (owner approved a library, 23-10-2026; valibot, pinned at 1.5.0, MIT) and the metar-taf-parser library for decoding pasted weather reports (owner approved, OD-29). Build-time only: Vite and Tailwind CSS (the styling tool, not the wind term). Dev tools: TypeScript, Vitest, oxlint (the linter; ESLint is not used because TypeScript 7 has no JavaScript API for typescript-eslint to use). Anything else needs the owner's yes. The validator checks every external input (packs, settings, imports, feeds) with strict types, ranges and unknown-key rejection; cross-reference checks (a mode naming a missing runway, gaps in time bands) are our own code. Pasted weather reports are decoded by metar-taf-parser behind our own adapter (Weather source, below).

**Data sources:** the station and feed identifiers come from the pack. METAR and TAF are fetched automatically and can be overridden by pasting (OD-37; see Weather source below); VATSIM `data.vatsim.net/v3/vatsim-data.json`, polled every 5 minutes by default (refdata value `vatsimPollSeconds`, default 300, editable; no enforced minimum). The feed itself regenerates every 15 seconds, so each snapshot is up to 5 minutes old; the traffic panel shows its age. Every source keeps its entry or fetch time, issue or observation time, and a stale flag. The stale limits are pack values; in every shipped pack the METAR is stale after 60 minutes, the TAF after 180 and the VATSIM feed after 10.

**VATSIM browser access check (YR-2, 23-10-2026).** A request for `https://data.vatsim.net/v3/vatsim-data.json` with `Origin: http://localhost:5173` returned HTTP 200, `Access-Control-Allow-Origin: *`, `Content-Type: application/json`, `Content-Encoding: gzip`, `Cache-Control: public, max-age=15`, about 465 KB on the wire and about 2.0 MB decoded (1,916 pilots at the time). The feed therefore allows requests from a browser page and no proxy is needed. The address is held in one constant (`src/traffic/config.ts`); the response cap (10 MB, counted on decoded bytes) leaves room for roughly five times today's size. The shape of the pilot and flight-plan fields used by the parser was checked against the live feed the same day.

**Weather source (OD-28, amended by OD-37).** The METAR and the TAF are fetched automatically for the pack's weather station, and the user can paste over either (paste pauses automatic updates for that report until the user resumes them). METAR: `https://metar.vatsim.net/{station}` (plain text, CORS-open). TAF: `https://datamask.org/api/v1/taf/{station}` (JSON, field `raw`, CORS-open), then `https://metars.eu/api/tafs/{station}` (JSON array, field `rawText`) if that fails. The addresses live in `src/weather/config.ts`, not in the engine, the parser or the screens. Datamask passes through a duplicated "TAF TAF" prefix, which is stripped before decoding. Both TAF services are small free third-party relays (NOAA's own servers send no CORS header), so each fetch has a short timeout, a size cap and a plain failure message, and a failure keeps the previous report. Fetched text goes through the same decode and station check as pasted text. Datamask's terms ask for a credit to NOAA/NWS and Datamask Aviation, shown in the app. Polling uses `weatherPollMinutes`.
- **How reports are read (OD-29).** The library is the npm package named exactly `metar-taf-parser` (the TypeScript library by aeharding, repository github.com/aeharding/metar-taf-parser, version 9.1.3 when researched, MIT). It is not any of the similarly named packages (metar-parser, metar-decoder, taf-parser, aewx-metar-parser, metar) and not the sibling libraries by mivek in Python and Java, which are only sources of test fixtures. Before installing, the package name, publisher and repository are checked against these details, because look-alike package names are a supply-chain risk. It decodes the raw ICAO text from the paste box, pinned to an exact version and used only inside one adapter module (`weather/decode`). The adapter is ours: nothing else imports the library, so it can be replaced, or copied into the repository and patched, without touching the engine. The adapter does the things the library does not: it catches a NIL TAF (the library throws); it converts units to knots, metres and hectopascals (the library returns m/s, statute miles and inHg as tagged); it carries visibility and cloud forward through FM groups (the library's FM entries hold only their own fields); it decodes the recent-weather (RE) group; it warns when the library silently drops a group (for example a `///015` cloud group); and it builds the 30-minute slots with TEMPO and PROB handling. A regression set of real METARs and TAFs from many airports is part of the tests, and the tests rely on our own checks, not the library's.
- **Provider selection is deferred** to the automation phase.

**Proxy.** Not needed (OD-37): the chosen weather sources answer browser requests directly (live check 24-10-2026). If one stops, a pass-through proxy could be added; the fetching code takes an optional base address so that needs no engine change. A proxy would be stateless, accept only fixed endpoints and station identifiers that match the pack, and hold no secrets in the browser bundle.

### 4c. Airport-agnostic rule (OD-9, requirements AG-1 to AG-13)
This is the governing design rule. Every other section is read through it.

**The engine and UI are a generic runway-mode planner.** They are given one `AirportPack` object (loaded from the pack folder) and never read anything about an airport from anywhere else. Concretely:
- **No airport literal in `src/`.** No ICAO code, runway name, mode number, bearing, coordinate, time zone, hour, limit, URL or label. Where code needs the arrival runways of a mode it reads `mode.arrivals`; where it needs the station for a weather request it reads `airport.weather.station`.
- **Modes and runways are lists, not constants.** The eligibility matrix is built by looping over `pack.modes` and the runway ends each one names. Three runways, one runway or six all work. Timeline rows, the weather runway table and the runway diagram are generated from the same lists.
- **Rules are data, not branches.** Curfew and shoulder periods are expressed as generic rule records: a time band in the airport's own time zone and a list of modes with penalties, some of which may be marked not allowed. One operating plan applies every day of the week (OD-19). The engine reads rule kinds from a fixed, airport-neutral vocabulary. If an airport needs something the vocabulary lacks, the vocabulary grows with an optional field whose default leaves other airports untouched (AG-12). The code never contains a test on which airport is loaded.
- **Wording comes from the pack.** App title, notices and labels that name an airport are built at run time from `airport.json`.
- **State is keyed by airport.** Settings, the current mode and the audit trail live under the airport's ICAO, so switching never mixes data (AG-8).
- **Validation first.** On load the schema checks the pack, including cross-references: a mode may only name runway ends that exist, every ranked mode must exist, and every time band must cover its day without gaps or overlaps. An invalid pack is refused with a precise message and never partly used (AG-10).

**How agnosticism is enforced, not just intended (AG-11):**
1. A fictional `TEST` pack with a different shape: two runways, different names, a different mode set and numbering, a different time zone, different limits (for example tailwind 8 kt dry), and one mode with a different crosswind limit. The full scenario suite runs against both `YSSY` and `TEST`. Any hidden YSSY assumption fails on `TEST`.
2. A script (`scripts/check-no-airport-literals`) runs in `npm test` and CI. It reads the ICAO codes, runway names and mode ids from every pack and fails if any appears in `src/` outside comments.

**Why packs (rationale).**
- A pack is plain data. It can be diffed, reviewed, validated by a schema and tested on its own, without reading any code.
- Adding an airport then needs no review of logic. The only review is whether the facts in the pack are right and sourced.
- A fictional second pack can prove the engine is correct for an airport the engine has never been written for. A code branch per airport could not be tested that way.
- Alternatives rejected: code branches per airport (airport facts leak into logic and every new airport changes code); a database (no server in phase 1, and files are easier to review and version); one shared file with an airport section per airport (edits to one airport risk another, and a bad entry could break all).
- Folder per airport keeps each airport's data, sources and history of changes together and independent.

**Run-time sequence.**
1. Read `refdata/app.json`: the list of packs and the default airport.
2. Choose the airport: the one the controller last selected, if its pack is still listed and valid; otherwise the default in `app.json`. The airport selector in the header is always visible (OD-37, a pull-down since OD-68): it offers only the airports listed in `app.json`, so an unlisted code cannot be chosen.
3. Load that pack's files and validate them against the shared schema, including cross-references. If invalid, refuse the pack and show the precise error. Never partly use it.
4. Strip `description` and `_` note fields, unwrap each tunable to its `value`, and build one immutable `AirportPack`.
5. Hand the `AirportPack` to the engine and the UI. Wording, runway diagram, timeline rows, weather station, VATSIM filter and time zone all come from it.
6. Recalculate whenever the pack or a setting changes.

**Pack delivery (decided 23-10-2026).** Packs are static JSON files served beside the app and fetched at run time. They are not bundled into the build. Replacing a file and pressing Reload data is enough to change a rule; no rebuild is needed, and adding an airport is a new folder plus one line in `app.json`. Three safeguards are part of the design from the start:
1. **No stale packs.** Each pack is requested with a version or content hash in its address, so a browser cache cannot serve an old copy.
2. **No app and pack mismatch.** `app.json` and every pack carry a `schemaVersion`. If a pack's version is not one the app supports, the pack is refused with a clear message and the previous valid pack stays in use.
3. **No separate integrity control on packs (owner decision, 23-10-2026).** No hash manifest or field-by-field source check is required for a pack change; the schema's number ranges and unknown-field refusal are the only controls. The risk accepted is that an unreviewed edit could alter a limit. The strict schema bounds (a number range on every limit, unknown keys refused) remain the control against nonsense values.
Phase 1 runs with a local web server (`vite` or `vite preview`), not by opening files from disk, because browsers block `fetch()` on `file://`. Relative paths keep the app usable at any folder or subdomain.

**First load.** If no valid pack exists yet, the app shows a full-screen error with the validation message and draws nothing else.

**Switching airports.** The previous airport's settings, current mode and audit trail stay under its ICAO and are not touched or merged. The new airport starts with its own stored state, or its pack defaults if it has none. Cached weather and traffic are discarded, because they belong to the old airport's station and area.

**Editing a pack while the app is open.** In phase 1 a pack is read when the app loads or when the controller chooses Reload data. A changed pack goes through the same validation, and a rejected pack leaves the previous valid one in use, with a visible error.

### 4a. Seam for a future server
Phase 1 has no server. We design for one and do not build it: a server for 24/7 recording and shared history can be added later without changing the engine.

The engine and the data sources sit behind three small interfaces, so a server can replace the browser parts later with no change to the engine or the screens:
- `WeatherSource`, `TrafficSource`: today the weather source fetches from the browser with a paste override (OD-28, OD-37) and so does the traffic source; later they read what a server has already fetched or fetch from a provider.
- `Store`: today browser storage; later an HTTP API over a JSON file or database (settings, observations, traffic snapshots, recommendations, audit log).
- `Scheduler`: today a timer in the open page; later a server job every 30 minutes.
The engine takes plain data in and returns a plan, so it can run in the page or on a server unchanged. All stored records are plain JSON with a schema version, so they can be moved to a server as they are.

### 4b. Hosting on the VATPAC site (future phase)
**Publication on the VATPAC site has not started.** The owner runs the app in a browser on their own PC (a dev server or the built files served locally). A GitHub Pages workflow (`.github/workflows/deploy-pages.yml`) builds and deploys `dist/` on every push to `main`. The rest of this section records what is known for the later VATPAC phase, so the build stays compatible; no work on it is scheduled.

Hosting is specific to the VATSIM division. The VATPAC site serves Australia and the Pacific; another division would host the build elsewhere, with its own theme and notice. This is a hosting matter and does not touch the engine.

Phasing: first the owner alone, then a few controllers, then the public on the VATPAC site, matching the other tools there.

The build output is a folder of static files (HTML, JavaScript, CSS) with relative paths, so it can sit at any path or subdomain without a server. The VATPAC tools page shows a dark navy theme with a blue accent, a "Flight simulation only" notice that users must accept, and a top menu; the app should match that theme, show the same notice (it must never be used for real-world navigation or flight planning), and link back to the site. **Open:** how tools are submitted or published on vatpac.org (own subdomain, a path under the site, or a link to an external host), who maintains the site, and whether it allows calls to data.vatsim.net from the page (and, once weather is fetched automatically, to the chosen weather provider). These are found out when the publication phase starts; no deploy step is written until then.

## 5. Reference data (the refdata files)
One folder per airport, `refdata/airports/<ICAO>/`. The files and their fields are defined once, in section 5a, and the worked example is refdata/airports/YSSY. All files are plain JSON, validated on load against a schema shared by every pack. Where two sources for the same rule differ, the owner decides and the decision is recorded in the pack. Changes made on screen (the current mode) are written to the audit trail (RD-6); changes to pack files are not (OD-23). A new METAR or TAF, or a change of current mode, triggers a fresh recommendation. Code contains **no** limits, thresholds, weights or orders.

**Self-documenting values (RD-7).** Every tunable value is written as `{ "value", "description" }` (section 5a), with its meaning in a `description` field the code never reads. The loader removes `description` and any `_`-prefixed note before building the `AirportPack`, so these fields cannot influence the engine. The validator fails a pack where a tunable has no `description`. The traffic bands, change penalties and every other tunable are in refdata/airports/YSSY/settings.json in this shape; display labels map light, medium and busy to LOW, MEDIUM and HIGH on screen.

### 5a. Pack schema (kept deliberately simple)
A pack is a folder of five plain JSON files. The validator (section 4c) checks them; the YSSY and TEST packs are the worked examples.

**Values.** Every tunable is written as `{ "value": 5, "description": "..." }` (RD-7). The unit is part of the field name (`...Kt`, `...Minutes`, `...Pct`). The loader checks the pack, strips the descriptions for the screen, and hands the engine plain numbers. Records carry an optional `source` for information. The `status` field (verified or provisional) was removed everywhere (owner, 26-10-2026): the engine never read it, and the screen no longer shows it. A pack's own `description` says where its figures are only assumptions.

**Version.** Every file carries `schemaVersion`. A pack the app does not support is refused with a message naming file and field, and the previous valid pack stays in use.

| File | Contents |
|---|---|
| `airport.json` | `icao`, `name`, `latitude`, `longitude`, optional `elevationFt`, `timeZone` (an IANA name), `weatherStation`, the traffic geometry (`trafficAreaNm`, `groundMaxSpeedKt`, `groundAltitudeMarginFt`, `arrivalSpeedFloorKt`) and the screen wording (`labels`). |
| `runways.json` | A list of runway ends: `name` and `headingDegrees`. Optional `threshold` (`latitude`, `longitude`) for the diagram; every shipped pack gives it for every end (OurAirports community data, source noted in the file). |
| `modes.json` | A list of modes: `id`, `description`, `enabled`, `arrivals` and `departures` (lists of runway-end names), `maxCrosswindKt`, and optionally `capacity` (total movements per hour; empty or `null` means no limit). A mode with no `maxCrosswindKt` takes `defaultCrosswindKt` at load, so the engine always sees a number. A mode may also have `minima` (WC-14, OD-78): any of `ceilingFt`, `visibilityMetres` and `requiresDrySurface`, at least one; a mode without it is not gated. A mode may also have `conditionalOperation` (WC-15, OD-79): a `name` and any of `ceilingFt`, `visibilityMetres` and `requiresDrySurface`; it only feeds a note in Panel A and never affects a status or the plan. |
| `operating_plan.json` | A list of time bands. Each band has `start` and `end` (local time, `HH:MM`, may cross midnight) and a list of rows `{ "mode", "penalty", "allowed" }`. |
| `settings.json` | The tunables of section 5 (limits, penalties, thresholds, windows). |

**One structure for the operating plan.** A time band lists the modes with a preference penalty each. A row with `"allowed": false` forbids that mode in the band (for example a curfew band that allows only one mode); that is a hard rule and makes the cell UNSUITABLE with the cause `PLAN`. A mode with no row in a band is allowed and takes `preferenceDefaultPenalty`. There is no separate eligibility structure. The bands must cover the 24 hours with no gap or overlap. A slot belongs to a band by the local wall time of its start, using the pack's time zone. Band ends are exclusive; a band whose `end` is earlier than its `start` crosses midnight; a band with the same `start` and `end` is refused unless it carries `"allDay": true` (optional, default false), which marks a whole-day band; that band must then be the only one.

**Settings inventory.** The names, units, defaults and meanings of every tunable are in refdata/airports/YSSY/settings.json, which is the worked example (each value carries its `description`). Defaults there were proposed on 23-10-2026 and are provisional simulation assumptions. The tunables are: `tailwindDryKt`, `tailwindWetKt`, `defaultCrosswindKt`, `limitToleranceKt`, `calmWindKt`, `nearLimitMarginKt`, `wetRunwayProbabilityPct`, `dryingTimeMinutes`, `precipitationCodes`, `metarValidityMinutes`, `lowVisibilityMetres`, `forecastWindowMinutes`, `demandHorizonMinutes`, `assumedDepartureWindowMinutes`, `assumedGroundSpeedKt`, `trafficBands`, `preferenceDefaultPenalty`, `marginalPenalty`, `changePenaltyLight`, `changePenaltyMedium`, `changePenaltyBusy`, `unknownDemandChangePenalty`, `noModePenalty`, `minimumStayMinutes`, `shortStayPenalty`, `changeoverPreparationMinutes`, `metarStaleMinutes`, `tafStaleMinutes`, `vatsimStaleMinutes`, `weatherPollMinutes`, `vatsimPollSeconds`, `auditMaxEntries`, `currentModeStaleMinutes`. Other files add their own: `maxCrosswindKt` and `capacity` on each mode, and the preference penalty on each operating-plan row.

**Checks the validator makes** (each message names the file and field): an enabled mode names at least one runway end across arrivals and departures (empty lists are allowed only for a disabled mode, such as the Sydney Mode 4); every runway a mode names exists; every mode a band names exists; ids and runway names are unique; the bands cover the day with no gap or overlap; every tunable has a `value` and a `description`; no unknown keys; the traffic bands are contiguous (light from 0, each band starting one above the one before, busy open-ended); the limits on file size (256 KB for a pack file, 16 KB for `app.json`) and nesting depth (10 levels) are checked on the raw text before it is parsed, the keys `__proto__`, `constructor` and `prototype` are refused at any depth, and every number and text has a range or length cap held in one bounds table in `src/refdata/schema.ts`. A key repeated within one object is refused. Keys that start with `_` are notes on records: they are removed before the unknown-key check and never reach the engine; where a key is data (the `labels` names) or a value must not start with `_` (ids), a leading `_` is refused. `-0` is read as 0. Airport ids are 3 to 8 capital letters or digits everywhere. `vatsimPollSeconds` has no enforced minimum beyond 1 second (a positive whole number), as agreed.

**What the engine receives.** `parsePack` (in `src/refdata`, pure, no fetch) returns a deeply frozen `AirportPack`: `airport`, `runways`, `modes`, `plan` (bands as minutes of the local day, `startMinute` and `endMinute`), `settings` (plain values, one per tunable), `descriptions` (the text of each tunable, kept apart for the settings drawer and never read by the engine) and `meta` (the file-level `source` notes). `fetchPack.ts` is the only file that fetches, through a `fetch` function passed in; `reloadPack` keeps the previous valid pack when the new files are rejected.

A cross-airport file `refdata/app.json` lists the available packs and the default; nothing else is shared between airports. The UI offers an always-visible airport pull-down that switches only between listed packs (OD-37, OD-68).

## 6. Engine
Stages: The engine receives one validated `AirportPack` and uses no other source of airport facts (section 4c).

**A. Slots.** Build 30-minute slots aligned to the clock (:00 and :30) across the window (4 hours, 6 hours or the full TAF validity; default the full TAF, OD-31). Slot 1 is the slot that contains now. There are no extra slots at TAF change times: a forecast group applies to the slot that contains its start time, so every slot is exactly 30 minutes and per-slot penalties and traffic bands stay comparable. Each slot holds the prevailing wind and weather, the TEMPO/PROB/BECMG overlays, a wet-risk flag, and demand (observed now, estimated ahead, or `unknown`).

**B. Eligibility matrix.** For each mode and slot, evaluate every hard rule below and keep every reason; the cell's status is the worst result, and the primary cause is the first failing rule in this order:
1. mode enabled in the pack (there are no runway closures, OD-19);
2. time-of-day and operating-plan restrictions, read from the pack's rule records in the airport's local time (for example a curfew band);
3. tailwind on every runway the mode uses, at the stronger of mean wind and gust, against the dry or wet limit (variable wind: dry limit only, OD-33); zero rounding before the test;
4. crosswind on every runway the mode uses, at the stronger of mean wind and gust, against **that mode's own `maxCrosswindKt`** (fallback: the settings default); the cell reason names the mode's limit;
5. weather minima (cause `MIN`), only for a mode whose pack entry has `minima` (WC-14, OD-78): the ceiling (lowest BKN or OVC base, or the vertical visibility if lower; CAVOK and a clear sky are no ceiling) against `ceilingFt`, the visibility against `visibilityMetres`, and the runway state against `requiresDrySurface`. A value exactly at the minimum passes. Below a minimum, or a WET runway, is a failure; a WET POSSIBLE runway, or a ceiling or visibility the report does not state, is MARGINAL and uncertain; a TEMPO or INTER group that would break a minimum is MARGINAL (a PROB group never changes a cell, OD-80). A METAR-governed slot uses the METAR alone. Windshear is not checked: a METAR or TAF cannot give it;
6. capacity: known demand, scaled to the slot length, against the mode's capacity (only when a capacity is set and demand is known).
Result per cell: SUITABLE, MARGINAL, UNSUITABLE or UNKNOWN. MARGINAL means it passes but relies on an uncertain input: a TEMPO or INTER group that would fail it, a WET POSSIBLE runway state where only the dry case passes, a weather minimum that cannot be checked or that only a TEMPO or INTER group would break (WC-14), a METAR and TAF that disagree in the near-term overlap, variable wind above calm (VRB, OD-33), or a tailwind or crosswind above zero and within `nearLimitMarginKt` (default 3) of its limit (WC-13). UNKNOWN means data is missing. Each cell stores its reasons and the figures behind them, which is what the timeline shows on hover.

**Runway state.** DRY, WET or WET POSSIBLE. It is derived only from the METAR and TAF; the app never receives a runway condition from the controller (OD-14). WET POSSIBLE evaluates both cases; a mode that passes only the dry case is MARGINAL, never SUITABLE.

**Forecast runway state per slot.** Pack values, all provisional simulation assumptions: `wetRunwayProbabilityPct` (default 40), `dryingTimeMinutes` (default 60), and the list of precipitation codes that count. Vicinity weather (VC) is never on that list and never makes a slot WET (OD-34). Rules, applied slot by slot from now:
1. Slot 1 is WET if the latest METAR reports precipitation now or recent precipitation (an RE group); otherwise DRY. Stored earlier METARs are not used. The screen states this assumption.
2. Prevailing precipitation (the TAF base group, FM, or BECMG from its start time) makes the slot WET.
3. A PROB group that is not on a TEMPO or INTER, with precipitation and a probability at or above `wetRunwayProbabilityPct`, makes the slot WET. Below it, the slot is WET POSSIBLE.
4. TEMPO or INTER precipitation without a PROB makes the slot WET POSSIBLE whatever the threshold. A PROB30 or PROB40 TEMPO or INTER changes nothing (OD-80).
5. WET POSSIBLE is evaluated as both wet and dry; a mode that fails only the wet case is MARGINAL. It does not start the drying clock.
6. After the last WET slot of each wet spell, the runway stays WET for `dryingTimeMinutes`, counted from the end of that slot, then is DRY.

**Slot weather source.** The latest METAR governs forecast slots that start within `metarValidityMinutes` of its observation (pack value; 40 in the shipped packs, OD-75). After that the TAF governs. Inside the METAR window the METAR decides each cell's status and the runway state, and a TAF that would make a mode worse for that slot makes the cell MARGINAL with the TAF reason (owner decision, 23-10-2026). With no usable METAR the TAF governs from slot 1. BECMG is treated as an ordinary change at its start time (owner decision, 23-10-2026).

**Report entry and selection (OD-28, amended by OD-37).** The METAR and TAF are fetched automatically. The user can instead paste either report into its text box and press Apply (the boxes appear when "Use my own weather" is pressed). The report's station must match the pack's weather station, or it is refused. A SPECI counts as a METAR. A new TAF issue, amendment or correction replaces the previous TAF; a cancelled or nil TAF counts as no TAF; a TAF whose validity has ended counts as no TAF. If there is no TAF, slots beyond the METAR window are UNKNOWN. If there is no METAR, or it is older than `metarValidityMinutes`, slot 1 takes its weather from the TAF and its runway state is DRY (WC-12). Times without a month are resolved from the clock: the day in the report is taken as the most recent date at or before now that matches, or for a TAF validity, the date nearest its issue time. The age shown is the age of the observation time in the report, so a pasted old report is visibly stale. A stale METAR is accepted and flagged, never refused (OD-30). Pasted reports are held in memory only and are not stored: every visit starts with empty boxes. If only one report is entered the app works with it (WX-9) and a banner names the missing one.

**Capacity.** Each mode has a maximum capacity in the pack, in total movements (arrivals plus departures) per hour, scaled to the slot length; `null` means no limit. Known demand above capacity makes the mode UNSUITABLE in that slot (hard limit, owner decision 23-10-2026). Known demand is the known arrivals plus the known departures. Departures are known only for slots 1 and 2 (slot 2 only when the feed carries prefiled plans), and missing departures count as zero, so later slots are checked against arrivals alone, a lower bound (owner decision, 23-10-2026). A slot where nothing is known skips the check and is marked uncertain, not UNSUITABLE. Accepted risk: a heavy arrival count alone can make a mode UNSUITABLE in later slots.

**C. Survival.** For each mode from now: continuous viable duration (stops at the first UNSUITABLE slot; UNKNOWN slots are counted and marked uncertain, not treated as failures), first MARGINAL slot, first UNSUITABLE slot, its cause, and the best replacement at that time.

**D. Sequence optimiser.** The optimiser chooses the sequence of modes across the forecast window with the lowest total penalty. A penalty is a score for something we want to avoid; lower is better. Hard rules are never penalties: a cell that is UNSUITABLE is forbidden, so the plan can never enter it.

*State and method.* Dynamic programming over (slot, mode). The window is the forecast window only; there is no look-ahead past its end and no terminal penalty (owner decision, 23-10-2026). The starting mode is the operator's current mode if one is entered (OD-21): a first slot in any other mode is charged a change penalty. If no current mode is set, there is no starting mode and the first slot may be any allowed mode. A "no suitable mode" state is used only in slots where every mode is UNSUITABLE, at `noModePenalty` per slot; entering or leaving it costs no change penalty, so a plan can always be produced.

*Penalties.* All weights are pack values, whole numbers, each with a `description` (RD-7). The total for a plan is the sum, over slots, of:
1. **Preference penalty.** Each ranked row of the operating plan carries its own number (owner decision, 23-10-2026), for example 0, 2, 5, 12. The row for the slot's time band gives the mode's penalty, so you set how close or far apart the choices are by editing data.
2. **Marginal penalty.** A fixed penalty for each MARGINAL slot.
3. **Short-stay penalty (OD-74).** `shortStayPenalty` is charged when a stay in one mode shorter than `minimumStayMinutes` ends in a change to another mode. The first stay counts only the time left in it; the mode in use now and the last stay in the window are not charged; moves into or out of the no-mode state are not charged. It stops a plan that picks a mode for a few minutes and then another.
4. **Change penalty.** Charged when a slot's mode differs from the previous slot's. It depends on the traffic level of that slot: light, medium or busy (pack values, for example 1, 5, 25). Where traffic is not known for a slot, a single flat `unknownDemandChangePenalty` is used and the plan gives no pre-emptive advice there (owner decision, 23-10-2026; see Traffic).

*Tie-breaks.* Equal totals are resolved by the lower total preference penalty, then by the mode that appears first in `modes.json` (the engine never uses a mode number or name, AG-4). The same input always gives the same plan.

*Worked example (made-up numbers).* Eight slots. Mode 12 has preference 0 and is allowed in slots 1 to 4 only; Mode 10 has preference 2 and is allowed throughout. A change costs 5 in medium traffic and 25 in busy traffic. No current mode is set. With medium traffic in every slot the best plan is Mode 12 for four slots, then Mode 10: 0 + 5 + 4 x 2 = 13, against 16 for Mode 10 throughout. Now make slot 5 busy and the others medium. Waiting for Mode 12 to end would put the change in slot 5: 0 + 25 + 8 = 33. Staying in Mode 10 all the way costs 16. The best plan is to change one slot early, at slot 4 while traffic is medium: slots 1 to 3 in Mode 12 (0), the change (5), slots 4 to 8 in Mode 10 (5 x 2 = 10), total 15. That is the lowest, and it is an early change (OP-7). If the current mode is Mode 10, add the change cost for leaving Mode 10 in slot 1 to any plan that starts in Mode 12. This example becomes a test with fixed weights on the TEST pack.

**Current mode (OD-21).** The operator picks the current mode from a pull-down menu of the pack's enabled modes, with Not set as the first entry. The choice is stored in browser storage under the airport and shown with the time it was set. It turns amber with "set more than 2 hours ago" once it is older than `currentModeStaleMinutes` (pack value, default 120), so a forgotten setting is visible (OD-30). On load it is checked against the pack: if it names a mode that is no longer enabled, it is cleared with a message. The app never changes it. A current mode that is UNSUITABLE now is shown as such, with a banner naming the replacement. The change penalty that discourages leaving the current mode is the ordinary change penalty (section D), so it grows with traffic.

**On-screen settings (OD-27).** The user can change only the current mode and the forecast window on screen. Every other setting is shown read-only and is changed by editing the pack files and pressing Reload data. Configuration on screen, with stored overrides over the pack defaults, is a later iteration.

**E. Changeover planning.** Changeovers are read from the chosen sequence, not searched separately. The change slot is wherever the optimiser placed it, which already weighs traffic. The planner then adds: the trigger (the first slot where the mode before the change would fail), the preparation start (the change time minus `changeoverPreparationMinutes`), traffic at the change, and the replacement mode with how long it survives. EARLY MODE CHANGE RECOMMENDED is shown only when the mode being left becomes UNSUITABLE later in the window, the chosen plan changes before that, and its total penalty is lower than the best plan that waits for the forced change. The engine finds that second plan by running the optimiser again with changes forbidden before the failure slot. The banner is not shown for a change made only for preference, or when traffic at the change slot is unknown. The banner states the two times and the traffic at each; the difference in score is never shown to the user.

**F. Stability.** The plan is recomputed every 30 minutes and on a new METAR, a TAF amendment, a settings change or a manual refresh. Each recalculation is the best plan for the current data and the current mode, if set; the app keeps no memory of earlier recommendations (OD-20). The newest plan is always shown, with its cells and explanation computed together. Repeated changes within one plan are limited by the change penalties.

**Explanations** are generated from the stored cell reasons and costs by template, so the text always matches the numbers. If no mode is eligible the screen shows "NO SUITABLE STANDARD MODE IDENTIFIED". Missing METAR, TAF or VATSIM data shows what is unknown and makes no claim that depends on it.

## 7. Weather and traffic detail
**Wind maths.** Headwind = speed x cos(dir - heading); tailwind = max(0, -headwind); crosswind = speed x sin(dir - heading). Runway headings come from the pack's `runways.json`; the engine accepts any number of runway ends. Wind direction and runway heading are taken as the same reference (OD-11); there is no conversion. Variable wind: VRB at or below `calmWindKt` counts as calm (no tailwind, no crosswind). VRB above it makes every mode MARGINAL with the cause VRB. A mode is UNSUITABLE only if, on every runway it uses, the full speed breaks the dry tailwind limit or that mode's crosswind limit (OD-33; this supersedes the wet-limit wording of OD-27). VRB is never judged against the wet tailwind limit. A direction range (for example 160V220) is tested at the worst direction in the range. Tailwind and crosswind use the stronger of the mean wind and the gust, and crosswind is the absolute value of speed times sin(direction minus heading). A component is compared as `component <= limit + limitToleranceKt` (WC-11), where `calmWindKt` and `limitToleranceKt` are pack values.

**TAF.** FM starts a new prevailing period. BECMG is treated as an ordinary change at its start time. TEMPO and INTER are overlays valid for their window and never replace the prevailing state. Vicinity weather (VC) in any group is never precipitation (OD-34). PROB30 and PROB40 are overlays flagged by probability. All times are UTC internally; the screen shows UTC with the airport's local time beside it, with daylight saving (owner answer Q7).

**Demand model (owner decisions, 23-10-2026).** Each aircraft in the VATSIM feed is counted once. Aircraft without a flight plan are ignored.
- **Departures.** Origin is the pack's airport and the aircraft is on the ground at the airport: within `trafficAreaNm` of it, groundspeed under `groundMaxSpeedKt`, altitude within `groundAltitudeMarginFt` of the airport elevation (`elevationFt`; with no elevation only distance and speed are used). Every such connected aircraft counts as departing in slot 1, the slot that contains now (Panel D calls it "Next 30 mins"). Prefiled flight plans (the feed's `prefiles`: filed by pilots who are not yet connected) whose origin is the pack's airport count as departing in slot 2, the next 30-minute slot, whatever their filed time (owner, 25-10-2026). Departure demand beyond slot 2 is unknown, and slot 2's departures are unknown too when the feed carries no prefiled plans. A prefiled plan from the airport to itself counts once, as a departure.
- **Arrivals.** Destination is the pack's airport. An airborne aircraft is timed from straight-line distance divided by groundspeed (not below `arrivalSpeedFloorKt`). An aircraft on the ground elsewhere (outside `trafficAreaNm` of the airport, groundspeed under `groundMaxSpeedKt`) with a flight plan to the pack's airport is assumed to take off within the next `assumedDepartureWindowMinutes` (pack value, default 30), with departures spread evenly across that window: with N such aircraft, sorted by distance from the airport and then by feed order, the k-th takes off at now plus the window times k divided by N. Its arrival is its take-off time plus straight-line distance divided by `assumedGroundSpeedKt` (pack value, default 400, provisional). Each aircraft counts in the slot containing its arrival time. Filed times are not used for connected aircraft. A prefiled plan to the pack's airport counts only in slot 2, and only when its filed departure time plus its time en route (nearest to now, UTC) falls in that slot; a prefile with no usable times is not counted as an arrival. Prefiled plans are not connected, so they are not in the connected counts. Aircraft bound for the airport from anywhere are counted; the demand horizon decides which fall inside the window.
- **Slot level.** For each 30-minute slot the arrival and departure counts are compared with the pack's light, medium and busy bands, and the slot takes the higher level.
- **Horizon.** Demand is estimated as far ahead as these rules support, up to `demandHorizonMinutes`. Beyond that it is unknown: the capacity check is skipped, the flat `unknownDemandChangePenalty` applies, and the cell is marked uncertain.
- **Risk accepted.** Counting every connected aircraft on the ground as departing in the current slot overstates demand when many sit at gates, and capacity is a hard limit, so a long idle queue can make a mode UNSUITABLE for capacity until aircraft leave.
- **Personal data.** Only position, altitude, groundspeed, origin and destination are read. Names, member numbers and callsigns are dropped when the feed is parsed and never stored or shown.

**Open point: other countries.** The METAR and TAF parser starts from Australian report conventions. Other countries differ (for example inHg altimeter settings and statute-mile visibility). When a second country is in view, its report fixtures are added and the parser is extended generically, never by a branch on country (requirement AG-13).

## 8. Dashboard
This section describes the main screen (v1, `index.html`); section 8a describes v2. The panels are A, B, D and F (Panels E and G were removed, OD-20, and Panel C, the weather table, by OD-40; letters are not reused). The runway diagram and timeline rows are generated from the pack's runway and mode lists, and all airport wording comes from `airport.json`. Layout order: header with the airport selector, freshness chips, the recommendation (A), the optimal mode timeline (B) directly below it, the weather entry (the fetched METAR and TAF and the paste option), then traffic (D) and the runway diagram (F), and the flight-simulation notice at the foot (OD-38, OD-41). The timeline has modes as rows and 30-minute slots as columns, scrolls horizontally, marks now, the recommended sequence and planned changes, and has a background band over every row for busy periods. Green is never drawn for a cell that fails a tailwind limit, because colour comes straight from the matrix: green means the engine said SUITABLE or MARGINAL (OD-81).

### 8a. The v2 front end (issue 94, phases 1 and 2)
A second, answer-first screen runs beside the one described above (v1). It has its own page and its own screen code, and shares everything else.
- **Where it lives.** `v2.html` at the repository root, beside `index.html`, loads `src/v2/main.tsx`. The code is in `src/v2/`: the shell (`App.tsx`), the controller (`controller.ts`, its own copy of the v1 scheduling and data flow), the view model (`src/v2/model/`: state band, tiles, chips, runway picture, evaluation, popover, drawer; `forecastBar.ts` holds the wind runs and the forecast sentence that the Evaluation section and its popover use) and the components. Its stylesheet is `src/v2/v2.css`; it does not use v1's.
- **The import rule.** `src/v2` imports nothing from `src/ui`, and `src/ui` imports nothing from `src/v2`. Both may import `src/engine`, `src/weather`, `src/traffic`, `src/refdata`, `src/store` and `src/net`. Copying v1 logic into v2 files is allowed; importing it is not. `scripts/check-ui-boundary.mjs` enforces this and runs in `npm run lint`; `tests/ui-boundary.test.ts` proves it fails when either direction is crossed. Tests may import both (the parity test does). The text-only rendering rule (SEC-2), the banned-import check and the airport-literal check apply to `src/v2` like the rest of `src/`.
- **State rule (provisional, owner, 25-10-2026; changed 26-10-2026, issue 104).** The state band uses v1's own conditions: CHANGE NOW where v1 shows "CURRENT MODE UNSUITABLE", CHANGE SOON where v1 shows "EARLY MODE CHANGE RECOMMENDED", otherwise the green state, whose internal id is HOLD and whose word on screen is RECOMMENDED. The other words are NO SUITABLE STANDARD MODE IDENTIFIED and NO DATA. v2 has no current mode (see below), so CHANGE NOW cannot appear on the screen; the rule stays in the code. CHANGE SOON can still appear, because the engine's own planned early change needs no current mode. The Key lists only the states that can appear. Issue 96 refines the rule.
- **No current mode (owner, 26-10-2026, issue 104).** v2 has no "I am on" selector. It never reads or writes a current mode, and it ignores a mode saved earlier by v1 in the shared browser storage, so the plan is always calculated as v1 does with "Not set".
- **Opening it.** `npm run dev`, then `/v2.html` on the address shown. `npm run build` produces both pages in `dist/` with one copy of `refdata/` (the Vite config has two page entries).
- **The closed screen (phase 1).** One screen with no scroll at 1280x720 and at 375x812: the state band, the mode, the forecast change ("Forecasting: MODE at HH:MMZ"), the "Also valid for the next hour" chips (issue 122: every other enabled mode that is SUITABLE in both of the next two half-hour slots, most preferred first, `alternatives` in `src/v2/model/answer.ts`; no priority numbers are drawn on the screen: hovering the small "i" mark by the state word, or the "Also valid" label, opens the ranking of every enabled mode in the plan with recommended, valid or not valid, `priorityText`), the runway picture, four tiles, the Evaluation and TAF toggle row, the freshness chips and the fixed flight-simulation notice. The runway tile (issue 123) leads with a weather line worded from the reports (`runwayTile` in `src/v2/model/tiles.ts`): the first slot of the whole forecast whose prevailing weather has precipitation at the station (never a VC group, never a TEMPO, INTER or PROB group), as "Showers in 30 min" (up to two hours ahead, then "from HH:MMZ"), "Heavy rain now" or "No precipitation forecast"; under it "Runway DRY", "WET" or "WET POSSIBLE" and the slot bar. Because only prevailing weather counts, the line can say "No precipitation forecast" while the runway reads WET (wet from recent weather, or drying time) or WET POSSIBLE; the runway state follows the rules above, the line only describes the reports. The slot builder carries the groups in an optional, display-only `present` field that the engine ignores.
- **The expansion (phase 2).** The Evaluation and TAF section is a native `details` element. Closed it is one row, with no strip of path, wind, group, wet and traffic bars (the slim bar was removed, issue 104); its summary reads "Evaluation and TAF" with a chevron and the time range; it opens and closes with no script. Open, it holds only v1's timeline block (the UTC time row with the NOW marker, the weather events row with the wind bars and the TEMPO, INTER and PROB bars, the event words, the traffic row, one row per mode with its REC tag and runways, the cells, the blue outline on the recommended path, the dashed change line and the busy band), a legend (Suitable, Unsuitable, Recommended path, Amber band and White corner only; the Unknown, green-with-a-word and planned-change entries were removed, owner, 26-10-2026), and the raw METAR and TAF. Opening it keeps the answer band on screen, and the band shrinks to one pinned line (state, mode, next change) by CSS (`:has(.fcx[open])`). A mode row that is red in every slot is hidden unless it is recommended or current, as in v1, with no button to reveal it. A marginal cell is green with its cause word and no tick; a white corner marks an uncertain input. The code is `src/v2/model/evaluation.ts` (the model, its own copy of v1's timeline model; the wind bars show a variable direction range as reported, as in v1; `tests/v2/evaluationParity.test.ts` proves the two agree on the same fixtures), `src/v2/model/status.ts` (cell status, glyph and cause words) and `src/v2/components/Evaluation.tsx`, `ForecastBar.tsx` (the `details` wrapper). On a phone the grid scrolls sideways with sticky mode names.
- **The shared popover (phase 2).** One hover, focus and tap popover (`src/v2/components/Popover.tsx`, its rules in `src/v2/model/popover.ts`) serves the chips, the tiles, the Evaluation and TAF toggle row and the grid cells. It is plain text in the page and the trigger's accessible description; Escape, a second tap, a tap elsewhere, and the pointer or focus leaving close it. On a phone it is a strip at the bottom of the screen.
- **The More drawer (phase 2).** A modal dialog (Escape closes, Tab stays inside, focus returns to the More button) with four sections: Why (the recommendation text, as v1's "More about the recommendation"), Reports (the raw METAR and TAF, "Use my own weather", Apply, Resume automatic, source and error notes and the credit line, as v1's weather entry, with the same input limits and refusals from the weather decoder), Key (state words, legend, cause words, runway picture key) and Settings (read-only values from the pack, Reload data, and the audit trail with Export and Clear through the store, as v1's settings drawer). The code is `src/v2/components/Drawer.tsx`, `DrawerContent.tsx` and `src/v2/model/drawer.ts`; the paste, resume, audit and reload paths are in `src/v2/controller.ts`.
- **Traffic detail (owner decision, 26-10-2026).** Traffic has no panel and the drawer has no Data section. The per-slot arrivals, departures and movements figures that v1 shows are not shown in v2. What v2 shows is the traffic tile with its trend arrow and "N in, N out", the tile popover with the connected-now sentence, and the Traffic row (the class per slot) in the expanded grid. v1 still shows the figures.
- **The runway picture (issues 105, 107 and 112; the same layout code is in v1, `src/ui/model/diagram.ts`).** Layout: when every runway end in a pair has `threshold` coordinates, the ends are drawn at their coordinates, to scale (the whole layout is scaled to fit the picture, with the runways' true lengths and spacing). A runway end with no coordinates makes the whole picture fall back to a schematic layout from the pack headings, with parallel runways spread sideways. Turn: coordinates give true bearings, but the pack headings and the wind are in the weather's (magnetic) reference. The offset is read from the pack: for each runway, the bearing from the first end's coordinates to the second end's, minus the first end's pack heading; the offset is the circular mean of these over the runways, and the layout is turned by it only when every runway agrees with the mean within 3 degrees (otherwise no turn). Pack headings must therefore be in the weather's reference for the picture to line up. The wind label (for example "130° 9 kt", with any gust) sits immediately beside the tail of the wind arrow, follows the arrow as the direction changes, stays inside the picture and covers no runway name, runway or arrow (`placeWindLabel` in `src/v2/model/diagram.ts`); with variable or unknown wind, which has no arrow, it stays in the top left corner. v2 labels only the ends the recommended mode uses (with ARR or DEP), draws no cross marks (the tailwind and crosswind figures are in the cell popovers), and has no "N up" note; v1 labels every end and still marks an end over a tailwind limit with a cross, but also has no "N up" note.
- **Not yet in v2.** The window choice is not drawn (phase 3 checks every row of the information ledger against v2).

## 9. Testing and verification
**Success criteria:** all scenarios pass on both the YSSY pack and the fictional TEST pack (tests/fixtures/TEST); the literal check finds no airport fact in `src/`; adding a third pack needs no code change; every number on screen traces to a refdata value or a feed value; changing a refdata value changes the plan with no code change; the timeline and recommendation agree because they share one engine output.

## 10. Modules and build order
The program is built in this order, each layer testable on its own:
1. **Reference data and engine core:** pack schema and loader with cross-reference validation, the YSSY and TEST packs, wind maths, eligibility with per-mode crosswind, survival, the optimiser, and the literal-check script.
2. **Weather and traffic:** the METAR and TAF decoding adapter with fixtures, the VATSIM demand model.
3. **Dashboard:** weather entry, recommendation, the survival timeline and the other panels.
4. **Settings and audit:** the current-mode and window controls, the settings drawer and the audit trail.

## 11. Risks
- Estimating arrival and departure demand from VATSIM is rough; shown as estimates with uncertainty.
- The METAR and TAF come from free third-party relays with no uptime guarantee (OD-37); a failure keeps the previous report and pasting always works. If the traffic or weather feeds ever block browser requests, a small proxy covers it (section 4).
- Pack files have no control beyond schema validation (owner decision, 23-10-2026). A mistaken or malicious edit within the schema's allowed range could change a limit without anyone noticing. Revisit this if more than one person edits packs or a pack is published.
- Over-fitting the schema to YSSY. Mitigated by the TEST pack, shaped differently on purpose, and by AG-12. A real second airport may still expose gaps, so expect a schema revision then.
- The generic rule vocabulary becoming too abstract to edit by hand. Mitigated by validation messages that name the file and field, and by the YSSY pack as the worked example.

## 12. Security and audit (adopted 23-10-2026)
The security requirements are SEC-1 to SEC-7 in REQUIREMENTS.md section 18; How they are met:
- **Notice (SEC-1).** The notice text is a constant in the application. `airport.json` may carry one extra line, shown beneath it.
- **Plain text only (SEC-2).** Every screen component receives data as strings and renders them as text nodes. A lint rule bans the HTML-insertion APIs and runs in CI.
- **Input checks (SEC-3).** All external input passes the schema validator (section 4c) before the engine sees it. The validator rejects unknown fields, enforces file and response size caps, depth limits and number ranges, and refuses the keys `__proto__`, `constructor` and `prototype`. Parsed data is copied into plain objects. A failed check refuses the input and keeps the previous valid data.
- **Hosting (SEC-4).** The build must run with no inline script, so the content-security policy can forbid it. The header values and the CI test belong to the publication phase.
- **Dependencies (SEC-5).** The lockfile, `--ignore-scripts` and the audit step are set up with the project skeleton.
- **Personal data (SEC-6).** The VATSIM parser keeps only position, altitude, groundspeed, origin and destination; no name, member number or callsign field exists in its types.

**Audit trail (RD-6).** An entry has: `time` (UTC), `airport`, `path` (which setting or "currentMode"), `old`, `new`. The store keeps up to a set number of entries per airport (a pack value, default 500), dropping the oldest first. It is shown at the foot of the settings drawer, can be exported as a JSON file, and is labelled "local record, not tamper-proof". It is validated on load like all stored data (SEC-3); a corrupt log is discarded with a message. The audit trail is not evidence: it can be cleared or edited by the user. Repository history is the record of pack changes.

**Uncertainty (replaces confidence, OD-25).** There is no HIGH, MEDIUM or LOW. The engine marks each cell uncertain when it rests on an uncertain input, and the timeline draws a white corner on it. The summary line in Panel A that once named the uncertain periods was removed (OD-76); the engine still computes it. A stale or failed source shows its own banner (UI_DESIGN section 7).

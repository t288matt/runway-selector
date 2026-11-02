# Australia runway summary screen: design

Status: DRAFT for owner approval, 02-11-2026. British English, dates DD-MM-YYYY.
Mockup: `docs/ui/australia-summary-picture-options.html`, tab 1 "Picture left" (the chosen layout). `docs/ui/australia-summary-mockup.html` holds the earlier rows and cards variants (superseded).

## Intent
The owner wants one page that lists the runway recommendation for every Australian airport at once, so they can see the whole country's picture without switching airport. Today the app shows one airport at a time (answer-first screen); the airport selector is the only way across.

## Decisions made by the owner (02-11-2026)
- **Content:** live now. Each airport shows the current recommended mode from live wind, updating with the weather. Not a static rules table.
- **Layout:** cards, "picture left" (option 1). Rows were rejected; cards were asked to be more compact.
- **Picture:** each card has a runway layout picture drawn to scale from the pack's runway threshold coordinates. Arrival runways blue, departure-only runways amber, runways not in use grey, with a small wind arrow.
- **No good / marginal / limit status.** The owner said it is not relevant; no status chips, no status colours, no status legend.
- **Scope:** Australian airports only (ten today: YBBN, YBCS, YBTL, YMML, YPAD, YPDN, YPPH, YSCB, YSSY, YSWS).
- **Placement:** a new screen inside the existing app, not a standalone page.
- **Tap a card:** opens that airport's existing full screen.
- **What a card's mode means (owner, 02-11-2026):** exactly what that airport's full screen shows as its headline, including the forecast, time-based rules and live traffic, not a wind-only pick. (The v2 screen keeps no stored current mode, so none is involved.) The summary must never disagree with the full screen.

## Each card shows
Airport code, recommended mode name, arrival runways, departure runways, wind direction and speed, the runway picture, and a hover tooltip with a one-line reason. Card height about 90 px; five columns by two rows on desktop, two columns on a phone.

## Goals
- All ten airports legible on one desktop screen without scrolling.
- The recommendation on each card is exactly the one the single-airport screen would give for that airport at that moment.
- Every airport fact (ICAO code, runway names, headings, coordinates) comes from the airport packs, never from code.

## Non-goals
- No non-Australian airports, no wall-display or fullscreen mode, no editing of packs, no new engine behaviour, no historical or forecast view.
- No good / marginal / limit status.

## Anti-goals (a failure even if it works)
- A card that shows a confident mode from stale or missing weather without saying so.
- A card whose recommendation differs from the airport's own full screen.
- Hardcoding the list of Australian airports or any runway fact in code (fails `npm run check-literals` and review, WORKING_AGREEMENT section 4).

## Constraints from the project
- Airport facts live in packs; the Australian group needs a data field. There is none today (`refdata/app.json` lists all 20 airports with no country). Needs a pack-schema decision; see "Left to the builder".
- `loadPack` loads one pack per call (five files each); the app controller holds one airport. Loading ten means ten `loadPack` calls and ten METAR/TAF fetches.
- Deep links already exist: `#/ICAO` opens an airport (`src/v2/route.ts`). The summary can be a new hash route and cards can link to `#/ICAO`.
- Process: WORKING_AGREEMENT. This adds a new screen layout, so it is a "complex change" and gets a QA agent (section 2a point 9). Display-only for the engine, so Low or Medium tier depending on whether it computes anything new; reading the engine for ten airports without changing it is display-only. Needs an issue, a worktree, an independent blind review, and the owner's go to release.

## Calls I made (the owner has not seen these; change any)
- **Stale or missing weather:** the card follows whatever state the single-airport screen would be in for that airport (its own rules for stale METAR, stale TAF and no weather). It never shows a confident mode the full screen would not. When the full screen has no answer, the card shows a grey border, "no report" in place of the wind, and no mode. No "last known mode" is invented: nothing is stored per airport for that today, so a card with no report is blank rather than stale.
- **Which airports count as Australian:** prefer a small group list in `app.json` over a new field in ten or more packs, because it touches less. The builder confirms against the schema and the airport-literal check, and the owner approves the schema change if one is needed.
- **Fetching:** ten parallel pack and weather fetches are acceptable; reuse the single screen's weather and pack caches and fetch no more often than it does. A failure on one card must not blank the others.
- **Entry point:** a new hash route (`#/australia`) reached from a link in the app header beside the airport selector. It is not the default landing screen; the app still opens on the default airport. Route name and link placement are the builder's to finalise.

## Left to the builder
- How to mark an airport as Australian in pack data (for example a `country` field in `airport.json` and a schema change) or whether to use a group list in `app.json`; the choice must pass the airport-literal check.
- How to reuse the existing engine and the existing runway picture component (`src/v2/components/Picture.tsx`) for ten airports, including loading and error state per card (one airport failing must not blank the page).
- Card order, my guess busiest first, to be fixed by data (for example order in `app.json`), not code.
- Refresh interval and caching; reuse what the single screen does.
- Mobile layout details and accessibility (colour is not the only cue for arrival versus departure).

## Risks
- Runway coordinates are community data (OurAirports), unchecked against an official source. A drawn picture will make any error visible. The engine does not use them, so recommendations are not affected.
- Ten parallel pack and weather fetches on load; failures and slow responses must degrade per card.

## How it could be verified
- Each card's mode and runways equal the single-airport screen's result for the same weather (test with captured weather for all ten).
- With weather missing for one airport, that card shows the grey "no report" state and the other nine are unaffected.
- A browser check at desktop and phone width.
- `npm test` including the airport-literal check passes.

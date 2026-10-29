# Runway Mode Planner

A decision-support tool for VATSIM controllers. It recommends which runway mode to use at an airport, and looks ahead through the whole forecast so the recommendation is a mode that should keep working, not just the best mode for the latest weather report.

**Flight simulation only.** Never use it for real-world navigation, flight planning or operations. 


## What it does

- Fetches the latest **METAR** and **TAF** automatically for the airport's weather station, with a box to paste your own over either report when you want to override it.
- Reads **live VATSIM traffic** and estimates arrivals and departures for each half-hour.
- Checks every standard mode for the airport against the wind, the runway state, the traffic and the airport's operating plan, for every half-hour of the forecast.
- Recommends the mode to use now, and a sequence of modes across the forecast, with the fewest and least disruptive changes.
- Warns when changing early would avoid a forced change in busier traffic.
- Shows why, in plain sentences and in the figures behind every cell.

It advises only. It never changes anything, and the final decision is yours.

## Using it

1. **Open the airport** you want from the selector in the header. Each airport keeps its own current mode, window and audit trail.
2. The **METAR and TAF are fetched automatically** and kept up to date. To use your own instead, press "Use my own weather", paste your report into the box and press Apply; that pauses automatic updates for that report until you press "Resume automatic". Each report shows its age, taken from its own time group. A report that cannot be read is refused with a message saying what is wrong, and the previous report stays in use.
3. **Choose the current mode** from the pull-down menu in Panel A, if you want the advice to take it into account. The list has the airport's enabled modes and "Not set". The tool remembers your choice and shows when you set it. If it is older than a set limit it turns amber with a "Still current" button, so a forgotten setting is visible.
4. **Read the recommendation** in Panel A, then check the optimal mode timeline below it.
5. Choose the **window** in Panel B's header: the full TAF (the default), or 4 or 6 hours.

If only a METAR is available, the tool judges the first hour from it and marks later slots unknown. If only a TAF is available, the TAF is used from the first slot. With neither, it shows no recommendation and says so.

## The screen

**Under the header:** a chip for each of the METAR, the TAF and the VATSIM traffic, with its time and age, and when the plan was last calculated and is next due. A chip turns amber with "Stale" when its data is older than the pack's limit (the shipped packs use 60 minutes for the METAR, 180 for the TAF and 10 for the traffic), and red with "Failed" when the last fetch failed.

**Panel A: recommendation.**
- The recommended mode for now, with its arrival and departure runways.
- Your current mode, if set, and a note if it differs from the recommendation.
- How long the recommended mode lasts, and the next change with its time.
- The METAR now in use, the traffic level now, the runway state and the ceiling. A collapsed "More about the recommendation" holds the full explanation.
- A red banner if your current mode is unsuitable now, and an amber banner, EARLY MODE CHANGE RECOMMENDED, when changing earlier avoids a forced change in busier traffic.
- A quiet green note, such as "LAHSO conditions met until 1430Z", when the recommended mode has a conditional operation in its airport data and its conditions (cloud ceiling, visibility, dry runway) are met on a green slot. It shows nothing otherwise and never changes the recommendation.
- If no mode is suitable, it says so and lists, for every mode, what blocks it. It never names a "least bad" mode.

**Panel B: optimal mode timeline.** Its header has the window selector (full TAF, 4 hours or 6 hours), and under it sit the Recommended, Next change and Next wet runway tiles. Rows are modes, in the airport's priority order, and columns are half-hour slots. A mode that is red in every slot is hidden behind a "Show unsuitable modes" button. Above the cells, the time row is followed by the weather events: bars for the wind (with a variable direction range, such as 160V220, shown as reported), a bar for each TEMPO, INTER or PROB group, and words such as WET, TS or low vis. A traffic row shows LOW, MED or HIGH for each slot. A PROB group is only shown: it never changes a cell. The recommended path is outlined, and a dashed line marks the planned change. Cell colours:
- Green: suitable.
- Green with a word (TEMPO, TW, VRB and so on): marginal. It passes, but see the word. A white corner marks a cell that depends on an uncertain input.
- Red with cross-hatching: unsuitable, with the cause (for example TW tailwind, XW crosswind, CAP capacity, PLAN operating plan).
- Grey with dots: unknown, for example after the TAF ends.

Hover or focus a cell to see the time (UTC), the wind and the tailwind and crosswind for every runway the mode uses, the runway state, the traffic, the operating-plan status and the reason. Colour is never the only signal: every cell also has an icon and a word.

**Weather.** Below the timeline, the raw METAR and TAF in use, with where each came from and its age, and the "Use my own weather" option.

**Panel D: VATSIM traffic.** Arrivals and departures for the next four half-hours, with a traffic level of LOW, MEDIUM or HIGH.

**Panel F: runway diagram.** The runways, the wind (with its speed and any gust), and the runways the recommended mode uses. An end that breaks a tailwind limit is marked with a cross. When the pack gives every runway end's coordinates, the runways are drawn to scale and turned from true north into the weather's magnetic reference, using the offset worked out from the pack itself. Without coordinates they are drawn from their headings.

(Panel C, the weather table, was removed. The panel letters are not reused.)

**Settings drawer.** Read only: every limit, threshold and setting in use, with a short explanation of each, plus the enabled modes, the operating plan's priority order, the time zone, a Reload data button, and the audit trail of changes you have made. The current mode and window are changed in Panel A and Panel B, not here.

## The answer-first screen (v2)

`v2.html` is a second screen that gives the answer on one page with no scrolling. It uses the same packs and the same engine, so it gives the same recommendation as the main screen does with "Not set" as the current mode. The freshness chips and the flight-simulation notice sit at the foot.

- **The answer.** A state word (RECOMMENDED, CHANGE SOON, NO SUITABLE STANDARD MODE IDENTIFIED or NO DATA) with the mode (hover the small "i" mark for the runway mode priority: every mode in plan order, marked recommended, suitable or unsuitable), the forecast change ("Forecasting: 25A16D at 1700Z" or "No change planned"), its arrival and departure runways, and under them "Also suitable": the other modes that stay suitable for the next two half-hour slots, as chips, most preferred first (nothing is shown when there are none). Clicking the mode, or a chip, copies its ATIS runway text to the clipboard ("07 FOR ARR. RWY 16L AND R FOR DEPS", all upper case; "16L AND R FOR ARR AND DEPS" when arrivals and departures use the same two or more runways; just "16" when both use the one runway) and shows "Copied" for about a second and a half; the text is built from the airport's runway lists, in the wording the pack itself gives for RWY, FOR, ARR, DEPS and AND (`atisWording` in `modes.json`, issue 154, AG-13), so a non-Australian pack can read out its own convention instead of vatSys phraseology. When the airport's data gives the recommended mode an approach ladder (Sydney does for 34AD, 16AD, 34A25D and 34AD25), a short chip beside the mode name, such as IVA, INSTR THEN IVA or INSTRUMENT, shows the approach type from the cloud base (the lowest layer of any cover) and the visibility in the latest report, with the longer wording on hover or tap; it shows nothing when there is no report or the weather cannot decide it. It has no "current mode" selector and ignores any current mode saved by the main screen.
- **The runway picture.** Each runway is drawn as asphalt, with edge lines, a dashed centreline, threshold stripes and the painted runway numbers at each end. The runways the recommended mode uses carry a blue accent glow and are labelled ARR or DEP; an unused runway keeps its stripes and numbers, in muted grey. The wind is an arrow with its direction, speed and any gust beside it. The picture is drawn to scale from the pack's runway end coordinates, turned into the weather's magnetic reference as described under Panel F.
- **Four tiles.** Traffic (the level now, or "LOW → HIGH" with the time when it changes within the next 90 minutes; three bars, one for each of the next three half hours, tall and amber or red for busier; a hatched bar means departures are not known yet; hover for each half hour's level and arrivals and departures), ceiling and visibility, runway condition (a weather line worded from the reports, such as "Showers in 30 min", "Heavy rain now" or "No precipitation forecast", looking across the whole forecast; under it "Runway DRY", "WET" or "WET POSSIBLE", and the bar of the slots) and the METAR.
- **Detail.** A section that opens to the same timeline as the main screen (modes by half-hour, the weather events, the traffic row, the recommended path), with its legend and the raw METAR and TAF. Hover, focus or tap a cell for three short lines: the mode, time and status; the cause (or "Within all limits"); and the wind used and runway condition. Hover a mode's label for its runways, capacity, plan priority and how long it stays suitable.
- **More.** A panel with Why (the explanation), Reports (the raw reports and "Use my own weather"), Key and Settings (read only, with Reload data and the audit trail).
- **Not in v2.** The window selector, the per-slot traffic figures and the current-mode setting.

## How a mode is judged

For every mode and every half-hour:

- **Wind.** The tailwind and crosswind on every runway the mode uses are worked out from the stronger of the mean wind and the gust. A mode is unsuitable if any of them is over its limit. A wind within a few knots of a limit is marginal. Wind at or below the calm threshold counts as calm. Variable wind above that makes every mode marginal. It is unsuitable only if the full speed breaks the dry tailwind limit or the crosswind limit on every runway the mode uses; the wet tailwind limit does not apply to it.
- **Runway state.** DRY, WET, or WET POSSIBLE, worked out only from the METAR and TAF. Rain in the METAR makes the first slot wet. Rain in the TAF base group, or a PROB group that is not on a TEMPO and is at or above the airport's threshold, makes a slot wet. TEMPO or INTER rain, and lower-probability PROB rain, make it wet possible: the mode is judged both ways and is marginal if only the wet case fails. After rain ends, the runway stays wet for a drying time. Weather in the vicinity (VC) never counts as rain. The tool never asks you for the runway condition.
- **Operating plan.** The airport's operating plan can forbid a mode in some time bands, such as a curfew, and ranks the modes in each band. Rankings only choose between modes that are otherwise suitable.
- **Weather minima.** A mode may have minimum weather in its airport's data, such as a land-and-hold-short mode: a cloud ceiling, a visibility and a dry runway. Below a minimum, or on a wet runway, the mode is unsuitable (cause MIN). If the runway may be wet, a report does not say, or only a TEMPO or PROB group would break a minimum, the cell is marginal. Modes without minima are unaffected.
- **Capacity.** If a mode has a maximum capacity, a slot where known traffic is above it makes the mode unsuitable. Where traffic is unknown, the capacity check is skipped and the cell is marked uncertain.
- **Forecast changes.** FM and BECMG apply from their start time. TEMPO and INTER and PROB groups are overlays: if the main forecast passes but the overlay would fail, the cell is marginal.
- **The first hour.** The METAR decides each cell's status for the first hour after its observation. If the TAF would make a mode worse in that hour, the cell is marginal.

The recommended sequence is the one with the best fit overall: preferred modes where possible, no unsuitable slots, and as few changes as possible, with changes made in quieter traffic rather than busy traffic. Hard limits are never traded away to avoid a change.

## Traffic

Traffic is read from the public VATSIM data feed every five minutes while the page is open.
- **Departures:** every connected aircraft on the ground at the airport, with a flight plan from it, counts as departing in the current half-hour. Flight plans filed from the airport by pilots who are not yet connected ("prefiled") count as departing in the next half-hour, whatever their filed time. Panel D marks that figure "(prefiled)". If the feed lists no prefiled plans, the next half-hour's departures are unknown.
- **Arrivals:** aircraft already airborne to the airport are timed from their distance and speed. Aircraft on the ground elsewhere with a flight plan to the airport are assumed to take off over the next 30 minutes and arrive after the flight time at an assumed speed. A prefiled plan to the airport counts in the next half-hour if its filed departure time plus its time en route falls in it.
- **Traffic level:** each half-hour is rated LOW, MEDIUM or HIGH from the airport's bands, using the higher of arrivals and departures.
- **Unknown:** beyond what can be estimated, traffic is shown as unknown, never invented. Departures are known only for the current and the next half-hour, so later slots use arrivals alone.
- **Privacy:** only position, altitude, speed, origin and destination are used. Names, member numbers and callsigns are discarded as the feed is read, and are never stored or shown.

## Airports

Each airport is a data pack: a folder of plain JSON files describing the airport, its runways, its modes, its operating plan and its settings. The packs are in `refdata/airports/`: YSSY (the default), YMML, YPAD, YPPH, YBBN, YSWS, YPDN, YSCB, NFFN, YBCS and YBTL. To add an airport, add a folder in the same shape and list it in `refdata/app.json`; the airport selector offers every listed airport. Nothing in the program is specific to any airport.

The values in a pack, including every limit and threshold, are edited in its files and take effect after Reload data. Each value carries a short description of what it means. A pack that is incomplete or inconsistent is refused with a message naming the file and field. A record may carry a `source` note saying where its figures came from. Treat every limit and capacity as a simulation assumption unless its source says otherwise. Runway end coordinates in every pack are community map data (OurAirports), with the source noted in each pack, and have not been checked against the official charts.

## Data and privacy

- METAR and TAF are fetched directly from your browser (VATSIM for METAR, then a couple of small weather relays for TAF) and are not stored between visits; a report you paste over the fetched one stays in the page only.
- The only things stored in your browser are your current mode, the audit trail of changes you have made, and the settings you have chosen, all kept per airport.
- The audit trail is a local record, not tamper-proof. You can export it.
- The page reads the VATSIM traffic feed directly from your browser. It sends nothing of yours to any other service.

## Running it

You need Node.js 24 or later. From the project folder, install the exact dependencies in the lock file and start the app:

```bash
npm ci --ignore-scripts
npm run dev
```

Open the address shown in the terminal. The answer-first screen (v2) is now `index.html`; the legacy main screen (v1) is a second page, `v1.html`, in the same folder (for example `http://localhost:5173/v1.html`). Both read the same airport packs. To make a static copy that any web host can serve:

```bash
npm run build
```

The built files go in `dist/`: `index.html` and `v1.html`, with one copy of the airport data. Serve them over HTTP; opening the page by double-clicking the file does not work, because browsers do not let a page read its data files that way.

## Limits

- The tool is only as good as the reports you give it and the data in the airport's pack.
- Traffic estimates are rough, particularly for aircraft that have not yet taken off.
- Counting every aircraft on the ground as departing in the next slot can overstate demand when many are at gates, and a capacity limit can then make a mode unsuitable until aircraft leave.
- With no current mode set, the recommendation can change between recalculations when the weather changes slightly.
- Weather fetching depends on third-party relays; a failure keeps the previous report and says so, and pasting your own report always works as a fallback.

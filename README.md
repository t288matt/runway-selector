# Runway Mode Planner

A decision-support tool for VATSIM controllers. It recommends which runway mode to use at an airport, and looks ahead through the whole forecast so the recommendation is a mode that should keep working, not just the best mode for the latest weather report.

**Flight simulation only.** Never use it for real-world navigation, flight planning or operations. Rules, limits and capacities are simulation assumptions unless the airport's data says otherwise.

Seven Australian airports are included: Sydney (YSSY), Melbourne (YMML), Brisbane (YBBN), Adelaide (YPAD), Perth (YPPH), Western Sydney (YSWS) and Darwin (YPDN). The tool works for any airport that has a data pack (see Airports); an airport selector appears whenever more than one is configured.

## What it does

- Fetches the latest **METAR** and **TAF** automatically for the airport's weather station, with a box to paste your own over either report when you want to override it.
- Reads **live VATSIM traffic** and estimates arrivals and departures for each half-hour.
- Checks every standard mode for the airport against the wind, the runway state, the traffic and the airport's operating plan, for every half-hour of the forecast.
- Recommends the mode to use now, and a sequence of modes across the forecast, with the fewest and least disruptive changes.
- Warns when changing early would avoid a forced change in busier traffic.
- Shows why, in plain sentences and in the figures behind every cell.

It advises only. It never changes anything, and the final decision is yours.

## Using it

1. **Open the airport** you want from the selector in the header, if more than one is configured. Each airport keeps its own current mode, window and audit trail.
2. The **METAR and TAF are fetched automatically** and kept up to date. To use your own instead, press "Use my own weather", paste your report into the box and press Apply; that pauses automatic updates for that report until you press "Resume automatic". Each report shows its age, taken from its own time group. A report that cannot be read is refused with a message saying what is wrong, and the previous report stays in use.
3. **Choose the current mode** from the pull-down menu in Panel A, if you want the advice to take it into account. The list has the airport's enabled modes and "Not set". The tool remembers your choice and shows when you set it. If it is older than a set limit it turns amber with a "Still current" button, so a forgotten setting is visible.
4. **Read the recommendation** in Panel A, then check the optimal mode timeline below it.
5. Choose the **window** in Panel B's header: the full TAF (the default), or 4 or 6 hours.

If only a METAR is available, the tool judges the first hour from it and marks later slots unknown. If only a TAF is available, the TAF is used from the first slot. With neither, it shows no recommendation and says so.

## The screen

**Under the header:** the age of the METAR, the TAF and the traffic data, the runway state, and the raw METAR and TAF text.

**Panel A: recommendation.**
- The recommended mode for now, with its arrival and departure runways.
- Your current mode, if set, and a note if it differs from the recommendation.
- How long the recommended mode lasts, and the next change with its time.
- Weather suitability, traffic now and later, the mode's rank in the airport's operating plan, the runway state, and a line saying how much of the plan rests on uncertain inputs.
- A red banner if your current mode is unsuitable now, and an amber banner, EARLY MODE CHANGE RECOMMENDED, when changing earlier avoids a forced change in busier traffic.
- If no mode is suitable, it says so and lists, for every mode, what blocks it. It never names a "least bad" mode.

**Panel B: optimal mode timeline.** Its header has the Recommended, Next change and Next wet runway summary tiles, and the window selector (full TAF, 4 hours or 6 hours). Rows are modes and columns are half-hour slots. The recommended path is outlined, and a dashed line marks the planned change. Cell colours:
- Green: suitable.
- Amber with stripes: marginal, or depends on an uncertain input (a white corner marks those).
- Red with cross-hatching: unsuitable, with the cause (for example TW tailwind, XW crosswind, CAP capacity, PLAN operating plan).
- Grey with dots: unknown, for example after the TAF ends.

Hover or focus a cell to see the time (UTC and local), the wind and the tailwind and crosswind for every runway the mode uses, the runway state, the traffic, the operating-plan status and the reason. Colour is never the only signal: every cell also has an icon and a word.

**Panel C: weather.** Headwind, tailwind and crosswind for every runway end, against the limits.

**Panel D: VATSIM traffic.** Arrivals and departures per half-hour, with a traffic level of LOW, MEDIUM or HIGH.

**Panel F: runway diagram.** The runways, the wind, and the runways the recommended mode uses.

**Settings drawer.** Read only: every limit, threshold and setting in use, with a short explanation of each, plus the enabled modes, the operating plan's priority order, the time zone, a Reload data button, and the audit trail of changes you have made. The current mode and window are changed in Panel A and Panel B, not here.

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
- **Departures:** every aircraft on the ground at the airport counts as departing in the next slot.
- **Arrivals:** aircraft already airborne to the airport are timed from their distance and speed. Aircraft on the ground elsewhere with a flight plan to the airport are assumed to take off over the next 30 minutes and arrive after the flight time at an assumed speed.
- **Traffic level:** each half-hour is rated LOW, MEDIUM or HIGH from the airport's bands, using the higher of arrivals and departures.
- **Unknown:** beyond what can be estimated, traffic is shown as unknown, never invented. Departures are known only for the next slot, so later slots use arrivals alone.
- **Privacy:** only position, altitude, speed, origin and destination are used. Names, member numbers and callsigns are discarded as the feed is read, and are never stored or shown.

## Airports

Each airport is a data pack: a folder of plain JSON files describing the airport, its runways, its modes, its operating plan and its settings. The packs are in `refdata/airports/`. To add an airport, add a folder in the same shape and list it in `refdata/app.json`. When more than one airport is listed, an airport selector appears. Nothing in the program is specific to any airport.

The values in a pack, including every limit and threshold, are edited in its files and take effect after Reload data. Each value carries a short description of what it means. A pack that is incomplete or inconsistent is refused with a message naming the file and field. Every pack's own status (shown in its description) states whether its figures are confirmed or still provisional estimates.

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

Open the address shown in the terminal. To make a static copy that any web host can serve:

```bash
npm run build
```

The built files go in `dist/`. Serve them over HTTP; opening the page by double-clicking the file does not work, because browsers do not let a page read its data files that way.

## Limits

- The tool is only as good as the reports you give it and the data in the airport's pack.
- Traffic estimates are rough, particularly for aircraft that have not yet taken off.
- Counting every aircraft on the ground as departing in the next slot can overstate demand when many are at gates, and a capacity limit can then make a mode unsuitable until aircraft leave.
- With no current mode set, the recommendation can change between recalculations when the weather changes slightly.
- Weather fetching depends on third-party relays; a failure keeps the previous report and says so, and pasting your own report always works as a fallback.

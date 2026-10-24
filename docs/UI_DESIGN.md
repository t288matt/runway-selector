# Runway Mode Planner: user interface design

Status: DRAFT for the owner's review, 22-10-2026; amended 23-10-2026 (REQUIREMENTS.md OD-14 to OD-30). Design only; no application code. Where this document and [REQUIREMENTS.md](REQUIREMENTS.md) differ, REQUIREMENTS.md governs.
Language: British English. Dates DD-MM-YYYY, times UTC. Plain words; no emoji.
Sources: [REQUIREMENTS.md](REQUIREMENTS.md) sections 4 to 9 (DB-1 to DB-9), [DESIGN.md](DESIGN.md) sections 4, 4b, 5, 6, 8, and the owner's survival-timeline illustration.
Airport-agnostic: every airport name, runway, mode, label and time zone on screen comes from the airport pack (REQUIREMENTS.md AG-1 to AG-13). Mode numbers, runway names and times in the examples and the mockup are illustrative values from the first (Sydney) pack, not fixed text.
The mockup was rebuilt on 23-10-2026 from the latest design and is the layout reference for section 3. It uses fake Sydney sample data from an in-page sample pack and is illustration only. Section 13 lists where it differs from the requirements.
Visual reference: [ui/mockup.html](ui/mockup.html), a static page with fake data, labelled "Illustrative, not live data".

## 1. Users and tasks
**Phase 1 user:** the owner, one VATSIM controller at the first airport (Sydney, YSSY), using a browser on the same PC as the simulator client. Later: a few controllers, then the public on vatpac.org.

The controller is busy talking to aircraft. The tool is a second-screen aid, glanced at for one or two seconds at a time. It advises and never changes anything.

| Task | How often | What the screen must give |
|---|---|---|
| T1 Check the mode is still right | every few minutes | Mode, how long it lasts, next change, why |
| T2 Plan a changeover | a few times per session | When, to what, traffic at that time, preparation time |
| T3 Understand a change in advice | when the plan moves | Which input changed, which cell turned red |
| T4 Trust or challenge the advice | on doubt | Per-cell numbers, sources, data ages, provisional flags |
| T5 Enter the current mode | at start, after each change of mode | Current mode (pull-down menu) |
| T6 Tune the rules | rarely | Settings, with an audit trail |

## 2. Information hierarchy
| Read time | Content | Where |
|---|---|---|
| 2 seconds | Recommended mode (large); whether it differs from the current mode; time it lasts; next change time; one status banner when action is needed | Panel A, top block |
| 10 seconds | The timeline: which rows stay green, where red begins, where the busy bands fall; the one-line reason; data freshness chips | Panel B and the one-line "why" in A |
| On demand | Cell detail (hover, click, keyboard); weather decode; traffic numbers; runway diagram; settings | Tooltips, panels C, D and F, settings drawer |

Rules that follow from this:
1. The first read answers four questions in this order: what mode now, how long will it last, when is the next change, why.
2. Nothing in the first read depends on colour alone (section 9).
3. Anything that needs attention is a banner inside A, never a pop-up. Pop-ups steal focus from the controller.
4. Provisional and illustrative values are always labelled where they appear, never only in a footnote.

## 3. Screen layout
The order is fixed at every width: header, notice, freshness chips, weather entry, A, B, then C, D and F. B is always directly below A. Panel letters are not reused, so the panels are A, B, C, D and F.

### 3.1 Wide desktop (1280 px and above, designed at 1440)
Content width capped at 1440 px, centred, 16 px gutters. C, D and F sit side by side.
```
+----------------------------------------------------------------------------------------------------------+
| <Airport> Runway Mode Planner   [Illustrative, not live data]   Times UTC + local   [Refresh] [Settings] |
| Flight simulation only. Never for real-world navigation, flight planning or operations.                  |
| Rules and capacities shown are provisional simulation assumptions.                                       |
| METAR 22:00Z (12 min) | TAF 21:30Z to 07:30Z | VATSIM 32 s | Plan 22:00Z, next 22:30Z | DRY              |
+----------------------------------------------------------------------------------------------------------+
| METAR [ paste box, 2 lines .......................................... ] [Apply]  12 min old              |
| TAF   [ paste box, 3 lines .......................................... ] [Apply]  valid 07:30Z            |
+----------------------------------------------------------------------------------------------------------+
| A  RECOMMENDED NOW  | Lasts to 07:30Z (9 h 18 min)    | Plan rank 3 of 8 (provisional)                   |
| MODE 12             | Next change 10 to 12 at 00:00Z  | Uncertainty: based on 2 uncertain slots          |
| Arr 07, Dep 07      | Weather SUITABLE                | Runway DRY; wet possible 05:00Z-06:00Z           |
| Current [Mode 10 v] | Traffic LOW now, HIGH by 04:00Z | Capacity 60/hr (placeholder)                     |
| [banner: EARLY MODE CHANGE RECOMMENDED: trigger, timing, benefit]                                        |
| Why Mode 12: one sentence                                                                                |
+----------------------------------------------------------------------------------------------------------+
| B  MODE SURVIVAL TIMELINE          Window [Full TAF v]                                                   |
| [Recommended] [Survives] [Next constraint] [Traffic at changeover]  (four summary tiles)                 |
| Time (UTC) | 22:00 | 22:30 | 23:00  | ...                                                                |
| Events     | BECMG | TEMPO | CHANGE | ...                                                                |
| Traffic    | L     | M     | H HIGH | ...                                                                |
| Mode 12 REC       [S][S][S][S][S][S][M][M] ...  scrolls ->                                               |
| Mode 10 CURRENT   [S][S][S][S][S][S][M][M] ...                                                           |
| ... one row per enabled mode ...                                                                         |
| Legend: tick suitable, tilde marginal, cross unsuitable, ? unknown; outline, change line, bands          |
| Reason line                                                                                              |
+----------------------------------------------------------------------------------------------------------+
| C Weather                | D VATSIM traffic            | F Runway diagram                                |
| Ends, components, limits | Arrivals, departures, class | Runways, ARR/DEP, wind arrow                    |
+----------------------------------------------------------------------------------------------------------+
```
At 1440 px the timeline shows its slots with no scroll; at 1280 px the rest of the full TAF validity scrolls.

### 3.2 Laptop (768 to 1279 px)
Same order. A uses two columns (mode block left, facts right; banner and why full width). B scrolls horizontally with the mode labels sticky. C and D sit side by side, then F takes the full width.
```
+--------------------------------------------+
| header, notice, chips (wrap)               |
| METAR and TAF boxes, Apply buttons         |
+--------------------------------------------+
| A  MODE 12  |  lasts, next change, weather |
| banner and why (full width)                |
+--------------------------------------------+
| B  tiles 2 x 2                             |
| [label] [cells ... scroll ->]              |
| legend, reason                             |
+--------------------------------------------+
| C Weather | D VATSIM traffic               |
| F Runway diagram (full width)              |
+--------------------------------------------+
```
Target: A and the first four timeline rows visible on a 1366 x 768 laptop without scrolling the page.

## 4. Persistent elements
### 4.1 Header strip
Title (built from the pack), a data tag, a "Times UTC, local time beside" label, Refresh button, Settings button. The tag reads "Live" with source times when data is live and "Illustrative, not live data" in the mockup. The tag is never absent.

### 4.2 Flight-simulation notice
- Text: "Flight simulation only. Never for real-world navigation, flight planning or operations." A second short line: "Rules and capacities are provisional simulation assumptions."
- Always visible as a bar under the header; it is not dismissible in phase 1.
- On the VATPAC site (future) the first visit shows the site's own acceptance step before the app loads; the bar stays after acceptance. Acceptance is stored in browser storage only, with the version of the wording.
- Contrast and size match body text. It must not be styled so quietly that it is missed.

### 4.3 Freshness chips
One chip each for METAR, TAF, VATSIM and when the plan last and next recalculates. Each shows time and age. A chip changes to amber with a "Stale" word when it passes the refdata stale limit, and to red with "Failed" when the last fetch failed (section 7). The weather entry boxes (section 5) sit directly under the chips, above Panel A, and show the report text as pasted.

Runway state is not a separate chip: owner decision, 24-10-2026, to stop the duplication of showing it in the header and again, one line below, in Panel A. It is now stated once, in Panel A, and every timeline cell still carries its own slot-by-slot runway-state detail on hover (DB-4).

## 5. Panel specifications
Common to all panels: a letter badge and title; a small "provisional" mark wherever a value comes from a provisional rule or placeholder band; no scrolling inside a panel except tables of more than 8 rows.

### Panel A: current recommendation
**Content (DB-2).** Left block: label "MODE", the mode number at 44 px, arrival and departure runways, and the current mode with its pull-down menu (enabled modes, plus Not set). Middle: "Lasts" (time to first unsuitable slot, or "to end of forecast"), "Next change" (mode and time), weather suitability, traffic class now and expected. Right: operating-plan priority rank, an uncertainty line ("Based on 2 uncertain slots" or "No uncertain inputs"; there is no confidence level), runway condition and wet-risk time, capacity note. Below: banner area, then a one-sentence "Why".

**Heading logic.** The large mode is the recommended mode for now: the first slot of the recommended sequence. A planned change appears in Next change. If the operator has entered a current mode that differs, it shows beside it as "Current: 10" and the banner explains the gap. The pull-down menu beside it sets the current mode (OD-21).

**States.**
| State | Display |
|---|---|
| Normal, current equals recommended or not set | No banner. "No change needed" in Next change if no change is planned. |
| Current differs, no urgency | Quiet note: "Recommended differs from current. See B." |
| Current mode failing now | Red banner: "Current mode 10 is unsuitable now (tailwind 16L 7 kt). Change to Mode 12." |
| EARLY MODE CHANGE RECOMMENDED | Amber banner with trigger, timing, benefit, traffic at changeover (section 7.1). |
| NO SUITABLE STANDARD MODE IDENTIFIED | Replaces the mode block (section 7.1). |
| Data missing | Fields that depend on the missing source show "Unknown", with the reason (section 7). |

**Interactions.** Clicking "Next change" scrolls B to the changeover marker and focuses it. Clicking "Why" expands the full explanation (the engine's template text with numbers).

### Panel B: survival timeline
Section 6 describes it in full.

### Panel C: weather
- The raw METAR and TAF are shown at the top of the screen, in the weather entry boxes (OD-32), not in this panel.
- Component table for every runway end in the airport pack: headwind, tailwind, crosswind, one decimal, using the stronger of mean wind and gust. Ends over a limit carry the cross icon and the cause code (TW or XW).
- A footer states the limits in use and their label: "Simulation settings".
- States: METAR stale or missing shows "Unknown" in every figure that needs it.

### Panel D: VATSIM traffic
- Table: for each of the first four 30-minute slots (now, +30, +60, +90 min), arrivals (airborne to the pack's airport), departures (on the ground) and movements per hour. Departures are estimated for the next slot only; later slots show "not est.". A line states "Connected aircraft are not movements."
- Traffic class chip (LOW, MEDIUM, HIGH) and a note that bands are provisional placeholders. No trend is shown (OD-32).
- Beyond the demand horizon (default: the forecast window, REQUIREMENTS.md TR-7): "Demand unknown" is shown, never an invented figure.
- States: feed stale shows the last values with the age in amber; feed failed shows "No traffic data" and the timeline falls back to unknown demand (capacity checks are skipped, shown by uncertainty corners).

### Panel F: runway diagram
A simple plan view of the runways from the pack, with ends labelled. The runways used by the recommended arrival and departure are highlighted in the accent colour and labelled "ARR" or "DEP" in text. A wind arrow shows direction, speed and gust. Ends over a tailwind limit get the cross icon. A text equivalent sits below it. Orientation is the runways' true layout, not north-up unless the data says so.

### Settings (drawer, opened from the header)
A right-hand drawer, not a page, so the dashboard stays visible behind it. In phase 1 the user can change only the current mode and the forecast window on screen (OD-27); the drawer shows the rest read-only. Sections in this order:
1. **Current mode:** a pull-down menu of enabled modes, plus Not set (OD-21). Runway state is display only: DRY, WET or WET POSSIBLE, derived from METAR and TAF, with no control to set it (OD-14). The pull-down is also in Panel A.
2. **Limits (read-only):** dry and wet tailwind, default crosswind limit, maximum crosswind per mode, calm wind and limit tolerance, each labelled "Simulation setting".
3. **Runway wetness (read-only):** wet-runway probability threshold and drying time.
4. **Plan and traffic (read-only):** operating-plan priorities and enabled modes, mode capacities, traffic bands, changeover preparation time and forecast horizon (DB-9).
5. **Airport and data:** an airport selector, shown only when more than one pack is listed in `app.json`; a "Reload data" button that re-reads and re-validates the pack (DESIGN.md section 4c); and the pack's validation error, if a reload was rejected, with the previous valid pack still in use.
6. **Audit trail:** the list of setting and current-mode changes, labelled "local record, not tamper-proof", with an export.

Each value shows its `description` from the pack as help text and its source status (provisional or verified). Changing the current mode takes effect at once, triggers a fresh recommendation, and writes to the audit trail (RD-6). The user never sees penalties, costs or scores (see the plain-language rule in section 13). The time display is fixed: UTC with local time beside it (section 13, Q7).

### Weather entry (above Panel A)
Two text boxes, METAR and TAF, each with the raw text the user pasted and an Apply button (OD-28). The boxes start empty on every visit, with "No weather entered" beside them; reports are not stored (OD-30). A METAR older than its window is accepted with an amber stale flag. If only one report is entered, a banner names the missing one. On Apply the text is checked (station, size, decodable) and, if valid, replaces the previous report and triggers a fresh recommendation. An invalid paste is refused with a message naming what could not be read, and the previous report stays. The observation age is shown beside each box, taken from the report's own time group, so an old pasted report is visibly stale. Where the weather would be fetched automatically in a later phase, the same two boxes show the fetched text read-only.

## 6. The survival timeline in detail
### 6.1 Structure
| Element | Specification |
|---|---|
| Rows | One per enabled mode. Order: recommended first, then the current mode if different, then by operating-plan rank. Disabled modes are not rows. |
| Row height | 36 px (cell 32 px plus a 2 px margin each side). |
| Columns | One per 30-minute slot, 56 px pitch (cell 54 px wide). Slots are clock-aligned half-hours; there are no extra columns at TAF change times (OD-24). |
| Row header | 176 px, sticky at the left. Line 1: "Mode 12" plus tags REC and CURRENT. Line 2: runways in small text. |
| Column header | Three sticky-top strips: time (HH:MM, hour labels in bold), weather events (BECMG, TEMPO, wet risk, change marker, no TAF), traffic class chips (L, M, H HIGH). |
| Default span | The full TAF validity by default (OD-31), with options of 4 hours and 6 hours. The timeline shows the slots of the chosen window, as the mockup does. |
| Window selector | Pull-down in the B header: Full TAF (default), 4 h, 6 h (OD-31). It sets the forecast window (OD-26) and the slots the timeline shows, as in the mockup. |

Slots beyond TAF validity are drawn as UNKNOWN (grey) with the reason "No TAF coverage". The last column never pretends to know the weather.

### 6.2 Cell content and drawing
Each cell holds an icon, and below it a 9 px cause code only when status is not SUITABLE.
| Status | Colour | Pattern | Icon | Cause codes |
|---|---|---|---|---|
| SUITABLE | green | solid | tick | none |
| MARGINAL | amber | diagonal stripes | tilde | TW, XW, TEMPO, WET, PROB, WET?, VRB (variable wind above calm, OD-33) |
| UNSUITABLE | red | dense crosshatch | cross | TW, XW, CAP, PLAN (operating plan) |
| UNKNOWN | grey | dots | question mark | NO TAF, NO MET |
The colour comes straight from the engine's matrix. The UI has no logic that can turn a cell green; it renders the status field only (DB-3, DESIGN section 8).

A white triangle in the top-right corner marks a cell whose status depends on an uncertain input (TEMPO or PROB group, wet-possible runway state, demand estimate). This is the "uncertainty overlay". It can appear on any status.

### 6.3 Overlays (all drawn from the same plan object)
| Overlay | Drawing | Notes |
|---|---|---|
| Now marker | 2 px white vertical line across all rows at the exact minute, with label "NOW 22:12Z" at the top | Moves each minute; the page scrolls so it is at the left edge on load. |
| Recommended sequence | A 2 px accent-coloured outline (with 2 px gap) around the cells of the recommended mode in each time span, stepping between rows at changeovers | If no change is planned the outline stays on one row. |
| Recommended mode row | Accent bar at the left of the row label and tag REC | |
| Planned changeover | Dashed accent vertical line from the event strip to the bottom, labelled CHANGE in the event strip, hover text "10 to 12, 00:00Z, traffic MEDIUM, prepare from 23:45Z" | The preparation period is a short bracket on the event strip. |
| High-traffic bands | A translucent amber band behind all rows from the traffic strip down, with dashed amber side edges, and the traffic chip "H HIGH" in the strip | Drawn behind cells; cell colours stay unchanged so contrast is kept. |
| Wind shift | In the event strip, at the start time of a BECMG or FM group, a label with the new wind (for example "wind to 340") | BECMG is an ordinary change at its start time (OD-20), so nothing is drawn across a transition. |
| Tailwind exceedance | Cause code TW in the cell; the hover shows the figure. Cells over the limit are never green. | |
| Current mode | Row label tag CURRENT (outlined) and a 2 px white underline of the row label | Separate from the recommendation (UP-4). |
| Wet-risk | A pale blue band with dotted edges across all rows in the wet-risk slots, and the word "wet risk" in the event strip | It does not recolour cells; the status already reflects the runway state. |
| Uncertainty | White corner triangle (6.2); UNKNOWN cells are grey with dots | |

Overlay layering from back to front: wet band, busy band, cells, recommended outline, now and changeover lines, labels. The sticky row labels sit above everything except the now label.

### 6.4 Hover and click detail
Hover (desktop) and click or Enter (any device) open a panel of at most 360 px beside the cell. It stays open on click until Escape or a click elsewhere.
Contents, in order:
1. Title: Mode, UTC slot start to end, status word with icon.
2. Reason, one sentence, from the engine's cell reason ("Tailwind 16.0 kt on 16L exceeds the dry limit of 5.0 kt").
3. Table: for each runway the mode uses, tailwind and crosswind (kt, one decimal, gust-based).
4. Forecast wind used and which group supplied it (prevailing, FM, BECMG, TEMPO, INTER, PROB with percentage).
5. Runway assumption: DRY, WET, or "WET POSSIBLE: both evaluated".
6. Traffic class and, where known, demand against capacity.
7. Operating-plan eligibility (eligible, time band, provisional flag) and operating-plan rank.
8. Survival summary for that mode: continuous viable duration from now, first marginal slot, first unsuitable slot, replacement mode.
Row-label hover shows the mode description, restrictions, capacity value and its status.
Event-strip hover shows the TAF group in raw and decoded form.

### 6.5 Scrolling and sticky behaviour
- Horizontal scroll inside the panel only; the page never scrolls sideways.
- Row labels are sticky left; the three header strips are sticky top while the page scrolls vertically through the rows (rows are few, so this matters mainly on short screens).
- The scroll position stays when data refreshes. A "Jump to now" button appears if now has scrolled out of view.
- Keyboard and wheel: Shift + wheel or touchpad swipe scroll horizontally; the focused scroller responds to arrow keys when no cell has focus.
- The scroll bar is shown only when the slots do not fit, with a visible track.

### 6.6 Summary tiles and reason line
Four tiles above the grid (DB-6): Recommended, Survives (end time and count of marginal slots), Next constraint (first forecast event that changes any cell of the recommended mode or the current mode), Traffic at changeover. Below the legend, a one-line reason in the style of the owner's illustration: "Mode 12 is recommended because it is the only mode with no unsuitable slot until 07:30Z..." The reason is a template sentence filled from the engine, never hand-written text.

### 6.7 Legend
Always visible under the grid: each status with its icon, pattern and word, plus the overlay keys (recommended outline, change line, busy band, wet band, uncertainty corner).

## 7. States
| State | Panel A | Panel B | Elsewhere |
|---|---|---|---|
| **Loading** (first load) | Skeleton blocks and the text "Loading the airport pack and VATSIM feed", with two step ticks. No recommendation text. | Skeleton grid with row labels from refdata; no cell colours | Chips show "Loading". Weather boxes are empty with "No weather entered". |
| **Stale data** (a source older than its refdata limit) | Amber strip: "METAR is 62 min old. Advice may be out of date." The uncertainty line also counts the slots that depend on the stale source | Cells keep colours but get the uncertainty corner for slots that depend on the stale source; a "Stale" label in the event strip | The chip is amber with "Stale" and age. |
| **Failed feed** (the VATSIM fetch failed) | Red strip naming VATSIM and the time of the last good data. Fields that depend on traffic read "Unknown". | Capacity checks are skipped and slots get the uncertainty corner; missing demand never turns a cell grey, and slots keep their status | Chip red "Failed", time of the last good data, and a Retry button. The tool does not claim anything the missing data would support. |
| **No data at all** | "No data. Cannot recommend a mode." and a list of what is missing (for example, no weather entered) | Grid shows all grey cells, or an empty-state message if refdata is also missing | All panels show their own "No data" line. Refresh button emphasised. |
| **NO SUITABLE STANDARD MODE IDENTIFIED** | Replaces the mode block with this text in a red bordered block, then: the first failing constraint per mode in a compact list, and what change would restore a mode (for example "Mode 10 returns when the tailwind falls below 5.0 kt"). No least-bad mode is ever named (OD-13). | Rows all red or grey at the affected slots; a red bracket labelled NO MODE spans those slots in the event strip. | Nothing further: the blocking cause for each mode is listed in Panel A. |
| **EARLY MODE CHANGE RECOMMENDED** | Amber banner (section 7.1) | Planned changeover line, outline stepping between rows, preparation bracket | "Next change" in Panel A shows the replacement and its time. |
| **Data partial** (for example TAF missing) | Only affected fields read "Unknown"; weather suitability after the METAR window is UNKNOWN; a banner names the missing report (WX-9) | Slots after the METAR window are grey | TAF chip shows "Not entered". |
| **Recalculating** | Small spinner in the header; values do not blank | Cells keep their last colours until the new plan arrives, then swap together | Chip "Plan 22:30Z". |

### 7.1 Required wording
- **No suitable mode text:** exactly "NO SUITABLE STANDARD MODE IDENTIFIED", as in OP-11, uppercase, red text on dark red tint with a cross icon.
- **Early change banner:** exactly "EARLY MODE CHANGE RECOMMENDED", amber text with a warning-triangle icon, then three labelled parts: Trigger (what fails and when), Timing (the window and traffic then), Benefit (what is avoided, for example a forced change in HIGH traffic).

## 8. Design tokens (dark theme)
The palette follows the VATPAC tools look: dark navy surfaces and a blue accent. The exact site colours have not been inspected; the values below are chosen to match the described theme and are to be reconciled when the site's styles are available (open question Q1).

### 8.1 Colour
| Token | Hex | Use | Contrast against panel `#111d36` |
|---|---|---|---|
| `--bg` | `#0b1426` | Page background | n/a |
| `--panel` | `#111d36` | Panel surface | n/a |
| `--panel-2` | `#16254a` | Tiles, buttons | n/a |
| `--line` | `#223356` | Borders | n/a |
| `--text` | `#e6ecf7` | Body text | 14.1 : 1 |
| `--muted` | `#9db0cf` | Secondary text | 7.6 : 1 |
| `--accent` | `#3b82f6` | Accent fills, REC tag, outline | 4.6 : 1 |
| `--accent-text` | `#6aa6ff` | Accent text and the recommended outline | 6.8 : 1 |
| `--ok` | `#1b7f46` | SUITABLE cell | 3.3 : 1 (graphic); white icon on it 5.0 : 1 |
| `--warn` | `#c98a00` | MARGINAL cell | 5.7 : 1; dark icon `#0b1426` on it 6.2 : 1 |
| `--bad` | `#c0392b` | UNSUITABLE cell | 3.1 : 1 (graphic); white icon on it 5.4 : 1 |
| `--unk` | `#66728a` | UNKNOWN cell | 3.5 : 1 (graphic); white icon on it 4.8 : 1 |
| `--ok-text` | `#5fd68a` | Status text on dark | 9.2 : 1 |
| `--warn-text` | `#ffc94d` | Warning text | 11.0 : 1 |
| `--bad-text` | `#ff8a80` | Error text | 7.3 : 1 |
| `--busy` | `#e8a33a` | High-traffic band edge and fill (at 9 per cent) | decorative; meaning also in text |
| `--wet` | `#5bb8e8` | Wet-risk band (at 10 per cent) | decorative; meaning also in text |
Contrast ratios were computed with the WCAG relative-luminance formula for the pairs shown. Graphic cells meet 3 : 1 against the panel; icons and codes meet 4.5 : 1 against their cell. The cell edge, the pattern and the icon carry the meaning as well as the colour.

### 8.2 Type scale
System font stack (`system-ui, Segoe UI, Arial, sans-serif`); monospace for METAR and TAF (`Consolas, Menlo, monospace`). No web fonts, so the static build has no external dependency.
| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--t-mode` | 44 / 44 px | 700 | Recommended mode number |
| `--t-key` | 20 / 28 px | 650 | "Lasts", "Next change" values |
| `--t-title` | 18 / 24 px | 650 | App title |
| `--t-body` | 14 / 20 px | 400 | Body |
| `--t-label` | 12 / 16 px | 500 | Panel titles (uppercase, 0.08 em), table text, chips |
| `--t-cell` | 13 / 13 px | 700 | Cell icon |
| `--t-code` | 9 / 10 px | 600 | Cell cause code |
Minimum text size is 11 px, used only for time labels and secondary notes; the cause code at 9 px is always repeated in full in the hover and the accessible label.

### 8.3 Spacing and shape
| Token | Value |
|---|---|
| Space scale | 4, 8, 12, 16, 24, 32 px |
| Page gutter | 16 px |
| Panel padding | 14 px vertical, 16 px horizontal |
| Panel gap | 12 px |
| Radius: panel | 10 px |
| Radius: tile, button, banner | 6 px |
| Radius: cell | 4 px |
| Radius: chip | 4 px (tag pills 999 px) |
| Cell | 56 px column pitch, 54 px wide, 32 px high in a 36 px row |
| Focus ring | 2 px white, 1 px offset |

## 9. Accessibility
1. **Colour is never the only signal.** Each status has a distinct icon (tick, tilde, cross, question mark), a distinct pattern (solid, stripes, crosshatch, dots), and a text cause code for everything except SUITABLE. The legend names all four.
2. **Overlays have text too.** Busy bands carry "H HIGH" in the traffic strip; wet risk carries the words "wet risk"; the changeover carries "CHANGE"; the uncertainty corner is explained in the hover and listed in the legend.
3. **Contrast.** Body text at least 4.5 : 1 (actual 7.6 to 14.1). Cell icons at least 4.5 : 1 on their cell. Cell fills at least 3 : 1 against the panel (graphics). Banners: coloured text on a darkened tint at 7 : 1 or more.
4. **Keyboard use of the timeline.** The timeline is a grid with roving tabindex: one Tab stop enters it, the arrow keys move between cells (up and down between modes, left and right between slots), Home and End go to the first and last slot of the row, Page Up and Page Down jump 4 slots (2 hours), Enter or Space pins the detail panel, Escape closes it. Focus scrolls the cell into view and the detail opens on focus. A visible 2 px white focus ring is drawn above the recommended outline. N moves focus to the now column; C moves it to the planned changeover.
5. **Screen readers.** Each cell has an accessible name such as "Mode 12, 00:30Z, marginal, cause capacity". The grid has an accessible caption and the summary tiles and reason line are real text above it. A "Table view" toggle shows the same data as a plain table (mode by slot, with the status word), which also serves as a print and copy view.
6. **No motion dependence.** The now marker steps once a minute; there is no auto-scroll, no flashing and no animation needed to understand a state. Banners appear without animation. The page respects reduced-motion settings.
7. **Targets and zoom.** Interactive controls at least 32 px high. The layout works at 200 per cent browser zoom by falling back to the laptop layout.
8. **Language and time.** `lang="en-GB"`; all times carry the suffix Z or the stated zone.
9. **Colour-vision check.** The four statuses are checked under simulated protan and deutan vision during build; the pattern and icon must remain distinguishable without colour (acceptance test, section 11).

## 10. Design decisions
| # | Decision | Reason |
|---|---|---|
| UD-1 | The timeline sits directly under A and is the largest element; A is kept to the four first-read answers. | The owner's brief makes the timeline the main feature; the controller must read mode, duration, next change and why in two seconds. |
| UD-2 | Status is shown by colour, pattern, icon and a cause code. | The controller may be colour-blind, the screen may be dim or small, and a red cell must say why without a hover. |
| UD-3 | Overlays are drawn behind or around cells and never recolour them. | Cell colour must come only from the engine matrix, so a cell can never be green over a tailwind limit (anti-goal in DESIGN section 1). |
| UD-4 | Recommended and current modes are separate on screen (tags, outline, underline). | UP-4 requires them to stay distinct; the operator enters the current mode and the tool never does (OD-21). |
| UD-5 | Warnings are inline banners, not pop-ups or sounds. | A controller in a busy session must not lose focus to a dialog. |
| UD-6 | Settings open in a drawer beside the dashboard. | A settings change triggers a new recommendation (DB-9); the effect is seen at once without leaving the page. |
| UD-7 | The timeline shows the slots of the chosen window (full TAF by default, OD-31), as the mockup does. | Slots beyond TAF validity are grey, not guessed. |
| UD-8 | System fonts; React and Tailwind (TC-1); no web fonts or other UI libraries. | The build must be a static folder that works offline and on another site (OD-2, TC-4). |
| UD-9 | Times are UTC with a "Z" everywhere. The airport's local time is shown beside UTC on the weather and traffic chips and in the timeline header, and in the hover. | WX-5 and owner answer Q7; avoids mistakes at the daylight-saving change. |
| UD-10 | The notice is a permanent bar, not a one-off dialog. | The tool must never be mistaken for real-world guidance, including on screenshots shared by others. |

## 11. Verification
How the design can be checked once built (success criteria):
1. Five-second test: a person who has not seen the screen can name the recommended mode, when it stops being suitable, and the next change, from A alone.
2. Every status in a screenshot converted to greyscale stays distinguishable (pattern and icon).
3. Contrast values in section 8.1 reproduced with a contrast checker.
4. The timeline can be fully operated with the keyboard only; a screen reader reads the cell names.
5. Feed-failure, stale, no-data, no-suitable-mode and early-change states each have a fixture and a visual check.
6. A cell fixture with tailwind 5.1 kt (dry) is never drawn green.
7. At 1280, 1024 and 768 px wide nothing overflows the page horizontally; only the timeline scrolls sideways.

## 12. Open question for the owner
| # | Question | Default taken until answered |
|---|---|---|
| Q1 | Can you supply (or let us inspect) the vatpac.org tools stylesheet, so the tokens match exactly? | The invented navy and blue palette in section 8. |

## 13. Owner decisions (22-10-2026 and 23-10-2026)
The layout in section 3 follows the mockup (`ui/mockup.html`) rebuilt on 23-10-2026. The mockup is illustration only. The owner decided (23-10-2026) that the mockup is followed where it differs from the requirements, and the requirements are amended to match (OD-31 to OD-33). The table below records those points.

| Point | Mockup | Requirement or decision | Followed here |
|---|---|---|---|
| Window options | 4 hours, 6 hours, Full TAF (no 2 hours) | OD-31: 4 hours, 6 hours and the full TAF, default the full TAF | Followed (OD-31) |
| Timeline when a window is chosen | Timeline cut to the chosen window | DB-3 amended by OD-31: the chosen window is shown | Followed (section 6.1) |
| Panel C raw text | Table only, no raw or decoded text | OD-32: raw text at the top; Panel C shows components against limits only | Followed (section 5) |
| Panel D trend | No trend shown | OD-32: no trend | Followed (section 5) |

### Answers to the open questions (owner, 22-10-2026)
| # | Answer | Effect |
|---|---|---|
| Q1 | Not asked; vatpac.org publication is a later phase | Keep the invented palette for now. |
| Q2 | Show all modes | Keep the "hide never-suitable modes" toggle as an option only. |
| Q3 | Banner only | No sound, no desktop notification. |
| Q4 | Desktop and laptop only | The first build has no phone layout. |
| Q5 | No training mode | No training-mode switch and no fixture data in the UI. Tests keep their own fixtures. |
| Q6 | "There will always be a mode available; that is inherent in the mode design" | Never show a "least-bad" mode. The engine still keeps the message NO SUITABLE STANDARD MODE IDENTIFIED as a safety net, because REQUIREMENTS.md OP-11 and the required tests ask for it; it is expected never to appear. |
| Q7 | Show both always | Every time on weather and traffic chips shows UTC and the airport's local time together. |

**Plain-language rule (owner, 23-10-2026).** End users never see the words "penalty", "cost" or "points", and never see the optimiser's scores or weights. The screen says "rank" for the operating-plan order, and explains a recommendation in plain sentences (which mode, when to change, what traffic then). Penalties are an internal engine detail and live only in the pack files and the design documents. The settings drawer has no penalty section.

# Radical answer-first design: ledger (25-10-2026)

**Status, 26-10-2026.** This is the design note for the mockups of 25-10-2026, kept as a record. The shipped v2 screen (`v2.html`) is described in [../DESIGN.md](../DESIGN.md) section 8a, and where the two differ, that section is right. The main differences from the mockup are:
- The state word for the normal state is RECOMMENDED, not HOLD.
- There is no "I am on" selector and no current mode in v2.
- There is no slim forecast bar. The Evaluation and TAF section is one closed row that opens to the full timeline.
- The runway tile reads "Runway condition".
- The picture is larger and drawn to scale from the pack's runway end coordinates, turned into the weather's magnetic reference. The wind label sits beside the arrow. It has no "N up" note and no cross marks, and labels only the ends the recommended mode uses.
- The legend has five entries (Suitable, Unsuitable, Recommended path, Amber band, White corner).
- Traffic is one row (the class per slot) in the expanded timeline. The per-slot arrivals, departures and movements are not shown.
- Marginal cells are plain green with the cause word (OD-81), as in v1.
- The window selector is not drawn.

Mockup: radical-ux.html (HTML and CSS only; the drawer opens with `#more`, `#forecast` etc. via :target, so links work by keyboard, touch and click without scripts). Screenshots: radical-desktop-closed.jpg, radical-desktop-drawer.jpg, radical-mobile-closed.jpg, radical-mobile-drawer.jpg (same folder).

## Measured height
| | Old page | New page |
|---|---|---|
| Desktop 1280 wide | about 1,400 px (before-desktop-1280-full.jpg is 800x875, scaled 1.6x) | 534 px content; fits 1280x720 with no scroll (62 percent less) |
| Phone 375 wide | at least 1,800 px (before-mobile-375.jpg is 750x3600 at 2x) | 706 px; fits 375x812 with no scroll (at least 61 percent less); no sideways scroll |

## Where each element lives now
"Main" = visible on the one screen. "Drawer" = behind the More button (or a tap on the forecast bar or traffic tile). Every drawer item is an anchor link, so keyboard Tab/Enter and touch both reach it. Popovers open on hover and on keyboard focus (tabindex=0); on touch the focusable element opens on tap.

### Header, chips, notices
| Old element | Now | Info lost |
|---|---|---|
| Title "Runway Mode Planner" | Small muted text in the top bar (hidden on phone; page title keeps it) | None |
| Tag "Live traffic; weather automatic" etc. | The four trust chips (shape plus age); popover text "Fetched automatically every 5 minutes. Not stored." ; failure and "pasted" states are chip shapes: circle ok, triangle stale, cross failed, open circle none | None (failed and pasted states are specified as chip shapes, not drawn in the sample) |
| Airport pull-down | Top bar, label is the select's accessible name | None |
| "Recalculating" | Spinner glyph on the plan chip with the same accessible name (not drawn, no sample state) | None |
| "Times UTC" | "UTC 17:49Z" in the top bar, every time carries Z | None |
| Settings button | Drawer, Settings section (nav chip) | None |
| METAR chip (time, age, Stale, Not entered) | Chip "METAR 14m"; popover gives time and age; shape carries stale/none | None |
| TAF chip (issue, valid to, age) | Chip "TAF 30m"; popover gives issue and valid-to | None |
| VATSIM chip | Chip "VATSIM 0s"; popover gives time; cross shape for Failed, with last good time in popover | None |
| Plan chip "Recalculated at, next" | Chip "17:49 -> 18:00" | None |
| Stale / failed / missing-report strips | Chip shape plus the state label on the main screen, full sentence in the chip popover and the Why section | None, but the strip as a separate full-width line is gone |
| Store notices (Dismiss) | Unchanged, a dismissible toast above the answer when present | None |
| Fixed flight-simulation notice | Bottom line, same exact wording, 11 px bold | None |

### Answer area (old Panel A)
| Old element | Now | Info lost |
|---|---|---|
| "Recommended" heading | None: the huge mode id is the answer (aria-label says Recommended mode) | None |
| Mode id | 84 px (62 px phone) | None |
| Arr/Dep runway text | Small text under the mode and highlighted runways on the picture | None |
| Current-mode select and label | "I am on" select under the answer; status "set 11:05Z" and amber clock when stale and "Still current" button appear beside it (not drawn, no sample state) | None |
| Next change | Line under the mode: "No change planned" or "-> 34A25D 14:00Z"; the state label changes colour | None |
| METAR row | Monospace one-liner tile, station code dropped | None |
| Traffic row | LOW tile with 3-bar glyph; "HIGH by 14:00Z" is a second line when applicable; tile popover and tap carry the rest | None |
| Runway state row | DRY tile with a drop glyph and a mini bar (white = dry, blue = wet) plus "wet 18:30 to 23:30Z" | None |
| Ceiling row | Cloud glyph tile "4,800 ft" | None |
| Red banner "CURRENT MODE UNSUITABLE" | State label turns red "CHANGE NOW" with the sentence under the mode; full text in Why | None |
| Amber banner "EARLY MODE CHANGE RECOMMENDED" | State label turns amber "CHANGE SOON", trigger/timing/benefit in Why; short form under the mode | None |
| Green "conditions met" note | Small green note under Next change | None |
| No-suitable block | State label red "NO SUITABLE STANDARD MODE" replaces the mode; per-mode causes in Why | None |
| No-data block | Grey state label "NO DATA", missing list in Why | None |
| "More about the recommendation" | Drawer, Why section | None |
| Panel F caption and key sentence | SVG title (accessible name) names runways, wind, mode and tailwind ends; "N up" and the tailwind cross are in the picture; key line in the drawer Key | None |

### Runway diagram (old Panel F)
Now the centre of the main screen and the proof. Active runways are blue, others grey, ends with a tailwind carry a cross, the wind is an arrow with "190 deg 23 kt". No heading.

### Timeline (old Panel B)
| Old element | Now | Info lost |
|---|---|---|
| Heading, range, Window select, hidden-modes button | Drawer, Forecast section top | None |
| Tiles: Recommended, Next change | Main answer area (duplicate removed) | None |
| Tile: Next wet runway | Drop tile with mini bar in the answer area; "Now" / "Not in forecast" are its text states; wet band on the slim bar | None |
| Time strip | Hour axis on the slim bar; full 30-minute header in the drawer grid | None |
| Event strip: wind bars, TEMPO/INTER/PROB bars, wet, TS, low vis, no TAF, NO MODE | Slim bar: wind row, risk row (glyph words); drawer grid: wind, groups (full group text on focus), wet rows | None |
| Traffic strip | Slim bar traffic micro-bars; drawer grid Class row | None |
| Row headers (REC, CURRENT, runways) | Drawer grid, same tags; main bar labels the recommended path with the mode id | None |
| Cells (icon, cause code, uncertain corner) | Slim bar: run-length segments for the recommended path; drawer: every mode and slot, with glyph and cause word | None |
| Overlays (NOW line, outline, change line, busy band, uncertain corner) | NOW line and glyphs on the slim bar; outline and dashed line in the drawer grid | None |
| Legend | Drawer, Key section | None |
| Cell detail | Drawer cells are focusable; tap or focus shows the same detail text | None |
| Jump to now | Not needed on the slim bar (always starts at now); remains in the drawer grid | None |

### Weather entry
| Old element | Now | Info lost |
|---|---|---|
| Intro, fetch cadence, "not stored" | Chip popovers and drawer Reports note | None |
| Raw METAR and raw TAF | Drawer, Reports | None |
| Use my own weather, paste boxes, Apply, Resume automatic, source and error notes, credit | Drawer, Reports (disclosure) | None |

### Traffic (old Panel D), folded into the forecast, no standalone block (owner steer)
| Old element | Now | Info lost |
|---|---|---|
| Arrivals, Departures, Movements, Class per slot | Rows Class, Arr, Dep, Moves in the drawer forecast grid, directly under the wind and wet rows and above the modes; the class also shows as micro-bars on the slim bar on the main screen; tapping the bar or the LOW tile opens it | None |
| "(prefiled)", "(arrivals only)", "not est." | Markers * (prefiled), dagger (arrivals only), dash (not estimated) with the key printed under the rows | None |
| Connected now line | Popover on the LOW tile ("5 inbound, 2 of them on the ground elsewhere, 1 on the ground here") and the same sentence under the rows in the grid; tile subtext "5 in, 1 out" | None |
| "Demand unknown from 21:30Z" | Hatched traffic segments on the slim bar plus "? unknown from 21:30Z" in the grid and "demand unknown ..." beside the Arr row | None |
| Elevation warning | Amber triangle on the traffic tile with the sentence in its popover (not drawn, no sample state) | None |
| "No traffic data" | Traffic tile shows a cross shape and "no data", reason in popover | None |

### Settings drawer
Unchanged content, now one section of the drawer (Limits, Operating plan priorities, Time zone, Airport and data with Reload, Audit trail with Export and Clear). The stale sentence about typing a code in the Airport box is replaced ("Choose the airport at the top of the screen").

## Earlier owner decisions overturned or changed
| Decision | What changes |
|---|---|
| OD-38 | Reports leave the main page; they sit in the drawer. Failure and stale remain on the main screen as chip shapes. |
| OD-39 | Hidden unsuitable modes remain behind a button, now inside the drawer. |
| OD-41 | The notice is still at the bottom with the same wording but is now part of the one-screen layout (compact). Footnote and "Connected aircraft..." removals are kept in spirit; traffic notes now live in popovers. |
| OD-47, OD-60 | No panel headings at all; "Recommended" heading is dropped (OD-47 already dropped "MODE"). |
| OD-49, OD-50, OD-59 | The three tiles above the grid are removed; their content is the answer area and the slim bar. Panel B is no longer a named heading on the main page. |
| OD-51, OD-53 | Wind/event strip is reduced to a slim bar with rows (wind, risk); the full strip is only in the drawer. |
| OD-52 | The thick outline of the recommended path is kept only in the drawer grid; the slim bar uses a coloured path segment. |
| OD-56 | "More about the recommendation" is a drawer section, not an expander in Panel A. |
| OD-65, OD-69, OD-73 | METAR text stays as a tile; no status chip. |
| OD-72 | A removed banner returns, as the state label colour (HOLD / CHANGE SOON / CHANGE NOW). This reverses the banner removal. |
| OD-81 | Marginal is drawn amber with a triangle and the cause word, not plain green. The old rule hid a caution inside green; colour plus shape plus word now separate suitable from marginal. |
| OD-70 | Row order not changed; mockup lists the three visible modes in the plan order. |
| UI_DESIGN section 3 | The screen order (header, chips, A, B, weather, D and F) is replaced entirely. D is no longer a panel (owner steer); F is no longer a lower panel. |
| UI_DESIGN section 6.1 | Timeline row labels and lanes are kept only in the drawer. |
| Section 9.4 | The grid keeps arrow-key navigation in the real build; the mockup cells use Tab focus only. |

Not overturned: OD-36 (UTC only), OD-35 (whole knots), OD-43 wind-change threshold, OD-44, OD-45, OD-46 (no "provisional" word on screen), SEC-1 notice wording, SEC-2 text-only rendering.

## Accessibility notes
- Colour is never alone: state label has a glyph and a word; marginal is a triangle plus word; chips have a shape; the runway cross marks tailwind.
- Every glyph has an accessible name (aria-label or SVG title). No emoji.
- Hover text is also on focus (chips, tiles, grid cells); drawer is reachable with Tab and Enter on More or the forecast bar; Close returns to the top.
- Gaps to fix in the build: Escape-to-close and focus return need a few lines of script (the mockup is script-free); the wind label on the slim bar clips at 375 px (shorten to "190/23" and "24G34"); marginal cell hover tips in the mockup exist only on sample cells.

## Biggest risk
Density: the slim bar, tiles and chips are small (11 to 13 px labels), and nearly all explanation sits in popovers. On touch, a popover needs a tap target of 32 px or more and a clear dismiss. If the owner reviews on a real phone, the 11 px text and the small runway labels are the first thing to check.

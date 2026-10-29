# Zurich (LSZH) runway pack: research notes

29-10-2026. Compiled as the basis for the new LSZH pack (`refdata/airports/LSZH`). General web research only — the Swiss AIP itself (Skyguide/FOCA, LSZH AD 2.18/AD 2.21, charts 10-P/10-P1) was not opened directly, so every figure below is a pointer to check against that primary source, not a confirmed value. Follows the same real-world-only, confidence-labelled approach used in `WSSS_RUNWAY_MODES_RESEARCH.md`.

## 1. Basic facts

- ICAO LSZH, IATA ZRH, Zurich (Kloten). Time zone Europe/Zurich.
- Elevation ~1,417 ft (432 m). Reference point ~47.46472°N, 8.54917°E. Sources agree closely (Wikipedia, ch-aviation, SkyVector) but none is the AIP itself.
- **METAR wind direction is true north, not magnetic** — confirmed directly from MeteoSwiss's own flight-weather documentation ("ddd = Windrichtung in Grad (geographisch)"). This matters because the pack's runway headings must be in the same reference frame as the wind reports (see `docs/NEW_AIRPORT_QUESTIONS.md` §2). **The pack therefore uses true headings, not the magnetic headings runway names are derived from.**

## 2. Runways (three parallel/crossing pairs)

| Runway | True heading | Threshold (approx, decimal degrees) |
|---|---|---|
| 10 | 096 | 47.4589, 8.5375 |
| 28 | 276 | 47.4566, 8.5704 |
| 14 | 137 | 47.4831, 8.5347 |
| 32 | 317 | 47.4613, 8.5645 |
| 16 | 155 | 47.4756, 8.5359 |
| 34 | 335 | 47.4454, 8.5567 |

Source: Sprinkle.com (true headings/decimal coordinates) cross-checked against SkyVector's magnetic headings (152°/332°, 134°/314°, 093°/273°) — the ~2–3° gap between the two sets matches Switzerland's magnetic declination, which is the expected pattern if one source is true and the other magnetic, and supports using the Sprinkle true-heading set. **Not checked against the Swiss AIP** — flag for confirmation.

## 3. Runway-use configurations (revised 29-10-2026 after checking against a live ATIS)

**First pass (retracted as the primary source — kept below for the record).** The first version of this pack was built from Zurich Airport's own "Operating Concepts" page (flughafen-zuerich.ch), which names three broad concepts (North/East/South) and pairs them with wide, vague runway sets (e.g. North: arrivals 14+16, departures 28+16). A live LSZH arrival ATIS read 2026-10-29 16:23 UTC ("1420Z ARRIVALS... RWY 14... DEP RWY 28") did not match any mode built from that page — the page turned out to describe noise-policy *themes*, not the actual runway pairs ATC assigns.

**Second pass — VATSIM Switzerland's vACC "Preferential Runway System" (vacc.ch, LSZH chart page).** This gives exact single-runway-in/single-runway-out pairs, explicit UTC windows (with separate summer/winter times) and a tailwind-component threshold, and it matches the live ATIS sample exactly. This is now the pack's primary source for runway pairs and hours, even though it is a VATSIM controller SOP, not the Swiss AIP itself, and the page itself says compliance is "the decision of the TOWER ATC."

| vACC name | Mode id in this pack | vACC published window (UTC, winter/summer) | Converted to local time | Arrivals | Departures |
|---|---|---|---|---|---|
| General | `14A28D` | (default/daytime) | 07:00–21:00 weekday, 09:00–20:00 weekend | 14 | 28 |
| Morning | `34A32D` | until 0600Z / 0500Z weekday; until 0800Z / 0700Z weekend | 00:00(ish)–07:00 weekday, –09:00 weekend | 34 | 32 |
| Evening | `28A32D` | after 2000Z / 1900Z weekday; after 1900Z / 1800Z weekend | 21:00–24:00 weekday, 20:00–24:00 weekend | 28 | 32 |

Mode ids use the project's usual runway-coded form (as YSSY and NFFN do), not the airport's own concept names. An earlier draft of this pack used names taken from the vACC page's own wording (`GENERAL`, `MORNING`, `EVENING`) and the Zurich Airport "Operating Concepts" page (`NORTH`/`EAST`/`SOUTH`) in two successive revisions; `GENERAL` on its own was then found to collide with an unrelated use of the word "general" in `src/traffic/parseFeed.ts` (a VATSIM feed field name, nothing to do with airports), which the project's airport-literal check (`scripts/check-no-airport-literals.mjs`) correctly caught in CI. Runway-coded ids avoid this class of problem entirely, which is why the project uses them as the default.

The UTC-with-summer-offset figures convert to the **same local clock time** in both seasons (e.g. 0600Z winter and 0500Z summer are both 07:00 CET/CEST) — a useful cross-check that the conversion is right, and convenient since the pack's bands are in local time anyway.

**Tailwind threshold (General/`14A28D` only):** "Runways will be used up to 10 kts (RWY 14) and 7 kts (RWY 28) tailwind-component" — a genuine per-runway figure, but the pack schema only has one pack-wide tailwind limit (`settings.json`), not a per-runway override. The pack uses 7 kt (the stricter figure) pack-wide, which likely understates RWY14's real 10 kt margin — flagged as a known simplification, not a data gap to silently ignore.

**North-easterly wind variants (`14A10D`, `34A10D`).** Zurich Airport's own page separately states that north-easterly wind moves departures to runway 10 (arrivals staying on 14 by day, or switching to 34 in the evening). This was **not** in the vACC page and **not** seen in the one live ATIS sample (which was itself a light 050°/9 kt wind, i.e. north-easterly-ish but evidently below whatever threshold triggers the switch — General/`14A28D` was still in use). No wind-speed threshold was found for these two variants from any source, so they carry a higher band penalty and are flagged low-confidence.

**Not modelled / flagged:**
- No crosswind threshold was found for any mode from either source; `maxCrosswindKt` falls back to the pack default (20 kt), unconfirmed.
- Weekend/holiday hours differ (09:00/20:00 instead of 07:00/21:00) but the engine does not support day-of-week rules yet (TB-4, see section 4) — weekday hours are used as the only band set.

## 4. Day-of-week limitation (important — this is a known engine gap)

`docs/TIME_BASED_RULES.md` (TB-4) explicitly states day-of-week rules are **not supported** by the engine today — `operating_plan.json` bands apply every day, with no weekday/weekend split. Zurich's concepts genuinely differ by weekday vs weekend/holiday (see table above).

**Decision taken for this pack:** use the weekday hours as the single set of bands (the engine's only option today), and flag the weekend/holiday variation here as an unmodelled simplification — not a data error. Do not "fix" this by editing the engine; that is exactly the TB-4 gap already tracked.

## 5. Night curfew (not modelled as a special rule — matches project convention)

- Slot-coordination data (slotcoordination.ch, the official Swiss slot coordinator): arrivals curfew 2300–0609 CET, departures 2246–0544 CET, no exceptions for slot allocation purposes (exempt/emergency flights aside).
- Other sources (an airport-operator announcement reported by Swissinfo, a 2019 Flughafen Zürich annual report) give slightly different 2300–0600 / 2330–0600 framing and mention special authorisations (~270–310/year).
- Per the project's own precedent (YSSY's curfew mode was removed by owner decision — "every remaining mode is usable at any time"), **this pack does not build a dedicated curfew band.** The overnight hours (within the MORNING band, 00:00–07:00) are covered by the MORNING mode rather than a special curfew mode — the vACC source's own "Morning" window already spans that period, so no extra invention was needed here, unlike the first-pass version of this pack. This is a simplification, flagged here, not a claim that Zurich is curfew-free.

## 6. Declared capacity (for `trafficBands`)

Source: slotcoordination.ch (Swiss Slot Coordination, the official coordinator) — declared capacity 40 movements per 30 minutes, 66 per hour (36 arrivals / 41 departures), reduced by 3+3 before ad-hoc slot allocation. This is the one number the question doc says needs real research rather than copying from another pack; used to set `trafficBands` (see settings.json) scaled to the per-30-minute cap.

## 7. ATIS wording — not found, placeholder only, and probably the wrong shape entirely

No Skyguide-published ATIS phrasing template was found. A real LSZH arrival ATIS sample (2026-10-29 16:23 UTC) reads:

> 1420Z ARRIVALS, EXP ILS APCH, RWY 14. TRL 70. DEP RWY 28. WIND 050 DEG, 9 KT. VIS 10 KM OR MORE, TDZ 10 KM OR MORE. CLD FEW 2400 FT, BKN 3000 FT. T 11. DP 6. QNH 1027. WS, WIND AT 3400 FT QNH 070 DEG 21 KT, WIND AT 3800 FT QNH 080 DEG 3 KT. NOSIG

This is free-running prose, not the `RWY <n> FOR ARR AND DEP` template the pack's `atisWording` field assumes (that template is this project's own generic default, shared by every other pack, not researched per airport). The pack keeps the generic words for schema compatibility, but they do not meaningfully describe LSZH's real ATIS style — flagged here rather than left to look confirmed.

## 8. Confidence summary (revised 29-10-2026)

- **Reasonably solid:** runway geometry/headings, the true-vs-magnetic wind finding, the 14A28D/34A32D/28A32D runway pairs and their local-time windows (now cross-checked against a real ATIS sample, not just two secondary sources agreeing with each other), declared capacity, the RWY14/RWY28 tailwind-component figures.
- **Weak:** the north-easterly wind variants (`14A10D`, `34A10D`) — sourced only from the airport's own vague marketing page, not corroborated by the vACC SOP or the one live ATIS sample, no threshold found; weekend/holiday hours (not modelled, per TB-4); crosswind limits (no source found at all, pack default used).
- **Not found:** a genuine Skyguide/AIP-published runway-selection document (the vACC page, while accurate enough to match the live ATIS, is explicitly a VATSIM controller aid with compliance "at the tower controller's discretion," not an AIP extract); ATIS phrasing template; per-runway crosswind limits.
- **One confirmed false lead:** the first version of this pack, built from Zurich Airport's own "Operating Concepts" page alone, did not match the live ATIS sample at all — a reminder that an airport's public-facing noise/policy page can describe themes rather than the actual runway pairs ATC assigns, and should be cross-checked against real traffic data before being treated as the primary source for a pack.

## Sources

- [Zurich Airport — Operating Concepts](https://www.flughafen-zuerich.ch/en/company/responsibility/noise-and-sound-insulation/flight-operations/operating-concepts) (background / superseded as primary source for runway pairs, see §3)
- [Zurich Airport — Flight Operation](https://www.flughafen-zuerich.ch/en/company/responsibility/noise-and-sound-insulation/flight-operations) (source for the north-easterly wind variants only)
- [VATSIM Switzerland vACC — Airports and Charts](https://www.vacc.ch/en/airports_and_charts/) and the LSZH chart page (vacc.ch/de/flughäfen_und_charts/LSZH) — primary source for 14A28D/34A32D/28A32D runway pairs, hours and the tailwind threshold
- A live LSZH arrival ATIS, read 2026-10-29 16:23 UTC (owner-supplied, quoted in full in §7) — used to cross-check the vACC data and to retract the first-pass "Operating Concepts" modes
- [MeteoSwiss — Flugwetterinfo (METAR wind = geographic/true)](https://www.meteoschweiz.admin.ch/dam/jcr:b72541fe-015d-4da5-bb4f-3f0dae842034/MCH_Flugwetterinfo_D_Web-2023.pdf)
- SkyVector LSZH airport page (magnetic headings) and Sprinkle.com LSZH page (true headings/decimal coordinates)
- [Swiss Slot Coordination — Zurich airport capacities](https://www.slotcoordination.ch/airport-information/zurich-zrhlszh/airport-capacities-zurich.html/106)
- [Swiss Slot Coordination — Zurich restrictions](https://www.slotcoordination.ch/restrictions_zrh)
- [Swissinfo — night-flight ban reporting](https://www.swissinfo.ch/eng/banking-fintech/zurich-airport-to-extend-ban-on-night-flights/2085108)
- `docs/TIME_BASED_RULES.md` (TB-4 day-of-week gap, curfew-modelling precedent)

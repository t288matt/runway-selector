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

## 3. Runway-use concepts (the closest real-world analogue to YSSY's mode system)

Source: Zurich Airport's own page, "Operating Concepts" (flughafen-zuerich.ch — the airport operator itself, not a forum). This is the strongest, most current, most official source found for any candidate airport researched (EHAM, EDDF and EIDW were all weaker — see the conversation record for that comparison).

| Concept | Published hours (weekday / weekend+Baden-Württemberg holiday) | Arrivals | Departures |
|---|---|---|---|
| North (standard) | 07:00–21:00 / 09:00–20:00 | 14, 16 | 28, 16 |
| North (north-easterly wind) | same window | 14 | 10 |
| East | 21:00–23:30 / 20:00–23:30 | 28 | 32, 34 |
| South (standard) | 06:00–07:00 / 06:00–09:00 | 34 | 32, 34 (occasionally 28 — not modelled, see below) |
| South/evening (north-easterly wind) | evening, in place of East | 34 | 10 |

The airport's own text also states a general wind override: "strong westerly winds" → takeoff 32 / land 28 (i.e. the East-concept runway pair), independent of the clock. This is **not modelled as a separate always-on mode** — it is consistent with the East concept's own runways, so the East-concept mode, already present, covers it; whether it should also be *allowed outside* the East concept's published hours is an open question, not confirmed either way.

**Not modelled / flagged:**
- The occasional 28 departure during the South concept — vague ("occasionally"), no published threshold found, left out rather than guessed.
- Exact wind-speed thresholds that trigger the north-easterly variants — the airport's own page only says "strong" / qualitative; a VATSIM-Switzerland community summary gives specific numbers (10 kt tailwind component for 14, 7 kt for 28) but that is an unofficial, simplified-for-simming source, not Skyguide/AIP, so it is **not** used to set `maxCrosswindKt` overrides in the pack. The pack falls back to the default crosswind/tailwind limits carried over from the Australian packs, same as NFFN's approach, pending AIP confirmation.

## 4. Day-of-week limitation (important — this is a known engine gap)

`docs/TIME_BASED_RULES.md` (TB-4) explicitly states day-of-week rules are **not supported** by the engine today — `operating_plan.json` bands apply every day, with no weekday/weekend split. Zurich's concepts genuinely differ by weekday vs weekend/holiday (see table above).

**Decision taken for this pack:** use the weekday hours as the single set of bands (the engine's only option today), and flag the weekend/holiday variation here as an unmodelled simplification — not a data error. Do not "fix" this by editing the engine; that is exactly the TB-4 gap already tracked.

## 5. Night curfew (not modelled as a special rule — matches project convention)

- Slot-coordination data (slotcoordination.ch, the official Swiss slot coordinator): arrivals curfew 2300–0609 CET, departures 2246–0544 CET, no exceptions for slot allocation purposes (exempt/emergency flights aside).
- Other sources (an airport-operator announcement reported by Swissinfo, a 2019 Flughafen Zürich annual report) give slightly different 2300–0600 / 2330–0600 framing and mention special authorisations (~270–310/year).
- Per the project's own precedent (YSSY's curfew mode was removed by owner decision — "every remaining mode is usable at any time"), **this pack does not build a dedicated curfew band.** The overnight hours are covered by the East-concept mode (lowest-impact pairing per the airport's own wind-override text), left allowed at all times outside the other three windows, with its usual priority. This is a simplification, flagged here, not a claim that Zurich is curfew-free.

## 6. Declared capacity (for `trafficBands`)

Source: slotcoordination.ch (Swiss Slot Coordination, the official coordinator) — declared capacity 40 movements per 30 minutes, 66 per hour (36 arrivals / 41 departures), reduced by 3+3 before ad-hoc slot allocation. This is the one number the question doc says needs real research rather than copying from another pack; used to set `trafficBands` (see settings.json) scaled to the per-30-minute cap.

## 7. ATIS wording — not found, placeholder only

No LSZH ATIS transcript or Skyguide-published phrasing was found. The pack uses the same generic wording (`RWY`/`FOR`/`ARR`/`DEPS`/`AND`) as every other pack in this project — this is the project's shared default, not evidence of Zurich's actual phrasing, and should be corrected if a real transcript turns up (e.g. LiveATC).

## 8. Confidence summary

- **Reasonably solid:** runway geometry/headings (two independent sources agree once reference frame is accounted for), the true-vs-magnetic wind finding, the three named concepts and their runway pairs, declared capacity.
- **Weak:** exact concept clock times (community sources disagree with each other and with the airport's own page by a few minutes/hours in places), the wind thresholds that trigger the north-easterly variants, the occasional 28 use in the South concept, exact curfew times.
- **Not found:** ATIS wording, any AIP-stated per-runway crosswind/tailwind limit, confirmation of the "wind override extends East concept outside its hours" question.

## Sources

- [Zurich Airport — Operating Concepts](https://www.flughafen-zuerich.ch/en/company/responsibility/noise-and-sound-insulation/flight-operations/operating-concepts)
- [Zurich Airport — Flight Operation](https://www.flughafen-zuerich.ch/en/company/responsibility/noise-and-sound-insulation/flight-operations)
- [MeteoSwiss — Flugwetterinfo (METAR wind = geographic/true)](https://www.meteoschweiz.admin.ch/dam/jcr:b72541fe-015d-4da5-bb4f-3f0dae842034/MCH_Flugwetterinfo_D_Web-2023.pdf)
- SkyVector LSZH airport page (magnetic headings) and Sprinkle.com LSZH page (true headings/decimal coordinates)
- [Swiss Slot Coordination — Zurich airport capacities](https://www.slotcoordination.ch/airport-information/zurich-zrhlszh/airport-capacities-zurich.html/106)
- [Swiss Slot Coordination — Zurich restrictions](https://www.slotcoordination.ch/restrictions_zrh)
- [Swissinfo — night-flight ban reporting](https://www.swissinfo.ch/eng/banking-fintech/zurich-airport-to-extend-ban-on-night-flights/2085108)
- `docs/TIME_BASED_RULES.md` (TB-4 day-of-week gap, curfew-modelling precedent)

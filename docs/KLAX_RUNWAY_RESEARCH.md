# Los Angeles International (KLAX) runway pack: research notes

31-10-2026. Compiled as the basis for the new KLAX pack (`refdata/airports/KLAX`). Follows the same real-world-only, confidence-labelled approach used in `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md`. Airport code uses the 4-letter ICAO form (KLAX), matching every other pack in `refdata/airports/` (YSSY, EGCC, LSZH, etc.), not the 3-letter FAA/IATA form (LAX).

## 1. Operating-plan source (already validated earlier this session)

Primary source for runway-use rules: VATSIM Los Angeles ARTCC (ZLA), "Los Angeles Tower Standard Operating Procedures," version 5.95, dated 19-03-2026 (the latest revision per the document's own changelog) -- https://laartcc.org/document/los-angeles-tower-lax. The full 22-page document was read directly this session, not just excerpted, and section 1-3 ("Runway Use Program") was checked end-to-end for a crosswind figure (zero hits for "crosswind") before concluding none exists. Like the LSZH and EGCC vMATS/vACC sources, this is a VATSIM controller SOP, not the FAA's own 7110.65 order or the Chart Supplement -- treated as a strong secondary source for operational structure, not a substitute for the AIP.

Section 1-3, verbatim, gives three configurations:

- **West Traffic (preferred/default):** arrive 24R/25L, depart 24L/25R. "Runway 25L may be used for aircraft parked south of runway 25L."
- **East Traffic:** arrive 06L/07R, depart 06R/07L. "Runway 07R may be used for aircraft parked south of runway 07R." Trigger: "Use when the tailwind component on a West Traffic configuration exceeds 10 knots."
- **Over-Ocean Traffic:** arrive 06R, depart 25R. "Noise abatement configuration between 0000L and 0630L" -- a scheduled overnight default with no wind criterion.
- A separate, un-named load-balancing note: "During periods of heavy arrival traffic, controllers should consider sending aircraft south of Runway 07R/25L to Runway 07L/25R instead." This is a soft, traffic-triggered suggestion about *which runway within a pair* takes the load, not a distinct runway pairing, and carries no wind or time criterion. **Decision taken:** document it here rather than build a fourth mode -- it doesn't fit the pack's arrivals/departures mode model (same physical runways, same role split, nothing for a mode id to distinguish), and inventing a mode for it would overstate how precisely it is specified.

## 2. Runways

| Runway | True heading | Magnetic heading | Threshold (approx, decimal degrees) |
|---|---|---|---|
| 06L | 083 | 071 | 33.9491, -118.4312 |
| 24R | 263 | 251 | 33.9521, -118.4019 |
| 06R | 083 | 071 | 33.9468, -118.4347 |
| 24L | 263 | 251 | 33.9505, -118.3990 |
| 07L | 083 | 071 | 33.9356, -118.4221 |
| 25R | 263 | 251 | 33.9399, -118.3798 |
| 07R | 083 | 071 | 33.9336, -118.4190 |
| 25L | 263 | 251 | 33.9374, -118.3827 |

Source: AirNav (FAA data, effective 30-10-2025) and SkyVector, cross-checked 31-10-2026. The public-data estimate in the task brief (~063/243 for the 06/24 pair, ~070/250 for the 07/25 pair) was **not confirmed** -- both independent sources instead agree the true headings are 083/263 (magnetic 071/251, matching a stated 12 degrees East variation) for **all four runway pairs**, with no distinguishable heading difference between the "06" complex and the "07" complex. This is a genuinely surprising, twice-corroborated finding rather than a single-source artefact: AirNav's magnetic/true pair and SkyVector's true-only figures agree with each other across all four pairs. A plausible (but unconfirmed) explanation is that LAX's runway designators are historical and were not renumbered when magnetic variation drifted past a rounding boundary for one complex but not updated for the other -- not verified against the FAA Chart Supplement, flagged rather than asserted. **Not checked against the FAA Chart Supplement/AIP itself.**

Thresholds are AirNav's decimal-minute coordinates converted to decimal degrees, cross-checked against SkyVector (closely matching, sub-arcsecond differences only).

## 3. True vs. magnetic heading frame -- correcting the brief's working assumption

The task brief's own working assumption was that "US METARs conventionally report wind direction relative to MAGNETIC north." **This session's research found the opposite is the documented convention**, and the brief's own instruction to verify rather than assume was warranted:

- Multiple sources paraphrasing the FAA's AIM and NWS/ASOS documentation agree: the **coded METAR/TAF wind group uses TRUE north** (ASOS computes a true 2-minute average, and that true value, not a magnetic-converted one, is what gets coded into the METAR). The common aviation mnemonic quoted across several of these sources is **"if you read it, it's true; if you hear it, it's magnetic."**
- **Spoken** wind -- ATIS, AWOS/ASOS voice broadcast, tower radio calls -- uses **magnetic** north (AIM, as paraphrased by several sources, with the exact paragraph number disputed between citations -- not independently confirmed against the current AIM text itself).
- At a site with non-zero magnetic variation (LAX: ~12 degrees East), the coded METAR and the spoken/broadcast wind for the same observation will therefore differ by roughly that amount.

**Consequence for this pack:** since this project's engine parses METAR data (see `metarValidityMinutes`/`metarStaleMinutes` in settings.json and the LSZH/EGCC precedent of matching runway heading to the parsed-wind frame), `runways.json` above uses the **TRUE** headings (083/263), not the magnetic ones (071/251) -- the same reasoning LSZH applied (`docs/LSZH_RUNWAY_RESEARCH.md` section 1), reaching the same true-heading conclusion for a different, FAA-specific reason. This was **not** independently verified against the AIM primary text or an NWS technical document directly (all evidence found was secondary sources quoting or paraphrasing those documents) -- flagged as reasonably solid but not as fully nailed-down as a direct primary-source read would be.

## 4. Basic facts

- ICAO KLAX, IATA LAX, Los Angeles International. Time zone America/Los_Angeles.
- Reference point 33-56-32.987N / 118-24-28.975W (33.9425, -118.40805 decimal), elevation 127.8 ft, magnetic variation 12 degrees East (2020) -- all from the FAA's own Airport/Facility data as mirrored by AirNav (FAA information effective 30-10-2025), cross-checked against SkyVector (127 ft surveyed, same coordinates to within rounding). Not independently checked against the FAA Chart Supplement/AIP itself.
- `weatherStation` assumes KLAX reports its own METAR; not separately confirmed.

## 5. Declared capacity (for `trafficBands`)

Searched for a declared/published hourly rate (FAA or LAWA). Found: the FAA's **LAX Airport Capacity Profile (2014)**, a planning document, states a declared/optimum runway capacity range of **147-153 operations per hour under marginal weather conditions** for the whole airport (I could not open the PDF directly -- it returned HTTP 403 -- so this figure is from a search-engine summary of that document, not a direct read of the primary text; flagged as a lower-confidence source than LSZH's direct read of the Swiss Slot Coordination page).

This is airport-wide, not broken down by configuration or by arrivals/departures, and the document is from 2014 (over a decade old) -- a real gap, but a better basis than EGCC's whole-day average, because it is at least an hourly runway-capacity figure of the right kind, for a situation (LAX's West Traffic mode genuinely uses both runway pairs simultaneously, 2 arrival + 2 departure runways active together) where an airport-wide hourly figure is a sensible proxy for one mode's throughput, unlike EGCC's single-runway case.

**Derivation used:** 147-153 ops/hour total, split evenly between arrivals and departures (~74-76/hour each), halved for a 30-minute window gives roughly 37-38 per direction -- used as the medium/busy boundary in `settings.json`'s `trafficBands` (`light: [0,18]`, `medium: [19,37]`, `busy: [38, null]`). This is a genuine derivation from an LAX-specific source, not a blind carry-over, but it rests on an even arrivals/departures split assumption that is not itself stated in the source, and the source itself is a 2014 planning document, not current NATS/LAWA-published operational data. Flagged as researched-but-dated, not owner-confirmed.

## 6. Fine-tuning numbers

- **`tailwindDryKt` = 10.** Matches the ZLA SOP's own West-to-East tailwind trigger ("exceeds 10 knots") exactly -- the engine's existing tailwind-eligibility check against this one pack-wide figure is what actually enforces that trigger; no separate time band was built for it (see `operating_plan.json`).
- **`defaultCrosswindKt` = 20**, carried over unchanged from LSZH, unconfirmed for LAX. The ZLA SOP was searched end-to-end for "crosswind" and returned zero hits -- confirmed absent from this source, not merely unfound. Unlike a real FAA 7110.65 order (which does define crosswind limits), this VATSIM training SOP appears to genuinely omit one; flagged clearly rather than invented.
- **`tailwindWetKt`, and every setting not named above** -- carried over unchanged from LSZH's values (per this session's explicit instruction), not independently researched for LAX.
- **ATIS wording** -- no LAX-specific ATIS phrasing template was found this session. Keeps the project's generic default, same as every other pack without its own confirmed template (LSZH, EGCC).

## 7. Modes and time bands

Three modes, runway-coded ids joined without a separator since each role (arrivals/departures) can carry two runways: `24R25LA24L25RD` (West Traffic), `06L07RA06R07LD` (East Traffic), `06RA25RD` (Over-Ocean Traffic).

Only Over-Ocean Traffic has an explicit scheduled window (0000L-0630L) -- modelled as a hard local-time band in `operating_plan.json`. West and East Traffic are not time-gated in the source document at all; the SOP's own switching rule is purely wind-driven (the 10 kt tailwind trigger), so no second time band was built for them -- the engine's per-slot tailwind check against `tailwindDryKt` does that work, matching the task brief's own instruction not to force a time band onto a wind-driven rule. West Traffic keeps preference penalty 0 (the SOP's stated default); East Traffic gets a small non-zero penalty (1) to mark it as the fallback without it competing as an equal default -- the actual switch is forced by the tailwind check, not by this penalty ordering.

## 8. Confidence summary

- **Reasonably solid:** the three runway-use configurations and their runway assignments (direct read of the ZLA SOP's own section 1-3, with its own verbatim wording quoted above); the confirmed absence of any crosswind limit in the source; the 10 kt tailwind trigger figure; the true-vs-magnetic conclusion (though sourced from secondary paraphrases of the AIM/ASOS documentation, not a direct primary-source read).
- **Weak / flagged:** the finding that all four runway pairs share an identical heading (083/263 true) is corroborated by two independent sources but not checked against the FAA Chart Supplement, and no explanation for the 06-vs-07 naming was confirmed; the declared-capacity figure is from a 2014 planning document reached only via a search-engine summary (the PDF itself returned HTTP 403), not a direct primary-source read; the even arrivals/departures split used to derive `trafficBands` is an assumption, not a stated fact.
- **Not found:** an FAA Chart Supplement/AIP cross-check for any field; an ATIS phrasing template; current (non-2014) declared hourly rates; a stated reason for the 06/07 naming despite near-identical headings.
- **Deliberately not modelled:** the "south of 07R/25L to 07L/25R" load-balancing note (section 1, above) -- a traffic-triggered suggestion with no wind/time criterion and no distinct runway pairing, documented rather than built as a mode.

## Sources

- [VATSIM Los Angeles ARTCC (ZLA) -- Los Angeles Tower Standard Operating Procedures, v5.95, 19-03-2026](https://laartcc.org/document/los-angeles-tower-lax) -- primary source for runway-use configurations, the tailwind trigger and the confirmed absence of a crosswind limit (already validated earlier this session, full document read directly)
- AirNav KLAX page (FAA data effective 30-10-2025) -- runway headings (true and magnetic), thresholds, reference point, elevation, magnetic variation
- SkyVector KLAX page -- cross-check for runway headings (true) and thresholds
- Multiple secondary sources paraphrasing the FAA AIM and NWS ASOS documentation (pilotsofamerica.com, askacfi.com, flyawaysimulation.com, touringmachine.com, among others found via web search) -- true-vs-magnetic METAR/ATIS wind convention; no single source was treated as individually authoritative, but the "coded = true, spoken = magnetic" conclusion was consistent across all of them
- FAA, LAX Airport Capacity Profile (2014) -- declared/optimum hourly runway capacity (147-153 ops/hour, marginal conditions); reached only via a search-engine summary, the PDF itself could not be fetched directly (HTTP 403)
- `docs/NEW_AIRPORT_QUESTIONS.md` (project's own new-pack checklist, used throughout)
- `docs/LSZH_RUNWAY_RESEARCH.md`, `docs/EGCC_RUNWAY_RESEARCH.md` (template, tone and confidence-labelling convention followed)

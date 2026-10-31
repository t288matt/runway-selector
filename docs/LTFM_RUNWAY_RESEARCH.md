# Istanbul (LTFM) runway pack: research notes

31-10-2026. Compiled as the basis for the new LTFM pack (`refdata/airports/LTFM`). Follows the same real-world-only, confidence-labelled approach used in `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md`.

## Source — and why this pack is the best-sourced one in the project

Everything in this pack is sourced from one document: **Turkiye's own AIP (DHMI, the Turkish civil aviation authority)**, AD 2 LTFM, current AIRAC cycle (pages dated between 19 MAR 26 and 29 OCT 26, AIRAC AMDT 11/26 for the pages that matter most to this pack — AD 2.12, AD 2.20). Downloaded and read directly this session: https://www.dhmi.gov.tr/AIPDocuments/LT_AD_2_LTFM_en.pdf (local copy used: `C:\Users\mdora\.claude\projects\C--Users-mdora-Claude-YSSY-Runways\49730767-295e-4d7f-ad66-501d8b46fbc5\tool-results\webfetch-1793434609615-l8d3km.pdf`).

This is a genuine national AIP — not a VATSIM/IVAO simulation document (the primary source for both LSZH and EGCC), not a secondary aggregator, not a community noise-engagement pamphlet. Every figure below that is attributed to "the AIP" is a first-party regulatory figure, the strongest sourcing tier this project has used for a pack so far.

## 1. Basic facts

- ICAO LTFM, İstanbul Airport. Time zone Europe/Istanbul.
- ARP 41°16'31"N 028°45'07"E = 41.275278, 28.751944 (AD 2.2 item 1) — "at the site of ARFF-3 building, West of RWY 18/36."
- Elevation: 99.0 M (325 FT) AMSL (AD 2.2 item 3). Reference temperature 29°C, mean low temperature -2°C — not used by this pack's schema but noted for completeness.
- Geoid undulation at AD elevation: 122 FT (AD 2.2 item 4) — matches the geoid undulation figure repeated against every runway threshold in AD 2.12, a useful internal consistency check that the coordinate data is self-consistent.
- Magnetic variation: 6.1°E (2025), annual change 0.05° increasing (AD 2.2 item 5) — not used directly (see §2 on the true-heading frame), but recorded for completeness and because it is the figure that would let a future pack convert between true and magnetic if ever needed.
- Operational hours: H24 for the AD operator, customs, ATS, fuelling, handling, security, de-icing — everything (AD 2.3). No curfew.
- `weatherStation` assumes LTFM reports its own METAR; not separately confirmed from this AIP extract (AD 2.11 names "Istanbul Airport Meteorological Service" as the associated MET office, which is consistent with self-reporting, but the AIP extract read this session did not include a METAR station-code table).

## 2. Runways — true heading frame confirmed explicitly (unlike LSZH/EGCC)

AD 2.12 "Runway physical characteristics" is a complete, unambiguous table. Its heading column is **literally labelled "TRUE BRG"** — this is the one new-airport question (`docs/NEW_AIRPORT_QUESTIONS.md` §2, "does the compass direction used for the runways match the compass direction used in the wind reports?") that did not need inference or cross-checking this time: the AIP states the frame directly. METAR/TAF wind directions are reported true-north by ICAO/WMO convention worldwide (the same assumption both LSZH's MeteoSwiss cross-check and this project's engine already make), so TRUE BRG is exactly the frame the pack needs — no displacement guess, no "~1–3° gap implies which source is which" reasoning like EGCC or LSZH needed.

| Runway | TRUE BRG | Dimensions (m) | THR coordinates (AIP DMS) | Decimal | THR elevation |
|---|---|---|---|---|---|
| 16R | 179.15° | 3750×60 | 411754.97N 0284224.31E | 41.298603, 28.706753 | 219 FT |
| 34L | 359.15° | 3750×60 | 411553.45N 0284226.71E | 41.264847, 28.707419 | 325 FT |
| 16L | 179.15° | 3750×45 | 411755.07N 0284233.33E | 41.298631, 28.709258 | 218 FT |
| 34R | 359.15° | 3750×45 | 411553.55N 0284235.73E | 41.264875, 28.709925 | 325 FT |
| 17R | 179.15° | 4100×45 | 411755.69N 0284328.33E | 41.298803, 28.724536 | 202 FT |
| 35L | 359.15° | 4100×45 | 411542.82N 0284330.92E | 41.261894, 28.725256 | 310 FT |
| 17L | 179.15° | 4100×60 | 411755.79N 0284337.36E | 41.298831, 28.727044 | 202 FT |
| 35R | 359.15° | 4100×60 | 411542.92N 0284339.94E | 41.261922, 28.727761 | 310 FT |
| 18 | 179.15° | 3060×45 | 411723.25N 0284522.24E | 41.289792, 28.756178 | 221 FT |
| 36 | 359.15° | 3060×45 | 411544.08N 0284524.12E | 41.262244, 28.756700 | 309 FT |
| 09 | 89.15° | 2820×45 | 411513.30N 0284558.58E | 41.253694, 28.766272 | 274 FT |

Source: DHMI AIP AD 2.12, AIRAC AMDT 11/26 (29 OCT 26). Decimal coordinates are this session's own DMS→decimal conversion of the AIP's own figures (`dd + mm/60 + ss/3600`), not taken from a third-party aggregator — the first LTFM pack-build step where that was possible, since every other pack in this project has had to use SkyVector/Sprinkle.com/etc. for thresholds.

Headings are recorded in `runways.json` to two decimal places (179.15 / 359.15 / 89.15) exactly as the AIP states them — the project's schema (`headingDegrees: num(...)`, not an integer type) supports this precision, and EGCC/LSZH only used whole-number headings because that was the precision their own secondary sources gave, not because of a schema limit.

RWY 09 is a single-direction strip (2820×45 m, concrete) — there is no reciprocal 27 designator in the AIP at all. Confirmed by both AD 2.12 (09 is the only row without a paired reciprocal row) and AD 2.20 (see §3): "RWY 09 shall only be used for departures."

## 3. Runway-use rules (AD 2.20) — genuinely different shape from every other pack

This is the part of the task that most needed judgement, because Istanbul's AIP organises runway selection completely differently from Zurich's or Manchester's.

### 3a. Hard landing restriction (AD 2.20 "USE OF RWYs", verbatim)

> "1- Unless otherwise authorized by ATS authority, RWYs 16L/34R and 17R/35L will not be used for landing purposes. 2- RWY 09 shall only be used for departures."

This directly determines which runways in each flow direction can be arrival runways:
- South flow (179.15° heading runways): 16L is excluded (paired with 34R) → only **16R** and **17L** may land; 17R is also excluded (paired with 35L).
- North flow (359.15°/89.15° heading runways): 34R and 35L are excluded by the same rule → only **34L**, **35R** and **36** may land; **09** never lands (rule 2).

All of 16L, 16R, 17L, 17R, 34L, 34R, 35L, 35R, 36 and 09 remain available for *departures* — the restriction is landing-only.

### 3b. No named configuration scheme — SID-fix-based departure assignment instead

Unlike every other pack built in this project, LTFM's AIP does **not** define named runway configurations (no "Config A/B", no "North/East/South" like EGCC's MAG document, no vACC-style numbered modes like LSZH's). Instead:

1. **Simultaneous independent parallel approaches/departures run continuously.** AD 2.22 §1.1: "To optimize RWY utilization and increase air traffic efficiency, simultaneous independent parallel approaches are in progress daily (24 hours)... Simultaneous independent parallel dual/triple departures are conducted from all RWYs." There is no separate "single-runway mode" documented in the AIP at all — Istanbul's normal operating state already uses every available runway in the active direction simultaneously.
2. **Departure-runway assignment within a direction is by SID exit waypoint, not by named mode.** AD 2.20 "USE OF RWYs" items 5–6 (verbatim, condensed):
   - "In case of RWYs 34L/R and 35L/R simultaneously used for departures; aircraft taking off to VICEN, RATVU, VADEN, BARPE, IVGUS points will use RWYs 34L/R, and aircraft taking off to TUDBU, IBLAL, MAKOL, EKAWE, REZOV points will use RWYs 35L/R."
   - "In case of RWYs 16L/R and 17L/R simultaneously used for departures; aircraft taking off to MAKOL, EKAWE, VADEN, REZOV, TUDBU, IBLAL points will use RWYs 16L/R, and aircraft taking off to BARPE, IVGUS, VICEN, RATVU points will use RWYs 17L/R."
   - "In case of RWYs 36 and 09 simultaneously used for departures; aircraft taking off towards VADEN, TUDBU, IBLAL, MAKOL, EKAWE, REZOV points shall use RWY 36, and aircraft taking off towards BARPE, IVGUS, VICEN, RATVU points shall use RWY 09. In case of RWYs 18 and 09 simultaneously used for departures; aircraft taking off towards VADEN, TUDBU, IBLAL, MAKOL, EKAWE, REZOV points shall use RWY 09, and aircraft taking off towards BARPE, IVGUS, VICEN, RATVU points shall use RWY 18."

This is genuinely a different kind of runway-selection document from LSZH's or EGCC's: it is organised by *departure traffic flow (SID exit fix)*, not by a wind- or noise-driven named scheme ATC picks from a short list.

### 3c. How this was mapped onto the project's mode schema — a deliberate, documented simplification

The project's `modes.json` schema is `{ id, arrivals: [...], departures: [...] }` — it has no field for "this runway only for this SID's traffic." Building a mode per SID-fix combination would multiply out to a dozen-plus artificial modes that the engine's wind/traffic logic was never designed to choose between (nothing in the engine knows which SID a given flight will fly).

**Decision taken for this pack:** treat the two genuine physical flow directions — "16/17 direction" (179.15° heading, landing into southerly wind) and "34/35/36/09 direction" (359.15°/89.15° heading, landing into northerly wind) — as the two modes, matching how the runways' own headings split and matching Istanbul's real-world prevailing north/south wind pattern. This is exactly the owner-anticipated approach from the task brief. Two modes were built:

- **`16AD`** — arrivals `16R, 17L`; departures `16L, 16R, 17L, 17R`.
- **`34AD`** — arrivals `34L, 35R, 36`; departures `34L, 34R, 35L, 35R, 36, 09`.

The SID-fix-based pairing *within* each direction (which of the direction's runways a specific departure actually rolls from) is **not** separately encoded — it is noted in each mode's `description` field and here, not silently dropped. This mirrors the project's existing precedent for documented-but-unencoded detail (e.g. LSZH's day/season-dependent dual-hours table, EGCC's maintenance-closure exception) — a known simplification, not a data gap to quietly absorb. If the engine ever grows a SID-aware departure field, this is exactly the data that would feed it; until then, listing all of a direction's runways as departure-capable is the correct (if coarser) representation, since all of them genuinely are used for departures in that direction — just not interchangeably for any one flight.

**Not modelled at all (out of scope for this schema, not just simplified):** the multiple-line-up procedures, intersection take-off criteria, rapid-exit-taxiway tables, and the parallel-departure-runway-change procedure for balancing departure queues (AD 2.20 "MULTIPLE LINE-UP PROCEDURES" and the RWY-change note in "USE OF RWYs" #7) are ATC tactical procedures, not strategic runway-use configuration, and have no equivalent field in any pack in this project.

## 4. Preferential Runway System (PRS) — wind thresholds (AD 2.20)

Verbatim: "In the PRS operations, the following wind criteria depending on the RWY surface condition shall be applied."

| RWYCC (Runway Condition Code) | Tail Wind Component (max) |
|---|---|
| RWYCC 6/6/6 (dry) | 10 KT (incl gusts) |
| RWYCC ≥5 for any third (wet) | 10 KT (incl gusts) |

**Notable, deliberately-flagged finding:** both rows give the *same* 10 kt figure. Most packs in this project (and most real airports) apply a stricter wet-runway tailwind limit than the dry one — LSZH's vACC source, for instance, gives 7–10 kt dry but implicitly stricter in practice for wet. Istanbul's own AIP states one number that covers both conditions down to RWYCC 5. This pack therefore sets **both** `tailwindDryKt` and `tailwindWetKt` to **10** in `settings.json` — a genuine sourced finding, not a copy-paste error, and documented as such directly in the settings file.

Below RWYCC 5, the AIP does not give a numeric figure at all — PRS operations simply become *unavailable* under a list of conditions (AD 2.20 PRS §3, verbatim, condensed):
- "The instrument approach/departure procedures available for the preferred RWY(s) are not convenient for landing and/or take-off operations under the existing meteorological conditions,"
- tailwind exceeds 10 kt (dry, RWYCC 6/6/6),
- tailwind exceeds 10 kt (RWYCC ≥5 any third, i.e. wet),
- "When RWYCC is reported at least 5 for any each the preferred RWY(s) third, there is a NOTAM/equivalent information... stating that the RWY is slippery,"
- "RWYCC is reported 4 or less any each the preferred RWY(s) third,"
- "Meteorological conditions such as heavy rainfall, thunderstorm or wind-shear has been reported on the approach or climb path of the preferred RWY(s),"
- "Low visibility operations are in progress."

**No numeric crosswind limit is published anywhere in the AIP.** Crosswind only enters qualitatively, bundled into "aircraft performance" as one of several factors ATC weighs when selecting the runway-in-use (AD 2.20 "SELECTION OF THE RUNWAY-IN-USE" #2: "In selecting the runway-in-use, ATC shall also take into consideration other relevant factors such as the aerodrome traffic circuits, the length of the RWY, the approach and landing aids available, meteorological conditions, aircraft performance, the existence of a preferential RWY system and noise abatement"). This pack does **not** invent a crosswind figure from this qualitative language — `defaultCrosswindKt` carries over LSZH/EGCC's unresearched 20 kt pack default instead, clearly flagged in `settings.json` as not AIP-sourced.

**ATIS announcement when PRS is active:** "Preferential Runway Operations are in progress" (AD 2.20 PRS §4, verbatim). This is a fixed phrase that announces PRS *state*, not a runway/for/arrivals/departures template — it does not map onto this project's `atisWording` schema fields (`rwyWord`/`forWord`/`arrWord`/`depWord`/`andWord`), so `modes.json` keeps the project's generic default and records this phrase here and in the mode's `atisWording.source` note, exactly as LSZH did for its own free-text ATIS sample.

## 5. No curfew, no time-of-day structure (AD 2.3, AD 2.22)

AD 2.3 "Operational Hours" states H24 for every single listed service (AD operator, customs, ATS, fuelling, handling, de-icing, security...) with no exceptions. AD 2.22 §1.1.1 confirms simultaneous independent parallel approaches run "daily (24 hours)." No night-only or day-only runway restriction, and no weekday/weekend split, was found anywhere in the AD 2.1–2.22 sections read this session. `operating_plan.json` is therefore a single all-day band (`allDay: true`) with both modes allowed and no preference penalty between them — genuinely the simplest operating plan in this project so far, reflecting that LTFM's real-world mode choice is driven entirely by wind (via the PRS tailwind rule in §4), not by a published schedule the way EGCC's or LSZH's AIPs require.

## 6. Movement-capacity figure (`trafficBands`) — the one number flagged as the weakest in this pack

No official declared-capacity table exists in the AD 2 LTFM sections read this session (no equivalent of LSZH's Swiss Slot Coordination figure). The only available figure is a widely **reported, not AIP-confirmed** number: 148 movements/hour since Triple Independent Runway Operations began 17-04-2025. This pack estimates `trafficBands` from that figure — see `settings.json` for the derivation (halved for an assumed even arrivals/departures split, halved again for the 30-minute window, rounded to light ≤20 / medium 21–40 / busy ≥41 per 30 minutes) — clearly flagged there as the weakest-sourced number in an otherwise exceptionally well-sourced pack, consistent with how EGCC and LSZH both flag this same field as the one genuinely needing airport-specific (and here, not fully available) research.

## 7. Confidence summary

- **Reasonably solid, AIP-sourced, strongest tier in this project:** every runway designator, true heading, dimension, PCR and threshold coordinate (AD 2.12); the hard landing restriction on 16L/34R and 17R/35L and the 09-departures-only rule (AD 2.20 "USE OF RWYs" #1–2); the PRS tailwind table including the dry=wet 10 kt finding (AD 2.20 PRS); the H24/no-curfew operating pattern (AD 2.3, AD 2.22); the SID-fix departure-assignment rules (AD 2.20 "USE OF RWYs" #5–6), quoted in full in §3b even though not separately encoded in modes.json.
- **Deliberate, documented simplification:** collapsing the SID-fix-based departure pairing within each flow direction into "all of that direction's runways are departure-capable" rather than building SID-aware modes the schema cannot express — see §3c.
- **Carried over, not AIP-sourced, explicitly flagged:** `defaultCrosswindKt` (no published crosswind figure exists at all, not even a vague one); `trafficBands` (no declared-capacity table, estimated from a reported-not-confirmed hourly figure); all the generic engine-tuning settings (`calmWindKt`, `nearLimitMarginKt`, penalty weights, staleness thresholds, etc.) carried unchanged from LSZH per this session's build instructions.
- **Not found / does not apply:** a numeric crosswind limit of any kind; an `atisWording` template matching LTFM's real PRS-state ATIS phrase ("Preferential Runway Operations are in progress" is recorded but does not fit the schema's rwy/for/arr/dep/and fields); a per-runway (rather than per-direction) movement-capacity figure.

## Sources

- [DHMI AIP Turkiye — AD 2 LTFM, İstanbul Airport](https://www.dhmi.gov.tr/AIPDocuments/LT_AD_2_LTFM_en.pdf) — current AIRAC cycle, pages dated 19 MAR 26 through 29 OCT 26 (AIRAC AMDT 11/26 for AD 2.12 and AD 2.20), downloaded and read directly this session. Sections used: AD 2.1 (location/name), AD 2.2 (geographical/administrative data), AD 2.3 (operational hours), AD 2.9 (surface movement guidance, RWSL), AD 2.12 (runway physical characteristics), AD 2.13 (declared distances), AD 2.17 (ATS airspace), AD 2.20 (local aerodrome regulations: USE OF RWYs, Preferential Runway System Operations, Selection of the Runway-in-Use), AD 2.21 (noise abatement — read, not used in this pack's schema), AD 2.22 (flight procedures: simultaneous independent parallel approaches/departures, Point Merge System, RNAV SID/STAR waypoints).
- `docs/NEW_AIRPORT_QUESTIONS.md` (project's own new-pack checklist, used throughout).
- `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md` (structure, tone and `defaultCrosswindKt`/generic-settings carry-over precedent followed by this pack).

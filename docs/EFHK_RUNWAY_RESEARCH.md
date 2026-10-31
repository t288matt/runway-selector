# Helsinki-Vantaa (EFHK) runway pack: research notes

31-10-2026. Compiled as the basis for the new EFHK pack (`refdata/airports/EFHK`). Follows the same real-world-only, confidence-labelled approach used in `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md`.

## 0. The modelling challenge this pack had to solve

VATSIM Scandinavia's EFHK pilot briefing (see §3) does not give fixed arrival+departure runway *pairs* the way LSZH and EGCC do. It gives two **independent, ranked fallback lists** — one for arrivals, one for departures — each six runway-directions long, to be walked down in order until wind permits:

| Preference | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Arrival runway | 15 | 22L | 04L | 04R | 22R | 33 |
| Departure runway | 22R | 22L | 04R | 33 | 04L | 15 |

This project's schema models a "mode" as one fixed set of arrival runways plus one fixed set of departure runways, with a single static preference penalty per time band — it has no concept of "whichever of these six is currently windy-eligible." Two ways to represent EFHK were considered:

1. **Document the mismatch and simplify** (pick only the plausible pairs, as a human controller mostly would) — the fallback-documenting approach EGCC used for seasonal hours it couldn't express.
2. **Build the full cross-product** of arrival-rank x departure-rank as separate modes, with a penalty that sums the two rank positions, and let the engine's own "pick the lowest-penalty allowed mode" logic reproduce the independent fallback behaviour.

**This pack uses option 2**, and it is not a hack: it is mathematically exact, not an approximation, for this engine. `src/engine/eligibility.ts` (`assessWind`) evaluates tailwind/crosswind *per runway a mode uses*, and marks the whole mode `UNSUITABLE` (`hasFail`) if **any** used runway breaks a limit — so a mode `(arrival=X, departure=Y)` is wind-eligible exactly when `X` is eligible **and** `Y` is eligible, independently. Because the penalty assigned to mode `(X, Y)` here is `(rankOf(X) − 1) + (rankOf(Y) − 1)` — additively separable in `X` and `Y` — minimising that penalty over every eligible `(X, Y)` pair is mathematically identical to independently minimising `rankOf(X)` over eligible arrivals and `rankOf(Y)` over eligible departures. That is exactly "walk down the arrival list to the first eligible runway, and separately walk down the departure list to the first eligible runway" — the real rule, reproduced exactly by the optimiser's existing penalty-minimisation logic, with no engine changes.

**One exclusion was needed.** Six of the 36 raw combinations pair a runway with its own physical reciprocal (e.g. arrivals on 04L with departures on 22R — the same strip, opposite ends, which cannot be used in two directions at once). Those 6 are omitted, leaving **30 modes**. The 6 same-name combinations (e.g. arrivals AND departures both on 15 — ordinary single-runway mixed-mode operation) are kept; they are physically normal.

This is logged here in detail because it is a genuine, non-obvious design decision for this pack, not a copy of LSZH's or EGCC's pattern (fixed pairs, or a night/day table) — it is a new case the project hasn't hit before.

## 1. Sources, and which one wins

- **VATSIM Scandinavia (VATSCA) EFHK pilot briefing**, `https://wiki.vatsim-scandinavia.org/books/finnish-airports-charts/page/efhk-pilot-briefing` (Revision #62, created ~3 years ago, updated 6 days before this session — genuinely current). The authoritative source for the preferential runway system and the ranked preference order (§0, §3). It is a VATSIM controller aid, not the Finnish AIP, and the page itself notes real ATC may differ from VATSIM practice.
- **Finland's official eAIP**, `https://www.ais.fi/eaip/006-2025_2025_11_27/eAIP/EF-AD 2 EFHK - HELSINKI-VANTAA 1-en-GB.html` (AIRAC cycle effective 27-11-2025, read directly this session). Used for ARP, elevation, magnetic variation, and — critically — AD 2.12's own runway-physical-characteristics table, which **resolves the heading discrepancy the task flagged as a risk** (see §2). This is the primary source for runway geometry, the strongest-sourced section of this pack.
- General aggregator sites (SkyVector, airport-data.com, Pilotnav, MetarCentral) were used only as cross-checks, not as the primary source, once the AIP table was in hand — unlike LSZH and EGCC, where no primary AIP page was reachable and aggregators had to be trusted.

## 2. Runway geometry — resolved against the AIP (AD 2.12)

The task brief noted public sources disagree (~038° vs ~046° for 04R/22L) and asked to try to resolve this via the AIP. **Resolved.** `ais.fi`'s AD 2.12 table (eAIP cycle 006-2025, effective 27-11-2025) gives, explicitly labelled **TRUE BRG**:

| Runway | True bearing | Threshold (DMS, from AD 2.12) | Threshold (decimal) | Threshold elevation (ft) |
|---|---|---|---|---|
| 04L | 047.47° | 601846.61N 0245413.93E | 60.312947, 24.903869 | 133.6 |
| 22R | 227.51° | DTHR 601952.11N 0245638.01E | 60.331142, 24.943892 | 179.2 |
| 04R | 047.50° | DTHR 601840.65N 0245610.94E | 60.311292, 24.936372 | 151.6 |
| 22L | 227.54° | 601950.49N 0245844.73E | 60.330692, 24.979092 | 148.6 |
| 15 | 153.04° | 601948.99N 0245752.19E | 60.330275, 24.964497 | 163.5 |
| 33 | 333.06° | 601825.44N 0245917.83E | 60.307067, 24.988286 | 147.1 |

(22R and 04R have displaced thresholds (DTHR) per the AIP; the coordinates above are the DTHR, i.e. the real operational threshold, not the full paved end. 22R's and 04R's reciprocal full-length ends match 04L's and 22L's own threshold coordinates respectively, as expected for opposite ends of the same strip.)

The ~038° figure some aggregators gave appears to be simply wrong (possibly confused with another airport or an old survey) — it is not within rounding distance of either the true or the magnetic value for this runway, and the AIP is unambiguous. The ~046° figure is close to the AIP's magnetic-equivalent value (see below) and was the better of the two aggregator figures. **This pack uses the AIP's true bearings, rounded to the nearest whole degree: 04L 047, 22R 228, 04R 048, 22L 228, 15 153, 33 333** (`refdata/airports/EFHK/runways.json`).

**Sanity check against magnetic variation.** The AIP gives magnetic variation as 10.4° E (Jan 2025, +0.2°/year). Subtracting that from the true bearings gives magnetic headings of ~37° (04L), ~217° (22R), ~38° (04R), ~217° (22L), ~143° (15), ~323° (33) — consistent with the runway *names* (04x/22x/15/33 round to the nearest 10° of magnetic heading) for 04/22, and close-but-not-exact for 15/33 (142.6°→"14", 322.7°→"32" rather than "15"/"33"). This ~1° mismatch for 15/33 is normal: magnetic variation drifts over time (here, ~0.2°/year) and runway designators are not renumbered until the drift crosses a 5° naming boundary, so a multi-year gap between naming and today's variation is expected, not a data error.

## 3. True vs. magnetic — the wind/runway reference-frame question

The AIP's own AD 2.12 table labels its bearings **TRUE BRG** — so the runway headings used in `runways.json` are definitely true. The remaining question (as for LSZH and EGCC) is whether METAR coded wind direction for EFHK is reported in the same frame.

No Finland-specific document was found this session stating this explicitly (the FMI/Ilmatieteen laitos aviation page was fetched directly and does not say). However, ICAO Annex 3 (the global standard METAR/TAF format every contracting state, including Finland, follows) specifies that coded METAR/SPECI surface wind direction is reported relative to **true north** — this is a worldwide convention, not an airport-specific choice, and it is the same reasoning LSZH's research relied on (confirmed there via MeteoSwiss's own documentation, which is airport/country-specific; here the confirmation is the general ICAO rule, one level less direct). **This pack therefore uses true headings for runways, matching the presumed true-north METAR convention — reasonably confident, but not confirmed by an FMI-specific document the way LSZH's was.** Flagged here rather than silently assumed, same honesty standard as EGCC's unresolved case (which could not even get this far).

## 4. Basic facts

- ICAO EFHK, Helsinki-Vantaa. Time zone Europe/Helsinki.
- ARP 601902N 0245748E = 60.317222, 24.963333 (AIP AD 2.1/2.2).
- Elevation 180 ft (AIP AD 2.2) — confirms the ~179–180 ft range given by non-official sources, and is itself the primary-source figure, better sourced than either LSZH's or EGCC's elevation.
- Reference temperature 23°C, magnetic variation 10.4° E (Jan 2025, +0.2°/year) — both AIP AD 2.2, not currently used by this pack's schema but recorded here in case a future field needs them.
- `weatherStation` assumed to be EFHK itself; not separately confirmed.

## 5. Runway-use configuration (the preferential runway system)

VATSCA EFHK pilot briefing, verbatim:

> "As a general rule, the first available preferential runway will be used until the crosswind component on a dry runway exceeds 20 KT and/or the tailwind component exceeds 5 KT. If the runway is contaminated, the respective restrictions are 15 KT and 5 KT."

and the ranked preference table reproduced in §0. Three physical runway strips exist — (04L/22R), (04R/22L), (15/33) — each a single paved surface usable in one direction at a time. See §0 for the full modelling decision: **30 modes**, one per valid (arrival-rank, departure-rank) combination, `id` of the form `<arrivalRwy>A<departureRwy>D` (matching the project's usual runway-coded id convention, e.g. LSZH's `14A28D`), `penalty = (arrivalRank − 1) + (departureRank − 1)` so penalty 0 is both roles at their rank-1 runway, rising as either role falls back further down its list. No mode sets its own `maxCrosswindKt` — the single pack-wide dry limit (20 kt, `defaultCrosswindKt`) applies to every mode, exactly matching the VATSCA dry figure, so no override is needed (unlike a pack with genuinely per-runway crosswind differences).

**Not modelled: the contaminated-runway crosswind reduction (15 kt vs. the dry 20 kt).** The schema has one pack-wide crosswind figure (`defaultCrosswindKt`), not a separate dry/contaminated pair, and no mode overrides it — so a contaminated runway is still checked against 20 kt crosswind in this pack, 5 kt more permissive than VATSCA's real 15 kt contaminated figure. Flagged here as a known simplification, the same class of gap LSZH flagged for its per-runway tailwind figures.

**Tailwind, by contrast, genuinely carries across cleanly.** VATSCA gives 5 kt tailwind for *both* the dry and the contaminated case — the one figure that doesn't change between the two surface states — so `tailwindDryKt = 5` applies regardless of surface state. Because the contaminated tailwind figure (5 kt) happens to equal the dry one, this pack sets `tailwindWetKt = 5` too, rather than carrying over the generic unresearched `0` that LSZH and EGCC use — **this is a genuinely-sourced figure for EFHK**, not a placeholder, though see the caveat immediately below.

**Caveat on "wet" vs. "contaminated."** The schema's runway-state model is `DRY` / `WET` / `WET_POSSIBLE`, where "wet" means rain-affected (see `src/engine/eligibility.ts`, `wetRunwayProbabilityPct`, `dryingTimeMinutes`). VATSCA's "contaminated" means a runway covered in snow, slush or ice — a materially different (and more severe) condition than rain-wet, with no equivalent state in this engine. Applying the contaminated tailwind figure to the engine's "wet" state is the closest available mapping, not a precise one. This is a schema gap (no snow/ice contamination model at all, not just a missing crosswind override), broader than the crosswind simplification above, and is flagged here rather than left to look more exact than it is.

## 6. Time-of-day / curfew

The VATSCA briefing page was fully re-read this session specifically to check for a night-hours rule or a movement-capacity figure. **Neither was found.** No AD 2.20 (local traffic regulations) text could be retrieved this session either (fetches of the Finnish eAIP for EFHK reliably returned AD 2.1 through AD 2.19 but truncated before AD 2.20), so a genuine night restriction may exist in the AIP without this session having been able to confirm or rule it out. Per the task brief's explicit instruction not to invent a time structure that wasn't found, `operating_plan.json` uses a **single all-day band** (`id: "all-day"`, `00:00`–`00:00`, matching the pattern NFFN uses for a similar no-time-split pack), listing all 30 modes with the penalties from §5. This is a gap to close later with a genuine AD 2.20 read, not a claim that EFHK has no night restriction at all.

## 7. Declared capacity / `trafficBands`

No current Finavia- or slot-coordinator-published declared capacity (movements per 30 minutes) was found. What turned up instead:
- The VATSCA briefing's own text: ~350 departures/day — a whole-airport daily average, not a per-runway or per-30-minute declared figure (the same shape of problem EGCC's research hit with the MAG pack's 537-movements/day figure).
- Old trade-press figures (43 ops/hour pre-third-runway in 2002, rising to "up to 86" after a transition period; 80/hour from a 2006 report; "up to 50" from a 2008 report) — these disagree with each other by nearly 2x and are 18-24 years old, so none is usable as a current figure.

Per the task's explicit instruction, this is flagged as an unresearched placeholder, same as LSZH/EGCC's own gaps in this one field, and **`trafficBands` is carried over from LSZH unchanged** (light 0–15, medium 16–30, busy 31+ movements per 30 minutes) rather than inventing an EFHK-specific number from any of the mismatched figures above.

## 8. Remaining settings

Per the task brief, every other `settings.json` field is carried over unchanged from LSZH's values (not independently re-researched for EFHK): `limitToleranceKt`, `calmWindKt`, `nearLimitMarginKt`, `wetRunwayProbabilityPct`, `dryingTimeMinutes`, `precipitationCodes`, `metarValidityMinutes`, `lowVisibilityMetres`, `forecastWindowMinutes`, `demandHorizonMinutes`, `assumedDepartureWindowMinutes`, `assumedGroundSpeedKt`, `preferenceDefaultPenalty`, `marginalPenalty`, `changePenalty*`, `unknownDemandChangePenalty`, `noModePenalty`, `minimumStayMinutes`, `shortStayPenalty`, `changeoverPreparationMinutes`, `*StaleMinutes`, `weatherPollMinutes`, `vatsimPollSeconds`, `currentModeStaleMinutes`, `auditMaxEntries`.

## 9. ATIS wording

No EFHK-specific ATIS phrasing template was found this session. The one piece of real ATIS-adjacent text found (VATSCA, for simultaneous parallel approaches) reads "SIMULTANEOUS DEPENDENT/INDEPENDENT IFR APPROACHES IN PROGRESS" — evidently not built on a `RWY <n> FOR ARR AND DEP` template, similar to LSZH's free-text real ATIS sample. `atisWording` therefore keeps the project's generic default, flagged here as not EFHK-specific, matching LSZH's and EGCC's own honesty note on this field.

## 10. Confidence summary

- **Reasonably solid / primary-sourced:** runway true bearings and threshold coordinates (direct AIP AD 2.12 read — the strongest-sourced geometry of any pack in this project so far), ARP/elevation/magnetic variation (direct AIP AD 2.1/2.2 read), the preferential runway ranked-order lists and the 20 kt dry crosswind / 5 kt dry-and-contaminated tailwind figures (VATSCA, cross-checked by a re-read), the true-vs-magnetic resolution for runway headings.
- **Reasoned, not directly confirmed:** METAR wind direction frame (true), by the general ICAO Annex 3 convention rather than an FMI-specific statement.
- **Weak / simplified:** the contaminated-runway crosswind reduction (15 vs 20 kt) has no schema field and is not modelled; "wet" (rain) vs "contaminated" (snow/ice) are conflated because the schema has no contamination state; the 30-mode cross-product is an exact reproduction of the independent-fallback rule under this engine's actual eligibility logic (see §0), not a simplification, but it is a new pattern for this project and worth a second pair of eyes.
- **Not found:** AD 2.20 local traffic regulations (so no night-hours rule could be confirmed OR ruled out), declared runway capacity for `trafficBands`, ATIS phrasing template.

## Sources

- [VATSIM Scandinavia — EFHK pilot briefing](https://wiki.vatsim-scandinavia.org/books/finnish-airports-charts/page/efhk-pilot-briefing) (Revision #62, updated within the last week of this session) — preferential runway system, ranked preference order, departures/day figure.
- [Finland eAIP — EF-AD 2 EFHK, Helsinki-Vantaa](https://www.ais.fi/eaip/006-2025_2025_11_27/eAIP/EF-AD%202%20EFHK%20-%20HELSINKI-VANTAA%201-en-GB.html) (AIRAC 006-2025, effective 27-11-2025) — AD 2.1/2.2 (ARP, elevation, magnetic variation) and AD 2.12 (runway physical characteristics, true bearings, threshold coordinates).
- SkyVector, airport-data.com, Pilotnav, MetarCentral EFHK pages — used only as cross-checks against the AIP table, not as primary sources.
- General aviation sources on ICAO METAR wind-direction convention (true north) — no Finland-specific document found.
- `docs/LSZH_RUNWAY_RESEARCH.md`, `docs/EGCC_RUNWAY_RESEARCH.md`, `docs/NEW_AIRPORT_QUESTIONS.md` — precedent and checklist.

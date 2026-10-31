# Cologne/Bonn (EDDK) runway pack: research notes

31-10-2026. Compiled as the basis for the new EDDK pack (`refdata/airports/EDDK`). Follows the same real-world-only, confidence-labelled approach used in `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md`.

## Sources, and which one wins

Operational facts (runway dimensions, direction-of-operation preference, tailwind threshold, parallel-runway separation rule) come from one source this session: **VATSIM Germany (VATGER) knowledgebase, EDDK Tower SOP** (`https://knowledgebase.vatsim-germany.org/books/sops-fir-langen/page/eddk-tower`, Revision #14, created ~1 year ago, last updated ~6 months ago). Like EGCC's vMATS, this is a VATSIM controller aid, not the German AIP (DFS) itself — treated as a strong secondary source for operational structure, not a substitute for AIP AD 2 EDDK.

Everything else (headings, coordinates, elevation, the 2024 runway rename, declared capacity) is this session's own web research, cross-checked across at least two sources where possible, with every unresolved disagreement flagged rather than silently picked.

## 1. Basic facts

- ICAO EDDK, Cologne/Bonn ("Köln/Bonn"), Germany. Time zone Europe/Berlin.
- Elevation 302 ft, agreed by SkyVector and airport-data.com; one outlier source (learn-atc.com, 77 m / 252 ft) was rejected as inconsistent with every other source.
- ARP: SkyVector gives N50°51.96'/E7°8.56' (50.8660, 7.1427); airport-data.com's independently-sourced decimal figure (50.865917, 7.142744) matches to the fourth decimal place — good cross-check. IVAO agrees to the second. Not checked against the DFS AIP directly.
- `weatherStation` assumed EDDK reports its own METAR; not separately confirmed (same caveat as every other pack).

## 2. The 2024 runway rename, and why it matters for this pack

Cologne/Bonn's parallel runway pair was **renamed on 18 April 2024** (AIRAC 2404): the former 14L/32R became 13L/31R, and 14R/32L became 13R/31L, because the magnetic field's drift had moved the rounded magnetic heading below the 14/32 designator's 135–144°/315–324° band and into 13/31's 125–134°/305–314° band. The crosswind runway 06/24 kept its name throughout (German-language reporting: "Der Name der Querwindbahn 06/24 bleibt gleich").

This is useful, not just a trivia note: **it is independent, dated evidence that the parallel runway's rounded magnetic heading has been drifting down through the 130s**, which is exactly the kind of corroboration LSZH's pack used two independently-sourced heading sets to establish (`docs/LSZH_RUNWAY_RESEARCH.md` §1) and which EGCC's pack explicitly said it *couldn't* get because Manchester's magnetic variation is too small to show up that way (`docs/EGCC_RUNWAY_RESEARCH.md` §2). EDDK sits in between: the drift is large enough over the decades to force a renaming, but the current magnetic variation (~3.15–3.2°E per Airmate/airportguide, with sources disagreeing on the second decimal) is still small enough that a ~2° gap between two heading sets is consistent with either true-vs-magnetic or simple measurement noise — so this is treated as supporting evidence, not proof.

OurAirports independently confirms the **current** designators are 13L/31R, 13R/31L and 06/24 (i.e. the rename has fully propagated to at least one major aggregator, unlike some flight-sim scenery which a VATSIM forum post says lagged behind AIRAC 2404).

## 3. True vs. magnetic heading frame

Per the project's standing question (`docs/NEW_AIRPORT_QUESTIONS.md` §2), the heading reference frame used for the pack's runways must match the frame used for wind reports. Research (not an official DWD document directly — a secondhand citation of a DWD METAR/TAF brochure via a forum post) says Germany follows the general worldwide METAR convention: **written METAR wind direction is relative to true north**; only spoken ATIS/tower wind and PIREPs are magnetic. This matches the LSZH finding (MeteoSwiss confirmed true/geographic for Swiss METARs) and the general ICAO/WMO pattern. **The pack therefore uses true headings**, same decision as LSZH, but — like EGCC — this is not confirmed against an official DWD/DFS publication, only a secondary citation of one.

- SkyVector's pre-rename page gives **magnetic** headings: 136°/316° for the parallel pair (14L/32R at the time it was captured) and 063°/243° for 06/24.
- Sprinkle.com (via a web-search snippet, since the page itself returned HTTP 410 when fetched directly) gives **true** headings for the parallel pair: 138°T / 318°T.
- 136° (magnetic) + ~3.15–3.2° (current easterly variation) ≈ 139°, close enough to Sprinkle's 138°T to support "SkyVector = magnetic, Sprinkle = true" as the same pattern found at LSZH (a magnetic-plus-variation gap, not two disagreeing true-heading sources). This is corroborating, not proof: the rename itself is the stronger piece of evidence (§2).
- **No independently-sourced true heading was found for 06/24.** The pack's true heading for 06/24 (066°/246°) is *derived*, not sourced: SkyVector's magnetic 063°/243° plus the current ~3.2°E variation. Flagged as the weakest heading figure in this pack — unlike the parallel pair, there is no second source's true-heading figure to cross-check it against.
- 13R/31L is assumed to share 13L/31R's heading (138°T/318°T) since it is a physically parallel runway at the same airport; SkyVector's own (pre-rename) data for 14R/32L gives the same 136°/316° magnetic figure as 14L/32R, supporting this.

## 4. Runways and thresholds

Thresholds converted from SkyVector's degree-minute figures (captured under the pre-rename designators, but thresholds are physical positions that don't move when a runway is renamed):

| Runway (current) | SkyVector old name | True heading (deg) | Threshold (decimal degrees) | Length × width |
|---|---|---|---|---|
| 13L | 14L | 138 | 50.8805, 7.1290 | 3815 m × 60 m |
| 31R | 32R | 318 | 50.8552, 7.1657 | 3815 m × 60 m |
| 13R | 14R | 138 | 50.8708, 7.1208 | 1863 m × 45 m |
| 31L | 32L | 318 | 50.8585, 7.1387 | 1863 m × 45 m |
| 06  | 06  | 066 (derived, see §3) | 50.8602, 7.1238 | 2459 m × 45 m |
| 24  | 24  | 246 (derived, see §3) | 50.8697, 7.1553 | 2459 m × 45 m |

Lengths match the user-supplied VATGER figures exactly (3815 m, 1863 m, 2459 m), which is a good cross-check between the two sources used this session.

## 5. Runway-use configuration

Source: VATGER EDDK Tower SOP (already validated this session, re-confirmed live, see header). Key facts:

- 13L/31R: primary for all arrivals/departures, ILS CAT III both ends.
- 13R/31L: ~1 km SW of 13L/31R, preferred for VFR/military, Code C max, usable for light/medium traffic **in high-demand periods**, within 1863 m TORA; non-precision approach to 13R needs ≥2.1 km visibility.
- 06/24: crossing runway, only 24 has ILS (CAT I), 06 non-precision only, Code E max (incl. B748); non-precision to 24 needs ≥1.5 km visibility; also used for taxiing.
- Direction of operation: up to 5 kt tailwind → ops via 31R/31L direction (and 24, also capped at 5 kt tailwind); direction 06 used very rarely (prevailing wind in Cologne Bay is north/northwest).
- Parallel ops: 13L/31R and 13R/31L centrelines ~1150 m apart; independent parallel IFR/SVFR **not** permitted — standard radar + runway separation applies instead (no wake-turbulence separation needed for independent ops, because ops aren't independent).

**Modelling decision (the question this task asked to resolve honestly): is it 3-runway simultaneous 31-direction operation, or single-runway-primary with 13R/31L only in high demand?**

The source supports **single-runway-primary as the default**, with the others as additions under specific conditions — not a standing three-runway simultaneous mode. Specifically:

1. 13L/31R is stated outright as "primary for all arrivals/departures" — the baseline case, used alone most of the time.
2. 13R/31L is explicitly conditioned on "high-demand periods" — not a standing parallel runway, so it is modelled as a *separate* dual mode, not folded permanently into the primary mode.
3. 06/24's crosswind role is tied to the same tailwind-cap language as the 31-direction preference ("ops via 31R/31L direction (**and** 24, also capped at 5 kt tailwind)") — read as 24 being *available* as an additional capacity runway under the same wind condition, not as a third runway that's always active alongside 31R and 31L together.

**This pack therefore builds five modes, not one three-runway "everything running" mode:**

| Mode id | Arrivals | Departures | Role |
|---|---|---|---|
| `31RAD` | 31R | 31R | Single-runway default, westerly (the normal case) |
| `13LAD` | 13L | 13L | Single-runway default, easterly (used when tailwind on 31R would exceed 5 kt) |
| `31RAD31LAD` | 31R, 31L | 31R, 31L | Dual, high-demand westerly: 13R/31L added for light/medium Code C traffic. Not segregated (both runways do both roles) because the source gives no arrival/departure role split for this pair — unlike LSZH/EGCC's segregated dual modes, which had an explicit arrivals-one-runway/departures-the-other source statement |
| `31R24AD` | 31R, 24 | 31R, 24 | Primary plus crosswind-runway capacity boost, westerly: 24 activated alongside 31R under the same ≤5 kt tailwind condition |
| `06AD` | 06 | 06 | Rare crosswind-only mode, easterly (reciprocal of `31R24AD`'s 24 leg) |

**Deliberately not built, flagged as gaps, not silently assumed:**
- No `13LAD`-paired dual or crosswind mode (e.g. `13LAD13RAD` or `13L06AD`): the source only discusses the dual/crosswind additions in the context of the 31-direction ("ops via 31R/31L direction (and 24...)"). There is no equivalent statement that 13R/31L or 06 are ever added to 13L in the 13-direction. Building the mirror-image mode would be inventing structure the source doesn't support — the task's own instruction against assuming more complexity than the text gives.
- A genuine three-runway (31R+31L+24 simultaneous) mode: the source's wording groups 24 with "31R/31L direction" as a single phrase, which is ambiguous between "24 used together with both 31R and 31L" and "24 used as an alternative addition to whichever of 31R/31L is the day's runway in use." Rather than guess, two separate two-runway dual modes (`31RAD31LAD` and `31R24AD`) are built instead of one three-runway mode — a conservative reading, flagged here rather than presented as settled.
- A dedicated VFR/military-only mode using 13R/31L alone (without 13L/31R running too): the source frames 13R/31L's use as supplementary during high demand, not as a standing alternative to the primary runway; this project's engine doesn't model aircraft-type routing in any case (same reasoning EGCC used to skip building a dedicated GA/VFR mode).
- `maxCrosswindKt` per mode: no crosswind limit stated for any runway/mode by VATGER; all modes fall back to `defaultCrosswindKt`.
- `minima`/`approachLadder` per mode: the source gives the two non-precision-approach visibility minima (13R ≥2.1 km, 24 ≥1.5 km) but this pack follows LSZH/EGCC's precedent of not populating `minima`/`conditionalOperation`/`approachLadder` fields at all — neither template pack used them, so this pack doesn't either, to stay consistent with the project's established pattern. The two visibility figures are recorded here in prose for a future pack revision, not lost, just not wired into the schema this session.
- `capacity` per mode: not stated by VATGER; left at the schema default (null, no limit).

## 6. Time-of-day / day-of-week

**No time-of-day or day-of-week structure was found in the VATGER SOP excerpt supplied this session** — no stated hours for when 31R is preferred vs. 13L, no night curfew, no weekday/weekend split (unlike LSZH's and EGCC's sources, which both gave explicit clock-time or UTC windows). The only conditioning factor stated is wind (the 5 kt tailwind threshold) and traffic demand ("high-demand periods" for 13R/31L) — neither of which is a time-of-day rule the engine's `operating_plan.json` band model can express directly (traffic-demand-triggered mode switching is exactly what the engine's own traffic-based banding/penalty system is for, not something to hand-code as a time band).

**Decision taken for this pack:** `operating_plan.json` uses a **single all-day band** (`allDay: true`), with every mode given `allowed: true` and `penalty: 0` except nothing is penalised preferentially by time — the wind/tailwind gate (via `settings.json`'s `tailwindDryKt`) and the engine's own traffic-based scoring are left to do the preference work that would otherwise come from a researched time band. This mirrors how LSZH and EGCC structured their bands when they had explicit hours to put in them; the difference here is honest: there are no hours to put in, so no band structure is invented. This is the same category of decision as LSZH's "don't invent day-of-week bands the engine can't express" and EGCC's "don't invent a maintenance-closure mode with no fixed cadence" — except here the gap is at the data layer (no hours exist in the source) rather than the engine layer.

## 7. Declared capacity (`trafficBands`)

**Not found — unresearched placeholder, same situation EGCC was in.** Searches for a DFS/Flughafenkoordination Deutschland declared-capacity figure for EDDK (the equivalent of LSZH's Swiss Slot Coordination 40-movements/30-min figure) did not turn one up this session. What was found: EDDK is listed as a slot-coordinated airport under Germany's FHKV regulation (alongside Frankfurt, Munich, Düsseldorf), confirming slot coordination applies, but not the actual declared-capacity number. Given Cologne/Bonn's real-world profile (mid-size passenger airport, and Europe's largest all-cargo hub for DHL's air hub, with significant night cargo movements), a bespoke capacity figure would be valuable — but inventing one from an unrelated statistic (as EGCC's research explicitly declined to do with its daily-average figure) would look more researched than it is. **This pack carries over NFFN/YBTL/EGCC's generic placeholder bands** (light 0–10, medium 11–20, busy 21+ per 30 min) rather than fabricate an EDDK-specific number. Needs the DFS/Flughafenkoordination Deutschland capacity declaration (or the DHL hub's own published peak-hour figures) before this is treated as confirmed.

## 8. Fine-tuning numbers

- **`tailwindDryKt` = 5.** Directly stated by the VATGER source: "up to 5kt tailwind → ops via 31R/31L direction (and 24, also capped at 5kt tailwind)." A genuine single pack-wide figure this time (unlike LSZH, which had two different per-runway tailwind figures and had to pick the stricter one) — EDDK's source states one number that applies to both the 31R/31L direction and 24, so no compromise was needed.
- **`defaultCrosswindKt`, `tailwindWetKt`, and every other `settings.json` field: carried over unchanged from LSZH's values**, per this task's explicit instruction. Not researched for EDDK; flagged in `settings.json`'s own description field as carried-over defaults, same honesty convention as every other non-bespoke figure in this pack.
- **ATIS wording**: no EDDK-specific ATIS phrasing was found this session (same situation as LSZH and EGCC — neither of those found a real phrasing template either, beyond LSZH's one free-text ATIS sample that didn't fit the schema's template shape anyway). The pack keeps the project's generic default block, copied from LSZH's `atisWording`, flagged as not EDDK-specific.

## 9. Confidence summary

- **Reasonably solid:** runway lengths/widths and the 2024 rename (cross-confirmed by VATGER lengths matching SkyVector exactly, and the rename independently reported by multiple German aviation-press sources), the 5 kt tailwind threshold (directly stated, single figure, no per-runway compromise needed), the true-vs-magnetic reasoning (weaker than LSZH's direct DWD confirmation, but stronger than EGCC's unresolved case, thanks to the rename itself being independent dated evidence of magnetic drift), the ARP/elevation (two independently-sourced figures agreeing to several decimal places).
- **Weak / simplified:** 06/24's true heading (derived by adding current variation to a magnetic figure, no independent true-heading source found for this pair specifically, unlike the parallel pair); the dual/crosswind mode split (`31RAD31LAD` vs. `31R24AD` as two separate modes rather than one three-runway mode) — a conservative reading of ambiguous source wording, flagged rather than resolved by guessing; the all-day single band (not a simplification of a real time structure, but an honest reflection that no time structure was found at all).
- **Not found:** DFS/Flughafenkoordination declared capacity (`trafficBands` placeholder only); ATIS phrasing template; UK/German AIP cross-check for any field; any stated crosswind limit; ceiling/visibility minima wired into the schema (the two non-precision visibility figures are recorded in prose in §5 but not built into `minima`, consistent with the template packs not using that field either).

## Sources

- VATSIM Germany (VATGER) knowledgebase — EDDK Tower, `https://knowledgebase.vatsim-germany.org/books/sops-fir-langen/page/eddk-tower`, Revision #14 (already validated and re-confirmed this session; primary source for runway roles, direction-of-operation preference, the 5 kt tailwind threshold, and the parallel-runway separation rule)
- [SkyVector — Koeln Bonn Airport](https://skyvector.com/airport/EDDK/Koeln-Bonn-Airport) (magnetic headings, degree-minute thresholds, lengths/widths, pre-rename designators)
- Sprinkle.com EDDK page (true heading for the parallel pair, 138°T/318°T) — cited via a web-search snippet; the page itself returned HTTP 410 when fetched directly this session
- [OurAirports — EDDK runways](https://ourairports.com/airports/EDDK/runways.html) (confirms current designators 13L/31R, 13R/31L, 06/24)
- [airport-data.com — EDDK/CGN](https://airport-data.com/world-airports/EDDK-CGN/) (decimal ARP coordinates, elevation, cross-check)
- Airmate.aero and Airportguide.com EDDK pages (current magnetic variation, ~3.15–3.2°E, disagreeing in the second decimal)
- German aviation press (frankfurtflyer.de, aerointernational.de, aerotelegraph.com) reporting the 18 April 2024 (AIRAC 2404) runway rename and its magnetic-drift cause
- A VATSIM flight-sim forum thread noting the rename's slow propagation to some scenery/nav databases
- A secondhand citation (via a Windy community forum post) of a DWD METAR/TAF brochure stating German METAR wind direction is relative to true north — not the DWD document itself
- `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md` (template packs; precedent for the true-vs-magnetic reasoning, the day-of-week engine gap, and the "don't invent a bespoke capacity figure from an unrelated statistic" decision)
- `docs/NEW_AIRPORT_QUESTIONS.md` (project's own new-pack checklist, used throughout)

# Madrid-Barajas (LEMD) runway pack: research notes

31-10-2026. Compiled as the basis for the new LEMD pack (`refdata/airports/LEMD`). Follows the same real-world-only, confidence-labelled approach used in `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md`.

## Primary source for runway use

**VATSIM Spain's LEMD Pilot Briefing, Version 1.0, May 2022** (`https://archivos.vatsimspain.es/Operaciones/Manuales/Pilotos/LEMD/EN_Briefing.pdf`). No newer revision was found this session (checked). `biblioteca.vatsimspain.es` hosts a login-gated "AD Manual Operativo" that may be more current, but it was not accessible without credentials — this briefing is flagged as the **best publicly-confirmed version found**, not provably the latest, exactly the same caveat LSZH's vACC source and EGCC's vMATS carry.

**Document-quality flag.** Sections 1.5 and 1.8 of the briefing have leftover "Barcelona" text, apparently a copy-paste artefact from a shared VATSPA template. The LEMD-specific tables actually used for this pack (runway/preference-configuration table in 1.7, the navaid/TORA table used to pair runway designators) look internally consistent and specific to LEMD, so this is recorded as a minor source-quality caveat, not a reason to distrust the figures taken from it — the same posture EGCC's research took toward vMATS's own real-world-use disclaimer.

Like a VATSIM-produced document generally (see EGCC's vMATS disclaimer), this briefing is written for VATSIM pilots, not issued by ENAIRE/AENA. It is treated here as a strong secondary source for the runway-preference structure, not a substitute for the Spanish AIP.

## 1. Basic facts

- ICAO LEMD, Madrid-Barajas (Adolfo Suárez Madrid–Barajas Airport). Time zone Europe/Madrid.
- ARP, from the official Spanish AIP (ENAIRE, AD 2-LEMD, checked 31-10-2026): 402820N 0033339W = 40.47222°N, 3.56083°W. Elevation 1998 ft (609 m), geoid undulation 51 m — also the AIP's own figure, and it matches the elevation already supplied from the VATSIM Spain briefing and every third-party source checked (SkyVector, Sprinkle.com), so this is the one figure treated as solid rather than merely "sources agree."
- **Magnetic variation at LEMD is 0° (epoch 2020), with an annual change of 8.1' East** — per the Spanish AIP. This is a materially different situation from both templates: LSZH's wind/heading frames differ by several degrees (confirmed true vs magnetic), EGCC's differ by ~1° but the frame itself is unresolved; at LEMD the two frames are essentially the same, within a fraction of a degree even after several years of drift. This makes the true-vs-magnetic question low-stakes here, but it has **not** been independently confirmed against a current AIP chart that METAR wind (reported true per ICAO Annex 3 outside the US) and the runway-heading convention actually agree at the sub-degree level — flagged per `docs/NEW_AIRPORT_QUESTIONS.md` §2, same as the other two packs, even though the practical risk is smaller here than at either template airport.
- `weatherStation` assumes LEMD reports its own METAR; not separately confirmed.

## 2. Runways (four parallel strips)

Real-world designators, confirmed via the briefing's own TORA/navaid table pairing runway ends: the four strips are **18L/36R**, **18R/36L**, **32R/14L**, and **32L/14R** (equivalently 14L/32R and 14R/32L). This matches the already-validated pairing supplied for this session and was independently re-derived from Sprinkle.com's eight threshold coordinates by proximity (each pair's longitude matches closely, confirming which two designators share one physical strip):

| Runway | True heading | Threshold (decimal degrees) |
|---|---|---|
| 18L | 177 | 40.5326, -3.5594 |
| 36R | 357 | 40.5011, -3.5592 |
| 18R | 177 | 40.5318, -3.5749 |
| 36L | 357 | 40.4926, -3.5746 |
| 14L | 140 | 40.4949, -3.5579 |
| 32R | 320 | 40.4700, -3.5326 |
| 14R | 140 | 40.4849, -3.5760 |
| 32L | 320 | 40.4557, -3.5464 |

**Headings — only half independently confirmed.** PilotNav gives a true heading of 177.2°/357.2° for the strip it labels 18L/36R, and separately a true heading of 140.3°/320.3° for a strip it still labels with Madrid's **older** 15L/33R designators — read here as today's 14L/32R, since 140.3° rounds to the "14" family while 15/33 would have rounded from an earlier, slightly different heading before Spain's eastward magnetic drift pushed the rounded designator down from 15/33 to 14/32 (a routine runway renumbering, not a data error). PilotNav's page did not give a clearly separate heading for 18R/36L or 14R/32L. **This pack assumes each unconfirmed runway shares its parallel partner's heading** (177/357 for 18R/36L, 140/320 for 14R/32L) — a reasonable assumption for parallel strips at the same airport, but not independently checked, flagged here rather than silently treated as confirmed.

**Thresholds** are from Sprinkle.com (marked "verified May 2026" at lookup), 31-10-2026. The official Spanish AIP gives runway-end coordinates in a degrees/minutes/seconds format (e.g. "Coordenadas extremo RWY 36R: 403157.44N 0033333.77W"), which on inspection appears to correspond to the *opposite* end of the strip from what Sprinkle calls the 36R threshold — i.e. the AIP's "RWY 36R" end-point looks like it is actually at the 18L end. This is this session's own inference from comparing the two coordinate sets, not something either source states directly, and it was not resolved further — flagged as unconfirmed, same spirit as EGCC's displaced-threshold gap. The pack uses Sprinkle's coordinates as given; they were not cross-checked against the AIP's own figures beyond this inconclusive comparison.

## 3. Runway-use configuration

Section 1.7 "Preference Configuration" of the VATSIM Spain briefing (verbatim, already supplied this session and re-confirmed against the PDF):

| Period | Local hours | Preferred | No-preference fallback |
|---|---|---|---|
| Day | 0700–2300 | Arrivals 32R/32L, departures 36R+36L | Arrivals 18R/18L, departures 14R+14L |
| Night | 2300–0700 | Arrivals 32R, departures 36L | Arrivals 32R/32L, departures 36R |

**The combined tailwind/crosswind rule.** "The controller will maintain the preferred settings... up to 10kt tailwind and/or 20kt crosswind components, including gusts." This is read as a single **combined** limit — both figures apply together, both including gusts — not two independent standalone thresholds, and the briefing states no separate crosswind-only limit anywhere else. This project's schema (`settings.json`) has two separate fields, `tailwindDryKt` and `defaultCrosswindKt`, with no way to express an AND condition between them. The pack sets `tailwindDryKt = 10` and `defaultCrosswindKt = 20` — i.e. each field takes its half of the combined figure — which is the closest honest fit the schema allows, but it is **not the same rule**: the schema will independently gate on either figure alone, whereas the briefing's actual rule only cares about the two together. This is the same class of schema/real-rule mismatch LSZH flagged for its own per-runway-vs-pack-wide tailwind split (`docs/LSZH_RUNWAY_RESEARCH.md` §3) — recorded here rather than silently absorbed, and noted again in `settings.json` itself.

**Genuine unmodelled gap.** The briefing does not state what happens if conditions exceed the no-preference fallback's own limits too — this is implicitly left to ATC judgement/some other combination, and the pack does **not** invent a further fallback mode to paper over this. Flagged as a real gap in the source document, not a data-entry omission.

**Footnotes, not modelled in the schema:**
- The night configuration can be extended before 2300 or brought forward before 0700 "if traffic, meteorological conditions or operational requirements allow" — a soft, judgement-based exception with no stated numeric trigger, so it is not built as a separate time band; the fixed 2300/0700 boundary from the table above is used as-is.
- Use of RWY 36L or 14R is restricted to aircraft needing a longer runway than 36R/14L offers, plus medevac/rescue/state flights, and those departures must use a conventional (non-RNAV) SID. This project's schema has no field for an aircraft-type or SID-type restriction, so it is recorded only in `modes.json`'s description text for `32RA36LD`, not enforced.

## 4. Time-of-day structure

Unlike LSZH (weekday/weekend split not supported by the engine, TB-4) and EGCC (seasonal + weekday/weekend split, worse than LSZH's case), **LEMD's own source gives a genuinely clean day/night-only split with no weekday, weekend or seasonal variation stated anywhere in section 1.7.** This is the one template airport among the three where the real-world rule and the engine's day-only band model (`docs/TIME_BASED_RULES.md` TB-4/TB-5) need no simplification at all — `operating_plan.json`'s two bands (`day` 07:00–23:00, `night` 23:00–07:00) map directly onto the briefing's own table with nothing papered over.

## 5. Fine-tuning numbers

- **`tailwindDryKt` = 10, `defaultCrosswindKt` = 20** — see §3 above for full reasoning and the schema-mismatch caveat.
- **`tailwindWetKt`** carried over unchanged from LSZH (0 kt); the briefing gives no separate wet-runway tailwind figure.
- **`trafficBands` — unresearched placeholder, the one figure `docs/NEW_AIRPORT_QUESTIONS.md` says genuinely needs airport-specific research.** No AENA/ENAIRE declared-capacity document (the equivalent of LSZH's Swiss Slot Coordination figure) was found this session. A single news article (reporting AENA's 2027 capacity-expansion plans, found via web search, not an AENA primary document) states Madrid-Barajas currently handles up to roughly 100 total operations per hour airport-wide, with a planned rise to 120 as part of a passenger-cap programme starting 2027. This is a **whole-airport** figure spread across up to four runways running in dual/quad configuration simultaneously, not a declared per-runway, per-30-minute capacity — using it to derive `trafficBands` would look more "researched" than it actually is, the same judgement EGCC's research made about its own whole-airport daily-average figure. The pack therefore carries over EGCC's own generic placeholder bands (light 0–10, medium 11–20, busy 21+ per 30 min) rather than inventing a bespoke-looking number from a mismatched source. Needs AENA's own declared-capacity document or Spain's AECFA slot-coordination figures before this is treated as confirmed.
- **ATIS wording** — not found. The briefing gives no ATIS phrasing template for LEMD. The pack keeps the project's generic `atisWording` default for schema compatibility; it is not confirmed to describe LEMD's real ATIS style.
- All remaining settings (`limitToleranceKt` through `auditMaxEntries`) are carried over unchanged from LSZH's values, as instructed, not independently re-researched for LEMD.

## 6. Confidence summary

- **Reasonably solid:** ARP and elevation (official AIP, matching every other source checked), the day/night preferred/no-preference runway pairs and their exact local-time windows (direct from the briefing's own section 1.7, with a genuinely clean day-only split needing no engine-gap simplification), the combined 10kt-tailwind/20kt-crosswind preference threshold as a *combined* rule (even though the schema can only express it as two separate figures).
- **Weak:** runway headings for 18R/36L and 14R/32L (assumed identical to their confirmed parallel partner, not independently sourced); the AIP-vs-Sprinkle threshold discrepancy noted in §2 (unresolved, not just unconfirmed); whether the true/magnetic wind-report frame genuinely lines up with the runway-heading frame at the sub-degree level (low practical risk given 0° variation, but not confirmed against a current AIP chart); the genuine "what happens beyond the no-preference fallback's limits" gap in the source document itself (not an omission on this pack's part).
- **Not found:** a current, non-login-gated AENA/ENAIRE "AD Manual Operativo" or equivalent primary operational document (the VATSIM Spain briefing, while internally consistent and specific to LEMD outside its two template-artifact sections, is a VATSIM pilot briefing, not an AIP or AENA-issued document); a declared per-runway/per-30-minute capacity figure for `trafficBands`; an ATIS phrasing template; the aircraft-type/SID restriction on RWY 36L/14R use has no schema field to enforce it.
- **One schema mismatch flagged, not silently absorbed:** the combined tailwind-AND-crosswind rule (§3), the same class of gap LSZH hit with its per-runway tailwind split.

## Sources

- [VATSIM Spain — LEMD Pilot Briefing, Version 1.0, May 2022](https://archivos.vatsimspain.es/Operaciones/Manuales/Pilotos/LEMD/EN_Briefing.pdf) — primary source for the preference-configuration table, the combined tailwind/crosswind threshold, the night-use restriction on RWY 36L/14R, and the runway-designator pairing (TORA/navaid table)
- `biblioteca.vatsimspain.es` "AD Manual Operativo" — noted as a possibly more current source, login-gated, not accessible this session
- ENAIRE Spanish AIP, AD 2-LEMD (`aip.enaire.es`) — ARP, elevation, magnetic variation
- PilotNav LEMD page — true runway headings (177.2°/357.2° for 18L/36R; 140.3°/320.3° for the strip it still labels 15L/33R, read as today's 14L/32R)
- Sprinkle.com LEMD page — decimal-degree threshold coordinates for all eight runway ends
- SkyVector LEMD airport page — cross-check on ARP and elevation
- News reporting on AENA's 2027 capacity-expansion plans (Aviation Week / Hosteltur / aviation24.be, via web search) — the ~100 ops/hour airport-wide figure, flagged as too coarse to use for `trafficBands`
- `docs/TIME_BASED_RULES.md` (TB-4/TB-5 day-of-week/season gap, for comparison against LSZH/EGCC — not actually triggered by this pack)
- `docs/NEW_AIRPORT_QUESTIONS.md` (project's own new-pack checklist, used throughout)
- `docs/LSZH_RUNWAY_RESEARCH.md`, `docs/EGCC_RUNWAY_RESEARCH.md` (template packs, tone and structure followed)

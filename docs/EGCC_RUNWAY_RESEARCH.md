# Manchester (EGCC) runway pack: research notes

31-10-2026. Compiled as the basis for the new EGCC pack (`refdata/airports/EGCC`). Follows the same real-world-only, confidence-labelled approach used in `docs/LSZH_RUNWAY_RESEARCH.md`.

## Sources, and which one wins

Two documents were used this session, and wherever they conflict, **vMATS wins** (owner decision):

1. **MAG "Manchester Airport Runway Use Information Pack" (Summer Season 2025)** — a community/noise-engagement document published by Manchester Airport itself (manchesterairport.co.uk). Good for dated, plain-English operating facts (dual-runway hours, the night restriction) but uses only community names ("Runway 1"/"Runway 2"), gives no headings, thresholds, crosswind/tailwind limits, ATIS wording, or per-mode movement caps, and its own arrivals chart appeared at first to contradict strict segregated-mode operation (resolved below).
2. **VATSIM UK's EGCC vMATS Part 2, Revision 2026/05, effective 25-05-2026** (`https://docs.vatsim.uk/Aerodrome/EGCC%20%28Manchester%29/Manchester%20%28EGCC%29%20vMATS%20Part%202%20-%202026%2005.pdf`). The authoritative source for this pack — far more operationally detailed, with real runway designators, an exact segregated-mode table, a numeric preference threshold, and a direct statement of the night restriction. It is explicitly disclaimed as "for use on the VATSIM Network only and should never be adopted for real world use," though it states it adapts NATS AIS content under licence. Treated here as a strong secondary source, not a substitute for the UK AIP, but the only source available that gives the structural detail this pack needs.

Where the two overlap, they agree exactly: the night restriction (05R/23L unavailable 2200–0600L) and the 2025 summer dual-runway hours table are identical between the two documents — real corroboration, not just one document copying the other.

## 1. Basic facts

- ICAO EGCC, Manchester. Time zone Europe/London.
- ARP 532114N 0021630W (53.3539, -2.2750), elevation 257 ft, transition altitude 5000 ft — all from vMATS `GEN 4.1`. Not independently cross-checked against the UK AIP, but this is the document's own geographical-data table, not a secondary aggregator.
- `weatherStation` assumes EGCC reports its own METAR; not separately confirmed.

## 2. Runways

Real-world designators, confirmed by vMATS (both the Figures list and the body text repeatedly name 05L/23R and 05R/23L): 05L/23R is the real-world "Runway 1" (closer to the terminal, CAT II/III ILS per `GEN 3.1`), 05R/23L is "Runway 2" (05R is CAT I ILS only, 23L is non-precision only).

| Runway | Heading (deg) | Threshold (decimal degrees) |
|---|---|---|
| 05L | 51 | 53.3451, -2.2927 |
| 23R | 231 | 53.3624, -2.2571 |
| 05R | 51 | 53.3320, -2.3107 |
| 23L | 231 | 53.3491, -2.2750 |

Headings from SkyVector and MetarCentral (both give 051/231). Thresholds from Sprinkle.com, cross-checked against SkyVector for 05R/23L (matched).

**Open flag — true vs. magnetic heading frame is unresolved.** Sources disagree on which frame 051/231 represents, and none states it explicitly. Unlike Zurich (`docs/LSZH_RUNWAY_RESEARCH.md` §1), this cannot be resolved by comparing two independently-sourced heading sets against each other: Manchester's magnetic variation is only around 1° West, too small a gap to distinguish a true-heading set from a magnetic one by that method. Runway heading must match the reference frame EGCC's own METAR wind directions use (`docs/NEW_AIRPORT_QUESTIONS.md` §2) — this needs confirming against UK Met Office or AIP documentation before the pack's headings can be trusted for anything beyond a rough approximation. Given the ~1° size of the gap, the practical risk of being wrong is small, but it is flagged rather than assumed away.

Displaced thresholds exist in real life (various sources suggest roughly 05L ~1401 ft, 23R ~600 ft, 23L ~604 ft) but sources disagree on the exact figures, and this project's schema has no displaced-threshold field — not recorded.

## 3. Runway-use configuration

**Resolves an apparent contradiction from the MAG pack.** The MAG document's arrivals chart appeared to show both runways receiving arrivals within the same "westerly" month (e.g. 1,697 on Runway 1 vs. 3,125 on Runway 2 in one month), which looked inconsistent with its own claim that dual mode is strictly segregated (one runway arrivals, one departures). vMATS resolves this: the chart is a monthly aggregate across days where the *segregated pairing* is fixed but the *direction* (and hence which physical runway is "arrivals") varies with the wind from day to day — not genuine mixed-mode operation within one configuration.

vMATS `GEN 5.1`/`GEN 5.2.1`/`GEN 5.2.2` give an exact, numeric picture:

| Mode | Arrivals | Departures | Role |
|---|---|---|---|
| `05LAD` | 05L | 05L | Single-runway default, easterly |
| `23RAD` | 23R | 23R | Single-runway default, westerly; preferred over `05LAD` when tailwind ≤5kt and dry (`GEN 5.1`) |
| `05RA05LD` | 05R | 05L | Dual segregated, easterly |
| `23RA23LD` | 23R | 23L | Dual segregated, westerly |

Dual configuration is triggered by: the published hours (below), VATSIM UK events, or "periods of heavy traffic where single runway operations would result in undue delay" — i.e. it is a preference, not a hard eligibility gate outside the published hours, which this pack's soft-penalty banding (see §4) matches.

**No crosswind distinction needed between a pair's two runways.** 05L/23R and 05R/23L are each a single physical strip under two names — crosswind is identical whichever name is active. The only directional choice that matters is tailwind, which `GEN 5.1` gives a number for (5kt, dry) — see §5.

## 4. Time-of-day / day-of-week

**Night (hard rule, fully supportable).** vMATS `GEN 5.2.2`: *"In real-world, the Runway 05R/23L is not available between the hours of 2200-0600L due to local planning constraints."* True every day of the week and every season — the one schedule fact in this pack that isn't day/season-dependent. The MAG pack states the identical restriction independently ("Our planning permission does not allow us to use Runway 2 between 10pm and 6am"). Modelled as an unconditional `allowed: false` for both dual modes in a 22:00–06:00 band.

**Daytime dual-runway hours (soft preference only, and genuinely day/season-dependent).** vMATS `GEN 5.2.1` gives a full table:

| Season | Mon–Fri | Sat | Sun |
|---|---|---|---|
| Summer (1 May–31 Oct) | 06:15–20:00 | 06:15–16:00 | 06:15–09:30, 13:00–20:00 |
| Winter (1 Nov–30 Apr) | 06:30–11:00, 16:00–20:00 | 06:30–11:00 | 16:00–20:00 |

The MAG pack's "From 1st April 2025" table matches the summer weekday/Saturday/Sunday figures exactly — real cross-confirmation, not two documents disagreeing.

`docs/TIME_BASED_RULES.md` (TB-4, TB-5) confirms the engine does **not** support day-of-week or seasonal bands today — the same gap `docs/LSZH_RUNWAY_RESEARCH.md` §4 hit with Zurich's weekday/weekend split. It's worse here: winter Saturday (06:30–11:00) and winter Sunday (16:00–20:00) don't even overlap with each other, so unlike Zurich there is genuinely no single time-of-day window that is safely "dual preferred" under every day/season combination in the real schedule.

**Decision taken for this pack:** use the weekday-summer window (06:15–20:00) as the one representative preference band, exactly as the engine's time-only band model requires. This is a known simplification: it will over-rate dual preference on weekends and in winter relative to the real published table. Flagged here, not silently absorbed. Do not "fix" this by editing the engine — that is the TB-4/TB-5 gap already tracked.

**Runway maintenance — deliberately not modelled.** MAG states Runway 05L/23R closes "three nights" a month for maintenance, with 05R/23L used 22:00–06:00 on those nights as the exception to the standing night rule. vMATS corroborates that the real-world closure exists but gives no fixed cadence, only "a variable schedule." `docs/TIME_BASED_RULES.md` records an explicit owner decision that runway closures and maintenance are out of scope for the engine (OD-19), and the owner this session confirmed: ignore maintenance entirely unless vMATS itself states it as a standing, schedulable rule. It doesn't, so no `05RAD`/`23LAD` maintenance-exception modes were built — they would be dead weight with no way to trigger them.

## 5. Fine-tuning numbers

- **`tailwindDryKt` = 5.** vMATS `GEN 5.1`: "Runways 23L and 23R are preferred when the tailwind component is 5 knots or less and the runway surface conditions are dry." This happens to exactly match the project-wide default used by every pack that hasn't done its own tailwind research (YSSY, YMML, NFFN, etc. all use 5) — a genuine match, not a coincidence of blind carrying-over.
- **`defaultCrosswindKt` = 20**, carried over unchanged, unresearched. Not meaningfully EGCC-specific: see §3 above — crosswind doesn't distinguish between a pair's two runways here, so this is a general safety ceiling rather than a runway-choice input.
- **`trafficBands` — unresearched placeholder, the one figure this project's own `docs/NEW_AIRPORT_QUESTIONS.md` says genuinely needs airport-specific research, not copying.** No declared-capacity source (the equivalent of LSZH's Swiss Slot Coordination figure) was found for EGCC this session. The MAG pack gives only a 2024 daily average (537 movements/day, ~22/hour) — a whole-airport whole-day figure, not a declared per-30-minute runway capacity, and using it to derive bands would look more "researched" than it actually is. The pack therefore carries over NFFN/YBTL's generic placeholder bands (light 0–10, medium 11–20, busy 21+ per 30 min) rather than inventing a bespoke-looking number from a mismatched source. Needs NATS, Manchester Airport's own ACL/slot-coordinator figures, or the UK AIP before this is treated as confirmed.
- **ATIS wording — not found.** vMATS `GEN 3.4` gives the ATIS frequency (121.980 MHz) and who is responsible for it, but no phrasing template. The MAG pack doesn't cover ATC phraseology at all. The pack keeps the project's generic `atisWording` default for schema compatibility; it is not confirmed to describe EGCC's real ATIS style.

## 6. Confidence summary

- **Reasonably solid:** runway designators (05L/23R, 05R/23L) and the segregated-mode table, the night restriction (cross-confirmed by two independent documents), the weekday-summer dual-hours window, the 5kt tailwind preference threshold.
- **Weak / simplified:** daytime dual-preference banding (weekday-summer only; the real table is day/season-dependent and the engine can't express that yet), runway heading true-vs-magnetic frame (small practical risk given ~1° variation, but genuinely unconfirmed), displaced thresholds (not recorded at all, schema gap).
- **Not found:** `trafficBands`/declared capacity, ATIS phrasing template, UK AIP cross-check for any field.
- **Deliberately excluded by owner decision:** runway maintenance/closure modelling (MAG's "3 nights/month" detail), per `docs/TIME_BASED_RULES.md` OD-19 and this session's explicit instruction.

## Sources

- [MAG — Manchester Airport Runway Use Information Pack, Summer Season 2025](https://assets.live.dxp.maginfrastructure.com/f/73114/x/8c7a4f7ea2/web-runway-use-information-pack-2025-update.pdf)
- [VATSIM UK — EGCC vMATS Part 2, Revision 2026/05, effective 25-05-2026](https://docs.vatsim.uk/Aerodrome/EGCC%20%28Manchester%29/Manchester%20%28EGCC%29%20vMATS%20Part%202%20-%202026%2005.pdf)
- SkyVector and MetarCentral EGCC airport pages (headings, 51/231)
- Sprinkle.com EGCC page (decimal threshold coordinates)
- `docs/TIME_BASED_RULES.md` (TB-4/TB-5 day-of-week/season gap, OD-19 maintenance-out-of-scope decision)
- `docs/NEW_AIRPORT_QUESTIONS.md` (project's own new-pack checklist, used throughout)

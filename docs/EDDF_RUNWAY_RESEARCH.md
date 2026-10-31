# Frankfurt (EDDF) runway pack: research notes

31-10-2026. Compiled as the basis for the new EDDF pack (`refdata/airports/EDDF`). Follows the same real-world-only, confidence-labelled approach used in `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md`.

## Sources, and which one wins

One source carries almost all of the operational detail this pack needs, already validated earlier this session and re-confirmed live against it:

- **VATSIM Germany (VATGER) knowledgebase, EDDF Tower page** (`https://knowledgebase.vatsim-germany.org/books/sops-fir-langen/page/eddf-tower`), Revision #11, updated roughly 4 weeks before this session -- the page itself carries no absolute date, which is noted rather than guessed at. Like EGCC's vMATS, this is a VATSIM controller aid, not the DFS eAIP, but it is the only source found this session with the structural detail (exact runway roles, the tailwind preference threshold, the runway 18 tailwind tolerance) a pack needs.

Everything else -- real headings, thresholds, elevation, ARP, declared capacity -- was researched fresh this session from aggregator sites (SkyVector, PilotNav, ch-aviation, Airmate) and DFS/Fraport's own press material, since VATGER does not cover geography or capacity.

## 1. Basic facts

- ICAO EDDF, Frankfurt am Main. Time zone Europe/Berlin.
- ARP 50°01'59.9"N 008°34'13.6"E (50.033306, 8.570444), elevation 364 ft. From a third-party copy of the Frankfurt AIP's own AD 2.2 geographical-data table (via Scribd), not DFS's eAIP directly. Cross-checked against ch-aviation (364 ft) and Airmate (363 ft) -- close enough to treat 364 ft as the working figure, flagged as not independently confirmed from DFS.
- `weatherStation` assumes EDDF reports its own METAR; not separately confirmed.

## 2. Runways (three near-parallel pairs plus one crossing runway)

Real-world designators and lengths, confirmed by SkyVector and airport-data.com: 07C/25C (4,000 m) and 07R/25L (4,000 m) are the airport's two longest east-west runways; 07L/25R, despite sharing the same orientation, is markedly shorter at 2,800 m -- confirmed by two independent sources' own length fields, not a data-entry error on this pack's part. Runway 18 (4,000 m) is the separate north-south strip ("Startbahn West"); VATGER states its reciprocal end (36) is never used operationally, so 36 is omitted from `runways.json` entirely rather than listed as a dead entry with no mode ever naming it.

| Runway | True heading | Threshold (decimal degrees) |
|---|---|---|
| 07C | 069 | 50.032667, 8.534667 |
| 25C | 249 | 50.045167, 8.587000 |
| 07R | 069 | 50.027500, 8.534167 |
| 25L | 249 | 50.040000, 8.586500 |
| 07L | 069 | 50.037000, 8.497000 |
| 25R | 249 | 50.045833, 8.533667 |
| 18  | 179 | 50.034167, 8.526000 |

**Pairing check.** SkyVector's three 07-ends and three 25-ends don't announce which end pairs with which; this was resolved by computing the great-circle distance between every 07/25 combination and keeping the pairs whose distance matches a real runway length (07R-25L and 07C-25C both land on ~3,980 m; 07L-25R lands on ~2,790 m, matching the independently-confirmed 2,800 m length for that one shorter runway -- a genuine cross-check, not an assumption).

**True vs. magnetic heading frame -- resolved, same method as LSZH.** SkyVector gives magnetic headings (068°/248° for the 07/25 trio, 178° for 18/36); PilotNav gives true headings (069°/249°, 179°/359°). The ~1° gap between the two sets is consistent with Frankfurt's small current magnetic variation (low single digits, easterly) -- the same reasoning LSZH's research used to tell a true-heading set from a magnetic one. Separately, international convention (ICAO Annex 3 / WMO: wind direction is coded relative to true, WGS-84 north) and secondhand citations of DWD's own METAR/TAF guidance agree that German METAR wind, like every other country's coded METAR, is reported true, not magnetic -- matching `docs/NEW_AIRPORT_QUESTIONS.md` section 2's requirement that runway heading match the wind-report frame. **This pack therefore uses true headings (069/249/179), not SkyVector's magnetic set.** Not checked against the DFS eAIP itself, and the DWD citation is secondhand (a forum post citing a DWD brochure that was not opened directly) -- flagged, not treated as fully closed the way LSZH's MeteoSwiss citation was.

Displaced thresholds were not researched; the schema has no field for them, same gap noted in both LSZH and EGCC.

## 3. Runway-use configuration

VATGER's EDDF Tower page gives a four-runway, fixed-role picture, not a simple arrivals/departures pair -- Frankfurt genuinely runs all four strips at once, each with its own standing role:

| Runway pair | Role (VATGER) |
|---|---|
| 25C/07C | Departures only, except coordinated emergency or swingover landings |
| 25L/07R | Landing; also departures from the southern apron (including GAT) during low traffic |
| 25R/07L | Landing only; no VFR approaches; banned to A380/B747/DC10/MD11/L-1011 |
| 18 | Departures only; no reciprocal runway (36) in use |

**Modelling choice.** The pack's schema already lets a mode's `arrivals`/`departures` arrays hold more than one runway, so this is modelled as two modes -- one per wind direction -- rather than forcing it into four single-runway modes the way a strict arrivals/departures pair would:

- `25L25RA25C18D` (25-direction / westerly): arrivals `[25L, 25R]`, departures `[25C, 18]`.
- `07R07LA07C18D` (07-direction / easterly): arrivals `[07R, 07L]`, departures `[07C, 18]`.

**Mode id convention.** LSZH and EGCC's runway-coded ids (`14A28D`, `05RA05LD`) assume exactly one runway per role. EDDF needs two runways on each side of some of these, so this pack extends the same convention by concatenating runway names before the `A`/`D` marker: `25L25RA25C18D` reads as arrivals `25L`+`25R`, departures `25C`+`18`. This is a genuine extension of the project's existing convention, not a new naming scheme, and is spelled out here and in `modes.json`'s own description so it isn't mistaken for a typo.

**Deliberately not modelled (all flagged, not silently dropped):**
- The 25L/07R southern-apron/GAT departure exception during low traffic -- VATGER gives no traffic threshold for when this applies, so there's no condition to hang a separate mode or row on. Same class of gap as LSZH's unmodelled per-runway tailwind split.
- The 25C/07C coordinated emergency/swingover landing exception -- a genuine edge case, not a standing operating pattern, and VATGER gives no criteria for it.
- The A380/B747/DC10/MD11/L-1011 ban on 25R/07L -- the engine has no aircraft-class input (the same scope limit `docs/TIME_BASED_RULES.md` records for Berlin's larger-aircraft rule, Christchurch's large-aircraft runway and Helsinki's propeller exemption).
- No VFR approaches on 25R/07L -- not modelled; the engine's approach-ladder mechanism is about cloud base/visibility bands, not VFR-vs-IFR eligibility, and no further detail was sought this session.
- ILS Y preferred for 25R/07L without tailwind during CAT I operations -- VATGER states the preference but gives no cloud-base or visibility figures to build an `approachLadder` row from, so nothing was built here. Flagged as not found, not invented.

**No crosswind limit found anywhere in VATGER (full-document search, confirmed this session).** Both modes fall back to `settings.json`'s `defaultCrosswindKt`, carried over unconfirmed, same as EGCC.

## 4. Time-of-day / day-of-week

**No night-hours restriction found in VATGER (full-document search, confirmed this session), and no time-of-day structure of any kind governs which direction is used.** Direction choice (25 vs 07) at Frankfurt is purely wind-driven: VATGER states "25-direction preferred up to 5kt tailwind component" -- a wind-eligibility fact the engine already captures through `tailwindDryKt`, not something that needs its own time band. There is, in other words, nothing here shaped like LSZH's weekday/weekend split or EGCC's seasonal dual-hours table.

**Decision taken for this pack:** a single `allDay` band with both modes allowed at equal (zero) penalty, per `docs/NEW_AIRPORT_QUESTIONS.md` section 4 and the same engine-option LSZH/EGCC fall back to when a real schedule doesn't fit the band model -- except here the reason is simpler: there's no schedule to not-fit in the first place.

**A note on an apparent conflict with another project document.** `docs/TIME_BASED_RULES.md` (TB-2, TB-6, TB-10, and its "out of scope" section) separately mentions a Frankfurt night ban around 23:00-05:00 and a 133-movements-a-night quota for 22:00-23:00/05:00-06:00, from general web research (Fraport's own noise pages), not VATGER. Read in context, these are read there as a noise/traffic **quota on total movements**, not a runway-use rule, and `docs/TIME_BASED_RULES.md`'s own "Out of scope for now" section already excludes exactly this kind of thing for Frankfurt by name ("Frankfurt's 133 movements a night ... Quotas and caps"). VATGER's own full-document search -- the more operationally detailed, ATC-facing source this pack is built from -- found no runway-specific night restriction. This pack takes VATGER's silence at face value rather than importing `TIME_BASED_RULES.md`'s quota note as a runway rule it was never meant to be; flagged here as a considered reading of a potential conflict, not an oversight.

## 5. Fine-tuning numbers

- **`tailwindDryKt` = 5.** Doubly supported, the same pattern EGCC's research flagged: this is both the project-wide default used by every pack without its own research, and VATGER's own stated figure ("25-direction preferred up to 5kt tailwind component"). VATGER separately states runway 18 is usable up to 15 kt tailwind, with a 10 kt threshold above which it must be broadcast on ATIS and pilots must report if unable to accept it on initial call, and may be closed depending on the volume of "unable" reports received. The schema has only one pack-wide tailwind limit, not a per-runway override (the same gap LSZH hit with its RWY14/RWY28 split), so this pack cannot express runway 18's more generous real-world tolerance -- flagged as a known simplification, not absorbed silently.
- **`defaultCrosswindKt` = 20**, carried over unchanged from LSZH, unresearched. VATGER's full-document search found no crosswind limit at all for any EDDF runway, so this pack-wide fallback is the only crosswind figure either mode has.
- **`tailwindWetKt`** and every other `settings.json` field not named above are carried over unchanged from LSZH's values, exactly as both LSZH and EGCC did for their own unresearched fields, and are described as such in `settings.json` itself.
- **`trafficBands` -- a partial estimate, not a confirmed figure, but not a pure placeholder either.** DFS and Fraport's joint 2025 press release (dfs.de, fraport.com, "DFS and Fraport present refined operational concept...") states a current declared coordinated rate of **104 movements per hour plus a 2-movement tolerance ("104+2")**, with a refined operating concept required once traffic reaches 110 movements per hour -- a genuine, recent, named-source declared-capacity figure, the kind `docs/NEW_AIRPORT_QUESTIONS.md` says this field actually needs. Unlike LSZH's Swiss Slot Coordination figure, though, this one is a **combined** arrivals-plus-departures hourly rate across all four runways, not split by direction -- so turning it into the schema's per-direction, per-30-minute `light`/`medium`/`busy` bands needed one further assumption: a roughly even 50/50 arrivals/departures split (reasonable for a scheduled hub over a full hour), giving about 26-27 movements per 30 minutes per direction, with the `busy` threshold set somewhat above that figure in the same proportion LSZH's bands sit above its own per-direction maximum. This is weaker evidence than LSZH's figure (which had a real direction split from the source itself) but meaningfully stronger than EGCC's (which had no declared-capacity source at all and fell back to a generic placeholder) -- flagged clearly as a partial estimate built from a real but combined figure, not confirmed against DFS/FHKD's own slot-coordination parameters.
- **ATIS wording -- not found.** VATGER's EDDF Tower page does not cover ATIS phraseology. The pack keeps the project's generic `atisWording` default for schema compatibility; it is not confirmed to describe EDDF's real ATIS style.

## 6. Confidence summary

- **Reasonably solid:** the four-runway fixed-role picture and the 25-direction/07-direction split (VATGER, re-confirmed live this session), the 5 kt tailwind preference threshold (doubly supported), runway designators/lengths and the 07/25 end-pairing (cross-checked by distance against independently-confirmed lengths), the true-vs-magnetic heading resolution (supported by both the SkyVector/PilotNav gap and WMO/ICAO convention, though the DWD-specific citation is secondhand).
- **Weak / simplified:** `trafficBands` (a real combined declared-capacity figure, but split 50/50 by assumption, not by source data), the runway-18 tailwind tolerance (15 kt real limit, collapsed into the pack-wide 5 kt figure -- a known understatement of 18's margin, the same shape of gap LSZH flagged for RWY14/RWY28), crosswind (no source found at all, pack default used).
- **Not found:** `defaultCrosswindKt`/any EDDF-specific crosswind figure, ATIS phrasing template, a DFS eAIP cross-check for any field, cloud-base/visibility thresholds for the stated ILS Y preference on 25R/07L.
- **Deliberately excluded, with reasons given above:** the southern-apron/GAT departure exception on 25L/07R, the coordinated emergency/swingover landing exception on 25C/07C, the heavy-aircraft ban on 25R/07L, VFR-approach eligibility, and the night-movement quota found only in `docs/TIME_BASED_RULES.md` (read as a quota, not a runway rule, and out of scope by that document's own stated policy).

## Sources

- [VATSIM Germany (VATGER) knowledgebase -- EDDF Tower](https://knowledgebase.vatsim-germany.org/books/sops-fir-langen/page/eddf-tower), Revision #11 (no absolute date on the page), re-confirmed live this session -- primary source for runway roles, the 5 kt/25-direction preference, the runway-18 tailwind tolerance, and the absence of a crosswind limit or night rule.
- [SkyVector EDDF](https://skyvector.com/airport/EDDF/Frankfurt-Main-Airport) -- magnetic headings, decimal-minute thresholds, runway lengths.
- [PilotNav (Dauntless Aviation) EDDF](https://www.pilotnav.com/airport/EDDF) -- true headings, cross-check coordinates for runway 18.
- [airport-data.com EDDF](https://airport-data.com/world-airports/EDDF-FRA/) -- runway length cross-check.
- A third-party copy of EDDF AD 2.2 (Scribd) -- ARP coordinates, elevation, reference temperature.
- [ch-aviation EDDF](https://ch-aviation.com/airports/1438) and Airmate EDDF -- elevation cross-check.
- [DFS -- "DFS and Fraport present refined operational concept to maintain stable and sustainable operations at Frankfurt Airport in future"](https://dfs.de/homepage/en/media/press/2025/04-06-2025-dfs-and-fraport-present-refined-operational-concept-to-maintain-stable-and-sustainable-operations-at-frankfurt-airport-in-future/) and the matching [Fraport release](https://www.fraport.com/en/newsroom/press-releases/2025/q2/dfs-and-fraport-present-refined-operational-concept-to-maintain-.html) -- the 104+2 movements/hour declared-capacity figure.
- A Windy community forum thread citing DWD's METAR/TAF brochure, and general WMO/ICAO Annex 3 citations -- true-north METAR wind convention (secondhand on the DWD-specific point).
- `docs/TIME_BASED_RULES.md` -- the separate general-web-research document whose Frankfurt night-ban/quota notes this pack deliberately does not import as a runway rule (see section 4).
- `docs/NEW_AIRPORT_QUESTIONS.md` -- this project's own new-pack checklist, used throughout.
- `docs/LSZH_RUNWAY_RESEARCH.md` and `docs/EGCC_RUNWAY_RESEARCH.md` -- the template packs this one follows for structure, tone and confidence labelling.

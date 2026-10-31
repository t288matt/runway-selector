# Dubai International (OMDB) runway pack: research notes

31-10-2026. Rebuild of the OMDB pack after the previous build's files were lost (deleted before commit) in this session. Re-researched from scratch — nothing below is copied from the lost build without being re-verified against a live source in this pass. Follows the same real-world-only, confidence-labelled approach used in `docs/LSZH_RUNWAY_RESEARCH.md`.

## 1. Basic facts

- ICAO OMDB, IATA DXB, Dubai International Airport, UAE. Time zone `Asia/Dubai` (UTC+4, no DST) — agreed by every source checked.
- Elevation: 62 ft (19 m) AMSL — Wikipedia, SkyBrary, SkyVector's ARP figure and a 2015 operator pilot-information sheet (Luxaviation/EAG) all agree on 62 ft; airport-data.com is an outlier at 59 ft. Not checked against the UAE GCAA AIP itself.
- Airport Reference Point: **25.2498°N, 55.3710°E** (Sprinkle.com / LFS Flight Support). This value sits almost exactly at the geometric midpoint of the four runway thresholds found below (~25.2503, 55.3727) — what an ARP should do. Wikipedia/SkyBrary instead give 25°15'10"N 55°21'52"E (25.2528, 55.3644), which coincides almost exactly with the **12R threshold** coordinate rather than a sensible midpoint. OurAirports has its own (resolved) problem report stating its 12R/30L coordinates were wrong in their database — the Wikipedia/SkyBrary figure looks like the same bad coordinate propagating elsewhere, not a second independent ARP measurement. The Sprinkle/LFS value is used here as the more geometrically plausible figure, but this is reasoning from internal consistency, not an AIP confirmation — flagged.
- METAR wind frame: no UAE-specific GCAA AIP source was found confirming true vs magnetic for OMDB METARs (unlike LSZH, where MeteoSwiss's own documentation gave a direct answer). This pack falls back to the universal ICAO Annex 3 convention — METAR wind direction is reported relative to **true** north everywhere, absent an airport-specific override — and uses true runway headings below to match. This is a generic-convention assumption, not a UAE AIP confirmation; flagged as a gap, same honesty standard as LSZH's.

## 2. Runways (two parallel pairs)

| Runway | True heading | Magnetic heading (not used) | Threshold (decimal degrees) |
|---|---|---|---|
| 12L | 121° | ~119° | 25.264617, 55.350414 |
| 30R | 301° | ~299° | 25.247683, 55.38095 |
| 12R | 121° | ~119° | 25.252828, 55.364369 |
| 30L | 301° | ~299° | 25.235914, 55.394875 |

Sources: Pilotnav.com (true headings 121.4°/301.4°, decimal-degree thresholds) cross-checked against an independent web search aggregation of Sprinkle.com's figures, which agree to 4 decimal places on every threshold. SkyVector separately gives 119°/299°, which are ~2° off the Pilotnav true figures — matching the 2015 Luxaviation/EAG pilot-information sheet's statement that magnetic variation at OMDB is "2° East." That gap is the same pattern LSZH's research used to tell a true-heading source from a magnetic one, and supports reading SkyVector's figures as magnetic. **Not checked against the UAE GCAA AIP charts.** Runway lengths and displaced-threshold distances vary noticeably between sources (12L/30R given as both ~4,351 m and ~4,000 m by different documents) — not needed by this pack's schema, but flagged as a reminder that any of these secondary sources could be stale.

## 3. Runway-use configuration

Source: IVAO XG (Gulf Cooperation Council region) "Dubai SOP," Rev 1.0, section 3.2 "Runway Selection" (owner-supplied verbatim text, confirmed in an earlier session):

> "In Dubai airport the main Runway for Departure is 30R and for Arrival is 30L. These Runways will normally be used unless otherwise according to Wind Component which has been mentioned before. Otherwise normally Runway 12L use for Arrival and Runway 12R for Departure."

**Re-confirmation attempt this session:** direct fetches of both `wiki.xg.ivao.aero/en/home/Dubai-SOP/Full` and `xg.ivao.aero/wp-content/uploads/2023/07/DXBbriefing.pdf` returned HTTP 403 in this session — the source could not be re-opened directly. A web search did independently return a crawled summary of the same wiki page's content, stating: "the primary departure runway is 30R and primary arrival runway is 30L ... these runways normally used unless wind dictates otherwise, otherwise 12L for arrivals and 12R for departures" — which matches the owner-supplied text's substance. That is the best re-confirmation obtainable this session; the exact verbatim wording quoted above rests on the earlier session's confirmation, not a fresh direct read.

So this pack's two modes:
- **`30LA30RD`** (preferred): arrivals 30L, departures 30R.
- **`12LA12RD`** (reciprocal): arrivals 12L, departures 12R, used "according to Wind Component" per the SOP.

**Dual-30 operations (not modelled):** other secondary sources (a Jeppesen-based operator aerodrome briefing, summarised via web search) mention that 30L and 30R are sometimes operated simultaneously as a dual-runway configuration, with ILS preferred on 30R and a vacate-left instruction for 30L arrivals. No clear switching criteria or thresholds were found for this configuration, so it is not modelled as a third mode — flagged as a real-world nuance this pack simplifies away, consistent with the project's existing practice of not inventing modes without a sourced trigger.

### Wind threshold — IMPORTANT SOURCING CAVEAT

The IVAO SOP's exact wind-threshold wording (owner-supplied, confirmed in an earlier session):

> "When the crosswind component, including gusts, exceeds 28 km/h (15 kt), or the tailwind component, including gusts, exceeds 9 km/h (5 kt) the Air Traffic Controller shall be calculated and selected the Runway according to current situation."

This wording — including the km/h-to-knot conversions — is **near-verbatim identical** to a real ICAO paper: **ATM SG/10-IP/4, "A Model for Optimal Runway Selection,"** presented by Saudi Arabia to the MIDANPIRG ATM Sub-Group's 10th meeting, Jeddah, 20–23 Oct 2024 (https://icao.int/MID/Documents/2024/ATM%20SG10/IP4.pdf). That ICAO document is **generic Middle East/ICAO-MID regional guidance — Dubai is never named in it.** The 15 kt crosswind / 5 kt tailwind figures used in this pack's `settings.json` (`defaultCrosswindKt`, `tailwindDryKt`) are therefore cited as **a real, citable ICAO-MID regional benchmark that this VATSIM-family source also applies to Dubai — not confirmed as Dubai's own officially published threshold.** This is the same honesty standard LSZH used for its non-AIP sourcing (see LSZH §3, tailwind figures), applied here to a case where the apparent primary source turns out to be quoting a different, unnamed, regional document.

## 4. Operating plan (time of day)

No time-of-day structure was found in any source — the SOP's own wording frames the choice entirely around wind component, not the clock. This pack therefore uses a **single all-day band**, same pattern as YSSY's post-curfew-removal plan: `30LA30RD` is the baseline preference (penalty 0), `12LA12RD` is kept allowed at all times with a modest preference penalty reflecting its description as "otherwise" / the wind-driven fallback, not a scheduled alternative.

## 5. Declared capacity (for `trafficBands`) — NOT FOUND, PLACEHOLDER ONLY

Dubai Airports' slot coordinator, Airport Coordination Limited (ACL, a Level-3-airport coordinator under the Worldwide Airport Slot Guidelines), publishes seasonal capacity-declaration packs (W24, S23, W25 schedule-coordination packs, etc.). This session's PDF fetches of several of these (e.g. the W25 pack) returned only binary/compressed stream data, not extractable text, so no current, airport-specific R60 (movements/60 min) figure could be read.

Secondary figures found, neither treated as a real declared-capacity source:
- A 2015 ACL policy document cites a peak declared runway capacity of **62 movements/hour** — now a decade old, pre-dating later capacity-enhancement work, almost certainly stale.
- An undated news article (The National) quoting a Dubai Airports executive gives "on average 37 arrivals and 41 departures per hour" (**78/hour combined**) — a secondary, non-primary figure with no date or methodology given.

**Per the LSZH/EGCC convention for a number that could not be pinned down: this pack does not fabricate an OMDB-specific `trafficBands` figure.** `trafficBands` is left at the same generic placeholder scale used for an unresearched pack (light 0–10, medium 11–20, busy 21+ per 30 minutes — the same bands YSSY started from), flagged explicitly in `settings.json`'s description as **not researched for OMDB and very likely too low** — the two secondary figures above (62/hour and 78/hour) both suggest OMDB's real "busy" threshold per 30 minutes is well above 20. This is a known gap, not a confirmed value, and should be replaced with a real ACL declaration figure if one can be sourced and read in a future pass.

## 6. ATIS wording

No Dubai-specific ATIS phrasing template was found or searched for in depth this session (out of scope given the other gaps above). `atisWording` uses the project's generic default, same as LSZH, flagged as unresearched for OMDB specifically.

## 7. Confidence summary

- **Reasonably solid:** runway true headings and thresholds (two independent aggregator sources agreeing closely), elevation (multiple independent sources agreeing), time zone, the SOP's preferred/reciprocal runway pairing (owner-confirmed verbatim text, independently corroborated in substance by a search-engine crawl of the same source).
- **Weak:** ARP coordinates (reasoned from internal geometric consistency rather than a primary source; the alternative Wikipedia/SkyBrary figure looks actively wrong); magnetic variation (one 2015 secondary source only, not cross-checked against a current model); true-vs-magnetic METAR convention (generic ICAO rule, not a UAE-specific confirmation).
- **Not found / placeholder:** `trafficBands` (no current, readable, airport-specific declared-capacity figure — placeholder flagged as likely too low); OMDB-specific ATIS wording; dual-30 simultaneous-runway criteria; a confirmed-current magnetic variation value.
- **Sourcing caveat carried through, not silently dropped:** the SOP's 15 kt/5 kt wind thresholds are a real ICAO-MID regional figure (ATM SG/10-IP/4) that the SOP applies to Dubai without Dubai being named in the original document — treated throughout as a regional benchmark, not a Dubai-specific AIP figure.

## Sources

- IVAO XG "Dubai SOP" Rev 1.0, §3.2 "Runway Selection" and its wind-threshold wording (owner-supplied verbatim text, confirmed in an earlier session; direct re-fetch of `wiki.xg.ivao.aero/en/home/Dubai-SOP/Full` and the XG briefing PDF returned HTTP 403 this session)
- ICAO MIDANPIRG ATM Sub-Group 10th meeting, ATM SG/10-IP/4, "A Model for Optimal Runway Selection" (Saudi Arabia, Jeddah, 20–23 Oct 2024) — https://icao.int/MID/Documents/2024/ATM%20SG10/IP4.pdf — source of the real 15 kt/5 kt regional benchmark the SOP's wording echoes
- Pilotnav.com OMDB page (true headings, decimal-degree thresholds)
- SkyVector OMDB page (headings read as magnetic, ARP in degrees/minutes)
- Sprinkle.com and LFS Flight Support OMDB pages (ARP, thresholds, cross-check)
- Wikipedia / SkyBrary OMDB pages (elevation; also the source of the suspect ARP figure, see §1)
- 2015 Luxaviation/EAG "Pilot Information — Dubai (OMDB)" sheet (elevation, magnetic variation figure; PDF body not machine-readable this session, so this is from web-search summarisation of the document, not a direct read)
- OurAirports OMDB problem report #114/114 (12R/30L coordinate error, resolved) — https://ourairports.com/airports/OMDB/problem-reports/114.html
- ACL (Airport Coordination Limited) DXB capacity-declaration packs (W24, S23, W25, 2015 policy doc) — acl-uk.org — figures could not be extracted as text this session; see §5
- The National, undated article quoting a Dubai Airports executive on average hourly arrivals/departures — secondary figure, see §5
- `docs/LSZH_RUNWAY_RESEARCH.md`, `docs/EGCC_RUNWAY_RESEARCH.md` (this pack's structural and honesty-about-gaps template)

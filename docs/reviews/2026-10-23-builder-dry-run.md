# Builder dry-run review: condensed record

Status: record of a read-only dry-run build on 23-10-2026 by an independent agent acting as builder, after OD-10 to OD-23. Condensed from its report (about 580 lines). Nothing here has been applied to the documents. U-numbers are the builder's references for undefined points.
Language: British English. Dates DD-MM-YYYY.

Verdict: about 70 to 80 per cent of the app can be built from the documents. The engine core, pack loader and validator, and the optimiser (including its worked example) are buildable. Not buildable without answers: the YSSY operating-plan content, about 9 settings with no default, the rule for known versus unknown demand, slot alignment, the weather source, the early-change and confidence logic, and the explanation text.

## What was done
1. Wrote the module list, TypeScript types (AirportPack, WeatherSlot, TrafficSlot, Cell, Plan) and the engine signature, marking every field it could not define.
2. Hand-built a YSSY pack and a tiny TEST pack against section 5a. TEST used a half-hour time zone and a single-runway variant to try to expose hidden assumptions.
3. Worked six scenarios by hand: tailwind 4.9 versus 5.1 kt; wet 0.1 kt; METAR rain with TEMPO and PROB40 TEMPO showers and a 60 minute drying time; capacity set versus known and unknown demand; the DESIGN 6D worked example with the current mode set and not set; a curfew band across midnight and a daylight-saving day. It also worked variable wind.
4. Listed the questions it would need answered before each tracker item.

## Findings by theme
- **Slot grid (U1).** Not defined: clock-aligned half-hours or "from now", which slot contains now, and extra TAF-boundary slots against a 30-minute penalty model. Builder would cut the extra boundary slots and the configurable slot length.
- **Near-limit margin (U3).** "Dry 4.9 kt eligible" could be SUITABLE or MARGINAL depending on an unspecified margin. Builder asks whether the margin exists, and what "eligible" means for MARGINAL.
- **METAR and TAF "disagree" (U4).** A no-op as written; delete or redefine. The METAR window boundary slot (inclusive or exclusive) is unspecified.
- **Demand (U10, U11).** With departures known only for the next slot, the capacity check is ill-defined. Builder's recommendation: skip the check when either side is unknown. A hard capacity can empty the mode list on a busy evening once capacities are filled in. "On the ground elsewhere" cannot be decided without an airport database; builder suggests groundspeed and altitude tests with pack values. `trafficAreaNm` is unused; `elevationFt` is missing.
- **Early change and confidence (U15, U17).** OP-7 has four conditions; DESIGN 6E has one. A plan that leaves a mode that never fails would qualify as "early". Confidence has no algorithm.
- **Settings layering (U8) and the audit trail.** Engine input lists both refdata and settings; the pack already holds settings. DESIGN says pack changes are audited; RD-6 and OD-23 say they are not.
- **Pack content.** The YSSY operating plan (bands, penalties, curfew content) is not in the documents and cannot be invented; builder proposes a placeholder plan with equal penalties, marked provisional.
- **Where TEST lives.** DESIGN puts it under `refdata/airports/TEST`, which would show an airport selector to the owner if `app.json` lists it.
- **Worked example.** The DESIGN 6D example matches only when the current mode is not set. With the current mode set to Mode 10, Plan 1 wins at medium traffic (16 against 18). The text should state which case it shows.
- **Variable wind.** VRB above calm is judged at the worst direction, which makes every mode fail. Direction ranges need the maximum of cos and |sin| over the interval, evaluated at the endpoints and critical angles.
- **Curfew and daylight saving.** Band lookup from a UTC instant through `Intl` works; the end of the band should be exclusive; no test oracle is stated.
- **Process.** The working agreement (issue, worktree, independent review, `Reviewed-by` lines) is the largest schedule risk for a one-person local build.

## Contradictions and stale text it found (selected)
TEST location; settings model; audit scope; early-change definitions; change penalty names (low/significant/very high against light/medium/busy); slot length treated as configurable; TAF-change slots; OD-14 residue in the section 13 text and UP-4; DB-9 "ordered list" against pack penalty numbers; UI text for the dropped narrow layout, demonstration mode, panels E and G, and the 20-slot default; OP-3 per-mode outputs not computed in DESIGN 6C; OP-10 "over-water preference" and "changeover guidance" with no data representation; METAR persistence into slots 2 and 3; the safety-net NO SUITABLE MODE message against the owner's Q6 view; tracker rows stale; provider names still in DESIGN 4b and the UI.

## Tests it could not write (expected result unspecified)
Dry 4.9 kt eligible; the METAR and TAF blend; capacity with unknown demand; the preference-against-resilience scenario without numeric penalties; "small wind changes" and "stable weather keeps the mode" with no current mode set; the early-change banner; confidence; explanation text; stale-data cell effect; the forecast wind-shift scenario; UI acceptance checks.

## Build order, cuts, size
- Order: skeleton, loader and validator, TEST pack and literal check; wind, runway state and eligibility; the optimiser with the worked example; weather fetcher, parsers and slot builder; minimal UI (header, Panel A, timeline, Panel C); traffic and Panel D; settings drawer, audit trail, Panel F.
- Cuts suggested (none reverses an owner decision): non-uniform TAF-boundary slots; configurable slot length; the Scheduler interface; the "disagree" rule; `trafficAreaNm`, runway `group`, threshold coordinates; confidence (replace by one derived line); trend; the unknown-demand penalty path until demand semantics are set; timeline extras for v1 (busy band, wet band, wind-shift arrows, jump to now, keyboard grid, table view); drawer editing of the operating plan; cache-hash URLs; METAR decode beyond wind and weather; per-process overhead for phase 1.
- Size: about 5,500 lines of TypeScript source (about 4,500 with the cuts), about 2,500 lines of tests, about 600 lines of JSON. Highest risk: the weather source and TAF parsing; the demand model; a YSSY pack the builder cannot fill; the process overhead; the early-change and confidence logic specified twice.

## The 10 questions the builder most needs answered
1. Slot grid: clock-aligned half-hours, slot 1 contains now, fixed 30 minutes, no TAF-boundary slots; what is "the next slot" for departures.
2. May the YSSY operating plan ship as a placeholder with equal penalties; what are the curfew rules.
3. Defaults for marginalPenalty, unknownDemandChangePenalty, noModePenalty, defaultPreferencePenalty, changeoverPreparationMinutes, the precipitation code list and the numeric ranges.
4. A near-limit margin (so 4.9 kt is MARGINAL) or none; may the "disagree" rule be deleted.
5. Capacity check when departures are unknown: skip (recommended) or run on arrivals alone.
6. Phase 1 weather source: raw text parsed in-house, fetched through a dev-server proxy, with a no-proxy METAR as backup.
7. Settings layering: pack defaults merged with UI overrides; confirm the operating plan is not editable in the UI.
8. How "on the ground elsewhere" is decided; what `trafficAreaNm` and `elevationFt` are for.
9. YSSY headings: true or magnetic, exact values; is SODPROPS enabled; Mode 4's shape.
10. Early change and confidence: adopt one definition, or drop both for v1.

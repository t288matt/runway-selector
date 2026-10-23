# Opus re-review of the design set: condensed record

Status: record of a read-only re-review on 23-10-2026, after the simplification pass and OD-10 to OD-23. Condensed from the reviewer's report. Finding IDs are the reviewer's. "Open" means no owner decision or edit has been made yet; nothing here has been applied to the documents.
Language: British English. Dates DD-MM-YYYY.

Verdict: much tighter than the first review, but not yet buildable without guessing.

## Critical
| ID | Finding | Minimal fix |
|---|---|---|
| CR-1 | The METAR and TAF blend contradicts itself and the slot-1 wet rule. "Governs" and "worse of the two" are different rules; "marked MARGINAL if they disagree" cannot apply if the worse status is UNSUITABLE, and "disagree" is undefined; under worse-of, a TAF base group with rain would make slot 1 WET, against WC-12; nothing says whether METAR rain carries into slot 2. | One rule: inside the METAR window the METAR decides the status and the runway state; if the TAF would make the mode worse, the cell is MARGINAL. Delete "worse of the two" from OD-17, WX-7 and DESIGN. |
| CR-2 | Departure demand is known only for the next slot, so traffic level, capacity and change penalties are undefined from slot 2. | A slot is known if its arrivals are known; departures after the next slot are marked "not estimated"; the capacity check uses known demand as a lower bound. (Builder recommended the opposite: skip the check when either side is unknown.) |
| CR-3 | Runway headings must be in the same reference as METAR and TAF wind. METAR and TAF winds are true; official headings are magnetic; a roughly 12 degree error moves a 20 kt wind component by about 4 kt, close to the 5 kt dry limit. | Keep OD-11 (no conversion in code) but state that `headingDegrees` must be entered as a TRUE heading, converted once by hand in the pack. NOTE: the owner has decided that wind and heading are the same reference (OD-11); this finding asks only that the pack author enter the heading in the wind's reference. |

## High
| ID | Finding | Minimal fix |
|---|---|---|
| H-1 | The worked example in DESIGN 6D gives the wrong winner: with busy traffic only at slot 5 the true optimum is an early change at slot 4, total 15. | Correct the text, or make slots 4 to 8 busy. |
| H-2 | Unknown slots planned through at no penalty can recommend a mode with no weather at all, against the UI "No data" state. | If slot 1 weather is UNKNOWN, show no recommended mode; planning through later UNKNOWN slots stays allowed. |
| H-3 | Variable wind above the calm threshold is judged at the worst direction, which makes every mode fail (VRB04KT wet, VRB06KT dry). | Choose: say plainly that VRB above calm is a full tailwind on every runway and test it, or make it MARGINAL. |
| H-4 | Opposite-direction modes plus a curfew band that uses `allowed: false` will often give NO SUITABLE MODE on wet curfew nights. | In the YSSY curfew band give non-curfew modes a high preference penalty instead of `allowed: false`, or accept and test the outcome. |
| H-5 | The demand model counts landed aircraft; `elevationFt` is missing from the schema; "on the ground elsewhere" is undefined; `trafficAreaNm` is unused; "next slot" is ambiguous. | Add `elevationFt`; define on the ground (below `groundMaxSpeedKt`), at the airport (within `trafficAreaNm`), elsewhere (outside it); an aircraft on the ground at the airport counts only as a departure with that origin; say which slot is next. |
| H-6 | No complete settings inventory: no name or default for the near-limit margin, the no-mode penalty, marginal and change penalty fields, `demandHorizonMinutes`, precipitation codes, recalculation interval, audit cap, `defaultPreferencePenalty`, `assumedDepartureWindowMinutes`, `assumedGroundSpeedKt`, `metarValidityMinutes`. Breaks OD-6. | One table in DESIGN 5a: name, file, unit, default, range, shown in drawer. |
| H-7 | The value shape is defined three ways (section 5 example, 5a, trafficBands); records that RD-7 says need a description have no field; section 5's file table duplicates and differs from 5a. | One shape; `description` and optional `source` and `status` on modes, runways and plan rows; delete the section 5 file table. |
| H-8 | An enabled mode with no runways would show green everywhere (Mode 4). | Validator: an enabled mode needs at least one runway end; empty lists only when disabled. |
| H-9 | Settings layering is undefined (where drawer edits are stored, reload behaviour, orphaned values, reset); the drawer edits an "ordered list" that cannot express penalties and `allowed: false`. | Effective value = pack default overridden by a per-airport stored value; drop orphans on reload; penalties and the plan are edited in pack files only; state which tunables appear in the drawer. |
| H-10 | UI says missing demand turns cells UNKNOWN (NO DEM); the design says uncertain only. Panel D and tracker YR-9 still say 30 and 60 minutes. | Remove NO DEM; show estimates up to the demand horizon. |

## Medium (condensed)
- M-1 Crosswind formula is signed; use the absolute value.
- M-2 The near-limit MARGINAL rule is undefined and fights the boundary tests; delete it, or name it and default it to 0.
- M-3 Slot alignment and extra TAF-change slots distort per-slot penalties; use :00 and :30 slots only.
- M-4 Survival treats a gap as failure; the optimiser plans through UNKNOWN; survival should stop at the first UNSUITABLE slot only.
- M-5 The no-mode state has no penalty and no change rule.
- M-6 The early-change test has no baseline when the replaced mode never fails; run a second optimiser pass with changes forbidden before the failure; suppress the banner when demand is unknown at the change slot.
- M-7 METAR and TAF edge cases (missing METAR, which TAF, expired TAF, SPECI, rollover, METAR older than its window) need a report-selection table.
- M-8 Confidence and trend have no algorithm; drop confidence or define both.
- M-9 "What change would restore a mode" needs a home: show the failing rule with the limit and the observed value.
- M-10 Capacity as a hard limit can block every mode during events; add a scenario with an accepted outcome.
- M-11 Test scenarios use Sydney values but run on TEST; write them relative to the pack's limit and give each an ID mapped to a requirement; missing tests for calm and tolerance, the METAR window, the current mode, UNKNOWN planning, demand, audit, airport switching, schema refusal, lint, input caps.
- M-12 DESIGN wrongly says pack changes are written to the audit trail.
- M-13 Tracker gaps: no rows for SEC-1 to SEC-3 and SEC-6, owner-supplied Sydney figures, UI wireframe redraw; stale YR-1, YR-9, YR-12, YR-10; YR-2 depends on YR-17.
- M-14 UI text stale beyond the wireframes (E and G rows, narrow layout, ACT row, demonstration mode, 20-slot default, BECMG dots, "three runway lines", UTC-or-local option against Q7).
- M-15 RD-3 "restrictions" has no field; make it free text or delete it.
- M-16 Process documents cite a section 12 that does not exist, branch `main` (the repository branch was `master`, now `main`), a missing `docs/README.md`, and an uncommitted original brief.

## Low (condensed)
Ordering of OD and requirement rows; stale status lines; removed terms still present (hysteresis, relay, cost, OP-6 level names, OP-10 "verified"); Sydney wording in generic text; AG-13 missing from "AG-1 to AG-12"; review-record resolution columns out of date; process-document contradictions (re-running tests, writer model, tier table has no new-behaviour row); noise-sharing promised but not expressible; runway diagram fallback; pack hash source; first-load "previous valid pack"; feed licence credit line; SEC-3 bounds unwritten; no `aria-live`.

## Agnosticism and extra criteria
- Generic text still carries Sydney facts (purpose line, WX-5, DB-9, DESIGN time zone wording, "three runway lines").
- The rule vocabulary is simple and buildable but cannot express noise quotas, wind-dependent preference, holidays, visibility or ceiling configurations, aircraft-type rules or runway dependencies (excluded by OD-19).
- What breaks first on a US airport: heading reference (CR-3); configuration by ceiling and visibility; inHg and statute-mile parsing; US TAF style; capacity depending on weather; quota noise rules; metres-per-second winds (parser must normalise to knots).
- The TEST pack plus the literal check is necessary but not enough: TEST has two runways, there is no single-runway fixture, though AG-7 promises one.
- Tunables in refdata: not yet (H-6). RD-7 cannot be enforced as written (H-7).
- Buildable from the documents alone: no (brief not committed, no README, blend and demand ambiguous, settings layering undefined).
- Least-bad mode: the empty state no longer names one; H-2 is a back door.
- Audit trail (RD-6): adequately specified apart from the two contradicting sentences and the unnamed cap.

## Status of the earlier findings
Resolved: C-1, C-2 (but see H-3, H-4), H-1, H-3, H-6, H-8, H-9, H-11, H-12, H-13 (but see CR-3), M-8, M-9, M-13. Partly resolved: C-3, C-4, C-5, H-2, H-4, H-7, M-1, M-3, M-7, M-10, M-11, M-12, M-19. Still open: H-5, H-10, H-14, H-15, M-2, M-4, M-5, M-6, M-14 to M-18.

## Top 10 fixes proposed
1. One rule for the METAR and TAF blend (CR-1). 2. Define known demand (CR-2). 3. Heading reference in the pack (CR-3). 4. Correct the worked example (H-1). 5. No recommendation when slot 1 has no weather (H-2). 6. Decide VRB handling and the YSSY curfew band (H-3, H-4). 7. Fix the demand geometry (H-5). 8. One settings inventory and one value shape (H-6, H-7). 9. Validator rule for empty modes, settings layering, delete the pack-change audit sentences (H-8, H-9, M-12). 10. One cleanup pass on the UI, tracker, review records, section references and README.

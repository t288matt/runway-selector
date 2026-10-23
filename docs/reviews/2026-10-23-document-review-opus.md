# Independent document review (Opus): condensed record

Status: record of a review on 23-10-2026 of the whole design set (REQUIREMENTS, DESIGN, UI_DESIGN, TRACKER, WORKING_AGREEMENT, TEAM_ROLES, TEAM_BRIEFS). The reviewer was read-only and independent. This is a condensed record of its findings and fixes; "Resolution" notes what the owner has decided since. Finding IDs are the reviewer's.
Language: British English. Dates DD-MM-YYYY.

Verdict: well organised but not yet buildable. The schema and rule vocabulary, the optimiser cost model, the demand model and the METAR and TAF blend were undefined.

## Critical
| ID | Finding | Suggested fix | Resolution |
|---|---|---|---|
| C-1 | RD-4 "only verified modes are recommended" blocks every recommendation, because every Sydney mode is provisional; the design silently ignored the rule. | Recommend enabled modes and label provisional ones. | Owner decided (OD-10): every mode in a pack is treated as verified and approved; status is information only. |
| C-2 | Wet 0 kt tailwind, worst-direction variable wind and floating-point noise will often leave no mode; opposite-direction modes always carry a tailwind on one end. | Calm threshold for VRB, a comparison epsilon in refdata, a rule for opposite-direction modes, tests. | Owner decided (OD-12, WC-11): `calmWindKt` and `limitToleranceKt` are pack values. No special rule for opposite-direction modes; each runway judged on its own. |
| C-3 | The optimiser cannot be built as written: no cost formula or weights, no rule for UNKNOWN cells, no initial or terminal state; the "lower mode number" tie-break contradicts AG-4. | A cost-model subsection: formula, named weights with defaults in settings, explicit DP state, initial state, tie-break on a pack-defined `order` field, one worked example. | Open. Design section to be written. |
| C-4 | The pack schema and the generic operating-plan rule vocabulary are not defined (no field list, no rule kinds, no hard or soft tagging, no day-type or holiday definition). | A schema document with every field, a closed list of rule kinds tagged hard or soft, and the Sydney and TEST packs written against it. | Open. Must precede tracker item YR-5. |
| C-5 | Nothing says how forecast slots blend the METAR with the TAF (which governs slot 1, how long, TAF base group, AMD/COR/CNL/NIL, future validity, month rollover, trend groups). UI_DESIGN gives two different cut-offs. | A "slot weather source" rule with values in refdata, worst-case in overlaps marked MARGINAL, fixtures. | Open. Design section to be written. |

## High
| ID | Finding | Suggested fix |
|---|---|---|
| H-1 | BECMG: marking the window MARGINAL when either end state fails lets the optimiser enter a mode that fails today's weather. Precipitation inside BECMG is missing from the wet rules. | Failing either state is UNSUITABLE for entering; MARGINAL only for staying in a mode that passes the start state. |
| H-2 | Forecast wet-runway rules are ambiguous: `PROB40 TEMPO` matches two rules; METAR rain with manual DRY can show green; precipitation codes unlisted; drying clock is per wet spell; a TEMPO shower never starts the drying clock; a manual WET makes every future slot wet; no rationale for the 40 percent and 60 minute defaults. | Specify precedence; mark slot 1 MARGINAL when METAR shows rain and the manual state is DRY; list codes in refdata; run the drying clock in the wet branch; define manual WET as wet until precipitation ends plus drying time (or ask the owner); record rationale. |
| H-3 | Capacity: units differ (per hour, per 30 minutes), it is hard in one place and soft in another, all Sydney capacities are null, and the cause table disagrees. | Capacity per mode as arrivals and departures per hour; shortfall on estimated demand is MARGINAL plus cost; UNSUITABLE only above a refdata ratio on observed demand. |
| H-4 | Traffic beyond 60 minutes is unknown, yet avoiding changes in busy traffic needs it. The demand estimation method is thin (prefiled flights, slot assignment of ground departures, distance method, trend window). | A demand-model section with thresholds in the pack, an explicit fallback for unknown future demand, a trend window, and an acknowledgement that pre-emptive changes beyond 60 minutes rest on an assumption. |
| H-5 | UI contradicts itself on a VATSIM outage: capacity skipped (Panel D) versus slots grey with cause NO DEM (section 7). | Capacity skipped with an uncertainty marker; status comes from weather. |
| H-6 | "Recommended now" is ambiguous between the target mode and the slot-1 mode of the plan; the mockup shows the difference. | Panel A shows the slot-1 mode of the optimal sequence; the planned change is a separate field. |
| H-7 | Changeover planning (E) can disagree with the optimiser (D) on the change time; tie-breaks and the early-change test are undefined. | Derive changeovers only from the optimiser's path; benefit = cost of the forced-change plan minus cost of the chosen plan, above a refdata minimum. |
| H-8 | Plan stability (F) is undefined and can display an outdated plan; the hysteresis margin is used with two meanings. | Build stability into the optimiser through the stay preference and always show the newest plan, or define the hold metric under its own name. |
| H-9 | Pack loading does not work from local files; a browser cannot know who edited a file. | Choose one mechanism and document it; log pack-content-hash changes with actor unknown. |
| H-10 | Settings edits and pack defaults have no layering model (where UI edits are stored, reload behaviour, orphaned overrides, reset). | Pack defaults, then a per-airport override store with schema version, then effective values; reconcile on reload. |
| H-11 | The audit trail (RD-6) is one line: no record format, actor, retention, export or tamper note. | A record schema, a retention cap, JSON export, a test that each setting path writes an entry. |
| H-12 | No visibility, ceiling or approach-availability constraints; many airports choose configurations by them. | Generic per-mode weather constraints evaluated in eligibility. |
| H-13 | Wind reference (true or magnetic) open and foundational. | Resolved by the owner (OD-11): wind and runway heading share one reference; no conversion. |
| H-14 | The documents are not self-sufficient: "as in the brief" references, a missing docs/README.md, no docs/reviews/, no source extract for the 2015 table. | Commit the brief, create the README, store citations with URL and access date. |
| H-15 | No traceability: many requirements (WC-9, WC-10, RD-6, AG-8, AG-10, WX-6, UP-1 and others) have no test or tracker row; several "done when" lines are untestable. | A requirement-to-design-to-test-to-tracker matrix, IDs on the scenarios, new tracker rows. |

## Medium (condensed)
- M-1 Descriptions are stripped before the UI, which needs them as help text: emit a separate metadata object.
- M-2 The RD-7 examples break RD-7 and RD-2 (no wrapper, `_status` stripped, free-text status, "tunable" undefined): one canonical leaf shape.
- M-3 About 15 tunables have no refdata home or default (near-limit margin, penalties, stale limits, demand horizons, VRB rule, epsilon, confidence algorithm, trend window, history length, precipitation list); tie-break order is in code; "30-minute slot" is fixed in requirements text: a complete settings inventory table.
- M-4 The literal check gives false positives on short ids and misses limits, times and URLs: an AST-based check on string literals and a ban on unexplained numeric literals.
- M-5 The TEST pack is weak proof: add a single-runway fixture, property tests over random valid packs, and a paper exercise with a real second airport.
- M-6 Confidence (HIGH, MEDIUM, LOW) has no algorithm.
- M-7 Time handling gaps: slot alignment, midnight and DST nights, band tiling applies only to preference tables, IANA zone only.
- M-8 Aircraft-class qualifiers have no engine semantics.
- M-9 The per-mode tailwind override is untraced; make it a dry and wet pair or remove it.
- M-10 Crosswind needs an absolute value; tailwind and crosswind should both use the stronger of mean and gust.
- M-11 Data-feed terms, personal data, a poll floor, the fallback source and content-security policy are absent.
- M-12 No `schemaVersion` or `packVersion` on packs and no migration policy.
- M-13 Eligibility stops at the first failure, so the hover cannot show every reason: evaluate all checks and keep all reasons.
- M-14 The tier table has no row for new behaviour.
- M-15 Process documents contradict each other (re-running tests, writer model, branch names).
- M-16 "Phase 1" means two things; Stage 1 research is not truly done.
- M-17 UI body text still specifies the narrow layout, demonstration mode, a 20-slot default and local time not always shown, contrary to the owner answers.
- M-18 Timeline rows reorder with each recommendation, against the stable mental map rationale.
- M-19 The optimiser tests have no oracle; the TEST pack should fix the weights and each scenario state its expected sequence.

## Low (condensed)
AG-13 left out of cited ranges; section order 4, 4c, 4a, 4b; module list against TC-2; dependency list against package.json; runway diagram geometry fallback; one runway condition for the whole airport (state as an assumption); explanation templates have no home; contrast figures correct but `--bad` is close to 3:1; no `aria-live` or grid semantics; process overhead is heavy for a one-user local tool.

## Agnosticism and extra criteria
- Sydney, Australian and VATPAC wording remained in the purpose, WX-5, DB-9, DB-1, TC-4, Panel F and the notice text; units are embedded in key names; the schema cannot express aircraft-class wind limits, per-end limits, quota-style noise rules, runway dependencies, holiday rules or timed closures. Expect a schema revision for a real second airport.
- The pack schema is not defined well enough to build (C-4). Pack versioning is not covered (M-12). TEST plus the literal check is not enough proof (M-4, M-5).
- Tunables in refdata: not yet (M-3). The RD-7 rule is neither consistent nor enforceable as written (M-1, M-2). Buildable from documents alone: no (H-14, C-3 to C-5, H-4, H-9). Tracker coverage incomplete (H-15).
- Accessibility is strong; the safeguards are present but the notice text was hard-coded in the UI document.
- Q6 contradiction: the UI empty state still named a least-bad mode. Resolved by the owner (OD-13): never name one; show the blocking cause per mode and what would restore a mode.

## Top 10 fixes proposed
1. Resolve RD-4 (done, OD-10). 2. Write the pack schema and rule vocabulary. 3. Specify the optimiser cost model. 4. Define VRB, calm and epsilon handling (done, WC-11). 5. Define the METAR and TAF blend. 6. Fix BECMG and wet-runway precedence. 7. Write the demand model and make capacity consistent. 8. Derive changeovers from the optimiser; define "Recommended now"; settle plan stability. 9. Settle pack loading (done), overrides, versioning and the audit-record schema. 10. Commit the brief, create the README, add a traceability matrix; correct stale UI text.

# Tracker

Kept by the manager. Local IDs `YR-n` until GitHub issues exist (issue first, then the row). Dates DD-MM-YYYY.

| ID | Item | Tier | Status | Done when |
|---|---|---|---|---|
| YR-1 | Requirements, design, UI design, working agreement, team roles and team briefs | Low | Written 22-10-2026, amended 23-10-2026 (many owner decisions, OD-8 to OD-28); awaiting owner approval | Owner approves the seven documents in docs/ |
| YR-2 | Test whether the VATSIM feed accepts browser requests (the weather browser test is deferred to the automation phase, OD-28) | Low | Not started | Result recorded in DESIGN.md |
| YR-3 | Find how tools are published on vatpac.org (path, subdomain or link), who maintains it, theme and notice | Low | Deferred to the publication phase (owner, 22-10-2026). Known so far: /tools shows a "flight simulation only" notice behind an accept button and a dark navy theme | Publishing route, constraints and contact recorded |
| YR-15 | UI design by a specialist UI designer: docs/UI_DESIGN.md and a static mockup | Low | Mockup approved by the owner 22-10-2026: keep it, thin out the data later | Owner approves the layout and the timeline design |
| YR-17 | Weather provider choice for automatic fetching | Low | Deferred to the automation phase (OD-28); research recorded in docs/reviews/2026-10-23-weather-provider-research.md; free providers only | A provider and fallback chosen, browser access confirmed or a proxy designed |
| YR-18 | Security review of the design (documents only): untrusted input (pack JSON, imported settings, feed data), output encoding of `description` help text, browser storage tampering, CSP and static hosting, third-party feeds and CORS, npm supply chain, personal data in the VATSIM feed (names, CIDs), audit-trail integrity, relay risks if one is added | Low | Report received 23-10-2026: docs/reviews/2026-10-23-security-review.md; owner adopted SEC-1 to SEC-6 (REQUIREMENTS.md section 18) | Ranked findings, each with a concrete abuse scenario and a fix; owner decides which to adopt; accepted fixes written into DESIGN.md |
| YR-19 | Security requirements SEC-1 to SEC-3 and SEC-6 built and tested (fixed notice, text-only rendering lint, input limits and refusal, personal data dropped) | Medium | Not started | Each has a failing-then-passing test or CI check |
| YR-20 | Owner supplies Sydney data: runway headings, operating plan and curfew rules, mode capacities, penalty figures | Owner | Open | Pack files updated and marked verified or corrected |
| YR-21 | Redraw the UI wireframes in UI_DESIGN.md (remove Panels E and G, add the weather entry boxes) | Low | Open | Section 3 matches ui/mockup.html |
| YR-22 | Library research: METAR and TAF decoding libraries | Low | Done 23-10-2026: docs/reviews/2026-10-23-metar-taf-library-research.md; owner chose metar-taf-parser (OD-29) | None |
| YR-4 | Project skeleton, CI, GitHub repo | Low | Not started | Empty app builds; `npm test`, `tsc`, ESLint run in CI |
| YR-5 | Airport-pack schema and loader with cross-reference validation; Sydney (YSSY) pack (a provisional draft exists in refdata/airports/YSSY; modes and runways from the 2015 table; operating plan is a placeholder; settings with `description` on every value) | Medium | Not started | Packs validate; every rule has source and status; no airport constants in code |
| YR-16 | Fictional TEST airport pack and the check that fails the build if an airport fact appears in `src/` | Medium | Not started | Full scenario suite passes on YSSY and TEST; literal check runs in CI |
| YR-6 | Engine core: wind maths, runway condition, eligibility matrix, survival | Medium | Not started | Dry 4.9 and 5.1 kt, wet 0.1 kt, wet headwind, wet-possible state, calm and tolerance scenarios pass |
| YR-7 | Optimiser and changeover planner, explanations | Medium | Not started | Remaining scenarios from REQUIREMENTS.md section 11 pass |
| YR-8 | Weather decode adapter around metar-taf-parser (OD-29) and the 30-minute slot builder, with a fixture set of 30 to 50 real reports | Medium | Not started | NIL TAF, unit conversion, FM inheritance, RE group and dropped-group warnings handled; FM, BECMG, TEMPO, INTER, PROB30/40, VRB and month rollover tested on real strings; the library is imported only in the adapter |
| YR-9 | VATSIM traffic model and traffic bands | Medium | Not started | Demand model of DESIGN.md section 7: arrivals timed from distance and speed, aircraft on the ground elsewhere spread over 30 minutes, departures in slot 1, class from refdata bands, unknown beyond the horizon |
| YR-10 | Dashboard: weather entry boxes, recommendation, survival timeline, weather, traffic, diagram | Medium | Not started | The recommendation and timeline come from one engine output; hover shows the figures behind each cell; the built page matches ui/mockup.html in structure |
| YR-11 | Settings screen, current-mode pull-down, audit trail behind the Store interface | Low | Not started | Setting change triggers new plan and an audit entry |
| YR-12 | Aviation data analyst check and owner live run | Medium | Not started | A set of hand-worked cases (pasted METAR and TAF plus expected cell statuses) agrees with the tool; the owner judges the advice sensible on a real METAR and TAF pasted in |
| YR-13 | Publication on vatpac.org (future phase, after local use) | High | Deferred; needs YR-3 and the owner's go | Live, with the notice, security check done |
| YR-14 | Owner to supply the current Sydney LTOP documents (optional) | Owner | Open | Rules re-marked verified or corrected |

# Review: PR 81, probability groups shown as bars (issue 82, OD-80)

Date: 25-10-2026. Reviewer: an independent agent (blind: the issue and the diff only). Tier: Medium.

**Verdict: APPROVE WITH FIXES.** The engine path was found sound: no route is left by which a PROB30 or PROB40 group changes a cell or the runway state, plain TEMPO and INTER still count, and a plain PROB group with rain at or above the threshold still makes the slot WET. No airport fact was added. No test was weakened.

| # | Finding | Action |
|---|---|---|
| 1 | docs/DESIGN.md "Result per cell" still named PROB as a MARGINAL cause | Fixed |
| 2 | docs/UI_DESIGN.md listed PROB as a MARGINAL cause and described the events strip without bars | Fixed; a "Group bars" row added |
| 3 | Header comment in src/engine/runwayCondition.ts and a comment in src/engine/types.ts described the old rule | Fixed |
| 4 | A group's bar crossed a gap in coverage and bars were keyed by text alone | Fixed; a new bar starts after a gap; key includes the start slot; test added |
| 5 | `aria-label` on a role-less div; the PROB bar looked the same as a TEMPO bar | Fixed: `role="group"`; PROB bars have a dashed border |
| 6 | The render and the busy-band offset are not tested (only `eventStripHeight` is) | Not changed: offset checked by reading and in the live app |
| 7 | `status.ts` still maps an OVERLAY cause of kind PROB to "PROB", now unreachable | Left in place: dead but harmless |

Criterion 3 of the issue (old and new differ only where a TAF holds a PROB group) was not checked by the reviewer; it was proved by the author on 99 fixture runs, see the PR body.

## Re-review of the fix commit (343182c)

Reviewer: a second independent agent, on the diff of that commit only. **Verdict: APPROVE WITH FIXES.** One finding: when the same group text is listed twice in one slot, the bar test `seen.end === i - 1` failed and a duplicate bar with a duplicate key was drawn. Fixed in the next commit (`>= i - 1`); the test "draws one bar when the same group text is listed twice in one slot" fails without the fix. The rest (contiguous case unchanged, lane order, gap test would fail without the gap handling, unique keys, no airport facts) was found sound. The one-operator fix itself has not had a third review.

# Review: PR 85, marginal cells drawn green (issue 84, OD-81)

Date: 25-10-2026. Reviewers: two independent agents, each blind (the issue and the diff only). Tier: Medium.

## First review (commits b843f88 to 6886cb6)

**Verdict: APPROVE WITH FIXES.** The colour is chosen in one place; nothing in the diff touches the engine, scoring, the plan or the cell detail text; the accessible name still says "marginal"; no airport fact was added; no test was weakened.

| # | Finding | Action |
|---|---|---|
| 1 | README, UI_DESIGN (`--warn` row, legend row overflowing its box), the mockup and a REQUIREMENTS image caption still described marginal as amber stripes; a comment in status.ts said "its stripes say it" | Fixed |
| 2 | The legend swatch was plain green with no word | Fixed: it holds a sample word |
| 3 | No test covered the new legend entry, nor a marginal cell keeping its corner and word at render level; one test title was stale | Fixed |
| 4 | Panel A's weather class still carried the stripe class | Fixed: `STATUS_STYLE.MARGINAL` now uses the suitable class. Panel A renders only text, so no stripe was ever drawn there |
| 5 | The detail chip and cause box stay amber | Kept: owner decision, 25-10-2026 |

## Second review (commits 6ae02e4 and 74a6f41)

**Verdict: APPROVE WITH FIXES.** The detail chip and cause box stay amber, `.cs-marginal` is unused, no duplicate swatches.

| # | Finding | Action |
|---|---|---|
| 1 | A redundant special case for MARGINAL was still in `cellView` (the builder's report said it was removed; the manager checked the file and it was not), so a revert test guarded the override and not the table | Fixed in fdb217c; 17 tests fail if the table is reverted to a stripe class |
| 2 | A render assertion compared `cause.slice(0, 2)` with the cell text | Fixed: it now checks the exact short cause word |
| 3 | The sample word overflowed the 22 px legend swatch | Fixed: that swatch has auto width; checked in a browser, 38 px wide with no overflow |

The fix commit fdb217c (three files, six lines changed in code and tests) has not had a third review.

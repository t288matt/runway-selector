# Review record — PR #147 (issue #146): runway picture end labels and wind arrow kept clear of the strips

Date: 26-10-2026. Tier: Low (display-only; src/engine and src/weather untouched). Reviewer: independent agent, blind (issue and diff only, no author report), briefed on this PR's history of two earlier false "fixed" claims so it verified the two load-bearing claims itself rather than trusting the description.

**Verdict: approve.**

**The two claims this PR rests on, both independently verified:**
- The Liang-Barsky segment/box intersection math in `segmentHits` (src/v2/model/diagram.ts) is correct: hand-traced against the textbook algorithm on a hit case and a miss case, sign conventions checked, no off-by-one.
- `REAL_PACKS` in `tests/v2/pictureAsphalt.test.tsx` lists exactly the 11 real airport packs on disk (`ls refdata/airports`), matching what `npm run check-literals` independently enumerates.

**Other checks, all pass:** the wind arrow's bearing (`from`) is never mutated in `placeArrow`, only a perpendicular offset and radial distance; `placeEndLabel`'s `anchor` is fixed, only distance and turn are searched; `data-used`, the ARR/DEP text and the gust format are unchanged; no airport facts added outside the packs; the "Also suitable" wording shortening is a documented, intentional bundled change (TRACKER.md YR-42), not scope creep.

**Tests that catch a revert:** `the active-end ARR/DEP labels overlap no runway strip...` and `the wind arrow does not cross any runway strip...` (pictureAsphalt.test.tsx) — both assert real geometry against the rendered positions, across 36 wind directions on all 11 real packs.

**Minor, non-blocking findings:**
1. `WindArrow.labelX/labelY/labelAnchor` are still computed from the old fixed r=92 formula, not the placeArrow-adjusted tail. Confirmed dead (Picture.tsx only reads `windLabel.x/y/anchor`) — harmless now, a stale-field trap for later.
2. `placeArrow`'s own clearance search still samples at 1-unit radial steps rather than exact math — the same bug class this PR fixed for labels. Provably safe only because distance-to-segment is 1-Lipschitz and `ARROW_SAFETY_MARGIN` (2) exceeds the 1-unit step; that invariant isn't stated or tied together in code, so it's fragile if either constant is retuned later.

**Not read (cap):** tests/fixtures/TEST(1), engine/planHelpers.ts, full Picture.tsx.

**Riskiest assumption:** the Lipschitz safety margin for `placeArrow` is implicit, undocumented and untested as an invariant.

**Summary for the owner:** both prior false "fixed" claims were about exactly these two mechanisms (fixture coverage, sampling gap) — both verified independently here, by hand-traced math and a direct directory listing, not by trusting the PR description. Trust this one.

# Review: PR 151 (issue 150) — copy ATIS text on click

**Verdict: approve.**

## What was checked
- `gh issue view 150` and `gh pr view 151 --json body` for the frozen wording and scope; the diff matches both exactly (no mode name, text from the pack's own `arrivals`/`departures` arrays, parallel-pair merge, "and"/comma joining).
- Full diff read: `src/v2/model/atisText.ts`, `src/v2/copy.ts`, `src/v2/model/answer.ts`, `src/v2/components/Answer.tsx`, `src/v2/v2.css`, `tests/v2/atisText.test.ts`, `tests/v2/copyClick.test.tsx`, and the README/DESIGN/TRACKER updates.
- The grouping/joining logic (`runwayWords`, `joinAnd` in `atisText.ts`) walked by hand against all 11 real `refdata/airports/*/modes.json` files (not just YSSY/YMML): every real runway string matches `^(\d{1,2})([LCR]?)$` (NFFN, YBCS, YBTL, YMML, YPAD, YPDN, YPPH, YSCB, YSWS all single-digit-pair runways with no suffix; YBBN and YSSY use L/R only — no airport uses C). The regex and suffix-sort order (`['', 'L', 'C', 'R']`) handle all of them correctly; an unrecognised name is kept verbatim (tested with `'H1'`).
- Confirmed by script that no real pack's mode has arrivals and departures that are the *same set* of runways listed in a *different order* (see riskiest assumption below).
- `tests/v2/atisText.test.ts` runs the formatter over every mode of every real pack and asserts the runways named in the output equal the pack's own arrays exactly (`runwaysIn` + `sortedUnique`), and that the text never contains the mode id — this is the AG-1/no-drop guard the issue asked for.
- AG-1: `npm test`'s `check-literals` step passes; no airport fact is hard-coded (`atisText.ts` is pure, takes arrays as input).
- Accessibility: mode and chips are real `<button type="button">` elements with `aria-label="Copy ATIS text for <mode>"`, keyboard-operable by default (native button), not a `div` with an onClick.
- "Also suitable" chips: `Answer.tsx` wraps each alternative in the same `CopyButton`, carrying `alt.copyText` from `answer.ts`'s `alternatives` array — covered by `copyClick.test.tsx`'s assertion that `texts.slice(1)` equals every alternative's `copyText`.
- No regression: `data-testid="mode"`, `"alt-chip"`, and the "Recommended mode X" aria-label are preserved; the PR body and my own `npm test` run show all 2775 tests pass, not just the new ones.
- Clipboard fallback: `copy.ts` tries `navigator.clipboard.writeText` then falls back to a hidden `textarea` + `execCommand('copy')`; both paths and both failure modes (no clipboard + no document, clipboard rejects + no document) are exercised in `copyClick.test.tsx`.
- Ran `npm test`, `npm run typecheck`, `npm run lint` in the worktree myself (CI was still pending at review start, pass 28s by the end) — all green locally too.

## Findings
None blocking. One low-severity note:

- **`src/v2/model/atisText.ts:30-35` (low, latent, not currently reachable).** `runwayWords` re-sorts each number's suffixes into a fixed order, so `atisText(['16L','16R'], ['16R','16L'])` correctly collapses to `"16L and R for ARR and DEP"`. But when a mode's arrivals and departures contain the *same set of distinct runway numbers* listed in a *different order* (e.g. arrivals `['07','16']` vs departures `['16','07']`), the flat word list is built in first-seen order per array, so the two strings would differ (`"07 and 16"` vs `"16 and 07"`) and the formatter would wrongly pick the "ARR. ... DEPS" form instead of "for ARR and DEP". I confirmed by script that no mode in any of the 11 real packs has this shape today, so it's not a live bug, but it's a gap in the "merge when same runways" guarantee that a future pack could trip. Test that would fail if reintroduced regression hits it: none exists — worth a follow-up test and fix (sort distinct-number groups too, not just suffixes within a group) if the owner wants it tightened, but it doesn't block this PR against its stated scope.

## Verified
Wording rules, pack-array guard test, accessibility (real buttons + aria-labels), chip copy support, no regression to existing tests/aria-labels, clipboard + fallback paths, AG-1 (no hard-coded airport facts), all 11 real packs' runway-name shapes against the regex, CI green on 06f0018, local test/typecheck/lint all pass.

## Could not verify
Live rendering at 375x812 and 1280x720 — I did not open a browser; the CSS change (`.copy`, `.mode-btn`, `.copied` absolutely positioned) looks plausible for not growing the layout (matches the PR author's own claim of a DOM-measured check), but I did not measure it myself. Real-phone clipboard permission behaviour (PR author also flags this as untested).

## Riskiest assumption
That a mode's `arrivals` and `departures` arrays, when they represent the same runway set, will always list the shared numbers in the same relative order across the two arrays — true for every mode in all 11 real packs today, but not enforced anywhere, so a future pack authored with reordered arrays could silently get the wrong joining word ("ARR./DEPS" instead of "for ARR and DEP") with no number dropped or added.

## Owner summary
Approve — the formatter is pure, driven only by each pack's own runway arrays, and is proven correct across every mode of all 11 real airports plus the explicit YSSY/YMML examples from the issue; buttons, aria-labels and the clipboard fallback are all tested, and CI, tests, typecheck and lint are green. One low-severity, not-currently-reachable gap noted above (same-runway-set-different-order between arrivals and departures) is worth a follow-up test but doesn't block merge.

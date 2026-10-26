# Review: PR 138, approach type chip (issue 99)

26-10-2026. Independent reviewer: one Sonnet 5.5 agent, blind (issue 99 and the diff only, not the builder's report). Tier Medium. Branch `approach-type`, tip 7189800 at review time. CI on that tip: pass.

**Verdict: approve.** Nothing blocking. Two optional tidy-ups and one item to confirm by eye.

## Findings, ranked

1. **Low (hides a chip that could show).** `src/weather/ceiling.ts`, `approachCloudBaseOf`: `if (layers.some((cl) => cl.baseFt === null)) return undefined;`. For `SCT010 BKN///` with visibility 6000 the known 1,000 ft base already decides "instrument", but the result is unknown, so no chip. `VV002 FEW///` also ignores a known vertical visibility, unlike `ceilingOf`. Safe direction (it hides, never shows wrongly) and rare. Suggested fix: take the minimum of the known bases and vertical visibility, and return unknown only when that list is empty and a layer has no height.
2. **Low (design note).** `src/engine/approachType.ts`, `approachRowFor`: "the first row not ruled out must be certain" is conservative, not exact. A ladder whose first two rows have the same chip text but different limits returns nothing when only one value is known. It never shows a wrong chip. For Sydney's ladder every case was walked and is correct.
3. **Low (validator).** `src/refdata/crossCheck.ts`: an unused ladder, a ladder on a disabled mode, and a bound that can never match (`above: 15000`) are accepted silently. Harmless.
4. **Info (not verified by the reviewer).** The "no scroll at 375x812 and 1280x720" rule is not proven by any automated test. A long mode id plus the chip may wrap and add about 30 px. The builder reports checking `INSTR THEN IVA` beside `34AD25` at 375 wide: one row, page height unchanged. The manager has not repeated that check.

## Verified by the reviewer
The full source diff and the data file; CI; test names and boundary tests; the row picker by reading (above is strict, atLeast inclusive, below strict, atMost inclusive; no cloud passes lower limits and fails every upper limit); schema strictness, ids, label rules, empty rows refused, `{}` bounds refused, both-lower and both-upper refused, lo greater than hi refused; no airport words in engine or weather code; the ceiling, minima and LAHSO code untouched; the chip is a text node through the shared popover with `tabIndex=0` and an `aria-label`, no wrapper when nothing shows. No tests were run by the reviewer (about 8 tool calls).

## Not verified by the reviewer
Browser scroll and wrap at the two sizes; popover tap and keyboard detail; the decoder (CB/TCU, `///` forms); the docs diffs; the full body of the new test files; the popover inside a flex wrap.

## Test that fails if the feature is reverted
`tests/engine/approachType.test.ts` ("cloud base above 3000 is the top row; exactly 3000 is the middle row") and `tests/v2/approachChip.test.tsx` ("is beside the mode name, in words"). Two assertions are weaker than their titles suggest: "never uses the word ceiling" and "does not change the recommendation".

## Riskiest assumption
That the decoder gives a null base only for baseless layers and converts hundreds of feet the same way as `ceilingOf`.

## Summary for the owner
- The chip logic is right at every boundary and hides itself whenever the weather is unknown.
- The other 10 airports behave as before, and CI is green.
- Before merging, look at a narrow phone screen with a long mode name; the rare "cloud with no height" tidy-up is optional.

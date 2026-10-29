# Review: PR 156 -- ATIS wording moves to pack data (issue 154)

**Verdict: Approve.**

## What was checked against the frozen spec (issue 154 body + design-review comment, 29-10-2026)

1. **Required, no default.** `AtisWordingSchema` (src/refdata/schema.ts) is a `v.strictObject` with all five words required; `ModesFileSchema.atisWording` has no `v.optional`. `parsePack.ts` reads `modes.atisWording.rwyWord` etc. directly, no `??` fallback anywhere. A new test (`tests/refdata/parsePack.test.ts:497-504`) proves a pack with `atisWording` deleted is refused, naming `modes.json` / `atisWording`. Confirmed.
2. **Byte-identical real output.** All 11 real `refdata/airports/*/modes.json` files add the identical block `{RWY, FOR, ARR, DEPS, AND}` (owner-sourced, 29-10-2026). `tests/v2/atisText.test.ts:137-151` ("byte-identical to before this change") covers YSSY 07A16D, YSSY 34AD25, YMML 16A27D and YMML 34A27AD against the known pre-change strings, and CI is green on these. Confirmed, not just spot-checked by eye.
3. **TEST vs TEST1 vs real, airtight distinctness.** TEST uses `{STRIP, TO, LANDING, TAKEOFF, PLUS}`; TEST1 uses `{TRACK, VIA, INBOUND, OUTBOUND, WITH}`; every real pack uses `{RWY, FOR, ARR, DEPS, AND}`. All three sets are pairwise disjoint word-for-word -- a defaulting bug could not pass by coincidence. Confirmed.
4. **`parsePack.ts` mapping step.** Present at lines 194-201, named `atisWording`, spreads `...prov(modes.atisWording)` for provenance, matching the `approachLadders` pattern. `crossCheck.ts` untouched, correctly (no cross-references to validate).
5. **Both `answer.ts` call sites.** Line 128 (each `alternatives` entry) and line 141 (the main mode) both pass `pack.atisWording`. Grepped `atisText(` across `src/` and found exactly these two call sites plus the definition -- no third site missed.
6. **`andWord` genuinely plumbed.** `joinAnd` and `runwayWords` in `atisText.ts` take `andWord` as a parameter; grep for hardcoded `RWY`/`FOR ARR`/`DEPS`/`'AND'` in `atisText.ts` hits only comments, never code.
7. **No airport fact or literal reintroduced** outside packs/fixtures -- `atisText.ts`, `answer.ts`, `parsePack.ts`, `schema.ts`, `types.ts` carry no ICAO codes or airport-specific strings.
8. **README.md and docs/DESIGN.md** both updated (field table, validator-checks paragraph, "what the engine receives" paragraph, and the phase-1 closed-screen paragraph) to describe the wording as pack data.
9. **`check-literals`** untouched, correctly -- the words were never airport facts, so AG-11's static check is unaffected either way.
10. **Tracker commit 487ff1d** touches only `docs/TRACKER.md` (1 file, 2 insertions, 1 deletion) -- confirmed docs-only, no further review needed under the docs-only rule.

## CI
`gh pr checks 156` reported the single `check` run as **pass** (44s) on commit 487ff1d. Did not re-run `npm test`/`typecheck`/`lint` locally since CI was green, per instructions.

## Test that would catch a revert
`tests/v2/atisText.test.ts` -- `'uses a different pack's own wording, not a hardcoded one (AG-13)'` (asserts `atisText(['07'], ['16L','16R'], {rwyWord:'STRIP', ...})` equals `'07 TO LANDING. STRIP 16L PLUS R TO TAKEOFF'`). If the wiring or the words were reverted to the old hardcoded strings, this would produce `'07 FOR ARR. RWY 16L AND R FOR DEPS'` instead and fail. The TEST/TEST1 fixture-driven `describe.each(REAL)` block would also fail for any pack whose JSON wording differs from the hardcoded default (though today no real pack does).

## What was not verified
- Did not execute the test suite myself (relied on green CI for 487ff1d).
- Did not check every one of the 11 real packs' full mode lists byte-for-byte by hand beyond the four named in the task plus the automated "byte-identical" test; relied on the automated test plus visual diff confirming all 11 files use the identical, unchanged word set.
- Did not review `crossCheck.ts` or `check-no-airport-literals.mjs` source in depth -- confirmed only that they are untouched in the diff, which is the correct outcome per the issue.

## Riskiest assumption
That CI's single green `check` run actually executes `npm test`, `typecheck` and `lint` (not verified by reading the workflow file) -- if the workflow only runs a subset, a regression in an unexercised path could still be hiding.

## Owner summary
Approve: the design review's five refinements (required/no-default, distinct TEST/TEST1 wording, named `parsePack.ts` mapping, both `answer.ts` call sites, DESIGN.md update) are all present and correctly wired. Real-pack output is proven byte-identical to before the change. CI is green; no literals or airport facts leaked into code.

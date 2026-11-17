# Review: PR 184, saved pack for repeat visits (issue 183)

Date: 04-11-2026. Reviewer: independent agent (blind: issue and diff only). Tier: Medium, full review. Verdict: **approve with fixes** (one decision for the owner, finding 1).

## Findings
1. **Medium. A refused fresh pack is silent.** `src/v2/App.tsx`, `afterFreshInitial`, the `!r.ok` branch keeps the saved copy. If a pack correction is rejected (schema, cross-reference) or 404s, the operator keeps the old rules for up to 24 hours with no sign; before this change they got the error screen. DESIGN says "no error" on purpose. Reviewer recommends a small non-blocking line for the validation-refused case only. New UI, so an owner decision.
2. **Low.** `loadInitialPack` clears the stored airport choice on any failure (pre-existing); offline with a saved copy of another airport on screen, it now forgets that airport.
3. **Low.** A withdrawn airport's saved copy is never cleared; a deep link to it shows the saved copy for up to 24 hours before the fresh load replaces it.
4. **Low.** Reload data can be overwritten by a slower initial fetch (`replacePack` effect in `src/v2/useController.ts`); window of seconds.

## Verified by reading
Validation on read uses `parseAppConfig` and `parsePack` plus the size, depth, forbidden-key and strict-schema guards; copies are per airport and a wrong-airport pack is refused (AG-8); expiry is `>=` 24 hours, future-dated copies are cleared, clock is `deps.now()`; throwing storage never throws; a late fresh pack for the old airport cannot replace the new one; fresh-fetch guards untouched; no airport facts added; DESIGN claims checked are true of the code; new test file passed 30 of 30 in a throwaway worktree.

## Mutation strength
Expiry check removed: two tests fail. Future-date guard removed: one fails. Validation on read: not independently confirmed (the reviewer's mutation broke compilation); by reading, three named tests would fail.

## Not verified
CI (trusting CI, not independently confirmed), real-browser behaviour, storage quota. Riskiest assumption: silent staleness for up to 24 hours is acceptable.

# Independent review: PR #92, prefiles count in the next 30-minute slot

Date: 25-10-2026
Branch: `prefile-next-slot` (2 commits: e536c58, de445be), diffed against `main` with `git diff main...prefile-next-slot`
Issue: #91
Tier: Medium (traffic levels feed the engine)
Reviewer: independent agent. No source, test or git state was changed.

**Note on state:** `gh pr view 92` reports the PR as MERGED, while its body says "Not merged; the owner merges." The review is therefore of merged code. Fixes below need a follow-up branch off `main`, not a push to this branch.

## Verdict

**Approve with fixes.** The core arithmetic is sound and the next-slot rule works as the issue describes. Two things need correcting before the owner relies on the change: the PR body's old-versus-new claim is wrong, and the feature can show a known zero for next-slot departures when no prefile data was received or was stale.

## Checks run

| Check | Command | Result |
|---|---|---|
| Unit and integration tests | `npx vitest run` | 52 test files passed, 2035 tests passed, 0 failed (matches the PR body's count) |
| Typecheck | `npm run typecheck` (tsc on `tsconfig.json` and `tsconfig.node.json`) | Completed with no errors reported |
| Lint | `npm run lint` (oxlint `--deny-warnings` on src, tests, scripts, vite.config.ts; plus banned-import check) | Clean; `check-banned-imports: OK` |

No test was run against a mutated copy, so every "would still pass if reverted" statement below is inferred from reading the tests and the wiring, not from a mutation run.

## Ranked findings

### 1. High: the no-prefile case changes, and the PR body says it does not

- Where: `src/traffic/demand.ts:156` (slot 1 departures becomes `prefileDepartures`, which is `0` when there are no prefiles, instead of `null`). `src/ui/model/panels.ts:328` and `:333` (Panel D shows `0 (prefiled)`). `src/ui/model/panels.ts:440` (the cell text loses its "arrivals only" note).
- The PR body says: "With no prefiles in the feed, nothing changes." This is false. The test at `tests/traffic/demand.test.ts` ("with no prefiles, the next slot has a departure count of zero, not unknown") asserts the change directly.
- Failing scenario: a normal feed with no prefiles. Before, the +30 min column read "not est." and movements read "N (arrivals only)". After, it reads "0 (prefiled)" and "N". A user reads that as a known zero departures in the next half hour, which the data never established.
- Engine numbers do not move in this case. `evaluateCell` computes `knownDemand = arrivals + (departures ?? 0)`, so a zero adds nothing. The change is visible in Panel D, the cell detail text, and the `departures` figure carried into reasons. Those are old-versus-new differences the PR body does not list.
- Fix: keep `departures` as `null` when the feed carried no prefile data (distinguish "key absent or feed not read" from "read, zero found"), or list this in the PR body and get the owner's sign-off on showing a known zero. Either way, correct the PR body.

### 2. Medium: prefiles are dateless and survive a failed or stale feed

- Where: `src/ui/model/dashboard.ts:61` (`applyFeedResult` keeps `previous.prefiles` on failure), `src/ui/model/dashboard.ts:207` (staleness only raises a notice), `src/traffic/demand.ts:144-150` (time of day is re-anchored to the current clock), `src/traffic/parseFeed.ts:127-135` (a missing `prefiles` key becomes `[]`, which is a known zero).
- Failing scenario: a feed fetched at 10:00 contains a prefile for 10:40. Fetches fail from then on. On the next day at 10:10 the same prefile is counted in the +30 min slot again, because `nearestUtc` only sees the time of day. The aircraft list has the same staleness pattern, but aircraft at least carry positions that show they are stale. Prefiles carry none.
- The controller already defines expiry (`src/ui/controller.ts:176`, `vatsimStaleMinutes`). Prefiles should be dropped, or not counted, once `fetchedAtMs` is older than that limit. This is untested.
- The missing-key case has the same root cause as finding 1: an absent `prefiles` key is indistinguishable from "no prefiles".

### 3. Medium: one flight can be counted twice in the same slot, against the module's stated rule

- Where: `src/traffic/demand.ts:147-148`. A prefile with `departure === arrival === YSSY` is counted as a departure at its filed time and as an arrival at filed time plus en route.
- The header at `src/traffic/demand.ts:3` says "Each aircraft is counted at most once." Connected traffic follows that: a grounded aircraft whose plan starts and ends here is counted once, as a departure (`demand.ts:116`).
- Failing scenario: a YSSY to YSSY prefile filed at 10:35 with 10 minutes en route. Both the take-off and the landing fall in the +30 min slot, so one circuit adds two movements there.
- Two movements may be the right physical answer, since take-off and landing are both movements. But the header and the connected rule say otherwise. This needs an owner decision and a test either way. No test covers this case.

### 4. Low: unbounded en route time is accepted

- Where: `src/traffic/parseFeed.ts:61` (`hhmm` accepts hours 00 to 99) and `:72` (only a null check on `enrouteMinutes`).
- Example: `enroute_time: "9959"` gives 6000 minutes and is accepted. The arrival then lands days away and is not counted, so no wrong count results today. But this is an unvalidated system-boundary value, which CLAUDE.md asks us to check. Bound it to 0 to 1439 like `deptime`.

### 5. Low: a prefile-count overflow refuses the whole feed

- Where: `src/traffic/parseFeed.ts:130`. More than `FEED_MAX_PILOTS` (50,000) prefiles makes `parseFeed` refuse the entire feed, including its pilots.
- Unlikely at current scale, but it means a prefile-only problem discards all traffic data. Consider skipping extra prefiles with a count, as is done for malformed pilots.

### 6. Low: the wiring from feed to demand has no test

- Where: `src/ui/model/dashboard.ts:97` and `:106` (`prefiles: input.feed.prefiles` in `calculate` and `liveDemandFor`). `DemandInput.prefiles` is optional (`demand.ts:46`), so deleting these two lines still compiles.
- Every UI test passes `prefiles: []` (`tests/ui/model.test.ts`, `tests/ui/render.test.tsx`, `tests/ui/helpers.tsx`). No test passes a non-empty list through `calculate` or `liveDemandFor`.
- Failing scenario: a later refactor drops `prefiles` from the two calls. Typecheck passes, every test passes, and Panel D silently stops showing prefiles.
- `tests/ui/model.test.ts:156-162` also does not assert that prefiles survive a failed fetch, so reverting that behaviour would pass too.

### 7. Nit: redundant condition

- `src/ui/model/panels.ts:328` (`i <= 1 ? ... : null`) is redundant, because `demand.ts` already gives null for slots 2 and beyond. Harmless.

## Verified (no defect found)

- **Next slot is index 1.** `slotStartsMs[0]` contains now, so `slotStartsMs[1]` is the slot after it. The "+30 min" label in Panel D is `i === 1`. Both match the issue.
- **known[1] gating.** Prefiles are counted only when `known[1]` is true, so a horizon that ends inside slot 1 drops them rather than inventing demand. Consistent with the "beyond the horizon is not invented" rule.
- **Minute-of-day and midnight arithmetic.** `nearestUtc` tries the day before, the same day and the day after. Hand-checked: `nearestUtc(00:10 on 24-10, 1435)` gives 23:55 on 23-10. The three-candidate set always contains the instant inside the next slot, because that instant is within about an hour of now. The only missing candidate is the day before, for minute values of 1440 or more, and that case lies more than 12 hours away from the window. No counting error found.
- **Connected traffic unchanged.** `addArrival` and the departure branch are untouched. Prefiles are not added to `connectedArrivals` or `connectedDepartures`.
- **Privacy.** `readPrefile` returns a fresh object with four fields only. The walk test in `parseFeed.test.ts` and the canary test ("keeps no personal value") cover it. `findForbiddenKeys` still runs over the whole raw feed.
- **Failed fetch keeps prefiles.** `applyFeedResult` spreads `previous`, so prefiles survive a failure. This is correct for UP-3, but see finding 2 for the age problem.
- **Malformed prefiles.** Bad times, missing plans and the `'2499'` and `'0160'` cases are ignored and do not inflate `skippedPilots`. Tested.

## Would a test still pass if the feature were reverted?

| Reversion | Caught? |
|---|---|
| Remove the next-slot count in `demand.ts` (lines 138-151) | Yes: "a departure from here filed for the next slot counts there" and "an arrival here is timed by its filed departure plus time en route" fail |
| Remove the `(prefiled)` label in `panels.ts:333` | Yes: `tests/ui/render.test.tsx` "Panel D" fails |
| Remove prefile parsing in `parseFeed.ts` | Yes: the parseFeed prefile tests fail |
| Stop passing `prefiles` in `dashboard.ts:97` or `:106` | **No test fails** (finding 6) |
| Drop prefiles on a failed fetch (`applyFeedResult`) | **No test fails** (finding 6) |
| Revert the prefile count only for the current slot (`known[1]` guard) | **No test fails** |

## Riskiest assumption

That a prefile's filed time is a time of day that can be trusted without a date, and that it is still valid when the feed is stale or the `prefiles` key is absent. Finding 2 shows the code assumes this and nothing tests it.

## What I could not verify

- The live VATSIM feed. I could not confirm that `prefiles` is always present, or that `deptime` and `enroute_time` are UTC `HHMM` as parsed. I used the fixture and the code's own comments.
- The owner's intent on showing a known zero for next-slot departures (finding 1). This is a product decision, not a code check.
- Whether the plan differs with prefiles. I inferred from `knownDemand` that an empty prefile list leaves the plan unchanged, and did not run a before-and-after plan comparison.
- CI on the latest commit. The PR is already merged, and I did not query Actions.
- Mutation results. No file was edited, so the reversion table above is from reading the tests.

## Corrections needed to the PR body

- Replace "With no prefiles in the feed, nothing changes" with a list of the no-prefile differences: next-slot departures become `0 (prefiled)`, the "(arrivals only)" note disappears in Panel D and the cell text, and the departures figure becomes `0` rather than unknown.
- Add the stale-feed and missing-key behaviour as a listed change, or fix it as in finding 2.

# Independent review: PR #93, prefile follow-up (next-slot rule)

Date: 25-10-2026
Branch: `prefile-no-feed-unknown` (3 commits: 038dd78, eed0bbf, 90c1179)
Base: `origin/main` (5de2f85). Note: local `main` is stale at cf99d3b, so `git diff main...prefile-no-feed-unknown` shows 11 files including PR #92. The PR diff against `origin/main` is 8 files, 172 insertions and 28 deletions. This review uses `origin/main`.
Issue: #91
Tier: Medium (traffic levels feed the engine)
Reviewer: independent agent. No source, test or git state was changed. Nothing was committed or pushed.

## Verdict

**Approve with fixes.** The next-slot arithmetic, the midnight handling, the fetch clearing and the privacy filter are sound. One fix is needed before the owner relies on it: a prefiled departure from YSSY is silently dropped when its filed time or time en route is malformed, which breaks the owner rule that every prefiled departure from here counts. The PR body also misstates two rules.

## Checks run

| Check | Command | Result |
|---|---|---|
| Unit and integration tests | `npx vitest run` | 52 test files passed; 2044 tests passed, 0 failed (matches the PR body) |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | exit 0; oxlint clean with `--deny-warnings`; `check-banned-imports: OK` |

No mutation run was done. Every "would still pass if reverted" statement below comes from reading the tests and the wiring.

## Ranked findings

### 1. High: a YSSY departure with a bad time is dropped (src/traffic/parseFeed.ts:65-74, tests at parseFeed.test.ts:192 and 209)

`readPrefile` returns `null` for the whole plan when `deptime` is malformed, when `enroute_time` is malformed or above 1440, or when the arrival is malformed. The departure count in `demand.ts:148` never sees that plan.

Failing scenario: at 10:10 UTC the feed has one prefile, YSSY to YMML, `deptime: "0900"`, `enroute_time: "2401"`. The parser returns `prefiles: []`, so the next slot shows `not est.` in Panel D. The owner rule says this filed departure from YSSY must count in the next slot whatever its take-off time, so the expected result is 1.

The same drop happens with `deptime: ""` on a YSSY departure. The parser tests at `parseFeed.test.ts:192` ("ignores a prefile with a missing or malformed time") and `:209` ("ignores a prefile whose time en route is longer than a day") assert that drop, so they pin the bug in place.

Fix: keep a prefile when its departure is valid. Make the times optional. Count every departure from here. Use the time only to time an arrival, and skip that arrival when the time is missing or invalid. Then rewrite the two parser tests to expect the departure to count.

### 2. Medium: the riskiest assumption, far-future prefiles count now (src/traffic/demand.ts:147-149)

The owner rule is implemented exactly as written. A YSSY prefile filed for 22:00 UTC, read at 10:10 UTC, adds one departure to the 10:30 to 11:00 slot. That feeds the Medium traffic level and so the engine. The 25-10-2026 EGLL check in the PR body reported 206 prefiles from a 2,471-pilot feed, of which 1 was from EGLL in the next slot. Prefiles for later hours will be common, so this rule may overstate next-slot demand every time.

This is the owner's decision, so no code change is asked for. The owner should confirm it explicitly, and the PR body should say that the next-slot departure count can include plans filed hours ahead. The test "five prefiled departures all count there" (demand.test.ts:359) locks the rule in.

### 3. Medium-low: null versus zero keys on the parsed list, not the feed (src/traffic/demand.ts:159)

The gate is `prefiles.length > 0`, and `prefiles` is the list after `readPrefile` has filtered it. A feed whose prefiles array is non-empty but every entry is malformed gives `null` (unknown) rather than zero.

Failing scenario: a feed lists 30 YSSY prefiles, all with `enroute_time: "0160"`. The parsed list is empty, so the next slot shows `not est.`. The spec's wording, "no prefiles in the feed", reads more naturally as the raw feed count. Either way the choice should be written down. This also depends on fix 1: once departures are kept, the case mostly disappears.

### 4. Low: test gaps (src/ui/model/panels.ts:333; tests/ui/render.test.tsx:375; src/traffic/fetchFeed.ts:31)

- No test asserts the `(prefiled)` suffix. `render.test.tsx:375` strips it before comparing. Removing the label from `panels.ts:333` would still pass every test.
- Nothing in vitest tests `fetchFeed` returning `prefiles`. A revert of the pass-through at `fetchFeed.ts:31` would still pass vitest. Only typecheck catches it, because `prefiles` is required on the ok branch.

### 5. Low: PR body accuracy (PR #93 description)

- "With prefiles in the feed but none for that slot, they are zero." The code gives zero only when no prefile departs from here. A YSSY prefile filed for another time still counts 1 in the next slot. Wording should read "none departing from here".
- "Time en route above one day is ignored." The whole prefile is dropped, departure included (fix 1). The wording should say what is actually ignored.
- "Decisions taken for the owner to confirm" calls the fetch-clearing rule and the YSSY-to-YSSY rule open review points. Issue #91 already lists both as owner rules.
- The verification claim "1 prefiled departure from EGLL, matching the model" cannot be checked from here (no live feed access).

## What I verified

- **Midnight wrap.** `nearestUtc` (demand.ts:76-80) checks `at - 1 day`, `at` and `at + 1 day`. The largest minute-of-day sum is 1439 + 1440 = 2879, so `at` lies in `[dayStart, dayStart + 2 days)`. `at - 2 days` is never the nearest candidate to `now`, so the three candidates are enough. Tests: demand.test.ts:400-411 (including 23:55 and 00:40 across midnight).
- **Plan from YSSY to YSSY.** Counts once, as a departure (demand.ts:150 guard; test demand.test.ts:378-383).
- **Failed fetch clears prefiles.** `dashboard.ts:64` sets `prefiles: []`. Test model.test.ts:156-164 checks it, and a revert to `...previous` would fail that test.
- **Null versus zero, no prefiles.** `demand.ts:159` gives `null`, and demand.test.ts:393-395 checks it. The render test at render.test.tsx:368 checks "not est." for the later columns.
- **Privacy.** Only the four prefile fields survive. parseFeed.test.ts checks the exact key list and a canary test (`PERSON`, `CALL1`, `DCT`).
- **Prefile limit.** Prefiles beyond `FEED_MAX_PILOTS` are dropped, not refused (parseFeed.test.ts:201-206).

## Would a revert be caught?

| Fix reverted | Caught by |
|---|---|
| Failed fetch keeps prefiles (dashboard.ts:64) | model.test.ts:156-164, yes |
| YSSY-to-YSSY counts twice (demand.ts:150 guard removed) | demand.test.ts:378-383, yes |
| Next-slot departures become 0 with no prefiles (demand.ts:159) | demand.test.ts:393-395, yes |
| Midnight wrap removed from `nearestUtc` | demand.test.ts:400-411, yes |
| Prefile limit refuses the feed | parseFeed.test.ts:201-206, yes |
| `(prefiled)` label removed (panels.ts:333) | none |
| `fetchFeed` drops `prefiles` (fetchFeed.ts:31) | none in vitest; typecheck only |
| Enroute above a day counts the departure again | parseFeed.test.ts:209 pins the drop, so the test would fail, but it asserts the wrong behaviour (fix 1) |

## Riskiest assumption

That a prefiled plan's filed take-off time has no bearing on whether it counts in the next 30 minutes. The owner has decided this, and it is the largest source of error in the next-slot figure (finding 2). The second is that a malformed time should drop the whole plan (finding 1), which the owner did not ask for.

## What I could not verify

- Live VATSIM behaviour: field formats for `deptime` and `enroute_time` (assumed HHMM strings), how often prefiles carry malformed times, and the EGLL check.
- The engine's response to next-slot departures, beyond the `levels` values in the summary.
- Mutation results. Every revert claim above is from reading the code and tests.
- That PR #93 on GitHub targets `origin/main` as stated. I took the base from `gh pr view 93`.

## Re-review of commit 0c3e4da (25-10-2026)

Scope: the diff of 0c3e4da alone, and the files it names (src/traffic/parseFeed.ts, src/traffic/demand.ts, tests/traffic/parseFeed.test.ts, tests/traffic/demand.test.ts).

### Checks

| Check | Result |
|---|---|
| `npx vitest run` | 52 test files passed; 2047 tests passed, 0 failed |
| `npm run typecheck` | exit 1: 3 errors, all in tests/traffic/demand.test.ts lines 381-382 (`null` assigned to a `number` field of the test helper's type) |
| `npm run lint` | exit 0 |

### Finding 0 (new, blocks a clean typecheck): test helper type not widened

The new test at demand.test.ts:378-386 passes `null` times through `withPrefiles`, whose parameter type comes from the `prefile` helper at demand.test.ts:337-342, which still types `departureMinuteOfDay` and `enrouteMinutes` as `number`. Vitest does not typecheck, so the suite passes. Fix: widen the helper's option and field types to `number | null`. This is a test-only change.

### Original high finding: fixed

A bad `enroute_time` or `deptime` no longer drops a YSSY departure. parseFeed.ts:70-74 keeps the plan with that time set to null, and demand.ts:148 counts the departure whatever its times. Checked by reading: a YSSY departure with enroute "2401" now counts 1 in the next slot. The arrival rule (demand.ts:150) requires both times, so an arrival with an unknown time is not counted. The test at demand.test.ts:378-386 covers both sides.

### Remaining gap (low)

parseFeed.ts:69 still returns null when the arrival fails the ICAO shape check or is not a string, so a YSSY departure with a malformed arrival field is still dropped. The owner rule says every prefiled departure from here counts. Fix: keep the departure when only the arrival is bad, and store the arrival as unknown.

### Other checks

- The `null` times reach `nearestUtc` only behind the `!== null` guards at demand.ts:150, so no NaN arithmetic occurs.
- Nothing outside parseFeed.ts and demand.ts reads the two time fields (grep of src/).
- The parser test at parseFeed.test.ts:191-201 now expects the kept plans with null times; the assertions match the new code.

### Verdict

Approve with fixes. The high finding is fixed. Before merge: widen the test helper type so typecheck passes (finding 0), and decide whether a malformed arrival should keep the departure (remaining gap).

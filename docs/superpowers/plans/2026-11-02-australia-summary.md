# Australia summary screen: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `#/summary` screen showing one compact card per airport in an app.json group, each card equal to that airport's full-screen headline, with a runway picture, linking to `#/ICAO`.

**Architecture:** One existing `createController` per airport (unchanged, so each card is exactly what the full screen computes). A new non-React `createSummary` loads the packs and owns the controllers; a pure `summaryCard` turns each controller state into card text; a React `SummaryScreen` draws cards using the existing `Picture`. Which airports form the group comes from a new optional `groups` list in `refdata/app.json`, never from code.

**Tech Stack:** TypeScript, React, Vite, Vitest, valibot (pack schema). Existing v2 code in `src/v2`, pack code in `src/refdata`.

**Spec:** `docs/superpowers/specs/2026-11-02-australia-summary-design.md`. Mockup: `docs/ui/australia-summary-picture-options.html`, tab 1.

## Global Constraints
- Airport facts (ICAO codes, runway names, group name "Australia", card order) live in `refdata`, never in `src` (`npm run check-literals`, WORKING_AGREEMENT section 4).
- `src/v2` imports nothing from `src/ui`; run `node scripts/check-ui-boundary.mjs` and `check-banned-imports.mjs`.
- `src/engine` and `src/weather` are not edited (display-only change, Low or Medium tier).
- No good/marginal/limit status chips, colours or legend (owner, 02-11-2026).
- British English, dates DD-MM-YYYY, times UTC.
- v2 has no stored current mode (controller.ts passes `currentMode: null`), so a card's headline is `answerModel(view)` exactly as the full screen shows it.
- Work in a worktree `.worktrees/australia-summary`, GitHub issue first, `Refs #N` never `Fixes #N`, no `Co-Authored-By` or "Generated with" lines in commits or the PR.

## Review Focus
- One airport's pack or weather fails: that card shows an error/no-report state and the other nine still render.
- All ten controllers poll the same VATSIM feed: it must be fetched once per interval, not ten times.
- Leaving `#/summary` (tap a card, Back button) stops all ten controllers' timers.
- `groups` names an airport not in `airports`, or lists one twice: pack validation refuses it with a precise message.
- A group with one airport, and app.json with no `groups` at all (older deployments): no summary link, no crash.

---

### Task 1: `groups` in app.json
**Files:** Modify `src/refdata/schema.ts` (`AppFileSchema`, ~line 359), `src/refdata/parsePack.ts` (`parseAppConfig`, ~line 79), `refdata/app.json`; Test `tests/refdata/appConfig.test.ts` (create if no app.json test file exists; follow the nearest existing refdata test).

**Interfaces:**
- Produces: `AppFile.groups?: readonly { name: string; airports: readonly string[] }[]` (optional; `name` uses the pack's short-text rule, members match `AIRPORT_ID`, at most `C.maxAirports`).

- [ ] **Step 1: Failing tests** (`parseAppConfig`): `accepts a group whose airports are all listed`; `refuses a group member not in airports` (issue path `groups[0].airports[1]`); `refuses a duplicate member within a group`; `accepts app.json with no groups`.
- [ ] **Step 2: Run** `npx vitest run tests/refdata` and see them fail.
- [ ] **Step 3: Implement** the optional `groups` field in `AppFileSchema`, and the member-in-`airports` and no-duplicate checks beside the existing duplicate check in `parseAppConfig`.
- [ ] **Step 4: Data.** Add to `refdata/app.json`: `"groups": [{ "name": "Australia", "airports": ["YSSY","YMML","YBBN","YPPH","YPAD","YSWS","YSCB","YBCS","YBTL","YPDN"] }]` (order is the card order; the mockup's order).
- [ ] **Step 5: Run** `npm test` (includes the literal check); all pass. Commit.

### Task 2: `#/summary` route
**Files:** Modify `src/v2/route.ts`; Test `tests/v2/route.test.ts`.

**Interfaces:**
- Produces: `Route` gains `summary: boolean`; `buildSummaryRoute(): string` returns `'#/summary'`. `parseRoute('#/summary')` gives `{ icao: null, detail: false, summary: true }`. `#/SUMMARY` is not an ICAO (shape-check must not treat "SUMMARY" as an airport: it is 7 capital letters and matches `AIRPORT_ID`, so test the summary keyword first).

- [ ] **Step 1: Failing tests:** `parses #/summary as the summary screen`; `parses #/summary case-insensitively`; `still parses #/YSSY and #/YSSY/detail unchanged`; `buildSummaryRoute is #/summary`.
- [ ] **Step 2: Run** `npx vitest run tests/v2/route.test.ts`, fails.
- [ ] **Step 3: Implement** in `parseRoute`: summary when the first segment lowercases to `summary`; `icao` null then.
- [ ] **Step 4: Run**, passes. Commit.

### Task 3: Card model (pure)
**Files:** Create `src/v2/model/summaryCard.ts`; Test `tests/v2/summaryCard.test.ts` (use `tests/v2/helpers.ts` `viewFromInput` and the `screenModel` pattern in existing tests).

**Interfaces:**
- Consumes: `screenModel(state: ControllerState): ScreenModel` (`src/v2/model/screen.ts`); fields `answer.modeLabel`, `answer.arrivals`, `answer.departures`, `answer.why`, `answer.band.id`, `picture` (`Picture`, with `windLabel`).
- Produces: `interface SummaryCard { icao: string; name: string; modeLabel: string; arrivals: string | null; departures: string | null; windLabel: string | null; reason: string | null; noReport: boolean; picture: Picture }` and `summaryCard(state: ControllerState): SummaryCard`. `noReport` is `answer.band.id === 'NO_DATA'`; `windLabel` is null when `noReport`.

- [ ] **Step 1: Failing tests:** `card mode, arrivals and departures equal the full screen's answer for the same state` (compare with `screenModel(state).answer` field by field on a real-weather fixture for two airports, one multi-runway); `noReport card has null windLabel and a reason`; `a NO_SUITABLE state still shows 'No recommended mode', noReport false`.
- [ ] **Step 2: Run**, fails. **Step 3: Implement** `summaryCard` using `screenModel`, adding no new rules. **Step 4: Run**, passes. Commit.

### Task 4: One VATSIM fetch for all ten
**Files:** Create `src/v2/coalesceFetch.ts`; Test `tests/v2/coalesceFetch.test.ts`.

**Interfaces:**
- Produces: `coalesceFetch(fetch: FetchLike, now: Clock, ttlMs: number): FetchLike`. A GET to a URL already fetched (or in flight) within `ttlMs` returns a `clone()` of the same response; other URLs and any non-GET pass straight through. Failures are not cached.

- [ ] **Step 1: Failing tests:** `ten simultaneous calls to one URL call the inner fetch once`; `a call after ttlMs calls it again`; `different URLs are not shared`; `a rejected fetch is not cached`; `each caller can read the body` (clone).
- [ ] **Step 2: Run**, fails. **Step 3: Implement.** **Step 4: Run**, passes. Commit.

### Task 5: Summary state across airports
**Files:** Create `src/v2/summary.ts`; Test `tests/v2/summary.test.ts` (fake fetch/timers as in `tests/v2/controller.test.ts`, `rig.ts`).

**Interfaces:**
- Consumes: `loadPack(fetch, { baseUrl, cacheBust, airportId })` (`src/refdata/fetchPack.ts`), `createController` (`src/v2/controller.ts`), `coalesceFetch`, `summaryCard`.
- Produces: `type SummaryEntry = { icao: string; status: 'loading' } | { icao: string; status: 'error'; message: string } | { icao: string; status: 'ready'; card: SummaryCard }`; `createSummary(deps: { airports: readonly string[]; fetch: FetchLike; now: Clock; store: Store; baseUrl?: string; timers: Timers }): { getState(): readonly SummaryEntry[]; subscribe(l: () => void): () => void; start(): void; stop(): void }` (entries in `airports` order).

- [ ] **Step 1: Failing tests:** `entries are in the given order and start as loading`; `a failed pack gives an error entry and the others are ready`; `a failed weather fetch gives a noReport card, others unaffected`; `one VATSIM URL fetch for ten airports in one poll`; `stop clears every timer (none left registered)`; `a ready card equals what a single createController gives for that airport on the same fakes`.
- [ ] **Step 2: Run**, fails. **Step 3: Implement:** load packs in parallel with `Promise.all` settled per airport; per ready pack create and start a controller with `coalesceFetch(deps.fetch, deps.now, 10_000)`; subscribe to each and republish. Ignore results that arrive after `stop`. **Step 4: Run**, passes. Commit.

### Task 6: Screen, link and styling
**Files:** Create `src/v2/components/SummaryScreen.tsx`, `src/v2/useSummary.ts` (thin `useSyncExternalStore` wrapper like `useController.ts`); Modify `src/v2/App.tsx` (state gains `groups` from `r.app.groups`; render `SummaryScreen` when the route is summary; popstate handler sets it), `src/v2/components/Header.tsx` (optional `summaryHref` shown only when `groups` exists), `src/v2/v2.css`; Test `tests/v2/summaryScreen.test.tsx` (pattern: `tests/v2/airportEntry.test.tsx`).

**Interfaces:**
- Consumes: `createSummary`, `Picture` (`src/v2/components/Picture.tsx`), `parseRoute`/`buildSummaryRoute`.
- Produces: `SummaryScreen({ groups, deps }: { groups: readonly { name: string; airports: readonly string[] }[]; deps: AppDeps })`: one heading per group (its `name`), a 5-column grid (2 on a phone) of cards; each card an `<a href="#/ICAO">` with picture left, code, mode, `A`/`D` runway text, wind, `title` attribute = `reason`; `noReport` cards get a grey border and "no report" in place of wind; error cards show the code and "unavailable".

- [ ] **Step 1: Failing tests:** `renders one card per group airport in order`; `each card links to #/ICAO`; `a noReport card shows 'no report' and no wind`; `an error card does not hide the other cards`; `no summary link without groups`; `unmounting stops the timers`.
- [ ] **Step 2: Run**, fails. **Step 3: Implement.** Constrain the picture to about 110 px wide in CSS; if the runway numbers are unreadable at that size, hide them with the existing `.rwy-detail` rule rather than adding a second picture renderer. Arrival and departure runways use the existing `Picture` colouring; the mockup's amber-for-departures is not required.
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npm run build`; all pass. Commit.

### Task 7: Documents and verification
**Files:** Modify `docs/REQUIREMENTS.md` or `docs/UI_DESIGN.md` (whichever lists screens and the deep-link rule), `docs/README.md` if it indexes screens; `docs/TRACKER.md` is committed by the manager, not the builder.

- [ ] **Step 1:** Search the repository for the deep-link wording from `src/v2/route.ts` and the app.json description; update every document the change makes stale and list them in the report.
- [ ] **Step 2: Browser check** (`npm run dev`): open `#/summary` at desktop and phone width, hover a card, tap a card, press Back; confirm ten cards, no scroll at 1280x720, and that a card's mode equals the airport's full screen for three airports.
- [ ] **Step 3:** QA agent (WORKING_AGREEMENT section 2a point 9; new screen layout and parser-adjacent schema change) runs the screen against captured real METAR/TAF samples and reports; the manager runs the review gate and prepares the merge checklist.

## Self-review
- Spec coverage: live content (T5), cards picture-left (T6), no status (constraint + T6), Australian-only from data (T1), new in-app screen and link (T2, T6), tap opens full screen (T6), matches full-screen headline (T3 test), stale/no-report (T3, T5), one failure not blanking others (T5, T6), shared fetch (T4, T5), docs (T7).
- Correction to the spec: it said the headline includes the stored current mode; v2 ignores stored modes, so the card matches `answerModel` with `currentMode: null`. The spec line should be reworded when this plan is approved.

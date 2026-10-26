# Review of PR 103: v2 front end, phase 2

Status: record of an independent, read-only, blind review on 26-10-2026 (issue #94, branch v2-phase2). The reviewer saw the issue and the diff, not the builder's report. Condensed from the reviewer's reports. Dates DD-MM-YYYY, times UTC.

## Verdict
First review (tip 9d340a8): approve with fixes. Re-review of the fix commit only (cbad057): approve.

## What was verified
- Paste-your-own weather is v1's own rule set: the 4096 character limit comes from the shared decoder, nothing is rendered with `innerHTML`, and a refused paste leaves the state unchanged.
- Clear keeps v1's confirm step. The audit export and clear go through `src/store`.
- The evaluation model matches v1's timeline model (the hide function is identical to v1's); the parity test compares against v1's own model on real and synthetic fixtures.
- Popover ids come from `useId`, so no duplicates. Stale-response guards still hold.
- The only new engine import is `preferencePenalty` from `src/engine/optimiser`, used the same way as v1.
- The diff touches nothing outside `src/v2`, the tests and the documents.

## Findings and resolution
1. Cell popovers carried per-slot demand and capacity numbers, which breaks the owner's decision that v2 shows no per-slot traffic figures. Fixed in cbad057: the traffic line is the class word only; the engine's reason lines, including a capacity reason, are kept. A new test fails if the numbers return (it covers busy traffic with ok, unsuitable and marginal cells; it does not cover a capacity-cause cell or unknown traffic). The parity test compares everything except the traffic line beyond its class word.
2. The v2 render tests are static markup, so drawer Escape and Tab wrap, popover Escape, the Clear confirm click and the details open state have no behavioural test. Accepted as a known limitation: the repo has no DOM test library and adding one is new infrastructure. The owner tests keyboard and touch by hand.
3. "Resume automatic" can wait up to a poll interval if a weather poll is in flight. v1 behaves the same. Not changed.
4. After a Reload that changes the weather station the old reports stay until the next poll; likely the same as v1 (not compared). Not changed.
5. Minor accessibility: the grid's row count covers mode rows only; hover-only popovers cannot be dismissed with Escape unless focused. Not changed.

## Tests that fail if a rule is reverted
- Hide rule: `tests/v2/evaluation.test.ts`, `tests/v2/expansion.test.tsx` and the parity test.
- Marginal green with the cause word and no tick: `tests/v2/evaluation.test.ts` and `tests/v2/expansion.test.tsx`.
- Paste limits and refusals, audit export and clear: `tests/v2/drawerController.test.ts`.
- No per-slot traffic figures: `tests/v2/evaluation.test.ts` (cell popovers) and `tests/v2/drawer.test.tsx` (drawer and cell popovers).
- No test: drawer and popover keyboard and touch behaviour, and the Clear click flow.

## Not verified by the reviewer
Browser, screen reader and touch behaviour; most of the stylesheet and the chips, tiles, Settings and Key bodies were read by search only.

## Riskiest assumption
That static-markup tests plus the reducer tests are enough for keyboard, focus and touch behaviour.

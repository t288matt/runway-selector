# Review of PR 102: v2 front end, phase 1

Status: record of an independent, read-only, blind review on 25-10-2026 (issue #94, branch v2-phase1). The reviewer saw the issue and the diff, not the builder's report. Condensed from the reviewer's reports. Dates DD-MM-YYYY, times UTC.

## Verdict
First review (tip a5c448d): approve with fixes. Re-review of the fix commits only (e9da034): approve.

## What was verified
- Nothing under `src/engine`, `src/weather`, `src/traffic`, `src/store`, `src/net`, `src/ui` or `refdata/` changed; the merge base equals main.
- v2 imports only the shared modules and its own files. `src/main.tsx` is the only file outside `src/ui` that imports from it.
- No `innerHTML` or `dangerouslySetInnerHTML` in `src/v2`.
- `vite build` gives `index.html` and `v2.html` with relative asset paths and one `refdata` copy.
- The state band rule matches v1's banner code (`panels.ts`), red winning over amber. Stale limits come from the pack.
- The drawer handles Escape, traps Tab, returns focus and uses `inert` and `aria-modal`.

## Findings and resolution
1. The import guard scanned line by line, so a specifier on a different line from its keyword passed (a multi-line `import {...} from` and a split `import(`). Fixed in e9da034: the guard scans the whole comment-stripped text, also covers `import.meta.glob`, with multi-line fixtures in both directions. The re-review found every form it tried caught; only an import with a variable specifier is missed, which is the known limit of a static check.
2. The tracker row for YR-26 quoted a test count. Removed (a161156).
3. The controller's two polls had `try/finally` and no `catch`, so a throw while applying a fetched report would be an unhandled rejection. Fixed in e9da034 with a catch that shows a failed fetch on the chips; a stuck in-flight flag the new test exposed was fixed in the same commit.
4. No test showed that an in-flight response is ignored after `stop()`, or that switching airport isolates the old controller. Added.

## Tests that fail if a rule is reverted
- Import guard: `tests/ui-boundary.test.ts`, one test per fixture, including the multi-line fixtures (they fail with the per-line scan).
- State band: `tests/v2/answer.test.ts`, plus the parity scenarios against v1's own banners.
- Trend: `tests/v2/tiles.test.ts`.
- Controller catch, stop and airport switch: `tests/v2/controllerSafety.test.ts`.
- The engine being unchanged has no test; the evidence is the diff.

## Not verified by the reviewer
Visual rendering, contrast and screen-reader behaviour; live feeds; whether the v1 bundle is byte-identical; most of the stylesheet and the picture, diagram and forecast-bar code. The screen remount on an airport switch has no test (no DOM test library in the repo).

## Riskiest assumption
That the static text guard is enough. Aliases and computed imports still rely on human review.

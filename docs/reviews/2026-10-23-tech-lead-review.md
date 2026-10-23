# Tech lead review of the stack and architecture: condensed record

Status: record of a review on 23-10-2026 by an independent agent acting as tech lead, read-only. Condensed from its report. "Resolution" notes what the owner has decided since.
Language: British English. Dates DD-MM-YYYY.

Verdicts: stack, endorse with changes. Architecture, endorse with changes.

## What was measured
- Installed versions are real and run: TypeScript 7.0.2, Vite 8.3.5, Vitest 5.0.5, React 19.3.1, @vitejs/plugin-react 6.1.2, Tailwind CSS 4.3.3; Node 24.15.0.
- Feed behaviour from a browser (curl with an Origin header, 23-10-2026): aviationweather.gov sends no CORS header; data.vatsim.net and metar.vatsim.net allow any origin. The VATSIM feed is about 1.27 MB uncompressed, about 300 kB compressed. Server behaviour can change, so repeat the test in the YR-2 spike. Provider selection is a separate, open decision (YR-17).

## Findings
| # | Severity | Finding | Recommendation | Resolution |
|---|---|---|---|---|
| 1 | High | The chosen weather source may refuse browser requests, so a relay or proxy may be mandatory, not conditional. | A dev-server proxy for phase 1; a stateless edge proxy for publication; re-scope YR-2. | Owner: design stays provider-agnostic; proxy decided only if the chosen provider needs one (DESIGN.md, "Proxy"). |
| 2 | High | The dependency rule ("React, Vite, Tailwind only") contradicts the schema validation the design requires; Vite and Tailwind are build-time, not runtime. | One small schema library (valibot or zod/mini), or a hand-written validator; reject JSON-Schema compilers that need `new Function`. | Owner approved a small schema library (DESIGN.md, "Dependencies"). |
| 3 | High | "Built files opened locally" does not work for a Vite build (browsers block module scripts and `fetch()` on `file://`). | Run `vite` or `vite preview`; set `base: './'`; choose how packs reach the browser. | Owner chose fetched static files (DESIGN.md, "Pack delivery"). |
| 4 | High | Browser storage cannot honour an "audit trail" or keep history: storage is per origin, evictable and editable; a running page cannot see file edits; hidden tabs throttle timers. | IndexedDB for history, localStorage for settings; log pack content-hash changes; `navigator.storage.persist()`; export and import; reword RD-6 as best-effort; use wall-clock timing and `visibilitychange`. | Open (audit-record schema to be written). |
| 5 | High | The optimiser spec is inconsistent: state must include run length; stay bonus, hysteresis and minimum duration double-count; changeover (E) should come from the DP path; no terminal cost; early-change benefit undefined. No worker thread is needed at this size. | One stay mechanism, one anti-flapping mechanism applied at plan replacement, terminal cost, benefit as a cost difference. | Open (cost model to be written). |
| 6 | Medium-high | The engine is not pure as specified: plan stability needs the previous plan as an input; `Date.now()` and browser globals must be banned in the engine. | Add `previousPlan` input; inject `now`; lint rule. | Open. |
| 7 | Medium | Floating-point determinism: trig results can differ by a last bit; a wind exactly on a limit may fail. | A fixed comparison tolerance as a named constant; golden-snapshot and boundary tests; integer costs. | Resolved in part: `limitToleranceKt` is a pack value (WC-11). |
| 8 | Medium | Weather parsing: provider JSON is decoded already; the live METAR contained `//` in the cloud group; an in-house parser costs about 600 to 900 lines plus fixtures; the `metar-taf-parser` library is an alternative. | Provider JSON primary with an own parser as fallback and cross-check, or a library for tokenising. | Owner: deferred until a provider is chosen. |
| 9 | Medium | Time zones: `Intl.DateTimeFormat` handles daylight saving without a library; store only the IANA zone; define band membership on local wall time; add DST-day tests. | As stated. | Open. |
| 10 | Medium | `package.json`: `private` is the string "true"; `main` is stale; no `engines`, ESLint, `tsconfig.json`, `lint` script or literal-check script; TypeScript 7 and Vite 8 are new majors. | Tidy; pin majors in the decision record. | Open (tracker YR-4). |
| 11 | Medium | The literal check gives false positives on short ids; numeric mode ids cannot be checked this way; the TEST pack is the real guard. | Token-aware check; give TEST different conventions (variation sign, limits, a single-runway variant, a half-hour zone). | Open. |
| 12 | Medium | Ambiguities a build team would hit: wind reference; variable-wind sampling; strip-then-validate order; capacity null means unknown; missing defaults table; how the UI treats provisional rules; the RD-4 contradiction; server-readiness needs no browser globals in the engine and loader. | Decide each in the decision record. | Wind reference and RD-4 resolved (OD-10, OD-11); others open. |
| 13 | Low | JSON is right for packs (YAML or JSON5 adds a parser; TypeScript packs make packs code); a Scheduler interface is more than a timer needs; the git workflow is heavy for a one-owner phase 1. | Keep JSON plus `description` fields. | Noted. |

## Draft decision record (ADR-001), as proposed by the reviewer
Status: proposed. Several items are now decided or deferred (see Resolution above).
- **Stack:** one TypeScript project; React, Vite, Tailwind CSS; Vitest. Engine is plain TypeScript with no browser globals, network, clock or storage; `now` and the previous plan are inputs.
- **Data:** JSON packs validated on load by one schema library; cross-reference checks are custom code; the loader validates, then strips `description` and `_` fields.
- **Dependency rule:** runtime React, React-DOM and the validator; everything else dev-only; any other runtime dependency needs the owner's yes.
- **Time:** UTC internally; local time and daylight saving from `Intl` using the pack's IANA zone; bands matched on local wall time.
- **Storage:** IndexedDB for history, localStorage for settings, keyed by airport; best-effort and exportable; git is the audit trail for packs; pack changes detected by content hash.
- **Architecture:** pure deterministic pipeline; three interfaces (weather and traffic sources, store, scheduler); optimiser is dynamic programming over (slot, mode, capped run length) on the main thread; integer soft costs; one stay mechanism; terminal cost; changeover read from the chosen path.
- **Agnosticism:** TEST pack and the full scenario suite on every pack, plus a token-aware literal check.
- **Numeric rule:** limits compared with a fixed tolerance.
- **Alternatives rejected:** a Node relay (heavier); JSON-Schema compilers (security policy and cross-reference limits); TypeScript packs; YAML or JSON5; a worker for the optimiser; a full in-house parser as the only path.
- **Consequences:** engine testable without a browser and reusable on a server; a new airport is data only; browser storage can be lost, so export matters; new major versions may cause tooling friction.
- **Open items for the owner:** validator (decided: a library), parser (deferred), meaning of "verified" in RD-4 (decided: OD-10), wind reference (decided: OD-11), pack delivery (decided: fetched static files).

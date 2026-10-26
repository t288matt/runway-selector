# Review record — PR #143 (issue #141): v2 runway picture redrawn as asphalt with markings

Date: 26-10-2026. Tier: Low (display-only; src/engine and src/weather untouched). Reviewer: independent agent, blind (issue and diff only, no builder report), light check per the Low-tier cap (5 tool calls, under the cap of 10).

**Verdict: approve.**

**Findings (none blocking):**
1. Minor, non-functional — `RUNWAY_ACCENT_EXTRA` (src/v2/model/diagram.ts) is a fixed unit, not scaled the way `RUNWAY_STRIP_WIDTH` is. No bug today since `DIAGRAM.width` is a fixed constant; a latent risk only if that constant ever changes.
2. Nit — some "look" constants live in Picture.tsx rather than alongside the others in diagram.ts. No functional effect.

**Test that fails if reverted (confirmed):** `tests/v2/pictureAsphalt.test.tsx` — reverting the runway to a plain `<line>` empties the structural query the test asserts on. Corroborated by `pictureTidy.test.tsx` and `render.test.tsx`. These check real markup structure, not snapshots.

**Verified:** diff matches issue #141 and both owner decisions (option B; v2-only, v1 untouched; unused runways keep muted painted numbers). ARR/DEP label logic, `data-used` semantics, the accessible title, and the wind-label placement algorithm are unchanged — only the clearance pad constant was widened, which the brief allowed. v2 imports nothing from src/ui; engine/weather untouched; SVG text nodes only. The phone-breakpoint CSS hides only `.rwy-detail`, leaving strip/edges/accent/centreline visible. No airport facts, secrets or personal data introduced.

**Not read:** nothing beyond the diff's own files was needed.

**Riskiest assumption:** the widened clearance constant stays large enough to keep the wind label clear of the asphalt strips across every pack and wind direction. Covered by a full 0-360-degree per-pack sweep in `pictureAsphalt.test.tsx`.

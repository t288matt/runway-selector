# Documents

The single index of the project's documents. One topic has one home: follow the link, do not copy.

| Document | What it is |
|---|---|
| [../README.md](../README.md) | The user guide: what the tool does, how to read the screens, how a mode is judged, how to run it. |
| [REQUIREMENTS.md](REQUIREMENTS.md) | What the app must do. The owner's decisions (OD numbers) and the requirement ids (AG, WC, WX, TR, OP, DB, UP, RD, SY, SEC). The source of truth. |
| [DESIGN.md](DESIGN.md) | How it is built: architecture, the airport pack schema, the engine, the demand model, the front end (section 8a), its visual and accessibility rules (section 8b), security. |
| [SCORING_EXPLAINED.md](SCORING_EXPLAINED.md) | The scoring and the choice of mode explained in plain words. |
| [TRACKER.md](TRACKER.md) | The work items and their state. Kept by the manager. |
| [ui/](ui/) | Design material: `answer-first-*.html` (mockups of the current screen) and `answer-first-ledger.md` (the design note for the current screen). Illustration only, not live data. |
| [*_RUNWAY_RESEARCH.md](.) | Runway research notes for airports that were tried and removed from the shipped packs (EDDF, EDDK, EFHK, EGCC, KLAX, LEMD, LSZH, LTFM, OMDB). Kept so a pack can be re-added; not part of the app. |
| [images/](images/) | Pictures used by the documents. |
| [reviews/](reviews/) | Dated review and research records. Not edited after the day. |

Process documents (kept on the manager's machine and not in the repository): `WORKING_AGREEMENT.md` (the rules the team works under), `TEAM_ROLES.md` (who does what) and `TEAM_BRIEFS.md` (how to brief each role).

The airport data is not documented here: each pack in `refdata/airports/` describes itself in its own files (a `description` on every value and an optional `source`).

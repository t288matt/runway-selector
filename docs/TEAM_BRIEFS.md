# Team briefs

How to staff each role in a new session. What each role is and who it works with: [TEAM_ROLES.md](TEAM_ROLES.md); the rules: [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md) section 10. A brief is the common preamble (section 1) plus the role section (section 2) plus the task. Keep briefs short and specific; name the issue, the files, and the proof required. The manager (Emma) briefs; the owner never has to.

## 1. Common preamble (every agent gets this)
- Local clone `C:\Users\mdora\Claude\YSSY Runways`. British English, dates DD-MM-YYYY, times UTC, no emoji.
- Read first: the requirements (`docs/REQUIREMENTS.md`), the design (`docs/DESIGN.md`), the working agreement (`docs/WORKING_AGREEMENT.md`, with `TEAM_ROLES.md` and this file beside it), the issue, and the files named in the task. Read `origin/main` once a remote exists.
- Work only in your own worktree: `git fetch`, then `git worktree add -b <name> .worktrees/<name> origin/main` (use `main` until a remote exists). Check `pwd` before every write. New commits only; never amend, never force-push. End every commit message with the attribution line the session gives.
- In pull requests write `Refs #N`, never `Fixes #N`.
- Push the BRANCH only, never `main`, unless the manager says the branch is approved. Do not edit `docs/TRACKER.md` from a branch; the manager does.
- Checks before reporting: the project's test, type-check and lint commands, once they exist.
- Never: release, print or commit secrets, close issues, delete branches, skip checks or hooks.
- Prove no change to existing functionality: characterise today's behaviour first, compare old and new on the same data, and end the report with a **Behaviour preserved** section: what could have changed, how it was shown not to, residual risk.
- Report honestly: commits and tip, exact test counts, what was not done or not verified, and anything new noticed (listed, not filed).
- Token economy (working agreement section 10): send ONE report and then stop; never wait for or poll CI (the manager checks it); a reviewer reviews the diff only and does not re-run the whole test suite when CI on that commit is green; read only the files named; no repeated re-reads.

## 2. Role sections
| Role | Scope and extras | Skills to load | Proof in the report |
|---|---|---|---|
| Tech lead / architect | Design only, no production code: options, trade-offs, a recommendation, then a decision record (ADR) text for the owner. Measure before proposing. | `engineering:architecture`, `engineering:system-design` | Measurements, the options considered, the ADR draft. |
| Builder | The files named in the issue. Tests first, then the smallest change. | `engineering:debug`, `engineering:testing-strategy` | Old and new compared on the same data, fuzz on malformed input where it applies. |
| QA / test engineer | Tests that do not share the author's blind spots: characterisation, fuzz, mutation checks. | `engineering:testing-strategy` | Which test fails when the fix is reverted; counts before and after. |
| Independent code reviewer | A DIFFERENT agent from the author. Read-only. Attacks the change; does not confirm it. Gets the issue and the diff, not the builder's report; names the test that fails if the fix is reverted. Re-runs the tests from a clean `git archive` checkout. | `code-review` (effort high), `engineering:code-review` | Verdict (approve / approve with fixes / do not merge), ranked findings with file:line and a failing scenario, what was verified, exact counts, riskiest assumption, what could not be verified, a three-line summary for the owner. Review record goes under `docs/reviews/`. |
| Security reviewer | Secrets handling, privileges, personal data, exposure. Read-only unless told. | `security-review` | Findings ranked, each with a concrete exploit or leak scenario and a fix. |
| Technical writer | Works ON THE BUILDER'S BRANCH before the review: updates every document the change makes wrong, from the code on that branch, so docs and code merge together; docs come from the code, not from agents' reports. Owns the shape of the set: ensures content is in the right document and acts on any fragmentation; a new document that should have been an addition to an existing file (whoever wrote it) is folded into that file and removed; checks every branch that adds or edits a document before its review; link, never copy; merge or remove duplicates and stale restatements; `docs/README.md` is the single index. | `engineering:documentation` | A list of files changed and what was checked against the code; duplicates found and how each was resolved. |

## 3. Rules for the manager when staffing (hats, not staff: working agreement section 2a)
- Default staffing for a change is ONE builder plus ONE independent reviewer. Do not start the architect, security reviewer or technical writer unless the task is of that kind (section 2a point 2).
- Search the repo, the tracker and the open issues for existing work before briefing anyone.
- Do small work (tracker, issues, ADR text, short docs, a one-line config change, a rename, anything under about ten lines) directly; no agent.
- Token economy: one session per task, then a fresh session from the handover memory; batch related changes into fewer pull requests; no documentation-only follow-up re-review (CI is the check); at most two agents running at once; Haiku 4.5 for mechanical work, Sonnet 5.5 for code, reviews and releases; decide with the owner (recommendation first) before starting a builder on a design with a trade-off.
- Match review depth to the tier: Low = light check; Medium = full review; High = full review plus the security checklist. A re-review after fixes covers only the new commits, and the brief says so.
- Ask every agent to leave progress notes on its branch as it goes, so a limit-killed agent can be resumed or replaced cheaply.
- At most 3 branches in flight (working agreement section 3). Brief one agent per branch, with disjoint files.
- Every code branch gets a reviewer who is not its author, and the author gets the findings back to fix; the reviewer then re-checks.
- The manager checks evidence (commits exist, CI result, counts) before telling the owner anything is done.
- After a session limit or restart, look for orphaned agents' branches and worktrees and clean up before relaunching.

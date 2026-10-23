# Working agreement

Status: ADOPTED by the owner in chat, 22-10-2026 (the same working agreement the owner uses on other projects).
Language: British English. Dates DD-MM-YYYY, times UTC. Plain words; no emoji.

## 1. Purpose
Small, frequent, safe releases, with the owner deciding what matters and not having to read everything. The aim is to remove the owner as the bottleneck without removing the safety: risk decides how much approval a change needs, and evidence replaces summaries.

## 2. The team
The job description of every role is in `TEAM_ROLES.md`. The table below is the short form.
| Role | Who | Owns |
|---|---|---|
| Owner and product lead | Matt | Priorities; approval of medium and high changes; every release outside the pre-approved tier (section 5). |
| Engineering manager | Emma (this assistant) | Triage, work-in-progress limit, the daily digest, the tracker and issues, risk tiers, the review gate, escalation. Does not write production code. |
| Tech lead / architect | agent | Design and decision records for larger changes before anyone builds them. |
| Builder | agent | One change at a time, on its own branch, with its tests. |
| QA / test engineer | agent | Characterisation and fuzz tests; proof that behaviour is preserved. |
| Independent code reviewer | a different agent from the author, every time | Reviews every change (section 4). Never reviews its own work. |
| Security reviewer | agent | Secrets, privileges, personal data. |
| Technical writer | agent | Documents and plain-language wording. |
Limit of the team: all agent roles are the same model family, so they can share blind spots. That is why section 4 asks for evidence.

### 2a. Lean staffing: hats, not staff
The roles above are hats. They are not permanent staff and not one agent run per role per change. Agent runs cost tokens and a session limit can kill them mid-task, so:
1. **A change normally gets two agents: one builder and one independent reviewer.** The builder wears the QA hat as needed (it writes the characterisation tests and the behaviour-preserved proof). The reviewer wears the code-review hat and checks the security points relevant to the change from its checklist.
2. **Extra agents only when the task is of that kind:** the tech lead for a real design problem or a decision record; the security reviewer as its own run only for high-tier changes that touch secrets, privileges, personal data or exposure; the technical writer in a batch when documents have drifted, not per change.
3. **The manager (Emma) does small work directly:** tracker rows, issues, ADR text, short documents, pointers. No agent for what takes a few steps.
4. **Check before briefing.** Search the repository, `docs/TRACKER.md` and the open issues for existing work before starting an agent.
5. **Review depth follows the tier (section 5):** Low = a light independent check (a short read and the tests, no full attack); Medium = the full review; High = the full review plus the security checklist. A re-review after fixes covers only the new commits.
6. **Finish before a session limit.** Agents write progress notes to their branch as they go (a short handover file or commit message) so a killed agent can be resumed or replaced cheaply. After a restart the manager looks for orphaned branches and worktrees first.
7. **Measure it.** The weekly measures (section 8) include agent tokens per merged change, reported from the agents' own usage, so cost is seen and not guessed.
### 2b. The technical writer keeps the documents current
**Documentation changes travel with the change.** A change that makes any document wrong updates that document in the SAME branch and pull request, so `main` and its documents never disagree. The builder says in the issue which documents the change touches; the technical writer updates them on the builder's branch before the review (the reviewer then reviews code and documents together, and checks that every claim in the documents is true of the code); a change with no documentation update says in its pull request why none is needed. The writer does not close issues. Documents must not quote test counts.

## 3. How work flows (small and often)
1. **Ready:** an issue and a tracker row exist (issue first, then the row), with a "done when" line.
2. **Build:** one agent, one branch, one worktree (`.worktrees/<name>`). Characterise today's behaviour first, then change only the defect. The documents the change makes wrong are updated on the same branch by the technical writer before the review (section 2b).
3. **Check:** unit tests and linting locally; the full suite runs in CI on the pull request.
4. **Review:** a different agent reviews the branch (section 4).
5. **Merge:** open a pull request so CI runs on the branch first. Merge only after an approved independent review AND green CI on the pull request's LATEST commit, then read CI on `main`. Merge checklist (the manager pastes the links): pull request open; CI green on the head commit (link); review verdict (link); Behaviour preserved section for Medium and High; the fix names a test that fails if it is reverted; tracker row and issue updated.
6. **Release:** per the tier (section 5), on the owner's go.
7. **Close:** the issue is closed with the evidence; the owner closes anything they asked to close themselves. **Clean up:** after a release is verified, the manager deletes the branches (on GitHub and locally) and removes the worktrees of everything that was merged and released, without asking again. Conditions: the branch tip is already in `main`, the worktree has no uncommitted work, and nothing unmerged or still in use (an open pull request, a builder at work) is touched. A branch with history that is not in `main` is first saved with `git bundle` and the bundle verified.
8. **Keep the issues current:** every issue a change touches gets a comment when the pull request opens (what changes, which commit, not yet released) and another after the verified release (what shipped, the commit, how it was verified, or what is still open). A change with no issue is not started (step 1). At the start of every session and after every release the manager lists open issues that have had commits or releases since their last comment, and fixes them before any new work.
Work in progress limit: at most 3 code branches in flight at once; docs-only branches do not count towards the limit. Finish and merge before starting another. Releases are small and frequent; there is no weekly batch.

## 4. Review and evidence
- Every review asks: does this change add an airport fact (an ICAO code, runway name, mode number, bearing, limit, time zone, source or wording) to code? If so it is rejected; the fact belongs in the airport pack (REQUIREMENTS.md AG-1, DESIGN.md section 4c). CI also runs the airport-literal check.
- Every change gets an independent review before it reaches `main`. Docs-only changes that state no operational fact may be merged by the manager.
- Every change that alters behaviour comes with a **Behaviour preserved** section: what could have changed, how it was proved not to (old and new compared on the same data), and the residual risk.
- The owner is asked to approve evidence (three lines: review verdict, test counts, behaviour-preserved proof), not to read a summary.
- Agent reports are not proof. The manager checks that commits, CI and test counts exist before reporting anything as done.
- A CI check that every code commit carries a `Reviewed-by:` line and a review record under `docs/reviews/` is planned. It is a tripwire, not proof.

## 5. Change tiers and who approves
| Tier | Examples | Approval |
|---|---|---|
| Low | Documentation; tests; layout and wording fixes that change nothing else | Independent review plus green CI. Released only on the owner's go, like every other change. |
| Medium | Code changes that keep existing behaviour identical; CI and release workflows | Independent review, behaviour-preserved proof, then merge on a green pull request; the owner's go is for the release. |
| High | Anything that deletes data or is irreversible; secrets; privileges | Independent review, the security checklist, and the owner's explicit go for each release. |
Every release needs the owner's explicit go, whatever the tier; tiers decide review depth only, and the go message carries the three-line evidence.

## 6. Decisions
- The manager brings decisions to the owner one at a time with a recommendation first, or in a short daily digest ("N things need a yes"). Each has a default taken if the owner does not answer within two working days, only for tier Low or for questions the owner has pre-agreed defaults for.
- Owner-only decisions: priorities; anything irreversible; spending; what "good enough" means.

## 7. Limits on every agent
- Never print, store or commit secrets; never enter credentials.
- Never release, close issues or delete branches or data without the approval the tier requires.
- Never skip hooks or checks, force-push, or amend commits.
- Stay inside the assigned files. Do not edit `docs/TRACKER.md` from a branch (the manager updates it), except the technical writer when the manager's brief says so (section 2b).
- Report honestly: what was done, what failed, what was not verified.

## 8. Measures (kept by the manager in the digest)
Weekly: agent tokens per merged change (from the agents' own usage reports; the manager's own conversation is not counted) and the open count of issues by tier. Monthly, in one line: releases, time from ready to live, share of releases rolled back. These replace opinions about "too slow" or "too risky".

## 9. Approval
| Item | Decision |
|---|---|
| Adoption of this agreement, the team roles and the briefs | instructed by the owner in chat, 22-10-2026 |
| Team, tier table and daily digest | agreed by the owner, 09-10-2026 |

## 10. Standing rules
- Every release needs the owner's explicit go: ONE go per release.
- A merge needs an independent review plus green CI on the pull request's latest commit; the owner's single gate is the release go. Main must stay green: open a pull request so CI runs on the branch first; read CI after every push to `main`.
- Never pin, skip or hide a product defect to get green: fix it or do not merge.
- Every change gets an independent review by a different agent than the author. Blind review: the reviewer gets the issue and the diff, not the builder's report. Every fix names a test that fails if the fix is reverted. (Docs-only changes that state no operational fact: section 4.)
- New work gets a GitHub issue first, then a tracker row. Closing an issue is ask-first (the owner closes, or says so). In pull requests write `Refs #N`, never `Fixes #N`, so GitHub does not close an issue by accident.
- Designs are tested against the real problem and sized against the pain they remove; ask for the smallest version first.
- No new test infrastructure beyond what the change needs.
- Opus 5.5 only as a second pass for complex code changes (owner told first), never for docs; Sonnet 5.5 for code, reviews and releases; Haiku 4.5 for mechanical work (token economy, rule 5 below).
- Agent reports stay under 300 words, with detail in files. One agent run fits in one session; split bigger work before briefing.
- **Token economy.**
  1. One session per task. When a task is merged or released, the next one starts in a fresh session from the handover memory; a session is not kept open for a whole day.
  2. The manager makes small edits directly (document wording, a one-line config change, a rename, tracker or ADR text). An agent is for code, or for work of more than about ten lines.
  3. Reviewers review the diff only. They do not re-run the whole test suite when CI on that commit is green, and they stop after reporting. A documentation-only follow-up commit is not re-reviewed (CI is the check); code and procedure changes still get an independent review.
  4. Agents never wait for or poll CI and send one report only; the manager checks CI.
  5. Model by task: Haiku 4.5 for mechanical work (documents, README, renames, log reading, status checks); Sonnet 5.5 for code, reviews and releases; Opus only as in the line above.
  6. Fewer, larger pull requests: related changes are batched instead of one pull request per tweak.
  7. Decide before building. For a design with a trade-off the manager gives the owner a recommendation first and starts a builder only after the owner's yes.
  8. At most two agents running at once, to stay under the session limit.
- Documentation changes accompany the change that makes them necessary: same branch, same pull request, reviewed together (section 2b).
- British English, dates DD-MM-YYYY, times UTC, no emoji.

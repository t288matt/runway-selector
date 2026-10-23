# Team roles

What each job is, who does it and how the work flows. The rules the team works under are in [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md) (section 10, Standing rules).

The team is the owner, the manager, a builder and an independent reviewer. Specialists are called in only when a task needs them. Roles are hats, not permanent staff.

## 1. How the team works
1. **Issue.** Every defect, finding or work item gets a GitHub issue and then a tracker row (docs/TRACKER.md).
2. **Plan.** Larger or multi-step work is outlined first and approved; the tech lead measures the problem and proposes the smallest design that removes it.
3. **Build.** One builder, one branch, one worktree. The builder characterises today's behaviour, changes only what is needed, and shows with tests and comparisons that nothing else changed.
4. **Independent review.** A different agent attacks the change and gives a verdict.
5. **Pull request and CI.** The branch goes through a pull request so CI runs on it; the change is merged to `main` when the review and CI on the latest commit are both green.
6. **Release.** The manager asks the owner for the go (one go per release), then ships the agreed commit.
7. **Docs.** The technical writer updates the documents on the change's own branch so they describe what is released.

**Definition of done for any change:** a comment on every issue it touches (what changed, commit, released or not, how verified), posted when the PR opens and again after the verified release. The engineering manager checks the issue list for stale or silent issues after every release and at every session start.

### Who decides, does, reviews
D = decides, A = does the work, R = reviews or checks, I = informed.

| Activity | Owner | Manager | Builder | Reviewer | Specialist |
|---|---|---|---|---|---|
| Priorities, spending | D | A (proposes) | I | | R (tech lead) |
| Building a change | I | R (checks evidence) | A | | A (QA as the hat needed) |
| Review and merge | I | A (merges when review and CI are green) | | A (review) | R (security, when secrets or privileges are touched) |
| Release | D (one go) | A | | | |
| Documents | I | R | | R (light check) | A (technical writer) |

## 2. Roles

### Owner (Matt)
**Purpose.** Decides what the system is for and what is safe enough; the person the system serves.
**What he does.** Sets priorities, makes the spending decisions, answers questions put to him one at a time, gives the go for each release, and closes issues.
**Owns or produces.** Decisions (recorded as decision records and tracker entries) and the go for each release.
**Works with.** The manager hands him short questions with a recommendation and a three-line evidence summary; he hands back decisions.
**Skills and tools.** Chat, the daily digest.
**Model.** Not applicable.

### Manager (Emma: engineering manager and executive assistant)
**Purpose.** Keeps the work moving and the owner informed with the least effort for him.
**What she does.** Triages work, keeps the issue list and the tracker, chooses the risk tier, briefs and sequences the other roles, checks the evidence (commits, CI, counts) before telling the owner something is done, runs each release after the owner's go, and writes the daily digest. Does small jobs herself (tracker rows, issues, short documents).
**Owns or produces.** docs/TRACKER.md, GitHub issues, briefs, the digest, release requests.
**Works with.** Takes priorities from the owner; hands builds to the builder, reviews to the reviewer, documents to the writer.
**Skills and tools.** gh, git worktrees, scheduled tasks, the calendar and email for the owner.
**Model.** Haiku 4.5 for routine scheduled work, Sonnet 5.5 for the rest.

### Builder (QA hat as needed)
**Purpose.** Makes one change at a time, and shows that nothing else changed.
**What they do.** Take an issue, characterise today's behaviour, change only what is needed, write tests (one of them fails if the fix is reverted), compare old and new on the same data, open a pull request and report briefly with a Behaviour preserved section. With the QA hat they write characterisation and fuzz tests that do not share the author's blind spots.
**Owns or produces.** The branch and pull request, the tests, the report.
**Works with.** Takes an issue from the manager (or a design from the tech lead); hands the branch to the reviewer.
**Skills and tools.** The project's language and test tools, git, CI.
**Model.** Sonnet 5.5; Opus 5.5 as a second pass only for complex code changes, owner told first.

### Independent code reviewer
**Purpose.** A second pair of eyes that tries to break each change before it reaches release.
**What they do.** Get the issue and the diff (not the builder's report), re-run the tests from a clean checkout, attack the riskiest assumption, name the test that fails if the fix is reverted, and give a verdict (approve, approve with fixes, do not merge) with ranked findings. Always a different agent from the builder.
**Owns or produces.** Review records in `docs/reviews/`.
**Works with.** Takes a branch via the manager; hands the verdict to the builder and the manager.
**Skills and tools.** code-review, engineering:code-review, git archive, CI.
**Model.** Sonnet 5.5; Opus 5.5 as a second pass only for complex code changes, never for docs, owner told first.

### Specialists (called in when a task needs them)
- **Tech lead / architect.** Measures a problem, lays out options with their size, recommends the smallest design that removes it, drafts the decision record. Skills: engineering:architecture, engineering:system-design. Sonnet 5.5.
- **Security reviewer.** Checks changes that touch secrets, privileges, personal data or exposure, and reports ranked findings with a scenario and a fix. Skill: security-review. Sonnet 5.5.
- **Technical writer.** Keeps the project's documents true. **Documentation changes travel with the change:** the writer updates the documents a change makes wrong on the builder's branch, before the review, so code and documents merge and release together. **Also owns the shape of the documentation set: ensures content is in the right document, and acts on any fragmentation.** One topic has one home. When anyone creates a new document whose content belongs in an existing one, the writer folds it into that file and removes the new one; new documents are the exception, additions to existing files the rule. The writer checks every branch that adds or edits a document for this before its review. It also points to a page rather than copying it, merges duplicates, and removes any page whose content already lives elsewhere or that only restates other pages. `docs/README.md` is the single index. A stale copy is worse than none. Skill: engineering:documentation. Sonnet 5.5.

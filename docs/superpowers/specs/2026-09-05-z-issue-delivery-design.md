# Z Issue Delivery Design

**Date:** 2026-09-05
**Status:** Approved

## Purpose

Connect approved `/z-design` results to one explicit GitHub issue. Make `/z-implement` implement and safely land that issue.

The GitHub issue tracks work. A committed specification remains authoritative for architectural designs. The approved issue body is authoritative for bounded designs.

## User interface

### Design command

```text
/z-design <request>
```

The command keeps its clean-session design workflow. After the user approves the final design, it creates exactly one GitHub issue.

### Implementation command

```text
/z-implement <issue-number-or-url>
```

The command accepts one issue number, `#` reference, or GitHub issue URL. It implements, verifies, reviews, squash-merges, closes, and synchronizes that issue.

The direct skill keeps the existing design-path fallback:

```text
/skill:z-implement <repository-relative-design-path>
```

Path mode has no issue to close. It retains the existing Superpowers implementation and integration-choice workflow.

## Design issue contract

`/z-design` creates the issue only after final user approval. It does not create draft issues.

The command infers the repository from the current Git checkout. It uses `gh` for GitHub operations. It creates the `approved-design` label when the repository does not have it.

Each issue body starts with this machine-readable header:

```text
<!-- z-design:v1 -->
Design-Class: bounded | architectural
Design-Status: approved
Design-Path: issue-body | <repository-relative Markdown path>
Design-Commit: none | <full Git commit SHA>
```

The body then contains:

- The original request.
- The approved design.
- Testable acceptance criteria.
- Explicit out-of-scope work.

For a bounded design, the issue body contains the complete approved design. `Design-Path` is `issue-body` and `Design-Commit` is `none`.

For an architectural design, the issue links the committed specification. The path and full commit SHA identify its approved version. The issue can summarize the design but does not replace it.

The issue receives the `approved-design` label. If issue creation fails, the command reports the error and preserves the approved design or committed specification.

## Implementation readiness

`/z-implement` reads only the explicit issue supplied by the user. It never scans the backlog or selects an issue.

Before implementation, it verifies:

- The current directory belongs to the same GitHub repository as the issue.
- The issue is open.
- The issue has the `approved-design` label.
- The issue contains the `z-design:v1` header.
- The design class and source fields are valid.
- The primary checkout has no tracked, staged, or unrelated untracked changes.
- The default branch matches its remote tracking branch.

The generated `.codegraph/` directory does not make the checkout dirty. Other untracked files remain blockers.

For an architectural design, it also verifies:

- The design path is repository-relative Markdown.
- The design commit exists and is an ancestor of the current default branch.
- The design file exists at that commit and in the current default branch.
- The file has not changed since the approved design commit.

A failed readiness check stops before branch or worktree creation. It leaves the issue open.

## Implementation workflow

The implementation branch is `issue-<number>`. Existing local or remote branches with that name stop the workflow unless they belong to a resumable run for the same issue.

The command records the primary checkout path before worktree creation. It then uses the installed Superpowers worktree workflow.

For an architectural design:

1. Read the committed specification.
2. Run the existing readiness review.
3. Use the Superpowers writing-plans workflow.
4. Execute the plan through the available approved execution workflow.

For a bounded design:

1. Treat the approved issue body as the design.
2. Skip a separate implementation-plan document.
3. Use test-driven development in the isolated workspace.
4. Complete the smallest implementation that satisfies the acceptance criteria.

Both paths follow repository instructions. Both run the applicable full test suite and required review before delivery.

## Delivery workflow

Invocation authorizes delivery. The command description must state that it implements and lands the issue.

After implementation and review succeed:

1. Verify the implementation worktree is clean.
2. Push `issue-<number>` without force.
3. Create one pull request into the repository default branch.
4. Put `Closes #<number>` in the pull-request body.
5. Wait for all required checks and reviews.
6. Stop on any failure or unresolved review finding.
7. Record the current head commit.
8. Squash-merge with head-commit protection and remote-branch deletion.
9. Never use an administrative bypass.
10. Verify GitHub reports the pull request as merged into the default branch.
11. Verify the issue is closed.
12. If GitHub did not close it, close it only after merge verification and reference the pull request.

The repository decides whether squash merging is available. The workflow stops if it is unavailable.

## Local synchronization and cleanup

After remote merge verification:

1. Operate on the recorded primary checkout, not the implementation worktree.
2. Verify the primary checkout is still safe to update.
3. Switch it to the repository default branch.
4. Pull with `--ff-only`.
5. Verify the local default branch matches its remote branch.
6. Run `codegraph sync` against the primary checkout.
7. Remove the clean implementation worktree.
8. Prune worktree metadata.
9. Delete the local implementation branch only after verified squash merge.

On Windows, use the full CodeGraph command under `%LOCALAPPDATA%\codegraph\current\bin\codegraph.cmd`. On other platforms, use the available `codegraph` executable.

Squash merge does not make the feature branch an ancestor of the default branch. Local force deletion is permitted only after the verified pull-request merge and clean-worktree checks.

## Recovery and error handling

The workflow is resumable.

Before remote merge, a failure preserves the issue, branch, pull request, and worktree. It reports the failed gate.

After remote merge, a local failure never repeats implementation or creates another pull request. A rerun detects the merged pull request and resumes issue closure, local synchronization, CodeGraph synchronization, and cleanup.

A CodeGraph failure does not reopen the issue or undo the merge. The command reports that delivery succeeded and local indexing failed.

The workflow never stashes, resets, force-pushes, removes a dirty worktree, or bypasses required checks automatically.

## Components

### `extensions/z-design/index.ts`

Keep the clean-session router. Extend its prompt with the approved issue contract and issue-creation stop condition.

### `extensions/z-implement/index.ts`

Keep the clean-session handoff. Change the primary argument to one explicit issue reference. Update the description and usage text to state full delivery.

### `skills/z-implement/SKILL.md`

Add issue validation, bounded and architectural routing, delivery gates, resumable completion, local synchronization, and safe cleanup. Preserve the existing path-mode workflow. Continue to delegate detailed procedures to installed Superpowers skills.

No dependency or helper script is required.

## Verification

Extension tests verify:

- Empty arguments stop before session replacement.
- Each command waits for idle and opens a clean session.
- `/z-design` includes the issue contract and creates no issue before approval.
- `/z-implement` passes the exact issue reference to the skill.
- `/z-implement` describes implementation and landing.
- Cancelled session replacement is reported.

Skill checks verify the required issue validation, merge gates, issue closure, fast-forward pull, CodeGraph synchronization, recovery behavior, and path fallback.

Run both Node test files and `git diff --check`. Reload Pi after integration.

## Non-goals

- Scan or batch open issues.
- Select work without an explicit issue reference.
- Create draft issues before design approval.
- Add a frontend, dependency, state database, or helper process.
- Bypass tests, reviews, branch protection, or merge restrictions.
- Modify upstream Superpowers skills.

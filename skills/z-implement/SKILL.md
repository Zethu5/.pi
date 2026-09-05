---
name: z-implement
description: Use when the user explicitly invokes implementation and delivery of one approved GitHub issue, or directly invokes one approved Superpowers design path.
---

# Z Implement

Implement one approved design through the installed Superpowers workflows. Issue mode also lands the change. Upstream skills remain authoritative for their procedures.

## Invocation contract

Treat the complete argument as one value.

Use path mode when it is a repository-relative Markdown path. Use issue mode when it is one issue number, `#` reference, or GitHub issue URL. Reject other input.

Issue-mode invocation confirms design approval, worktree consent, and squash-delivery consent. Do not ask for these approvals again. Do not scan, list, or select backlog issues.

## Issue readiness

Use `gh issue view` to read only the explicit issue. Verify its repository matches the current GitHub checkout.

Before requiring the issue to be open, inspect recovery state. For a verified matching merged pull request, use Recovery; this is the only closed-issue exception.

Require an open issue with the `approved-design` label and this header:

```text
<!-- z-design:v1 -->
Design-Class: bounded | architectural
Design-Status: approved
Design-Path: issue-body | <repository-relative Markdown path>
Design-Commit: none | <full Git commit SHA>
```

Require `Design-Status` to equal `approved`.

For a bounded design, require `Design-Path: issue-body` and `Design-Commit: none`.

For an architectural design, require a repository-relative Markdown `Design-Path` and a full `Design-Commit` SHA. Reject every other field combination.

Capture the issue number, URL, title, body, repository, default branch, and primary checkout path. Require repository support for squash merge.

Fetch the default branch. Require the primary checkout to use that branch and match `origin/<default-branch>`. Stop for tracked, staged, or unrelated untracked changes. Ignore only generated `.codegraph/` contents. Never stash, reset, clean, or discard checkout changes automatically.

A failed readiness check leaves the issue open and creates no branch or worktree.

For an architectural issue, validate that the design path is repository-relative Markdown. Require its full design commit to exist in the default-branch history. Require the file at that commit and at the current default branch. Stop if its content changed after approval.

## Recovery

Use branch `issue-<number>`. Before creating anything, inspect local and remote branches and all pull requests with that head.

Resume one matching open pull request. Never create a duplicate. If a matching pull request is already merged, skip implementation and resume issue closure, local synchronization, CodeGraph synchronization, and cleanup. A closed issue is valid only for this verified post-merge recovery.

Stop on an unrelated existing branch, multiple matching pull requests, or a closed-unmerged pull request.

## Implementation

Record the primary checkout before entering isolation. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create or resume the isolated `issue-<number>` workspace.

For `Design-Class: bounded`, treat the approved issue body as the complete design. **REQUIRED SUB-SKILL:** Use `superpowers:test-driven-development`. Do not create an implementation-plan document.

For `Design-Class: architectural`, read the complete approved design and referenced inputs. Stop for a material readiness blocker. **REQUIRED SUB-SKILL:** Use `superpowers:writing-plans`. Preserve the design path in the plan `Spec` field and complete its self-review.

For architectural execution, call `subagent` with `action: "list"` and `capabilities: true`. Use only executable, non-disabled agents. Require `runner.available` for external CLI agents. Use `superpowers:subagent-driven-development` when suitable. Otherwise use `superpowers:executing-plans`.

Continue until implementation completes or an upstream stop condition applies.

## Verification and review

Run the applicable full test suite on the final branch. **REQUIRED SUB-SKILL:** Use `superpowers:verification-before-completion`.

**REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review`. Resolve every blocking finding and rerun affected checks. Require a clean implementation worktree.

Do not invoke `superpowers:finishing-a-development-branch` in issue mode. This command already selects delivery.

## Squash delivery

Push `issue-<number>` without force. Create or reuse exactly one pull request into the default branch. Put `Closes #<number>` in its body.

Wait for all required checks and reviews. Stop on failure or an unresolved finding. Never use `--admin` or force-push.

Capture the current head SHA. Squash-merge with remote branch deletion and head protection:

```text
gh pr merge <pr> --squash --delete-branch --match-head-commit <head-sha>
```

Verify through GitHub that the pull request is merged into the default branch. Only then verify that the issue is closed. If automatic closure failed, close it with a comment that references the merged pull request. Then use `gh issue view` to confirm its state is `closed` before synchronization or cleanup.

## Primary-checkout synchronization

Operate on the recorded primary checkout, not the implementation worktree. Verify it is still safe to update. Switch to the default branch and run:

```text
git pull --ff-only origin <default-branch>
```

Require local and remote default-branch SHAs to match.

Run CodeGraph sync against the primary checkout. On Windows, use `%LOCALAPPDATA%\codegraph\current\bin\codegraph.cmd sync <primary-checkout>`. Otherwise use the available `codegraph sync <primary-checkout>` command.

Remove only the owned clean implementation worktree, then prune worktree metadata. Because squash merge does not preserve feature-branch ancestry, run `git branch -D issue-<number>` only after GitHub verifies the pull request was squash-merged, the primary default branch matches `origin/<default-branch>` after `git pull --ff-only`, and the owned implementation worktree is clean and removed.

## Failure reporting

Before merge, preserve the issue, branch, pull request, and worktree when a step fails.

After merge, never repeat implementation or create another pull request. Resume remaining closure, synchronization, and cleanup steps. A CodeGraph failure does not reopen the issue or undo delivery.

Report the exact completed stage, failed command or gate, issue URL, pull-request URL, branch, primary checkout, and preserved worktree.

## Path compatibility

For a repository-relative Markdown path, preserve the prior workflow. Reject absolute paths and paths outside the current repository. Require a Markdown file that exists in `HEAD`.

Read the design and referenced inputs. Stop for material blockers. Use `superpowers:using-git-worktrees`, `superpowers:writing-plans`, and the available approved execution workflow.

Path mode has no issue lifecycle. Use the normal `superpowers:finishing-a-development-branch` integration choice after verification.

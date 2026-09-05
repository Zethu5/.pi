# Z Issue Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/z-design` create one approved GitHub issue and make `/z-implement` implement and safely land one explicit issue.

**Architecture:** Keep both Pi extensions as thin clean-session routers. Put the issue contract in the design routing prompt and the implementation lifecycle in the `z-implement` coordinator skill. Reuse GitHub CLI, Git, CodeGraph, and installed Superpowers workflows without new dependencies.

**Tech Stack:** Pi TypeScript extension API, Agent Skills Markdown, GitHub CLI, Git, CodeGraph CLI, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-z-issue-delivery-design.md`

## Global Constraints

- Create an issue only after final design approval.
- Read and implement only one explicit issue.
- Keep architectural specifications authoritative in Git.
- Keep bounded approved designs in their issue bodies.
- Require the `approved-design` label and `z-design:v1` metadata.
- Never bypass tests, reviews, branch protection, or merge restrictions.
- Squash-merge before issue closure and local synchronization.
- Pull the default branch with `--ff-only`.
- Run CodeGraph synchronization after the verified pull.
- Preserve resumable remote state after any failure.
- Preserve the direct design-path skill workflow.
- Do not modify upstream Superpowers skills.
- Do not stage unrelated working-tree changes.

---

### Task 1: Add the approved-issue handoff to `/z-design`

**Files:**
- Modify: `extensions/z-design/index.test.ts`
- Modify: `extensions/z-design/index.ts`

**Interfaces:**
- Consumes: `/z-design <request>` and the completed Superpowers design dialogue.
- Produces: One verified GitHub issue with `approved-design` and `z-design:v1` metadata after user approval.

- [ ] **Step 1: Add failing prompt-contract assertions**

Add these assertions to the existing routing-prompt test:

```typescript
assert.match(prompt, /only after final user approval/i);
assert.match(prompt, /approved-design/);
assert.match(prompt, /<!-- z-design:v1 -->/);
assert.match(prompt, /Design-Class: bounded \| architectural/);
assert.match(prompt, /Design-Status: approved/);
assert.match(prompt, /Design-Path:/);
assert.match(prompt, /Design-Commit:/);
assert.match(prompt, /testable acceptance criteria/i);
assert.match(prompt, /out-of-scope/i);
assert.match(prompt, /gh issue view/);
```

Keep the current routing, empty-input, and cancellation assertions.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
node --test extensions/z-design/index.test.ts
```

Expected: a new issue-contract assertion fails.

- [ ] **Step 3: Add the exact issue-handoff prompt**

Insert this section before `## Request` in `buildRoutingPrompt()`:

```text
## Approved GitHub issue handoff

Only after final user approval, create exactly one GitHub issue in the current repository:

1. Confirm the current directory is a Git repository with a GitHub remote. Use `gh` for GitHub operations.
2. Do not create a draft or pre-approval issue.
3. Check for the exact `approved-design` label. Create it only when absent, with description `Approved design ready for implementation`. Do not replace an existing label.
4. Start the issue body with this exact header:

<!-- z-design:v1 -->
Design-Class: bounded | architectural
Design-Status: approved
Design-Path: issue-body | <repository-relative Markdown path>
Design-Commit: none | <full Git commit SHA>

5. For a bounded design, put the complete approved design in the issue body. Use `issue-body` and `none` for its source fields.
6. For an architectural design, use the committed approved specification path and the full commit SHA that contains it. Verify that version before issue creation.
7. Include the original request, approved design summary, testable acceptance criteria, and explicit out-of-scope work. Include no secrets.
8. Create a concise issue title and apply `approved-design`.
9. Verify the URL, state, labels, and body with `gh issue view`.
10. Report the issue URL, then stop. Do not write an implementation plan or implement the request.

If GitHub validation or issue creation fails, report the exact error. Preserve the approved in-session design or committed specification.
```

Keep all existing feature, bug-fix, ambiguous, and unsupported-request routing.

- [ ] **Step 4: Run the focused test and verify success**

```bash
node --test extensions/z-design/index.test.ts
```

Expected: all `/z-design` tests pass.

- [ ] **Step 5: Commit only the design-command files**

```bash
git add extensions/z-design/index.ts extensions/z-design/index.test.ts
git commit -m "feat: create issues from approved designs"
```

### Task 2: Change `/z-implement` to accept one issue

**Files:**
- Modify: `extensions/z-implement/index.test.ts`
- Modify: `extensions/z-implement/index.ts`

**Interfaces:**
- Consumes: `/z-implement <issue-number-or-url>`.
- Produces: A clean session whose first expanded command is `/skill:z-implement <exact-issue-reference>`.

- [ ] **Step 1: Update tests for the issue interface**

Make `getHandler()` also capture the registered description. Change the success input to `#42`, then assert:

```typescript
assert.equal(prompt, "/skill:z-implement #42");
assert.match(description, /implement and land/i);
```

Change the empty-input expectation to:

```typescript
assert.deepEqual(notification, {
  message: "Usage: /z-implement <issue-number-or-url>",
  level: "warning",
});
```

Use `#42` in the cancelled-session test. Keep the idle wait, replacement, exact trimming, expansion, and cancellation checks.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
node --test extensions/z-implement/index.test.ts
```

Expected: the old description or usage assertion fails.

- [ ] **Step 3: Replace the extension with this implementation**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("z-implement", {
    description: "Implement and land one approved GitHub issue in a clean session",
    handler: async (args, ctx) => {
      const issueReference = args.trim();
      if (!issueReference) {
        ctx.ui.notify("Usage: /z-implement <issue-number-or-url>", "warning");
        return;
      }

      await ctx.waitForIdle();
      const result = await ctx.newSession({
        withSession: async (replacementCtx) => {
          await replacementCtx.sendUserMessage(
            `/skill:z-implement ${issueReference}`,
            { expandPromptTemplates: true },
          );
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("New session cancelled", "info");
      }
    },
  });
}
```

- [ ] **Step 4: Run the focused test and verify success**

```bash
node --test extensions/z-implement/index.test.ts
```

Expected: all `/z-implement` extension tests pass.

- [ ] **Step 5: Commit only the implementation-command files**

```bash
git add extensions/z-implement/index.ts extensions/z-implement/index.test.ts
git commit -m "feat: route z-implement through issues"
```

### Task 3: Add issue execution and delivery to the coordinator skill

**Files:**
- Modify: `extensions/z-implement/index.test.ts`
- Modify: `skills/z-implement/SKILL.md`

**Interfaces:**
- Consumes: One explicit GitHub issue reference in issue mode, or one repository-relative Markdown path in compatibility mode.
- Produces: A verified implementation and issue delivery, or a precise resumable stop report.

- [ ] **Step 1: Run RED pressure samples without the skill**

Run five fresh-agent samples without loading `z-implement`. Give each sample the same cases: missing approval metadata, failed checks under delivery pressure, dirty primary checkout, post-merge recovery, and the successful delivery order.

Record each decision and unsafe action. Confirm that at least one sample misses a required contract. If every sample already complies, stop and keep the current skill unchanged.

- [ ] **Step 2: Add a failing skill-contract test**

Add this import and test to `extensions/z-implement/index.test.ts`:

```typescript
import { readFileSync } from "node:fs";

const skill = readFileSync(
  new URL("../../skills/z-implement/SKILL.md", import.meta.url),
  "utf8",
);

test("z-implement skill defines safe issue delivery", () => {
  assert.match(skill, /approved-design/);
  assert.match(skill, /z-design:v1/);
  assert.match(skill, /Design-Class/);
  assert.match(skill, /issue-body/);
  assert.match(skill, /Closes #/);
  assert.match(skill, /--squash/);
  assert.match(skill, /--match-head-commit/);
  assert.match(skill, /--ff-only/);
  assert.match(skill, /codegraph/i);
  assert.match(skill, /resum/i);
  assert.match(skill, /Do not scan/i);
  assert.match(skill, /repository-relative Markdown path/);
});
```

- [ ] **Step 3: Run the test and verify failure**

```bash
node --test extensions/z-implement/index.test.ts
```

Expected: the new skill-contract test fails.

- [ ] **Step 4: Replace the coordinator skill with this content**

````markdown
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

Require an open issue with the `approved-design` label and this header:

```text
<!-- z-design:v1 -->
Design-Class: bounded | architectural
Design-Status: approved
Design-Path: issue-body | <repository-relative Markdown path>
Design-Commit: none | <full Git commit SHA>
```

Capture the issue number, URL, title, body, repository, default branch, and primary checkout path. Require repository support for squash merge.

Fetch the default branch. Require the primary checkout to use that branch and match `origin/<default-branch>`. Stop for tracked, staged, or unrelated untracked changes. Ignore only generated `.codegraph/` contents.

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

Verify through GitHub that the pull request is merged into the default branch. Only then verify that the issue is closed. If automatic closure failed, close it with a comment that references the merged pull request.

## Primary-checkout synchronization

Operate on the recorded primary checkout, not the implementation worktree. Verify it is still safe to update. Switch to the default branch and run:

```text
git pull --ff-only origin <default-branch>
```

Require local and remote default-branch SHAs to match.

Run CodeGraph sync against the primary checkout. On Windows, use `%LOCALAPPDATA%\codegraph\current\bin\codegraph.cmd sync <primary-checkout>`. Otherwise use the available `codegraph sync <primary-checkout>` command.

Remove only the owned clean implementation worktree, then prune worktree metadata. Because squash merge does not preserve feature-branch ancestry, delete the local `issue-<number>` branch forcibly only after verified pull-request merge and clean-worktree checks.

## Failure reporting

Before merge, preserve the issue, branch, pull request, and worktree when a step fails.

After merge, never repeat implementation or create another pull request. Resume remaining closure, synchronization, and cleanup steps. A CodeGraph failure does not reopen the issue or undo delivery.

Report the exact completed stage, failed command or gate, issue URL, pull-request URL, branch, primary checkout, and preserved worktree.

## Path compatibility

For a repository-relative Markdown path, preserve the prior workflow. Reject absolute paths and paths outside the current repository. Require a Markdown file that exists in `HEAD`.

Read the design and referenced inputs. Stop for material blockers. Use `superpowers:using-git-worktrees`, `superpowers:writing-plans`, and the available approved execution workflow.

Path mode has no issue lifecycle. Use the normal `superpowers:finishing-a-development-branch` integration choice after verification.
````

- [ ] **Step 5: Run the skill and extension checks**

```bash
node --test extensions/z-implement/index.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run GREEN pressure samples with the skill**

Run five fresh-agent samples with `z-implement` loaded. Use the same cases and scoring as Step 1.

Require every sample to stop at unsafe gates, preserve resumable state, and use the required successful delivery order. If a sample fails, change only the smallest skill text that closes the observed gap, then repeat the affected samples.

- [ ] **Step 7: Commit only the skill and its test**

```bash
git add skills/z-implement/SKILL.md extensions/z-implement/index.test.ts
git commit -m "feat: land approved issues safely"
```

### Task 4: Verify the complete command workflow

**Files:**
- Verify: `extensions/z-design/index.ts`
- Verify: `extensions/z-design/index.test.ts`
- Verify: `extensions/z-implement/index.ts`
- Verify: `extensions/z-implement/index.test.ts`
- Verify: `skills/z-implement/SKILL.md`

**Interfaces:**
- Consumes: The complete changed command set.
- Produces: Fresh test, formatting, and repository-state evidence.

- [ ] **Step 1: Run all focused tests together**

```bash
node --test extensions/z-design/index.test.ts extensions/z-implement/index.test.ts
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Verify the skill structure and size**

```bash
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const text = readFileSync("skills/z-implement/SKILL.md", "utf8");
assert.match(text, /^---\r?\nname: z-implement\r?\ndescription: /);
assert.ok(text.trim().split(/\s+/).length < 1400);
NODE
```

Expected: no output and exit status zero.

- [ ] **Step 3: Verify patch hygiene**

```bash
git diff --check HEAD~3..HEAD
git status --short
git diff --name-only HEAD~3..HEAD
```

Expected:

- `git diff --check` reports no errors.
- The three implementation commits contain only the five intended command files.
- Pre-existing unrelated changes remain unstaged and uncommitted.

- [ ] **Step 4: Reload Pi after integration**

Run `/reload` in Pi after this branch is integrated. Do not reload during the active command that changes the extension.

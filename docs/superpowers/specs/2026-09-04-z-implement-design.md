# Z Implement Design

**Date:** 2026-09-04
**Status:** Draft for final review

## Purpose

Add one command that starts implementation from an approved Superpowers design in a clean Pi session.

The command must preserve the Superpowers planning and execution workflows. It must not duplicate them.

## User interface

The primary command is:

```text
/z-implement <design-path>
```

`<design-path>` is one repository-relative Markdown path.

The skill remains directly available when a session reset is not wanted:

```text
/skill:z-implement <design-path>
```

Explicit invocation confirms design approval and permits creation of an isolated worktree.

## Components

### Pi extension

Create `extensions/z-implement/index.ts`.

The extension registers `/z-implement`. It trims and validates the command argument, waits for the current agent to become idle, and creates a clean session.

In the replacement session, it sends this command with skill expansion enabled:

```text
/skill:z-implement <design-path>
```

The extension contains no design-review, planning, or implementation rules.

### Pi skill

Create `skills/z-implement/SKILL.md`.

The skill coordinates these installed Superpowers skills:

- `superpowers:using-git-worktrees`
- `superpowers:writing-plans`
- `superpowers:subagent-driven-development`
- `superpowers:executing-plans`

Each referenced skill remains authoritative for its own workflow.

## Workflow

1. Require exactly one design path.
2. Resolve the path inside the current Git repository.
3. Require a Markdown file that exists in `HEAD`.
4. Read the full design, repository instructions, and referenced project inputs.
5. Review the design for implementation readiness.
6. Stop and report material blockers before creating a plan or changing code.
7. Invoke `superpowers:using-git-worktrees` to create or verify isolation.
8. Invoke `superpowers:writing-plans` inside the isolated workspace.
9. Preserve the exact design path in the plan's `Spec` field.
10. Complete the plan self-review required by `superpowers:writing-plans`.
11. Do not ask the standard execution-choice question.
12. On Pi, inspect subagent capabilities before selecting execution.
13. Prefer `superpowers:subagent-driven-development` when an executable subagent is available and suitable.
14. Otherwise, invoke `superpowers:executing-plans`.
15. Continue until the selected Superpowers workflow completes or reaches one of its defined stop conditions.

## Readiness rules

A material blocker is an unresolved issue that can change:

- Feature scope.
- An external interface.
- Data ownership or persistence.
- Security behavior.
- Acceptance criteria.

Placeholders and internal contradictions are blockers when they affect one of these areas.

Ordinary implementation choices are not blockers. The planning workflow resolves them from repository patterns and the approved design.

A draft-status label does not block this command. Explicit invocation is the approval signal.

When blocked, report this form and stop:

```text
Cannot implement <design-path>:
- <section>: <specific blocker>
```

Do not create a plan, worktree changes, or implementation code after this result.

## Error handling

The extension reports command usage when the argument is empty. It does not replace the session.

The extension reports when another extension cancels session replacement.

The skill stops when the path is outside the repository, is not Markdown, is absent, or is not tracked in `HEAD`.

Existing Superpowers stop rules remain active. These include failed baseline tests, destructive actions, security-sensitive actions, and an irrecoverably broken plan.

## Verification

### Extension tests

Create `extensions/z-implement/index.test.ts` with Node test cases that verify:

- Empty input reports usage and does not replace the session.
- The command waits for idle before session replacement.
- The replacement session receives the exact skill command.
- Skill and prompt expansion is enabled.
- Cancelled session replacement produces a notification.

### Skill evaluations

Use fresh agents for RED and GREEN evaluation.

Run five baseline samples without `z-implement`. Run the same five samples with the skill.

The scenarios verify these decisions:

1. A ready design proceeds from planning directly into execution.
2. A material contradiction stops work despite deadline pressure.
3. Missing subagent capability selects inline execution instead of stopping or fabricating a tool.

Add only instructions that correct failures observed during baseline evaluation.

## Deployment

Store the design and implementation plan under `docs/superpowers/` in the personal Pi configuration repository.

Commit only new `z-implement` files. Do not stage or modify unrelated working-tree changes.

After integration, run `/reload` so Pi discovers the new extension and skill.

## Non-goals

- Replace or modify an upstream Superpowers skill.
- Copy Superpowers planning or execution rules.
- Select a design automatically.
- Accept an untracked design.
- Add configuration, dependencies, or helper scripts.

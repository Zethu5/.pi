---
name: z-implement
description: Use when the user explicitly invokes implementation of one approved Superpowers design from a repository-relative Markdown path.
---

# Z Implement

Turn one approved design into implementation through the installed Superpowers workflows. Those skills remain authoritative for their procedures.

## Invocation contract

Treat the complete user argument as one path. Invocation confirms design approval and permits creation of an isolated worktree. Do not ask for either approval again.

Validate that the path:

- Is repository-relative. Reject absolute paths before resolution.
- Resolves inside the current Git repository.
- Names a Markdown file.
- Exists in `HEAD`.

If validation fails, report the specific condition and stop.

## Readiness review

Read the complete design, repository instructions, and referenced project inputs.

A material blocker is an unresolved issue that changes scope, an external interface, data ownership, persistence, security behavior, or acceptance criteria. Affected placeholders and contradictions are blockers. Ordinary implementation choices and a draft-status label are not blockers.

When blocked, stop before creating a plan or changing code:

```text
Cannot implement <design-path>:
- <section>: <specific blocker>
```

## Handoff

1. **REQUIRED SUB-SKILL:** Use `superpowers:using-git-worktrees` to create or verify isolation.
2. **REQUIRED SUB-SKILL:** Use `superpowers:writing-plans` inside that workspace.
3. Preserve the exact design path in the plan `Spec` field and complete the plan self-review.
4. Continue directly to execution. Do not ask the standard execution-choice question.
5. On Pi, call `subagent` with `action: "list"` and `capabilities: true` before subagent execution. Use only executable, non-disabled agents. Require `runner.available` for external CLI agents.
6. **REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development` when a suitable executable agent is available.
7. **REQUIRED SUB-SKILL:** Otherwise use `superpowers:executing-plans` for inline execution.
8. Continue until the selected workflow completes or reaches one of its defined stop conditions.

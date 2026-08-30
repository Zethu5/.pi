---
name: z-spec-kit-workflow
description: Orchestrates feature development with GitHub Spec Kit from a goal through delivery. Use for specification, planning, tasks, issues, implementation, and convergence.
---

# Spec Kit Workflow
Use Spec Kit for feature development. Let the current runtime control subagents.

## Default workflow

1. Run `speckit.specify`.
2. Run `speckit.clarify` only for material ambiguity.
3. Run `speckit.plan`.
4. Run `speckit.checklist` only when it adds a useful quality gate.
5. Run `speckit.tasks`.
6. Run `speckit.analyze` once before implementation.
7. Create GitHub issues only when the user or repository requires them.
8. Run `speckit.implement` with focused checks after each task. Run tests only through GitHub Actions.
9. Review and run all applicable checks once at the delivery gate.
10. Deliver one feature or milestone pull request.
11. Run `speckit.converge` after delivery for a non-trivial feature.

For a small, low-risk feature, use `specify → plan → tasks → implement`.

## Artifact ownership
Each fact has one source of truth.

- `spec.md` owns requirements and acceptance criteria.
- `plan.md` owns technical decisions.
- `tasks.md` owns implementation order.
- Contract files own external data formats.
- GitHub issues reference requirement and task identifiers.

Do not copy complete requirements into multiple artifacts. Update an artifact only when its owned information changes.

## Task and issue size

Each task must cover one behavior or one cohesive calculation. Split tasks with unrelated formats or more than three independent gates.

Combine adjacent test-only tasks when the production behavior already exists. Keep detailed implementation steps in `tasks.md`.

Create issues for independently deliverable vertical slices. Do not create an issue for each test, parser, or documentation update.

Add all relevant repository labels when you create each GitHub issue.

Prefer three to five milestone issues for one feature. Preserve acceptance criteria and explicit dependencies through references.

## Dependencies and parallel work
Declare a dependency only when one task needs another task's output. Shared feature membership does not create a dependency.

Parallelize tasks that change separate files or test separate behavior. Assign one writer to each shared file.

## Implementation and checks

Follow repository rules and use test-first development when required. Reuse existing code and standard tools.

During implementation:

- Do not run tests locally.
- Run tests through the applicable remote GitHub Actions workflow.
- Inspect the remote result before you continue.
- Run local Python checks, except tests, only after Python changes.
- Run local client checks, except tests, only after client changes.
- Run container builds only after container-related changes.
- Do not run other remote delivery steps during each red-green cycle.

Before delivery, run every applicable test through GitHub Actions. Run each applicable full check once.

## Delivery strategy

Use feature-level or milestone-level delivery by default.

1. Commit related tasks at one stable milestone.
2. Push one feature branch.
3. Create one pull request for that milestone.
4. Close all completed issues through that pull request.
5. Verify that the change reached `origin/main`.
6. Update local main:

   ```sh
   git switch main
   git pull --ff-only origin main
   ```

7. Run `codegraph sync` after the merge when the repository requires it.
8. Add one verification summary to the related issues.

Use separate issue delivery only when the issue ships independently, has high risk, or repository rules require it.

Stop if a required check, commit, push, merge, or synchronization fails. Keep affected issues open.

## Token controls
Read each large artifact once per workflow phase. Create one concise implementation brief for subagents.

The brief contains requirement identifiers, changed paths, dependencies, acceptance tests, and unresolved decisions.

Do not ask each subagent to inspect the complete specification set. Resume an existing subagent for related tasks when possible.

Use one scout before implementation. Use one correctness review at the delivery gate. Avoid repeated reviews after small tasks.

## Long validation

Keep long live trials outside implementation tasks. First verify the observer with fixtures and a short dry run.

Run required live windows as one operational milestone. Repeat a trial only when a change can affect its result.

## Completion
A feature is complete when behavior matches the specification, applicable checks pass, and the change reaches the default branch.

Confirm affected services or state that no service update was necessary. Report unresolved convergence findings and operational limits.

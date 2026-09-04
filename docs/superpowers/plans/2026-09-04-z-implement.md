# Z Implement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/z-implement` and `/skill:z-implement` as clean, explicit entrypoints from an approved Superpowers design to implementation.

**Architecture:** A small Pi extension opens a clean session and expands the personal skill command. The skill validates one design path, then composes existing Superpowers worktree, planning, and execution skills without copying their procedures.

**Tech Stack:** Pi TypeScript extension API, Agent Skills Markdown, Node.js 24 test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-z-implement-design.md`

## Global Constraints

- Keep all work in the personal Pi configuration repository.
- Do not modify upstream Superpowers skills.
- Accept only one explicit repository-relative Markdown design path that exists in `HEAD`.
- Treat invocation as design approval and worktree consent.
- Stop before planning or code when the design has a material blocker.
- Prefer subagent-driven execution after capability discovery; otherwise execute inline.
- Add no dependencies, configuration, helper scripts, or copied Superpowers procedures.
- Do not stage or modify unrelated working-tree changes.

---

### Task 1: Add the `z-implement` coordinator skill

**Files:**
- Create: `skills/z-implement/SKILL.md`

**Interfaces:**
- Consumes: The complete `/skill:z-implement` argument as one repository-relative design path.
- Produces: A discoverable `z-implement` skill that transfers control to installed Superpowers skills.

- [ ] **Step 1: Run the missing-skill check**

Run:

```bash
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

assert.ok(
  existsSync("skills/z-implement/SKILL.md"),
  "z-implement skill must exist",
);
NODE
```

Expected: FAIL with `AssertionError: z-implement skill must exist`.

The completed five-sample RED evaluation found no workflow-policy failure. Therefore, add no rationalization table or duplicated doctrine.

- [ ] **Step 2: Write the minimal skill**

Create `skills/z-implement/SKILL.md` with this exact content:

````markdown
---
name: z-implement
description: Use when the user explicitly invokes implementation of one approved Superpowers design from a repository-relative Markdown path.
---

# Z Implement

Turn one approved design into implementation through the installed Superpowers workflows. Those skills remain authoritative for their procedures.

## Invocation contract

Treat the complete user argument as one path. Invocation confirms design approval and permits creation of an isolated worktree. Do not ask for either approval again.

Validate that the path:

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
````

- [ ] **Step 3: Validate the skill structure**

Run:

```bash
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "skills/z-implement/SKILL.md";
const text = readFileSync(path, "utf8");
const words = text.trim().split(/\s+/).length;

assert.match(text, /^---\r?\nname: z-implement\r?\ndescription: Use when /);
assert.match(text, /superpowers:using-git-worktrees/);
assert.match(text, /superpowers:writing-plans/);
assert.match(text, /superpowers:subagent-driven-development/);
assert.match(text, /superpowers:executing-plans/);
assert.match(text, /Do not ask the standard execution-choice question/);
assert.match(text, /action: "list"/);
assert.match(text, /runner\.available/);
assert.ok(words < 500, `skill must stay below 500 words; got ${words}`);
NODE
```

Expected: PASS with no output.

- [ ] **Step 4: Commit the skill**

```bash
git add skills/z-implement/SKILL.md
git commit -m "feat: add z-implement coordinator skill"
```

### Task 2: Add the clean-session `/z-implement` command

**Files:**
- Create: `extensions/z-implement/index.test.ts`
- Create: `extensions/z-implement/index.ts`

**Interfaces:**
- Consumes: `/z-implement <design-path>` from Pi.
- Produces: A replacement session whose first user message is `/skill:z-implement <design-path>` with expansion enabled.

- [ ] **Step 1: Write the failing extension tests**

Create `extensions/z-implement/index.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

type Handler = (args: string, ctx: any) => Promise<void>;
type Extension = (pi: any) => void;

async function loadExtension(): Promise<Extension> {
  try {
    return (await import("./index.ts")).default;
  } catch (error) {
    assert.fail(`z-implement extension is missing: ${String(error)}`);
  }
}

async function getHandler(): Promise<Handler> {
  let handler: Handler | undefined;
  const extension = await loadExtension();

  extension({
    registerCommand(name: string, options: { handler: Handler }) {
      assert.equal(name, "z-implement");
      handler = options.handler;
    },
  });

  assert.ok(handler);
  return handler;
}

test("z-implement starts the skill in a clean session", async () => {
  const events: string[] = [];
  let prompt = "";
  let sendOptions: unknown;

  await (await getHandler())("  docs/superpowers/specs/example-design.md  ", {
    ui: {
      notify() {
        throw new Error("Unexpected notification");
      },
    },
    async waitForIdle() {
      events.push("idle");
    },
    async newSession(options: { withSession?: (ctx: any) => Promise<void> }) {
      events.push("new");
      await options.withSession?.({
        async sendUserMessage(message: string, options: unknown) {
          events.push("send");
          prompt = message;
          sendOptions = options;
        },
      });
      return { cancelled: false };
    },
  });

  assert.deepEqual(events, ["idle", "new", "send"]);
  assert.equal(prompt, "/skill:z-implement docs/superpowers/specs/example-design.md");
  assert.deepEqual(sendOptions, { expandPromptTemplates: true });
});

test("z-implement rejects empty input without replacing the session", async () => {
  let notification: unknown;

  await (await getHandler())("   ", {
    ui: {
      notify(message: string, level: string) {
        notification = { message, level };
      },
    },
    async waitForIdle() {
      throw new Error("waitForIdle must not run");
    },
    async newSession() {
      throw new Error("newSession must not run");
    },
  });

  assert.deepEqual(notification, {
    message: "Usage: /z-implement <design-path>",
    level: "warning",
  });
});

test("z-implement reports cancelled session replacement", async () => {
  let notification: unknown;

  await (await getHandler())("docs/superpowers/specs/example-design.md", {
    ui: {
      notify(message: string, level: string) {
        notification = { message, level };
      },
    },
    async waitForIdle() {},
    async newSession() {
      return { cancelled: true };
    },
  });

  assert.deepEqual(notification, {
    message: "New session cancelled",
    level: "info",
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
node --test extensions/z-implement/index.test.ts
```

Expected: FAIL with `AssertionError` containing `z-implement extension is missing`.

- [ ] **Step 3: Write the minimal extension**

Create `extensions/z-implement/index.ts`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("z-implement", {
    description: "Implement an approved Superpowers design in a clean session",
    handler: async (args, ctx) => {
      const designPath = args.trim();
      if (!designPath) {
        ctx.ui.notify("Usage: /z-implement <design-path>", "warning");
        return;
      }

      await ctx.waitForIdle();
      const result = await ctx.newSession({
        withSession: async (replacementCtx) => {
          await replacementCtx.sendUserMessage(
            `/skill:z-implement ${designPath}`,
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

- [ ] **Step 4: Run the tests to verify GREEN**

Run:

```bash
node --test extensions/z-implement/index.test.ts
```

Expected: 3 tests pass and 0 tests fail.

- [ ] **Step 5: Run final focused verification**

Run:

```bash
node --test extensions/z-implement/index.test.ts
git diff --check
git status --short
```

Expected:

- The three extension tests pass.
- `git diff --check` prints no errors.
- Status lists only the two new extension files plus pre-existing unrelated changes, if present.

- [ ] **Step 6: Commit the extension**

```bash
git add extensions/z-implement/index.ts extensions/z-implement/index.test.ts
git commit -m "feat: add z-implement clean-session command"
```

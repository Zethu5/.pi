import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const skill = readFileSync(
  new URL("../../skills/z-implement/SKILL.md", import.meta.url),
  "utf8",
);

type Handler = (args: string, ctx: any) => Promise<void>;
type Extension = (pi: any) => void;

async function loadExtension(): Promise<Extension> {
  try {
    return (await import("./index.ts")).default;
  } catch (error) {
    assert.fail(`z-implement extension is missing: ${String(error)}`);
  }
}

async function getHandler(): Promise<{ handler: Handler; description: string }> {
  let handler: Handler | undefined;
  let description = "";
  const extension = await loadExtension();

  extension({
    registerCommand(name: string, options: { handler: Handler; description: string }) {
      assert.equal(name, "z-implement");
      handler = options.handler;
      description = options.description;
    },
  });

  assert.ok(handler);
  return { handler, description };
}

test("z-implement skill defines safe issue delivery", () => {
  assert.match(skill, /approved-design/);
  assert.match(skill, /z-design:v1/);
  assert.match(skill, /Design-Class/);
  assert.match(skill, /issue-body/);
  assert.match(skill, /Closes #/);
  assert.match(skill, /--squash/);
  assert.match(skill, /--match-head-commit/);
  assert.match(skill, /--ff-only/);
  assert.match(skill, /git branch -D issue-<number>/);
  assert.match(skill, /codegraph/i);
  assert.match(skill, /resum/i);
  assert.match(skill, /Do not scan/i);
  assert.match(skill, /repository-relative Markdown path/);
});

test("z-implement skill checks merged-PR recovery before the open-issue gate", () => {
  const recoveryCheck = skill.indexOf(
    "Before requiring the issue to be open, inspect recovery state.",
  );
  const openIssueGate = skill.indexOf("Require an open issue");

  assert.ok(recoveryCheck >= 0, "missing the pre-gate recovery check");
  assert.ok(recoveryCheck < openIssueGate, "recovery must precede the open-issue gate");
});

test("z-implement skill confirms manual issue closure before cleanup", () => {
  assert.match(
    skill,
    /If automatic closure failed,[\s\S]*?gh issue view[\s\S]*?state[\s\S]*?closed[\s\S]*?before synchronization or cleanup/i,
  );
});

test("z-implement skill blocks a dirty primary checkout", () => {
  assert.match(
    skill,
    /Stop for tracked, staged, or unrelated untracked changes\. Ignore only generated `\.codegraph\/` contents\./,
  );
});

test("z-implement command describes approved issue and design-path inputs", async () => {
  const { description } = await getHandler();

  assert.match(description, /approved GitHub issue/i);
  assert.match(description, /repository-relative Markdown path/i);
});

test("z-implement starts the skill in a clean session", async () => {
  const events: string[] = [];
  let prompt = "";
  let sendOptions: unknown;

  const { handler, description } = await getHandler();
  await handler("  #42  ", {
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
  assert.equal(prompt, "/skill:z-implement #42");
  assert.match(description, /implement and land/i);
  assert.deepEqual(sendOptions, { expandPromptTemplates: true });
});

test("z-implement shows issue-or-path usage for empty input", async () => {
  let notification: unknown;

  const { handler } = await getHandler();
  await handler("   ", {
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
    message: "Usage: /z-implement <approved-issue-or-repository-relative-markdown-path>",
    level: "warning",
  });
});

test("z-implement reports cancelled session replacement", async () => {
  let notification: unknown;

  const { handler } = await getHandler();
  await handler("#42", {
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

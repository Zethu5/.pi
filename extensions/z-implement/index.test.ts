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

test("z-implement rejects empty input without replacing the session", async () => {
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
    message: "Usage: /z-implement <issue-number-or-url>",
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

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

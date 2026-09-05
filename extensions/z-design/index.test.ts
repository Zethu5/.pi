import assert from "node:assert/strict";
import test from "node:test";
import extension from "./index.ts";

type Handler = (args: string, ctx: any) => Promise<void>;

function getHandler(): Handler {
  let handler: Handler | undefined;

  extension({
    registerCommand(name: string, options: { handler: Handler }) {
      assert.equal(name, "z-design");
      handler = options.handler;
    },
  } as never);

  assert.ok(handler);
  return handler;
}

test("z-design resets before it sends the routing prompt", async () => {
  const events: string[] = [];
  let prompt = "";

  await getHandler()("  fix the login crash  ", {
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
        async sendUserMessage(message: string) {
          events.push("send");
          prompt = message;
        },
      });
      return { cancelled: false };
    },
  } as never);

  assert.deepEqual(events, ["idle", "new", "send"]);
  assert.match(prompt, /fix the login crash/);
  assert.match(prompt, /brainstorming/i);
  assert.match(prompt, /systematic-debugging/i);
  assert.match(prompt, /ambiguous/i);
  assert.match(prompt, /neither/i);
  assert.match(prompt, /\/z-design\b/);
  assert.doesNotMatch(prompt, /\/design\b/);
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
});

test("z-design rejects empty input without replacing the session", async () => {
  let notification = "";

  await getHandler()("   ", {
    ui: {
      notify(message: string) {
        notification = message;
      },
    },
    async waitForIdle() {
      throw new Error("waitForIdle must not run");
    },
    async newSession() {
      throw new Error("newSession must not run");
    },
  } as never);

  assert.equal(notification, "Usage: /z-design <request>");
});

test("z-design reports a cancelled session replacement", async () => {
  let notification = "";

  await getHandler()("add account export", {
    ui: {
      notify(message: string) {
        notification = message;
      },
    },
    async waitForIdle() {},
    async newSession() {
      return { cancelled: true };
    },
  } as never);

  assert.equal(notification, "New session cancelled");
});

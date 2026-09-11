import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { designPrompt, selfCheck } from "./core.ts";

// Test the event handler without starting Pi or contacting GitHub.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "@earendil-works/pi-coding-agent") {
			return {
				url: "data:text/javascript,export const isToolCallEventType = (name, event) => event.toolName === name;",
				shortCircuit: true,
			};
		}
		return nextResolve(specifier, context);
	},
});
const { default: zDesign } = await import("./index.ts");
let handler;
let branch = "z-design/test";
zDesign({
	registerCommand() {},
	on(name, callback) { if (name === "tool_call") handler = callback; },
	async exec() { return { code: 0, stdout: branch }; },
});
const ctx = {
	cwd: process.cwd(),
	hasUI: true,
	ui: { confirm() { assert.fail("Publication must not request confirmation"); } },
	sessionManager: {
		getEntries: () => [{ type: "custom", customType: "z-design-session", data: { repo: "owner/repo" } }],
	},
};
for (const toolName of ["bash", "powershell"]) {
	for (const command of ["gh issue create -R owner/repo --body-file spec.md", "gh label create z-design", "gh pr create --body-file pr.md", "git push origin HEAD"]) {
		assert.equal(await handler({ toolName, input: { command } }, ctx), undefined);
	}
	for (const command of ["gh issue create -R wrong/repo", "git push origin main", "git push --force origin HEAD", "gh pr merge 12", "gh issue close 12", "npm run deploy"]) {
		assert.equal((await handler({ toolName, input: { command } }, ctx))?.block, true);
	}
}
branch = "main";
assert.equal((await handler({ toolName: "bash", input: { command: "git push" } }, ctx))?.block, true);
const prompt = designPrompt("test", "owner/repo");
assert.ok(prompt.includes("Ask the user to approve design decisions"));
assert.ok(prompt.includes("After those approvals, publish automatically"));
assert.ok(!prompt.includes("Wait for the extension's publication-stage confirmation"));
selfCheck();
console.log("z-design publication checks passed");

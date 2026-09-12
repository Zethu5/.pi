// Run with Node.js 24: node check-portability.mjs
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const settings = JSON.parse(readFileSync(join(root, "settings.json"), "utf8"));
assert.equal(settings.theme, "thinking-colors/thinking-colors");
for (const name of settings.theme.split("/")) {
  const theme = JSON.parse(readFileSync(join(root, "themes", `${name}.json`), "utf8"));
  assert.equal(theme.name, name);
  assert.equal(theme.colors.thinkingMax, "#FF0000");
}
assert.equal(settings.defaultProvider, "openai-codex");
assert.equal(settings.defaultModel, "gpt-6-astra");
assert.equal(settings.defaultThinkingLevel, "medium");
assert.equal(settings.tuiMode, "fullscreen");
for (const [role, thinking] of Object.entries({ scout: "low", researcher: "medium", worker: "high", reviewer: "high", oracle: "high", delegate: "medium" })) {
  assert.equal(settings.subagents.agentOverrides[role].thinking, thinking, "Preserve the selected thinking levels");
}
assert.equal(settings.shellPath, "C:/Program Files/Git/bin/bash.exe");
for (const [role, model] of Object.entries({ scout: "gpt-5.6-luna", researcher: "gpt-5.6-terra", worker: "gpt-5.6-terra", reviewer: "gpt-5.6-terra", oracle: "gpt-5.6-sol", delegate: "gpt-5.6-luna" })) {
  assert.equal(settings.subagents.agentOverrides[role].model, `openai-codex/${model}`, "Preserve the selected role models");
}
const overrides = JSON.parse(readFileSync(join(root, "models.json"), "utf8")).providers["openai-codex"].modelOverrides;
assert.equal(overrides["gpt-6-astra"].contextWindow, 1050000);
assert.equal(overrides["gpt-5.6-sol"].contextWindow, 1050000);
assert.ok(settings.packages.every(source => /^(npm:|https:\/\/)/.test(source)), "Packages must not use local paths");
assert.ok(existsSync(join(root, "AGENTS.md")));

// Load from another user path without the author's packages, documents, or credentials.
const temporary = mkdtempSync(join(tmpdir(), "pi-portability-"));
const relocated = join(temporary, "Another User Ω", ".pi", "agent");
try {
  for (const relative of ["extensions/z-design/core.ts", "extensions/z-implement/core.ts", "docs/workflows.md"]) {
    const destination = join(relocated, relative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, relative), destination);
  }
  const design = await import(pathToFileURL(join(relocated, "extensions/z-design/core.ts")));
  const implement = await import(pathToFileURL(join(relocated, "extensions/z-implement/core.ts")));
  design.selfCheck();
  implement.selfCheck();
  for (const prompt of [design.designPrompt("Feature", "owner/repo"), implement.implementPrompt(1, "Feature", "owner/repo")]) {
    const match = prompt.match(/Read ("(?:\\.|[^"\\])*") before/);
    assert.ok(match, "The guide must have a quoted absolute path");
    const guide = JSON.parse(match[1]);
    assert.equal(guide, join(relocated, "docs/workflows.md"));
    assert.ok(readFileSync(guide, "utf8").includes("## Review and current-source corrections"));
    assert.ok(!prompt.includes("C:/Users/zvika"));
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log("PASS: original model/theme/context settings preserved and workflow guides relocated; both workflow self-checks passed.");

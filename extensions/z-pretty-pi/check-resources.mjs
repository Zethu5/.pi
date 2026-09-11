// Run: node ~/.pi/agent/extensions/z-pretty-pi/check-resources.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters as plain } from "node:util";
const require = createRequire(new URL("../../npm/package.json", import.meta.url));
const { createJiti } = require("jiti");
const tuiPath = require.resolve("@earendil-works/pi-tui");
const agentPath = require.resolve.paths("@earendil-works/pi-coding-agent")
  .map(path => `${path}/@earendil-works/pi-coding-agent/dist/index.js`).find(existsSync);
assert.ok(agentPath);
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-tui": tuiPath, "@earendil-works/pi-coding-agent": agentPath } });
const { colorResourceLines, decorateResources } = await jiti.import(new URL("resources.ts", import.meta.url).href);
const { Container, Text, visibleWidth } = await jiti.import(tuiPath);
const { InteractiveMode } = await import(pathToFileURL(agentPath.replace(/index\.js$/, "modes/interactive/interactive-mode.js")));
const { initTheme } = await import(pathToFileURL(agentPath.replace(/index\.js$/, "modes/interactive/theme/theme.js")));
initTheme("dark", false);
const theme = { fg: (_color, text) => `\x1b[36m${text}\x1b[0m` };
const local = path => ({ path, source: "local", scope: "user", origin: "top-level" });
const packageInfo = { path: "C:/packages/tool/index.ts", source: "npm:@scope/tool", scope: "user", origin: "package", baseDir: "C:/packages/tool" };
const mode = Object.create(InteractiveMode.prototype);
mode.loadedResourcesContainer = new Container();
mode.options = {};
Object.defineProperty(mode, "settingsManager", { value: { getQuietStartup: () => false } });
mode.getStartupExpansionState = () => false;
mode.getBuiltInCommandConflictDiagnostics = () => [];
Object.defineProperty(mode, "sessionManager", { value: { getCwd: () => "C:/work/project" } });
Object.defineProperty(mode, "session", { value: {
  promptTemplates: [{ name: "review", filePath: "C:/prompts/review.md", sourceInfo: local("C:/prompts/review.md") }],
  resourceLoader: {
    getSkills: () => ({ skills: ["alpha", "beta", "gamma", "delta"].map(name => ({ name, filePath: `C:/skills/${name}/SKILL.md`, sourceInfo: local(`C:/skills/${name}/SKILL.md`) })), diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [{ name: "custom", sourcePath: "C:/themes/custom.json", sourceInfo: local("C:/themes/custom.json") }], diagnostics: [] }),
    getSystemPromptSource: () => undefined,
    getAppendSystemPromptSources: () => [],
    getAgentsFiles: () => ({ agentsFiles: [{ path: "C:/work/项目😀/AGENTS.md" }] }),
    getExtensions: () => ({ extensions: [
      { path: "C:/Users/test/.pi/agent/extensions/z-pretty-pi/index.ts", sourceInfo: local("C:/Users/test/.pi/agent/extensions/z-pretty-pi/index.ts") },
      { path: "C:/Users/test/.pi/agent/extensions/helper.ts", sourceInfo: local("C:/Users/test/.pi/agent/extensions/helper.ts") },
      { path: packageInfo.path, sourceInfo: packageInfo },
      { path: "C:/external/" + "long-path/".repeat(12) + "entry.ts", sourceInfo: local("C:/external/entry.ts") },
    ], errors: [{ path: "C:/broken.ts", error: "Load failed: test diagnostic" }] }),
  },
  extensionRunner: { getCommandDiagnostics: () => [], getShortcutDiagnostics: () => [] },
} });
mode.showLoadedResources();
const root = new Container(), document = new Container();
root.addChild(document);
document.addChild(new Text("logo"));
document.addChild(mode.loadedResourcesContainer);
const original = mode.loadedResourcesContainer.render;
let sampleFrame = ["\x1b[48;2;1;2;3m \x1b[0m"];
const restore = decorateResources(root, theme, lines => colorResourceLines(lines, sampleFrame));
assert.equal(typeof restore, "function");
const ExpandableText = mode.loadedResourcesContainer.children.find(child => child.getCollapsedText).constructor;
const futureList = new ExpandableText(
  () => theme.fg("mdHeading", "[Future resource list]") + "\n" + theme.fg("muted", "  future-item"),
  () => theme.fg("mdHeading", "[Future resource list]") + "\n" + theme.fg("muted", "  expanded-item"),
  false, 0, 0,
);
mode.loadedResourcesContainer.addChild(futureList);
const output = width => mode.loadedResourcesContainer.render(width).map(plain);
const wide = output(120);
for (const width of [121, 160, 240]) {
  const padding = " ".repeat(Math.floor((width - 118) / 2) - 1);
  assert.deepEqual(output(width), wide.map(line => line ? padding + line : line),
    `Center every resource section at width ${width}.`);
}
const colored = mode.loadedResourcesContainer.render(120);
for (const heading of ["[Context]", "[Skills]", "[Prompts]", "[Extensions]", "[Themes]", "[Future resource list]", "  Local", "  Packages", "  Source paths"]) {
  assert.ok(colored.find(line => plain(line).includes(heading)).includes("\x1b[38;2;1;2;3m"));
}
assert.ok(!colored.find(line => plain(line).includes("Load failed")).includes("\x1b[38;2;1;2;3m"), "Keep diagnostic colors.");
for (const value of ["  • alpha", "  • /review", "  future-item"]) {
  assert.ok(colored.some(line => line.includes(`\x1b[36m${value}`)), `Keep the original color for ${value}.`);
}
sampleFrame = ["\x1b[48;2;4;5;6m \x1b[0m"];
for (const heading of ["[Themes]", "[Future resource list]", "  Local"]) {
  assert.ok(mode.loadedResourcesContainer.render(120).find(line => plain(line).includes(heading)).includes("\x1b[38;2;4;5;6m"));
}
const futureOnly = new Container();
futureOnly.addChild(futureList);
const restoreFuture = decorateResources(futureOnly, theme, lines => colorResourceLines(lines, sampleFrame));
assert.equal(typeof restoreFuture, "function", "Recognize lists without the original four sections.");
for (const expanded of [false, true]) {
  futureList.setExpanded(expanded);
  assert.deepEqual(futureOnly.render(12).map(plain).filter(line => line.trim()).map(line => line.slice(1).trimEnd()), futureList.render(10).map(plain).filter(line => line.trim()).map(line => line.trimEnd()));
  assert.ok(futureOnly.render(12).filter(line => plain(line).includes("Future") || plain(line).includes("resource")).every(line => line.includes("\x1b[38;2;4;5;6m")));
}
futureList.setExpanded(false);
restoreFuture();
const unicode = ["项目😀 e\u0301 👨‍👩‍👧‍👦"];
const paintedUnicode = colorResourceLines(unicode, sampleFrame);
assert.deepEqual(paintedUnicode.map(plain), unicode);
assert.equal(visibleWidth(paintedUnicode[0]), visibleWidth(unicode[0]));
assert.ok(wide.some(line => /\[Context\].+\[Extensions\]/.test(line)), "Align the two main columns.");
assert.ok(wide.some(line => /• alpha.+• delta/.test(line)), "Use two skill columns.");
for (const label of ["[Skills]", "[Prompts]", "• /review", "Local", "Packages", "Source paths", "• z-pretty-pi", "• helper", "• @scope/tool", "Load failed: test diagnostic"]) {
  assert.ok(wide.some(line => line.includes(label)), `Missing ${label}\n${wide.join("\n")}`);
}
assert.equal(wide.join("\n").match(/• @scope\/tool/g)?.length, 1);
const narrow = output(60);
assert.ok(!narrow.some(line => /\[Context\].+\[Extensions\]/.test(line)), "Stack narrow layouts.");
for (let width = 8; width <= 180; width++) {
  for (const line of mode.loadedResourcesContainer.render(width)) {
    assert.ok(visibleWidth(line) <= width, `Overflow at ${width}: ${plain(line)}`);
  }
}
const oldNoColor = process.env.NO_COLOR;
process.env.NO_COLOR = "1";
assert.ok(mode.loadedResourcesContainer.render(120).every(line => !line.includes("\x1b")));
if (oldNoColor === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = oldNoColor;
mode.showLoadedResources();
assert.ok(output(120).some(line => /\[Context\].+\[Extensions\]/.test(line)), "Handle resource reloads.");
restore();
assert.equal(mode.loadedResourcesContainer.render, original);
assert.equal(Object.hasOwn(mode.loadedResourcesContainer, "render"), false);
assert.equal(decorateResources(new Container(), theme), undefined);
const { default: logo } = await jiti.import(new URL("logo.ts", import.meta.url).href);
const handlers = new Map();
let command, header;
root.terminal = { rows: 40 };
root.requestRender = () => {};
const ctx = { mode: "tui", ui: {
  notify: message => assert.fail(message),
  setHeader(factory) { header?.dispose(); header = factory?.(root, theme); },
} };
logo({ on: (name, handler) => handlers.set(name, handler), registerCommand: (_name, definition) => { command = definition.handler; } });
handlers.get("session_start")({ reason: "reload" }, ctx);
header.render(120);
assert.notEqual(mode.loadedResourcesContainer.render, original);
await command("pause", ctx);
assert.notEqual(mode.loadedResourcesContainer.render, original, "Pausing animation must retain the layout.");
await command("off", ctx);
assert.equal(mode.loadedResourcesContainer.render, original);
handlers.get("session_start")({ reason: "reload" }, ctx);
header.render(120);
handlers.get("session_shutdown")();
assert.equal(mode.loadedResourcesContainer.render, original);
if (process.argv.includes("--preview")) console.log(wide.join("\n"));
console.log("PASS: real Pi resource sections, columns, groups, wrapping, diagnostics, reload, NO_COLOR, logo lifecycle, restoration.");

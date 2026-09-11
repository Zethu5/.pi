// Run: node ~/.pi/agent/extensions/z-pretty-pi/check.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(new URL("../../npm/package.json", import.meta.url));
const { createJiti } = require("jiti");
const tuiPath = require.resolve("@earendil-works/pi-tui");
const agentPath = require.resolve.paths("@earendil-works/pi-coding-agent")
  .map(path => `${path}/@earendil-works/pi-coding-agent/dist/index.js`).find(existsSync);
assert.ok(agentPath, "Pi must be available in Node's module search path.");
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-tui": tuiPath, "@earendil-works/pi-coding-agent": agentPath } });
const { default: extension } = await jiti.import(new URL("index.ts", import.meta.url).href);
const { visibleWidth } = await jiti.import(tuiPath);
const { loadThemeFromPath } = await jiti.import(new URL("./modes/interactive/theme/theme.js", pathToFileURL(agentPath)).href);
const thinkingTheme = loadThemeFromPath(fileURLToPath(new URL("../../themes/thinking-colors.json", import.meta.url)), "truecolor");
const handlers = new Map();
let listener, footer, header, logoCommand, editorFactory, disposed = 0, renders = 0;
let mouseRow, mouseColumn, mouseWidth;
let completions = ["completion"];
let editorPadding = 2;
const existingEditor = {
  setPaddingX(value) { editorPadding = value; },
  borderColor: text => text,
  renderedVisibleLineCount: 1,
  renderBottomBorder: (width, hidden) => (hidden ? "↓ " : "──").padEnd(width, "─").slice(0, width),
  render(width) { return ["─".repeat(width), ...Array(this.renderedVisibleLineCount).fill(""), this.renderBottomBorder(width, 2), ...completions.map(line => line.slice(0, width))]; },
  handleInput() {},
  handleMouse(event) { mouseRow = event.y; mouseColumn = event.x; mouseWidth = event.width; return { handled: true }; },
};
const pi = {
  on: (name, handler) => {
    const previous = handlers.get(name);
    handlers.set(name, (...args) => { previous?.(...args); handler(...args); });
  },
  registerCommand: (name, definition) => { assert.equal(name, "logo"); logoCommand = definition.handler; },
  events: { on: (_, handler) => { listener = handler; return () => { listener = undefined; }; } },
};
extension(pi);
let branch = "main", percent = 23.4;
const statuses = new Map([["mcp", "cached: offline"], ["ponytail", "ponytail: full"], ["test", "two\nlines\tOK"]]);
const ctx = {
  mode: "tui", cwd: "C:/work/Argus", model: { id: "gpt-test", provider: "openai-codex", contextWindow: 1100000 },
  thinkingLevel: "medium",
  modelRegistry: { isUsingOAuth: () => assert.fail("Do not read subscription data for the footer.") },
  sessionManager: { getEntries: () => assert.fail("Do not scan session costs for the footer.") },
  getContextUsage: () => ({ percent }),
  ui: {
    theme: { fg: (_, text) => text },
    setToolsExpanded: () => assert.fail("Preserve Pi's default resource and tool expansion state."),
    notify: message => assert.fail(message),
    setHeader: factory => {
      header?.dispose();
      header = factory?.({ terminal: { rows: 40 }, requestRender() {} }, ctx.ui.theme);
    },
    getEditorComponent: () => () => existingEditor,
    setEditorComponent: factory => { editorFactory = factory; },
    setFooter: (factory) => {
    footer = factory({ requestRender: () => { renders++; } },
      { fg: (_, text) => `\x1b[36m${text}\x1b[0m`, bold: text => `\x1b[1m${text}\x1b[0m`,
        getThinkingBorderColor: level => thinkingTheme.getThinkingBorderColor(level) },
      { getGitBranch: () => branch, getExtensionStatuses: () => statuses,
        onBranchChange: () => () => { disposed++; } });
  } },
};
listener({ version: 1, servers: [{ name: "penpot", status: "connected" }, { name: "offline", status: "cached" }] });
handlers.get("session_start")({}, ctx);
assert.ok(header.render(80).some(line => /\x1b\[48;2;\d+;\d+;\d+m /.test(line)));
assert.equal(typeof logoCommand, "function");
const plain = width => stripVTControlCharacters(footer.render(width)[0]);
// EditorTheme has borderColor and selectList, but no fg method.
const editor = editorFactory({}, { borderColor: text => text, selectList: {} }, {});
assert.equal(editor, existingEditor);
assert.equal(editorPadding, 0, "Align the input with the top separator.");
const editorLines = editor.render(100);
assert.deepEqual(editorLines.map(stripVTControlCharacters), ["─".repeat(99), "", "completion", ""]);
assert.ok(plain(200).startsWith("Argus"), "Align the footer with the top separator.");
assert.ok(!editorLines.join("\n").includes("gpt-test"));
assert.ok(plain(200).includes("MCP penpot | ponytail: full"));
assert.ok(plain(200).endsWith("23.4% (1.1M) | gpt-test OpenAI ● medium"));
for (const [level, rgb] of Object.entries({ minimal: "34;197;94", low: "132;204;22", medium: "234;179;8", high: "249;115;22", xhigh: "220;38;38", max: "255;0;0" })) {
  ctx.thinkingLevel = level;
  const color = `\x1b[38;2;${rgb}m`;
  assert.ok(thinkingTheme.getThinkingBorderColor(level)("─").startsWith(color));
  assert.ok(footer.render(200)[0].includes(color + `● ${level}`), `${level} footer dot and label color`);
}
ctx.thinkingLevel = "medium";
assert.ok(!plain(200).includes("$") && !plain(200).includes("(sub)"));
editor.handleMouse({ x: 5, y: 2, width: 100 });
assert.equal(mouseColumn, 5);
assert.equal(mouseWidth, 100);
assert.equal(mouseRow, 3);
editor.handleMouse({ x: 5, y: 3, width: 100 });
assert.equal(mouseRow, 3, "The blank row must not receive editor clicks.");
editor.handleMouse({ x: 5, y: 4, width: 100 });
assert.equal(mouseRow, 3, "The label must not receive editor clicks.");
editor.handleMouse({ x: 0, y: 1, width: 100 });
assert.equal(mouseRow, 1, "The first input column must receive editor clicks.");
assert.equal(mouseColumn, 0);
editor.handleMouse({ x: 2, y: 1, width: 100 });
assert.equal(mouseRow, 1);
assert.equal(mouseColumn, 2);
ctx.model.id = "updated-model"; ctx.thinkingLevel = "high";
assert.ok(plain(200).includes("updated-model OpenAI ● high"));
ctx.model.provider = "anthropic";
assert.ok(plain(200).includes("updated-model Anthropic ● high"));
ctx.model.provider = "openai-codex";
for (let width = 0; width <= 180; width++) {
  const lines = editor.render(width);
  assert.equal(lines.length, 4);
  assert.equal(visibleWidth(lines[0]), Math.max(0, width - 1), "Leave one empty column on the right.");
  assert.equal(lines.at(-1), "", "Keep a blank row above the footer.");
  for (const line of lines) assert.ok(visibleWidth(line) <= width);
}
assert.match(plain(200), /^Argus  on main\s+MCP penpot \| ponytail: full \| two lines OK \| 23.4% \(1.1M\) \| updated-model OpenAI ● high$/);
for (const count of [0, 3]) {
  completions = Array.from({ length: count }, (_, i) => `choice-${i}`);
  const lines = editor.render(100);
  assert.equal(lines.length, count + 3);
  assert.equal(lines.at(-1), "");
  assert.ok(!lines.join("\n").match(/[│└┌]/));
  for (let i = 0; i < count; i++) {
    assert.equal(lines[i + 2], `choice-${i}`);
    editor.handleMouse({ x: 5, y: i + 2, width: 100 });
    assert.equal(mouseRow, i + 3);
  }
}
existingEditor.renderedVisibleLineCount = 3;
const multiline = editor.render(100);
assert.equal(multiline.length, 8);
assert.equal(multiline.at(-1), "");
assert.equal(multiline[4], "choice-0");
editor.handleMouse({ x: 5, y: 3, width: 100 });
assert.equal(mouseRow, 3);
editor.handleMouse({ x: 5, y: 4, width: 100 });
assert.equal(mouseRow, 5, "Map autocomplete past the removed bottom border.");
existingEditor.renderedVisibleLineCount = 1;
branch = null; percent = null;
assert.match(plain(160), /^Argus\s+MCP/);
assert.ok(!plain(160).includes(" on"), "Hide Git details outside a repository.");
assert.match(plain(160), /\?% \(1.1M\) \| updated-model OpenAI ● high$/);
ctx.getContextUsage = () => ({ percent: 7.4, contextWindow: 200000 });
assert.ok(plain(160).includes("7.4% (200K)"));
ctx.getContextUsage = () => undefined;
assert.ok(plain(160).includes("?% (1.1M)"));
listener({ version: 1, servers: [] });
assert.ok(!plain(160).includes("MCP"));
assert.equal(renders, 1);
listener({ version: 2, servers: [{ name: "bad", status: "connected" }] });
assert.ok(!plain(160).includes("bad"));
ctx.cwd = "C:/work/项目😀"; branch = "feature/" + "long".repeat(50);
for (let width = 0; width <= 180; width++) {
  const lines = footer.render(width);
  assert.equal(lines.length, 1);
  assert.ok(visibleWidth(lines[0]) <= width, `Width ${width}`);
  assert.ok(!/[\r\n\t]/.test(lines[0]));
}
const originalFooter = footer;
await logoCommand("off", ctx);
assert.equal(header, undefined);
assert.equal(footer, originalFooter, "Turning off the logo must preserve the footer.");
assert.ok(!editor.render(100).join("\n").includes("updated-model"));
footer.dispose();
assert.equal(disposed, 1);
handlers.get("session_shutdown")();
assert.equal(listener, undefined);
console.log("PASS: open editor, footer model/status order, no cost display, mouse/autocomplete, MCP, context, Unicode, widths 0–180, cleanup.");
await import("./check-logo.mjs");
await import("./check-resources.mjs");

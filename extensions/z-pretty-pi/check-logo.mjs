// Run: node ~/.pi/agent/extensions/z-pretty-pi/check-logo.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { stripVTControlCharacters } from "node:util";

const require = createRequire(new URL("../../npm/package.json", import.meta.url));
const { createJiti } = require("jiti");
const tuiPath = require.resolve("@earendil-works/pi-tui");
const agentPath = require.resolve.paths("@earendil-works/pi-coding-agent")
  .map(path => `${path}/@earendil-works/pi-coding-agent/dist/index.js`).find(existsSync);
assert.ok(agentPath, "Pi must be installed.");
const jiti = createJiti(import.meta.url, { alias: {
  "@earendil-works/pi-tui": tuiPath, "@earendil-works/pi-coding-agent": agentPath,
} });
const { default: extension } = await jiti.import(new URL("logo.ts", import.meta.url).href);
const { visibleWidth, TuiMainScreen, TuiAltScreen, Container, Text } = await jiti.import(tuiPath);
const data = JSON.parse(gunzipSync(readFileSync(new URL("frames.json.gz", import.meta.url))));
const { VERSION } = await jiti.import(agentPath);
assert.equal(data.caption.text, `pi v${VERSION}`);
assert.equal(data.caption.frames.at(-1), data.caption.text);
assert.ok(new Set(data.caption.frames).size > 20);
for (const frame of data.caption.frames) {
  assert.equal(visibleWidth(frame), data.caption.text.length);
  assert.equal(stripVTControlCharacters(frame), frame);
}
const visibleShape = line => stripVTControlCharacters(line.replace(/\x1b\[48;2;\d+;\d+;\d+m \x1b\[0m/g, "█"));
const shape = data.frames[0].map(visibleShape);
assert.deepEqual(shape, [
  ...Array(2).fill("███████████████     "),
  ...Array(2).fill("█████     █████     "),
  ...Array(2).fill("██████████     █████"),
  ...Array(2).fill("█████          █████"),
]);
assert.equal(shape[3].lastIndexOf("█") + 1, shape[4].lastIndexOf(" ") + 1,
  "The i must sit outside the P and touch its lower-right corner.");
assert.ok(data.frames.length > 100);
assert.ok(new Set(data.frames.map(JSON.stringify)).size > 100);
assert.ok(data.intro.length > 1);
for (let i = 1; i < data.intro.length; i++) {
  assert.notDeepEqual(data.intro[i], data.intro[i - 1], "Expansion must not pause on repeated frames.");
}
assert.notDeepEqual(data.intro[0].map(visibleShape), shape);
assert.deepEqual(data.intro.at(-1), data.frames[0]);
for (const frame of data.frames) assert.deepEqual(frame.map(visibleShape), shape);
for (const frame of [...data.frames, ...data.intro]) {
  assert.equal(frame.length, data.height);
  for (const line of frame) {
    assert.ok(visibleWidth(line) <= data.width);
    // Permit colors and reset only. No cursor movement or terminal commands.
    assert.equal(line.replace(/\x1b\[(?:48;2;\d+;\d+;\d+|0)m/g, ""), stripVTControlCharacters(line));
    assert.equal(stripVTControlCharacters(line).trim(), "", "Use backgrounds, not font glyphs.");
  }
}

const realNow = performance.now;
let now = 0;
performance.now = () => now;
const realInterval = global.setInterval;
const realClear = global.clearInterval;
const savedNoColor = process.env.NO_COLOR;
const savedReduced = process.env.PI_REDUCED_MOTION;
const timers = new Set();
let unrefs = 0;
global.setInterval = (callback, interval) => {
  assert.equal(interval, data.intervalMs);
  const timer = { callback() { now += interval; callback(); }, unref() { unrefs++; } };
  timers.add(timer);
  return timer;
};
global.clearInterval = timer => timers.delete(timer);
try {
  delete process.env.NO_COLOR;
  delete process.env.PI_REDUCED_MOTION;
  const handlers = new Map();
  let command, header, renders = 0, sets = 0;
  const section = { getCollapsedText: () => "[Skills]\n  alpha, beta", getExpandedText: () => "[Skills]\n  alpha, beta", render: () => ["[Skills]", "  alpha, beta"] };
  const resources = { children: [section], render: () => section.render() };
  const originalResources = resources.render;
  const tui = { mode: "regular", children: [resources], terminal: { rows: 40 },
    captureRenderState: () => ({ previousViewportTop: 0, maxLinesRendered: 20 }),
    requestRender() { renders++; } };
  const theme = { fg: (_color, text) => `\x1b[36m${text}\x1b[0m` };
  const ctx = { mode: "tui", ui: {
    setHeader(factory) { sets++; header?.dispose(); header = factory?.(tui, theme); },
    notify() {},
  } };
  extension({ on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, definition) => { assert.equal(name, "logo"); command = definition.handler; } });
  assert.equal(timers.size, 0, "Loading must not start a timer.");
  handlers.get("session_start")({}, { ...ctx, mode: "print" });
  assert.equal(sets, 0);
  handlers.get("session_start")({}, ctx);
  assert.equal(timers.size, 1);
  assert.equal(unrefs, 1);
  for (const width of [40, 80, 81, 120]) {
    const lines = header.render(width).map(visibleShape);
    assert.equal(lines[1].indexOf("█"), Math.floor((width - data.width) / 2));
    assert.deepEqual(lines.slice(1, 1 + data.height).map(line => line.slice(Math.floor((width - data.width) / 2))), shape);
    for (const line of lines.slice(2 + data.height).filter(line => line.trim())) {
      assert.equal(line.length - line.trimStart().length, Math.floor((width - data.caption.text.length) / 2));
    }
  }
  const first = header.render(80);
  const resourceFirst = resources.render(80);
  assert.ok(resourceFirst.some(line => /\x1b\[38;2;/.test(line)), "Color the welcome lists with the logo palette.");
  [...timers][0].callback();
  assert.equal(renders, 1);
  [...timers][0].callback();
  assert.notDeepEqual(header.render(80), first);
  assert.notDeepEqual(resources.render(80), resourceFirst, "Advance resource colors with the same timer.");
  assert.deepEqual(resources.render(80).map(stripVTControlCharacters), resourceFirst.map(stripVTControlCharacters));
  const values = lines => lines.filter(line => stripVTControlCharacters(line).includes("•"));
  assert.deepEqual(values(resources.render(80)), values(resourceFirst), "List values must keep their original colors across frames.");
  assert.ok(values(resourceFirst).every(line => !line.includes("\x1b[38;2;")));
  const frameColors = new Set(data.frames[2].flatMap(line => [...line.matchAll(/\x1b\[48;2;(\d+;\d+;\d+)m/g)].map(match => match[1])));
  assert.equal(stripVTControlCharacters(header.render(80).at(-2)).trim(), data.caption.frames[12].trim());
  for (const line of [...resources.render(80), header.render(80).at(-2)]) {
    for (const match of line.matchAll(/\x1b\[38;2;(\d+;\d+;\d+)m/g)) assert.ok(frameColors.has(match[1]), "Use the current logo frame's exact colors.");
  }
  for (let width = 0; width <= 160; width++) {
    for (const line of header.render(width)) assert.ok(visibleWidth(line) <= width);
  }
  assert.ok(header.render(20).map(stripVTControlCharacters).some(line => line.includes("π")));
  tui.terminal.rows = 15;
  assert.ok(header.render(80).map(stripVTControlCharacters).some(line => line.includes("π")));
  tui.terminal.rows = 40;
  handlers.get("session_start")({ reason: "startup" }, ctx);
  const waiting = () => header.render(80).slice(1, 1 + data.height).every(line => !visibleShape(line).trim());
  assert.ok(waiting(), "Do not display a partial logo during startup.");
  for (let tick = 0; tick < 10; tick++) [...timers][0].callback();
  assert.ok(waiting(), "Wait for resource discovery.");
  handlers.get("resources_discover")();
  [...timers][0].callback();
  assert.ok(!waiting(), "Start on the first animation tick after resource discovery without an extra delay.");
  const startup = header.render(80);
  assert.deepEqual(startup.slice(1, 1 + data.height).map(visibleShape),
    data.intro[0].map(line => " ".repeat((80 - data.width) / 2) + visibleShape(line)));
  now += 1000;
  [...timers][0].callback();
  assert.deepEqual(header.render(80).slice(1, 1 + data.height).map(visibleShape),
    data.intro[1].map(line => " ".repeat((80 - data.width) / 2) + visibleShape(line)),
    "A delayed callback must not skip the entrance animation.");
  for (let tick = 1; tick < data.intro.length; tick++) [...timers][0].callback();
  assert.deepEqual(header.render(80).slice(1, 1 + data.height).map(visibleShape),
    shape.map(line => " ".repeat((80 - data.width) / 2) + line));
  for (let tick = 0; tick < data.frames.length; tick++) [...timers][0].callback();
  assert.notDeepEqual(header.render(80), startup, "Expansion must not repeat with the color loop.");
  for (const reason of ["reload", "new", "resume", "fork"]) {
    handlers.get("session_start")({ reason }, ctx);
    assert.deepEqual(header.render(80).slice(1, 1 + data.height).map(visibleShape),
      shape.map(line => " ".repeat((80 - data.width) / 2) + line));
  }
  for (let tick = 0; tick < Math.ceil(data.caption.frames.length / 6); tick++) [...timers][0].callback();
  assert.equal(stripVTControlCharacters(header.render(80).at(-2)).trim(), data.caption.text);
  for (let tick = 0; tick < data.frames.length; tick++) [...timers][0].callback();
  assert.equal(stripVTControlCharacters(header.render(80).at(-2)).trim(), data.caption.text, "Decrypt must finish without looping.");
  const beforePrompt = header.render(80);
  handlers.get("before_agent_start")?.();
  assert.equal(timers.size, 1, "Keep animation active after a prompt.");
  [...timers][0].callback();
  [...timers][0].callback();
  assert.notDeepEqual(header.render(80), beforePrompt, "Frames must advance after a prompt.");
  await command("animate", ctx);
  assert.equal(timers.size, 1);
  await command("pause", ctx);
  assert.equal(timers.size, 0);
  const pausedResources = resources.render(80);
  assert.deepEqual(resources.render(80), pausedResources, "Pause both animations together.");
  await command("animate", ctx);
  handlers.get("session_start")({}, ctx);
  assert.equal(timers.size, 1, "Replacing the header must dispose the old timer.");
  await command("off", ctx);
  assert.equal(header, undefined);
  assert.equal(resources.render, originalResources);
  assert.equal(timers.size, 0);
  process.env.PI_REDUCED_MOTION = "1";
  handlers.get("session_start")({ reason: "startup" }, ctx);
  assert.equal(timers.size, 0);
  assert.deepEqual(header.render(80).slice(1, 1 + data.height).map(visibleShape),
    shape.map(line => " ".repeat((80 - data.width) / 2) + line));
  assert.equal(stripVTControlCharacters(header.render(80).at(-2)).trim(), data.caption.text);
  assert.ok(header.render(80).at(-2).includes("\x1b[38;2;"), "Keep logo colors with reduced motion.");
  delete process.env.PI_REDUCED_MOTION;
  process.env.NO_COLOR = "1";
  await command("animate", ctx);
  assert.equal(timers.size, 0);
  assert.ok(header.render(80).every(line => !line.includes("\x1b")));
  assert.ok(resources.render(80).every(line => !line.includes("\x1b")));
  assert.ok(header.render(80).some(line => line.includes("π")), "NO_COLOR must retain a visible logo.");
  delete process.env.NO_COLOR;
  await command("animate", ctx);
  header.dispose();
  assert.equal(timers.size, 0);
  await command("animate", ctx);
  handlers.get("session_shutdown")();
  handlers.get("session_shutdown")();
  assert.equal(timers.size, 0, "Shutdown cleanup must be idempotent.");
  for (const mode of ["rpc", "json", "print"]) {
    const before = sets;
    await command("animate", { ...ctx, mode });
    handlers.get("session_start")({}, { ...ctx, mode });
    assert.equal(sets, before);
  }
  // Exercise Pi's real renderers, including their scrollback and full-redraw decisions.
  for (const Screen of [TuiMainScreen, TuiAltScreen]) {
    const writes = [];
    const terminal = { columns: 100, rows: 40, kittyProtocolActive: false,
      write: value => writes.push(value), start() {}, stop() {}, hideCursor() {}, showCursor() {},
      moveBy() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
    };
    const screen = new Screen(terminal);
    let requests = 0, liveHeader;
    screen.requestRender = () => { requests++; };
    const headerContainer = new Container();
    const resourceContainer = new Container();
    const liveSection = new Text("[Skills]\n  alpha, beta", 0, 0);
    liveSection.getCollapsedText = section.getCollapsedText;
    liveSection.getExpandedText = section.getExpandedText;
    resourceContainer.addChild(liveSection);
    const chat = new Text("", 0, 0);
    screen.addChild(headerContainer);
    screen.addChild(resourceContainer);
    screen.addChild(chat);
    const events = new Map();
    extension({ on: (name, handler) => events.set(name, handler), registerCommand() {} });
    const liveCtx = { mode: "tui", ui: {
      notify: message => assert.fail(message),
      setHeader(factory) {
        liveHeader?.dispose();
        headerContainer.clear();
        liveHeader = factory?.(screen, theme);
        if (liveHeader) headerContainer.addChild(liveHeader);
      },
    } };
    events.get("session_start")({ reason: "reload" }, liveCtx);
    screen.start();
    screen.renderNow();
    requests = 0;
    const tick = () => {
      for (const timer of timers) timer.callback();
      if (requests) { requests = 0; screen.renderNow(); }
    };
    const onScreen = liveHeader.render(100);
    tick(); tick();
    assert.notDeepEqual(liveHeader.render(100), onScreen, `${screen.mode}: animate the visible welcome screen.`);

    chat.setText(Array.from({ length: 100 }, (_, i) => `Chat line ${i}`).join("\n"));
    screen.renderNow();
    const top = screen.mode === "regular" ? screen.captureRenderState().previousViewportTop : screen.viewportTop;
    assert.ok(top > 0, `${screen.mode}: the welcome screen must leave the viewport.`);
    requests = 0;
    writes.length = 0;
    const hiddenHeader = liveHeader.render(100);
    const hiddenHeadings = resourceContainer.render(100);
    const redraws = screen.fullRedraws;
    for (let i = 0; i < 40; i++) tick();
    assert.equal(writes.length, 0, `${screen.mode}: hidden animation must not write to the terminal.`);
    assert.equal(screen.fullRedraws, redraws, `${screen.mode}: do not replay scrollback.`);
    assert.deepEqual(liveHeader.render(100), hiddenHeader, "Freeze hidden logo frames, not only redraw requests.");
    assert.deepEqual(resourceContainer.render(100), hiddenHeadings, "Freeze hidden heading colors too.");
    chat.setText(Array.from({ length: 101 }, (_, i) => `Chat line ${i}`).join("\n"));
    screen.renderNow();
    assert.equal(screen.fullRedraws, redraws, `${screen.mode}: new output must not expose a hidden frame change.`);

    if (screen.mode === "fullscreen") screen.scrollToTop();
    else terminal.rows = 200;
    screen.renderNow();
    requests = 0;
    tick(); tick();
    assert.notDeepEqual(liveHeader.render(100), hiddenHeader, `${screen.mode}: resume when the welcome screen is visible again.`);
    const beforeOverlay = liveHeader.render(100);
    const hasOverlay = screen.hasOverlay;
    screen.hasOverlay = () => true;
    requests = 0;
    for (const timer of timers) timer.callback();
    assert.equal(requests, 0, "Do not animate behind an overlay.");
    assert.deepEqual(liveHeader.render(100), beforeOverlay);
    screen.hasOverlay = hasOverlay;
    if (screen.mode === "fullscreen") {
      screen.hasActiveSelection = () => true;
      for (const timer of timers) timer.callback();
      assert.equal(requests, 0, "Do not disturb text selection.");
    }
    events.get("session_shutdown")();
    assert.equal(timers.size, 0);
    screen.stop();
  }
  console.log("PASS: logo/heading animation, widths, controls, cleanup; real regular/fullscreen renderers: no hidden writes or scrollback replays, visible resume, overlay/selection pause.");
} finally {
  performance.now = realNow;
  global.setInterval = realInterval;
  global.clearInterval = realClear;
  if (savedNoColor === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = savedNoColor;
  if (savedReduced === undefined) delete process.env.PI_REDUCED_MOTION; else process.env.PI_REDUCED_MOTION = savedReduced;
}

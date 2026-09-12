import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { sliceByColumn, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { colorResourceLines, decorateResources } from "./resources.ts";

type Animation = { width: number; height: number; intervalMs: number; frames: string[][];
  caption: { text: string; frames: string[] } };

export default function (pi: ExtensionAPI) {
  let stop = () => {};
  let startupReady = () => {};
  let restoreLayout = () => {};
  let animation: Animation | undefined;

  const show = (ctx: ExtensionContext, startup = false) => {
    if (ctx.mode !== "tui") return;
    try {
      animation ??= JSON.parse(gunzipSync(readFileSync(new URL("./frames.json.gz", import.meta.url))).toString());
    } catch (error) {
      ctx.ui.notify(`Cannot load the Pi logo: ${String(error)}`, "warning");
      return;
    }
    const data = animation!;
    stop();
    ctx.ui.setHeader((tui, theme) => {
      let frame = 0;
      let width = 0;
      let restoreResources: (() => void) | undefined;
      restoreLayout = () => { restoreResources?.(); restoreResources = undefined; };
      const noColor = Boolean(process.env.NO_COLOR);
      const reducedMotion = process.env.PI_REDUCED_MOTION === "1";
      const caption = `pi v${VERSION}`;
      let captionFrame = 0;
      let ready = false;
      let expansion = startup && !noColor && !reducedMotion ? 0 : 1;
      let expansionStarted = false;
      let expansionTicks = 0;
      // Reveal the whole welcome area from its center without moving the editor or list rows.
      const expand = (lines: string[], columns: number) => {
        if (expansion === 1) return lines;
        // Discovery runs before Pi mounts the lists. Do not consume the reveal during that wait.
        // Keep the header visible if quiet startup or a Pi update omits the resource component.
        if (ready && !restoreResources) return lines;
        if (ready && restoreResources) expansionStarted = true;
        const inset = Math.floor(columns * (1 - expansion) / 2);
        const size = Math.max(0, columns - inset * 2);
        return lines.map(line => expansion === 0 ? "" : " ".repeat(inset) + sliceByColumn(line, inset, size, true));
      };
      startupReady = () => { ready = true; };
      let timer: ReturnType<typeof setInterval> | undefined;
      const dispose = () => { clearInterval(timer); timer = undefined; };
      stop = () => { dispose(); expansion = 1; tui.requestRender(); };
      if (!noColor && !reducedMotion) {
        timer = setInterval(() => {
          if (expansionStarted && expansion < 1) {
            // Startup can block the event loop. Preserve the opening frames instead of skipping ahead.
            const progress = Math.min(1, ++expansionTicks * data.intervalMs / 650);
            expansion = progress * progress * (3 - 2 * progress);
          }
          if (ready || !startup) captionFrame = Math.min(captionFrame + 6, data.caption.frames.length);
          frame = (frame + 1) % data.frames.length;
          tui.requestRender();
        }, data.intervalMs);
        timer.unref();
      }
      return {
        render(availableWidth: number) {
          restoreResources ??= decorateResources(tui, theme, lines => colorResourceLines(lines, data.frames[frame]), expand);
          width = Math.max(0, availableWidth);
          const compact = noColor || width < data.width + 4 || tui.terminal.rows < 20;
          const logo = compact ? [theme.fg("accent", "π")] : data.frames[frame];
          const logoPadding = " ".repeat(Math.max(0, Math.floor((width - (compact ? 1 : data.width)) / 2)));
          const center = (line: string) => " ".repeat(Math.max(0, Math.floor((width - visibleWidth(line)) / 2))) + line;
          const captionText = !compact && !reducedMotion && data.caption.text === caption
            ? data.caption.frames[captionFrame] ?? caption : caption;
          const lines = ["", ...logo.map(line => logoPadding + line), "",
            center(colorResourceLines([captionText], data.frames[frame])[0]), ""];
          return expand(lines.map(line => truncateToWidth(noColor ? stripVTControlCharacters(line) : line, width, "")), width);
        },
        invalidate() {},
        dispose() { dispose(); restoreResources?.(); restoreResources = undefined; },
      };
    });
  };

  pi.on("session_start", (event, ctx) => show(ctx, event.reason === "startup"));
  pi.on("resources_discover", () => { startupReady(); });
  pi.on("session_shutdown", () => { stop(); restoreLayout(); });
  pi.registerCommand("logo", {
    description: "Pi logo: animate, pause, or off",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return;
      switch (args.trim()) {
        case "":
        case "animate": show(ctx); break;
        case "pause": stop(); break;
        case "off": stop(); ctx.ui.setHeader(undefined); break;
        default: ctx.ui.notify("Use /logo animate, /logo pause, or /logo off.", "info");
      }
    },
  });
}

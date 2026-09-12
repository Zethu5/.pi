import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type TuiMainScreen, type TuiAltScreen } from "@earendil-works/pi-tui";
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
      let viewportDirty = true;
      let nextViewportCheck = 0;
      let visible = false;
      let restoreResources: (() => void) | undefined;
      restoreLayout = () => { restoreResources?.(); restoreResources = undefined; };
      const noColor = Boolean(process.env.NO_COLOR);
      const reducedMotion = process.env.PI_REDUCED_MOTION === "1";
      const caption = `pi v${VERSION}`;
      let captionFrame = 0;
      let ready = false;
      startupReady = () => { ready = true; };
      let timer: ReturnType<typeof setInterval> | undefined;
      const dispose = () => { clearInterval(timer); timer = undefined; };
      stop = dispose;
      if (!noColor && !reducedMotion) {
        timer = setInterval(() => {
          if (width < data.width + 4 || tui.terminal.rows < 20 || tui.hasOverlay?.()) return;
          if (tui.mode === "regular") {
            // Read committed viewport state after rendering, not while measuring the header.
            // Recheck cached state once per second, even without a header render.
            // This avoids permanent pauses without copying the transcript on every idle tick.
            if (viewportDirty || performance.now() >= nextViewportCheck) {
              const state = (tui as TuiMainScreen).captureRenderState?.();
              visible = state?.previousViewportTop === 0 && state.maxLinesRendered <= tui.terminal.rows;
              viewportDirty = false;
              nextViewportCheck = performance.now() + 1000;
            }
          } else if (tui.mode === "fullscreen") {
            const screen = tui as TuiAltScreen;
            visible = screen.viewportTop === 0 && !screen.hasActiveSelection?.();
          } else visible = false;
          // Freeze both frame state and redraws. Hidden frame changes also cause history replays.
          if (!visible) return;
          if (ready || !startup) captionFrame = Math.min(captionFrame + 6, data.caption.frames.length);
          frame = (frame + 1) % data.frames.length;
          tui.requestRender();
        }, data.intervalMs);
        timer.unref();
      }
      return {
        render(availableWidth: number) {
          viewportDirty = true;
          restoreResources ??= decorateResources(tui, theme, lines => colorResourceLines(lines, data.frames[frame]));
          width = Math.max(0, availableWidth);
          const compact = noColor || width < data.width + 4 || tui.terminal.rows < 20;
          const logo = compact ? [theme.fg("accent", "π")] : data.frames[frame];
          const logoPadding = " ".repeat(Math.max(0, Math.floor((width - (compact ? 1 : data.width)) / 2)));
          const center = (line: string) => " ".repeat(Math.max(0, Math.floor((width - visibleWidth(line)) / 2))) + line;
          const captionText = !compact && !reducedMotion && data.caption.text === caption
            ? data.caption.frames[captionFrame] ?? caption : caption;
          const lines = ["", ...logo.map(line => logoPadding + line), "",
            center(colorResourceLines([captionText], data.frames[frame])[0]), ""];
          return lines.map(line => truncateToWidth(noColor ? stripVTControlCharacters(line) : line, width, ""));
        },
        invalidate() { viewportDirty = true; },
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

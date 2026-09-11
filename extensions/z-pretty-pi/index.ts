import registerLogo from "./logo.js";
import { basename } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const clean = (text: string) => stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export default function (pi: ExtensionAPI) {
  registerLogo(pi);
  let connected: string[] = [];
  let requestRender = () => {};
  const unsubscribe = pi.events.on("pi-mcp-adapter/status/v1", (data: unknown) => {
    const snapshot = data as { version?: number; servers?: unknown[] } | null;
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.servers)) return;
    connected = snapshot.servers.flatMap((item) => {
      const server = item as { name?: unknown; status?: string; disabled?: boolean } | null;
      return server?.status === "connected" && !server.disabled && typeof server.name === "string"
        ? [clean(server.name)] : [];
    }).sort();
    requestRender();
  });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const previousEditor = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = previousEditor?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
      editor.setPaddingX(0);
      // Preserve the existing editor, including autocomplete and keyboard handlers.
      // Use Pi's visible row count to remove only the bottom border, not autocomplete.
      const layout = editor as unknown as { renderedVisibleLineCount: number };
      const render = editor.render.bind(editor);
      let renderedRows = 0;
      editor.render = (width) => {
        const lines = [...render(Math.max(0, width))];
        lines[0] = truncateToWidth(lines[0] ?? "", Math.max(0, width - 1), "");
        lines.splice(layout.renderedVisibleLineCount + 1, 1);
        renderedRows = lines.length;
        return [...lines.map(line => truncateToWidth(line, Math.max(0, width), "")), ""];
      };
      const handleMouse = editor.handleMouse?.bind(editor);
      if (handleMouse) editor.handleMouse = (event) => {
        if (event.y === 0 || event.y >= renderedRows) return { handled: true };
        return handleMouse({ ...event,
          y: event.y > layout.renderedVisibleLineCount ? event.y + 1 : event.y });
      };
      return editor;
    });
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const stopBranch = footerData.onBranchChange(requestRender);
      return {
        invalidate() {},
        dispose() { stopBranch(); requestRender = () => {}; },
        render(width) {
          if (width <= 0) return [""];
          const branch = footerData.getGitBranch();
          const project = clean(basename(ctx.cwd) || ctx.cwd);
          const left = theme.fg("accent", theme.bold(project))
            + (branch ? theme.fg("success", " ") + theme.fg("muted", ` on ${clean(branch)}`) : "");
          const context = ctx.getContextUsage();
          const percent = context?.percent;
          const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow;
          const statusSeparator = theme.fg("dim", " | ");
          const contextStats = theme.fg(percent != null && percent > 90 ? "error" : percent != null && percent > 70 ? "warning" : "muted",
            `${percent == null ? "?" : percent.toFixed(1)}% (${contextWindow == null ? "?" : compact.format(contextWindow)})`);
          const provider = clean(ctx.model?.provider ?? "no provider").split("-")[0];
          const vendor = provider === "openai" ? "OpenAI" : provider.charAt(0).toUpperCase() + provider.slice(1);
          const level = ctx.thinkingLevel ?? "off";
          const label = theme.fg("muted", `${clean(ctx.model?.id ?? "no model")} ${vendor} `)
            + theme.getThinkingBorderColor(level)(`● ${level}`);
          const stats = contextStats + statusSeparator + label;
          const statuses = [...footerData.getExtensionStatuses()]
            .filter(([key]) => key !== "mcp")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, value]) => clean(value)).filter(Boolean);
          const details = [
            ...(connected.length ? [`MCP ${connected.join(", ")}`] : []),
            ...statuses,
          ].join(" | ");

          // Keep the counters visible. Shorten names first on narrow terminals.
          const leftBudget = Math.min(visibleWidth(left), Math.max(1, width - visibleWidth(stats) - 2));
          const fittedLeft = truncateToWidth(left, leftBudget, "…");
          const rightBudget = Math.max(0, width - visibleWidth(fittedLeft) - 2);
          const detailBudget = rightBudget - visibleWidth(stats) - visibleWidth(statusSeparator);
          const fittedDetails = details && detailBudget > 1 ? truncateToWidth(details, detailBudget, "…") : "";
          const right = truncateToWidth((fittedDetails ? theme.fg("muted", fittedDetails) + statusSeparator : "") + stats, rightBudget, "…");
          const padding = " ".repeat(Math.max(0, width - visibleWidth(fittedLeft) - visibleWidth(right)));
          return [truncateToWidth(fittedLeft + padding + right, width, "…")];
        },
      };
    });
  });
  pi.on("session_shutdown", () => { unsubscribe(); requestRender = () => {}; });
}

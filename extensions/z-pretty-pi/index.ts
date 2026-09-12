import registerLogo from "./logo.js";
import { basename } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const clean = (text: string) => stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// Git porcelain v2 uses NUL separators, including a second path for renames.
export function gitStatus(text: string, plain = false) {
  let untracked = 0, modified = 0, staged = 0, conflicts = 0, stashed = 0;
  let ahead = 0, behind = 0;
  const records = text.split("\0");
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (row.startsWith("# branch.ab ")) {
      const counts = /^# branch.ab \+(\d+) -(\d+)$/.exec(row);
      if (counts) { ahead = Number(counts[1]); behind = Number(counts[2]); }
    } else if (row.startsWith("# stash ")) stashed = Number(row.slice(8));
    else if (row.startsWith("? ")) untracked++;
    else if (row.startsWith("u ")) conflicts++;
    else if (row.startsWith("1 ") || row.startsWith("2 ")) {
      if (row[2] !== ".") staged++;
      const submodule = row.split(" ")[2];
      if (row[3] !== "." || (submodule.startsWith("S") && submodule.slice(2) !== "..")) modified++;
      if (row.startsWith("2 ")) i++;
    }
  }
  const symbols = [untracked && `?${untracked}`, modified && `!${modified}`, staged && `+${staged}`, conflicts && `~${conflicts}`,
    stashed && `${plain ? "*" : "▶"}${stashed}`,
    ahead && (plain ? (behind ? `↕${ahead}` : `↑${ahead}`) : `⇡${ahead}`),
    behind && (plain ? (ahead ? false : `↓${behind}`) : `⇣${behind}`)].filter(Boolean).join("");
  return { symbols, color: conflicts ? "error" as const : untracked || modified || staged ? "warning" as const : "success" as const };
}

export default function (pi: ExtensionAPI) {
  registerLogo(pi);
  let connected: string[] = [];
  let requestRender = () => {};
  let stopGit = () => {};
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
      stopGit();
      requestRender = () => tui.requestRender();
      const plainGit = process.env.PI_PRETTY_GIT_STYLE === "plain";
      let status: ReturnType<typeof gitStatus> | undefined;
      let statusBranch: string | null = null;
      let busy = false, disposed = false;
      const controller = new AbortController();
      const refreshGit = async () => {
        if (busy || disposed) return;
        busy = true;
        const branch = footerData.getGitBranch();
        let next: typeof status;
        try {
          if (branch) {
            const result = await pi.exec("git", ["--no-optional-locks", "-C", ctx.cwd, "status",
              "--porcelain=v2", "--branch", "--show-stash", "-z", "--untracked-files=all", "--ignore-submodules=none"],
              { timeout: 5000, signal: controller.signal });
            if (result.code === 0 && !result.killed) next = gitStatus(result.stdout, plainGit);
          }
        } catch { /* Keep failed Git reads neutral, not clean. */ }
        finally { busy = false; }
        if (disposed || branch !== footerData.getGitBranch()) return;
        const changed = statusBranch !== branch || status?.symbols !== next?.symbols || status?.color !== next?.color;
        status = next;
        statusBranch = branch;
        if (changed) requestRender();
      };
      const stopBranch = footerData.onBranchChange(() => { void refreshGit(); requestRender(); });
      const timer = setInterval(() => { void refreshGit(); }, 3000);
      timer.unref();
      void refreshGit();
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        clearInterval(timer);
        controller.abort();
        stopBranch();
        requestRender = () => {};
      };
      stopGit = dispose;
      return {
        invalidate() {},
        dispose,
        render(width) {
          width = Math.max(0, width - 1); // Match the top separator's right edge.
          if (width <= 0) return [""];
          const branch = footerData.getGitBranch();
          const project = clean(basename(ctx.cwd) || ctx.cwd);
          const currentStatus = statusBranch === branch ? status : undefined;
          const left = theme.fg("accent", theme.bold(project))
            + (branch ? theme.fg("muted", plainGit ? " on " : "  on ")
              + theme.fg(currentStatus?.color ?? "muted", clean(branch)
                + (currentStatus?.symbols ? ` ${currentStatus.symbols}` : "")) : "");
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
  pi.on("session_shutdown", () => { stopGit(); unsubscribe(); requestRender = () => {}; });
}

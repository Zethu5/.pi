import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

type ResourceNode = {
  children?: ResourceNode[];
  render(width: number): string[];
  getCollapsedText?: () => string;
  getExpandedText?: () => string;
};
const names = new Set(["Context", "Skills", "Prompts", "Extensions"]);
const plain = (text: string) => stripVTControlCharacters(text).replace(/\r/g, "");
const sectionName = (node: ResourceNode) => plain(node.getCollapsedText?.() ?? "").split("\n")[0].match(/^\[(.+)\]$/)?.[1];

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Reuse the logo's generated ColorShift and Highlight frames as text foreground colors.
export function colorResourceLines(lines: string[], frame: string[]): string[] {
  const text = lines.map(plain);
  if (process.env.NO_COLOR || !frame.length) return text;
  const colors = frame.map(line => [...line.matchAll(/\x1b\[48;2;(\d+;\d+;\d+)m/g)].map(match => match[1]));
  const width = Math.max(1, ...text.map(visibleWidth));
  return text.map((line, y) => {
    const row = colors[Math.min(colors.length - 1, Math.floor(y * colors.length / text.length))];
    if (!row.length) return line;
    let x = 0, previous = "", result = "";
    for (const { segment } of graphemes.segment(line)) {
      const color = row[Math.min(row.length - 1, Math.floor(x * row.length / width))];
      if (segment.trim() && color !== previous) {
        result += `\x1b[38;2;${color}m`;
        previous = color;
      }
      result += segment;
      x += visibleWidth(segment);
    }
    return result + (previous ? "\x1b[0m" : "");
  });
}

// Pi has no resource-layout hook. Limit this adapter to the existing resource component.
// If its shape changes, retain Pi's normal listing instead of rebuilding resource discovery.
export function decorateResources(root: ResourceNode, theme: Theme, paint?: (lines: string[]) => string[]): (() => void) | undefined {
  const find = (node: ResourceNode): ResourceNode | undefined => {
    if (node.children?.some(child => sectionName(child))) return node;
    for (const child of node.children ?? []) {
      const match = find(child);
      if (match) return match;
    }
  };
  const container = find(root);
  if (!container) return;
  const original = container.render;
  const descriptor = Object.getOwnPropertyDescriptor(container, "render");
  container.render = (width: number) => {
    if (width < 8) return original.call(container, width);
    const sections = new Map((container.children ?? [])
      .filter(child => names.has(sectionName(child) ?? ""))
      .map(child => [sectionName(child)!, child]));
    const text = (name: string, expanded = false) => {
      const node = sections.get(name);
      return plain((expanded ? node?.getExpandedText?.() : node?.getCollapsedText?.()) ?? "")
        .split("\n").slice(1);
    };
    const heading = (label: string) => {
      const styled = theme.fg("mdHeading", label);
      return paint?.([styled])[0] ?? styled;
    };
    const join = (left: string[], right: string[], leftWidth: number, gap = 4) =>
      Array.from({ length: Math.max(left.length, right.length) }, (_, i) => {
        const line = left[i] ?? "";
        return line + " ".repeat(Math.max(0, leftWidth - visibleWidth(line)) + gap) + (right[i] ?? "");
      });
    const list = (items: string[], size: number, columns = false): string[] => {
      if (columns && size >= 44 && items.length > 1) {
        const half = Math.ceil(items.length / 2);
        const columnWidth = Math.floor((size - 2) / 2);
        return join(list(items.slice(0, half), columnWidth), list(items.slice(half), size - columnWidth - 2), columnWidth, 2);
      }
      return items.flatMap(item => wrapTextWithAnsi(item, Math.max(1, size - 4))
        .map((line, index) => theme.fg("muted", `${index === 0 ? "  • " : "    "}${line}`)));
    };
    const left = (size: number) => ["Context", "Skills", "Prompts"].flatMap(name => {
      if (!sections.has(name)) return [];
      const items = name === "Context" ? text(name, true).map(line => line.trim()).filter(Boolean)
        : text(name).join(" ").split(", ").map(item => item.trim()).filter(Boolean);
      return [heading(`[${name}]`), ...list(items, size, name === "Skills"), ""];
    });
    const right = (size: number) => {
      if (!sections.has("Extensions")) return [];
      const local: string[] = [], packages: string[] = [], paths: string[] = [];
      for (const line of text("Extensions", true)) {
        // Scope headings use two spaces; package members use six spaces.
        if (!/^ {4}\S/.test(line)) continue;
        const item = line.trim().replace(/\\/g, "/");
        if (/^(npm:|git:|https?:)/.test(item)) packages.push(item.replace(/^npm:/, ""));
        else if (/(^|\/)\.pi\/extensions\/|(^|\/)\.pi\/agent\/extensions\//.test(item)) {
          const parts = item.replace(/\/$/, "").split("/");
          const file = parts.pop()!;
          local.push(file === "index.ts" || file === "index.js" ? parts.pop()! : file.replace(/\.(ts|js)$/, ""));
        } else paths.push(item);
      }
      const groups: [string, string[], boolean][] = [["Local", local, true], ["Packages", packages, false], ["Source paths", paths, false]];
      // Keep unfamiliar source formats visible if Pi changes its grouping format.
      if (!local.length && !packages.length && !paths.length) return [heading("[Extensions]"), ...list(text("Extensions").join(" ").split(", "), size), ""];
      return [heading("[Extensions]"), ...groups.flatMap(([label, items, columns]) => items.length
        ? [`  ${heading(label)}`, ...list([...new Set(items)], size, columns), ""] : [])];
    };
    const size = Math.min(118, width - 2);
    const inset = Math.floor((width - size) / 2);
    const leftWidth = Math.floor((size - 4) / 2);
    const lines = (size >= 92 ? join(left(leftWidth), right(size - leftWidth - 4), leftWidth)
      : [...left(size), ...right(size)]).flatMap(line => wrapTextWithAnsi(line, size));
    // Style additional list headings without changing their bodies or diagnostic colors.
    const extra = (container.children ?? []).filter(child => !names.has(sectionName(child) ?? ""));
    const output = [...lines, ...extra.flatMap(child => {
      const name = sectionName(child);
      const rendered = child.render(size);
      if (!name) return rendered;
      const label = `[${name}]`;
      return [...wrapTextWithAnsi(heading(label), size), ...rendered.slice(wrapTextWithAnsi(label, size).length)];
    }).filter(line => line.trim())];
    return ["", ...output.map(line => " ".repeat(inset) + line), ""]
      .map(line => process.env.NO_COLOR ? plain(line) : line);
  };
  return () => {
    if (descriptor) Object.defineProperty(container, "render", descriptor);
    else delete (container as Partial<ResourceNode>).render;
  };
}

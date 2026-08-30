import { SessionManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	fuzzyFilter,
	Input,
	KeybindingsManager,
	SelectList,
	type Focusable,
	type SelectItem,
	truncateToWidth,
} from "@earendil-works/pi-tui";

function userPromptText(content: unknown): string | undefined {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return undefined;

	const text = content
		.filter((block): block is { type: "text"; text: string } =>
			typeof block === "object" &&
			block !== null &&
			(block as { type?: unknown }).type === "text" &&
			typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => block.text)
		.join("");
	return text || undefined;
}

async function promptHistory(ctx: ExtensionContext): Promise<string[]> {
	const branches = [ctx.sessionManager.getBranch()];
	for (const session of await SessionManager.listAll()) {
		try {
			branches.push(SessionManager.open(session.path).getBranch());
		} catch {}
	}

	const seen = new Set<string>();
	const prompts: string[] = [];
	const entries = branches
		.flat()
		.filter((entry) => entry.type === "message" && entry.message.role === "user")
		.sort((a, b) => b.message.timestamp - a.message.timestamp);

	for (const entry of entries) {
		const prompt = userPromptText(entry.message.content);
		if (!prompt || seen.has(prompt)) continue;
		seen.add(prompt);
		prompts.push(prompt);
	}

	return prompts;
}

class HistoryPicker implements Focusable {
	private _focused = false;
	private readonly query = new Input();

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.query.focused = value;
	}
	private list: SelectList;

	constructor(
		private readonly prompts: string[],
		private readonly keybindings: KeybindingsManager,
		private readonly onSelect: (prompt: string) => void,
		private readonly onCancel: () => void,
		private readonly theme: { fg(color: "accent" | "muted" | "dim", text: string): string; bold(text: string): string },
		private readonly onChange: () => void,
	) {
		this.query.focused = this.focused;
		this.list = this.createList("");
	}

	private createList(query: string): SelectList {
		const items: SelectItem[] = fuzzyFilter(this.prompts, query, (prompt) => prompt).map((prompt) => ({
			value: prompt,
			label: prompt.replaceAll("\n", " ↵ "),
		}));
		const list = new SelectList(items, 10, {
			selectedPrefix: (text) => this.theme.fg("accent", text),
			selectedText: (text) => this.theme.fg("accent", text),
			description: (text) => this.theme.fg("muted", text),
			scrollInfo: (text) => this.theme.fg("dim", text),
			noMatch: (text) => this.theme.fg("muted", text),
		});
		list.onSelect = (item) => this.onSelect(item.value);
		list.onCancel = this.onCancel;
		return list;
	}

	handleInput(data: string): void {
		if (
			this.keybindings.matches(data, "tui.select.up") ||
			this.keybindings.matches(data, "tui.select.down") ||
			this.keybindings.matches(data, "tui.select.confirm") ||
			this.keybindings.matches(data, "tui.select.cancel")
		) {
			this.list.handleInput(data);
			this.onChange();
			return;
		}

		this.query.handleInput(data);
		this.list = this.createList(this.query.getValue());
		this.onChange();
	}

	render(width: number): string[] {
		return [
			truncateToWidth(this.theme.fg("accent", this.theme.bold("History search")), width),
			...this.list.render(width),
			...this.query.render(width),
			truncateToWidth(this.theme.fg("dim", "Type to filter. Press Enter to select. Press Esc to cancel."), width),
		];
	}

	invalidate(): void {
		this.query.invalidate();
		this.list.invalidate();
	}
}

export default function (pi: ExtensionAPI): void {
	pi.registerShortcut("ctrl+r", {
		description: "Search prompt history",
		handler: async (ctx) => {
			if (ctx.mode !== "tui") return;

			const prompts = await promptHistory(ctx);
			if (prompts.length === 0) {
				ctx.ui.notify("No prompt history.", "info");
				return;
			}

			const selected = await ctx.ui.custom<string | null>((tui, theme, keybindings, done) =>
				new HistoryPicker(
					prompts,
					keybindings,
					done,
					() => done(null),
					theme,
					() => tui.requestRender(),
				),
			);

			if (selected !== null) ctx.ui.setEditorText(selected);
		},
	});
}

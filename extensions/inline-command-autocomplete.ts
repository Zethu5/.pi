import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

const COMMAND_TOKEN = /(\/[^\s/]*)$/;

type TriggerableEditor = CustomEditor & {
	tryTriggerAutocomplete(explicitTab?: boolean): void;
};

class InlineCommandEditor extends CustomEditor {
	handleInput(data: string): void {
		const text = this.getText();
		const cursor = this.getCursor();
		const wasShowingAutocomplete = this.isShowingAutocomplete();
		super.handleInput(data);

		const { line, col } = this.getCursor();
		const changed = text !== this.getText() || line !== cursor.line || col !== cursor.col;
		if (wasShowingAutocomplete || !changed || this.isShowingAutocomplete()) return;

		const beforeCursor = (this.getLines()[line] ?? "").slice(0, col);
		if (COMMAND_TOKEN.test(beforeCursor)) {
			// ponytail: Pi has no public trigger API. Remove this call when Pi adds one.
			(this as unknown as TriggerableEditor).tryTriggerAutocomplete();
		}
	}
}

function createCommandProvider(current: AutocompleteProvider): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
			const token = beforeCursor.match(COMMAND_TOKEN)?.[1];
			if (!token) return current.getSuggestions(lines, cursorLine, cursorCol, options);

			const suggestions = await current.getSuggestions([token], 0, token.length, options);
			if (!suggestions) return null;

			return {
				prefix: token,
				items: suggestions.items.map((item) => ({
					...item,
					value: item.value.startsWith("/") ? item.value : `/${item.value}`,
					label: item.label.startsWith("/") ? item.label : `/${item.label}`,
				})),
			};
		},

		applyCompletion(lines, cursorLine, cursorCol, item: AutocompleteItem, prefix) {
			if (!prefix.startsWith("/")) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			}

			const newLines = [...lines];
			const line = newLines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol - prefix.length);
			const after = line.slice(cursorCol).replace(/^[^\s]*/, "");
			const suffix = /^\s/.test(after) ? "" : " ";
			newLines[cursorLine] = before + item.value + suffix + after;
			return {
				lines: newLines,
				cursorLine,
				cursorCol: before.length + item.value.length + suffix.length,
			};
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.addAutocompleteProvider(createCommandProvider);
		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
			new InlineCommandEditor(tui, theme, keybindings),
		);
	});
}

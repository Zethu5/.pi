import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const skillDir = join(homedir(), ".pi", "agent", "extensions", "z-spec-kit-workflow");
const skillPath = join(skillDir, "SKILL.md");

export default function (pi: ExtensionAPI) {
	pi.registerCommand("z-spec-kit-workflow", {
		description: "Start a new session and run the Spec Kit workflow",
		handler: async (args, ctx) => {
			const featurePrompt = args.trim();
			if (!featurePrompt) {
				ctx.ui.notify("The command requires a feature prompt.", "error");
				return;
			}

			const body = readFileSync(skillPath, "utf8")
				.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
				.trim();
			const skill = `<skill name="z-spec-kit-workflow" location="${skillPath}">
References are relative to ${skillDir}.

${body}
</skill>`;
			const prompt = `${skill}\n\n${featurePrompt}`;

			await ctx.newSession({
				withSession: async (session) => {
					await session.sendUserMessage(prompt, { expandPromptTemplates: false });
				},
			});
		},
	});
}

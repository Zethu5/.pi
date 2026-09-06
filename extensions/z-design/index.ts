import {
	isToolCallEventType,
	type ExtensionAPI,
	type ExtensionContext,
	type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { classifyCommand, containsGitPush, designPrompt } from "./core.ts";

const MARKER = "z-design-session";
const PUBLICATION_APPROVAL = "z-design-publication-approved";

type RunMarker = { goal: string; repo: string; root: string };
type RepoContext = { repo: string; root: string };
type Preflight = { ok: true; value: RepoContext } | { ok: false; error: string };

function marker(ctx: ExtensionContext): RunMarker | undefined {
	const entries = ctx.sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.type === "custom" && entry.customType === MARKER) return entry.data as RunMarker;
	}
}

function publicationApproved(ctx: ExtensionContext): boolean {
	return ctx.sessionManager
		.getEntries()
		.some((entry) => entry.type === "custom" && entry.customType === PUBLICATION_APPROVAL);
}

function shellCommand(event: ToolCallEvent): string | undefined {
	if (isToolCallEventType("bash", event) || isToolCallEventType("powershell", event)) return event.input.command;
}

function explicitGhRepo(command: string): string | undefined {
	const match = command.match(/(?:^|\s)(?:-R|--repo)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/i);
	return match?.[1] ?? match?.[2] ?? match?.[3];
}

function cleanGoal(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

async function preflight(pi: ExtensionAPI, cwd: string): Promise<Preflight> {
	const [root, auth, repo, branch, status, localHead, remoteMain] = await Promise.all([
		pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 15_000 }),
		pi.exec("gh", ["auth", "status"], { cwd, timeout: 15_000 }),
		pi.exec("gh", ["repo", "view", "--json", "nameWithOwner,defaultBranchRef"], { cwd, timeout: 15_000 }),
		pi.exec("git", ["branch", "--show-current"], { cwd, timeout: 15_000 }),
		pi.exec("git", ["status", "--porcelain=v1", "-uall"], { cwd, timeout: 15_000 }),
		pi.exec("git", ["rev-parse", "HEAD"], { cwd, timeout: 15_000 }),
		pi.exec("git", ["ls-remote", "origin", "refs/heads/main"], { cwd, timeout: 30_000 }),
	]);
	if ([root, auth, repo, branch, status, localHead, remoteMain].some((result) => result.code !== 0)) {
		return { ok: false, error: "Repository or authenticated GitHub preflight failed." };
	}
	let info: { nameWithOwner?: string; defaultBranchRef?: { name?: string } };
	try {
		info = JSON.parse(repo.stdout);
	} catch {
		return { ok: false, error: "GitHub repository metadata was invalid." };
	}
	if (!info.nameWithOwner) return { ok: false, error: "GitHub repository identity is missing." };
	if (info.defaultBranchRef?.name !== "main") return { ok: false, error: "The GitHub default branch must be main." };
	if (branch.stdout.trim() !== "main") return { ok: false, error: "Checkout main before z-design." };
	if (status.stdout.trim()) return { ok: false, error: "Commit or remove all worktree changes before z-design." };
	if (remoteMain.stdout.trim().split(/\s+/)[0]?.toLowerCase() !== localHead.stdout.trim().toLowerCase()) {
		return { ok: false, error: "Local main must equal origin/main before z-design." };
	}
	return { ok: true, value: { repo: info.nameWithOwner, root: root.stdout.trim() } };
}

export default function zDesign(pi: ExtensionAPI): void {
	pi.registerCommand("z-design", {
		description: "Start a clean, confirmation-gated Matt Pocock feature design",
		handler: async (args, ctx) => {
			const goal = cleanGoal(args);
			if (!goal) return void ctx.ui.notify("Usage: /z-design <feature goal>", "warning");
			await ctx.waitForIdle();
			if (ctx.mode !== "tui") return void ctx.ui.notify("z-design requires an interactive TUI.", "warning");
			if (!ctx.isProjectTrusted()) return void ctx.ui.notify("Trust this project before z-design.", "warning");
			const checked = await preflight(pi, ctx.cwd);
			if (!checked.ok) return void ctx.ui.notify(checked.error, "warning");
			const run: RunMarker = { goal, ...checked.value };
			const previousSession = ctx.sessionManager.getSessionFile();
			const result = await ctx.newSession({
				parentSession: previousSession,
				setup: async (session) => {
					session.appendCustomEntry(MARKER, run);
					session.appendSessionInfo(`z-design: ${goal.slice(0, 48)}`);
				},
				withSession: async (replacement) => {
					await replacement.sendUserMessage(designPrompt(goal, checked.value.repo));
				},
			});
			if (result.cancelled) ctx.ui.notify("z-design session creation was cancelled.", "warning");
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		const run = marker(ctx);
		const command = shellCommand(event);
		if (!run || !command) return;
		const kind = classifyCommand(command);
		if (kind === "none") return;
		const commandRepo = explicitGhRepo(command);
		if (commandRepo && commandRepo.toLowerCase() !== run.repo.toLowerCase()) {
			return { block: true, reason: `z-design cannot mutate ${commandRepo}.`, terminate: true };
		}
		if (
			kind === "force-push" ||
			kind === "direct-main-push" ||
			kind === "direct-merge" ||
			kind === "issue-close" ||
			kind === "pr-merge" ||
			kind === "destructive-local" ||
			kind === "generated-workflow" ||
			kind === "blocked-remote" ||
			kind === "deploy"
		) {
			return { block: true, reason: `z-design blocks ${kind} commands.`, terminate: true };
		}
		if (containsGitPush(command)) {
			const current = await pi.exec("git", ["branch", "--show-current"], { cwd: ctx.cwd, timeout: 5_000 });
			if (current.code !== 0 || current.stdout.trim() === "main") {
				return { block: true, reason: "z-design never pushes main.", terminate: true };
			}
		}
		if (kind === "publish" && !publicationApproved(ctx)) {
			if (!ctx.hasUI) return { block: true, reason: "Design publication needs an interactive confirmation.", terminate: true };
			const shown = command.length > 800 ? `${command.slice(0, 800)}…` : command;
			const ok = await ctx.ui.confirm(
				"Publish z-design artifacts",
				`Approve the reviewed publication stage for ${run.repo}?\n\nFirst command:\n${shown}`,
			);
			if (!ok) return { block: true, reason: "Design publication was not confirmed.", terminate: true };
			pi.appendEntry(PUBLICATION_APPROVAL, { repo: run.repo, approvedAt: new Date().toISOString() });
		}
	});
}

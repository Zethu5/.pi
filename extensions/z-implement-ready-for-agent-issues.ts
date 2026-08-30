import { execFileSync } from "node:child_process";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const LABEL = "ready-for-agent";
const TIMEOUT_MS = 120_000;

type Issue = { number: number; title: string; url: string };
type Result = { code: number; stdout: string; stderr: string };

function command(cwd: string, file: string, args: string[], timeout = TIMEOUT_MS): Result {
	try {
		return {
			code: 0,
			stdout: execFileSync(file, args, { cwd, encoding: "utf8", timeout }),
			stderr: "",
		};
	} catch (error) {
		const result = error as { status?: number; stdout?: string; stderr?: string };
		return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
	}
}

function fail(ctx: ExtensionCommandContext, message: string): false {
	ctx.ui.notify(message, "error");
	return false;
}

function run(ctx: ExtensionCommandContext, file: string, args: string[], action: string, timeout?: number): Result | undefined {
	const result = command(ctx.cwd, file, args, timeout);
	if (result.code === 0) return result;
	fail(ctx, `${action}: ${result.stderr.trim() || result.stdout.trim() || "command failed"}`);
}

function branchAbsent(ctx: ExtensionCommandContext, branch: string): boolean {
	const local = command(ctx.cwd, "git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
	if (local.code !== 1) return fail(ctx, local.code === 0 ? `${branch} already exists locally` : `Could not check local ${branch}`);
	const remote = command(ctx.cwd, "git", ["ls-remote", "--exit-code", "--heads", "origin", branch]);
	if (remote.code !== 2) return fail(ctx, remote.code === 0 ? `${branch} already exists remotely` : `Could not check remote ${branch}`);
	return true;
}

function startingBranch(ctx: ExtensionCommandContext): string | undefined {
	const status = run(ctx, "git", ["status", "--porcelain"], "Could not inspect the worktree");
	if (!status) return;
	if (status.stdout.trim()) {
		fail(ctx, "Worktree is dirty; commit or stash changes before starting.");
		return;
	}
	const branch = run(ctx, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"], "Detached HEAD; check out a branch before starting");
	const base = branch?.stdout.trim();
	if (!base) return;
	if (!run(ctx, "git", ["fetch", "origin", base], `Could not fetch origin/${base}`)) return;
	const local = run(ctx, "git", ["rev-parse", base], `Could not resolve ${base}`);
	const remote = run(ctx, "git", ["rev-parse", `origin/${base}`], `Could not resolve origin/${base}`);
	if (!local || !remote || local.stdout.trim() !== remote.stdout.trim()) {
		fail(ctx, `${base} does not match origin/${base}; fast-forward or reset before starting.`);
		return;
	}
	return base;
}

function parseIssues(stdout: string): Issue[] | undefined {
	try {
		const issues: unknown = JSON.parse(stdout);
		if (Array.isArray(issues) && issues.every((issue) =>
			typeof issue === "object" && issue !== null &&
			typeof issue.number === "number" && typeof issue.title === "string" && typeof issue.url === "string",
		)) return (issues as Issue[]).sort((a, b) => a.number - b.number);
	} catch {}
}

async function runIssue(issues: Issue[], index: number, base: string, ctx: ExtensionCommandContext): Promise<void> {
	if (index === issues.length) return void ctx.ui.notify(`Processed ${issues.length} ${LABEL} issue(s).`, "info");
	const issue = issues[index];
	const branch = `issue-${issue.number}`;
	if (!branchAbsent(ctx, branch)) return;
	const marker = `ISSUE_WORKFLOW_COMPLETE:${issue.number}`;
	let completed = false;
	let replacementContext: ExtensionCommandContext | undefined;
	const result = await ctx.newSession({ withSession: async (session) => {
		replacementContext = session;
		await session.sendUserMessage(`Implement only GitHub issue #${issue.number}: ${issue.title}
${issue.url}

Follow all repository instructions. Work autonomously. The batch started on branch ${base}. Create and check out ${branch} from ${base}. Write required tests, but do not run tests or checks locally. Commit and push the implementation. Open exactly one pull request from ${branch} into ${base}. Use remote CI as the only validation. Fix each remote CI failure by committing and pushing to ${branch}.

After all required remote CI checks pass, complete the issue workflow. Switch to ${base}. Squash-merge the pull request with head-commit protection and delete the remote branch. Pull ${base} with fast-forward only. Delete the local ${branch}. Verify that the worktree is clean, ${base} matches origin/${base}, and ${branch} does not exist locally or remotely. Close issue #${issue.number} with a pull-request reference. Run CodeGraph sync through its full Windows PowerShell path. Redeploy with docker compose up -d --build. Output ${marker} only after every step succeeds.`, { expandPromptTemplates: false });
		await session.waitForIdle();
		const reply = session.sessionManager.getBranch().reverse().find((entry) =>
			entry.type === "message" && entry.message.role === "assistant",
		);
		if (reply?.type === "message" && reply.message.role === "assistant" && reply.message.stopReason === "aborted") return void session.ui.notify(`Cancelled issue #${issue.number}; stopping batch.`, "warning");
		const markerFound = reply?.type === "message" && reply.message.role === "assistant" &&
			reply.message.content.some((content) => content.type === "text" && content.text.includes(marker));
		if (!markerFound) return void session.ui.notify(`Issue #${issue.number} did not complete; stopping batch.`, "warning");
		completed = true;
	} });
	if (result.cancelled) return void ctx.ui.notify(`Session reset cancelled before issue #${issue.number}.`, "warning");
	if (completed && replacementContext) await runIssue(issues, index + 1, base, replacementContext);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("z-implement-ready-for-agent-issues", {
		description: `Implement all open GitHub issues labeled ${LABEL}`,
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			const base = startingBranch(ctx);
			if (!base) return;
			const result = run(ctx, "gh", ["issue", "list", "--state", "open", "--label", LABEL, "--limit", "10000", "--json", "number,title,url"], "Could not list issues");
			const issues = result && parseIssues(result.stdout);
			if (!issues) return void fail(ctx, "gh returned malformed issue data");
			if (issues.length === 0) return void ctx.ui.notify(`No open issues have the ${LABEL} label.`, "info");
			await runIssue(issues, 0, base, ctx);
		},
	});
}

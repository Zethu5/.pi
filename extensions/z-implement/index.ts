import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
	isToolCallEventType,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	classifyCommand,
	containsGitPush,
	documentContainsCommand,
	extractGhTarget,
	implementPrompt,
	isCodegraphSyncCommand,
	matchHeadCommit,
	parseSpecReference,
} from "./core.ts";

const MARKER = "z-implement-session";
const VERIFIED = "z-implement-verified";
const CODEGRAPH_SYNCED = "z-implement-codegraph-synced";
const DEPLOYED = "z-implement-deployed";

type RunMarker = { repo: string; root: string; specNumber: number; specTitle: string };
type Verification = { phase: "ticket" | "main"; head: string; checks: string[][]; verifiedAt: string };
type RepoContext = { repo: string; root: string };
type SpecInfo = { number: number; title: string; url: string };
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function runMarker(ctx: ExtensionContext): RunMarker | undefined {
	const entries = ctx.sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.type === "custom" && entry.customType === MARKER) return entry.data as RunMarker;
	}
}

function hasStage(ctx: ExtensionContext, customType: string): boolean {
	return ctx.sessionManager.getEntries().some((entry) => entry.type === "custom" && entry.customType === customType);
}

function latestVerification(ctx: ExtensionContext, phase: Verification["phase"]): Verification | undefined {
	const entries = ctx.sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== VERIFIED) continue;
		const data = entry.data as Verification;
		if (data.phase === phase) return data;
	}
}

async function currentHeadIsVerified(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	run: RunMarker,
	phase: Verification["phase"],
	requireUntrackedClean = true,
): Promise<boolean> {
	const verified = latestVerification(ctx, phase);
	if (!verified) return false;
	const [head, status] = await Promise.all([
		pi.exec("git", ["rev-parse", "HEAD"], { cwd: run.root, timeout: 5_000 }),
		pi.exec(
			"git",
			["status", "--porcelain=v1", requireUntrackedClean ? "-uall" : "--untracked-files=no"],
			{ cwd: run.root, timeout: 5_000 },
		),
	]);
	return head.code === 0 && status.code === 0 && !status.stdout.trim() && head.stdout.trim().toLowerCase() === verified.head.toLowerCase();
}

function awaitsDeploy(ctx: ExtensionContext): boolean {
	const entries = ctx.sessionManager.getEntries();
	let syncIndex = -1;
	let deployIndex = -1;
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		if (entry?.type !== "custom") continue;
		if (entry.customType === CODEGRAPH_SYNCED) syncIndex = index;
		if (entry.customType === DEPLOYED) deployIndex = index;
	}
	return syncIndex > deployIndex;
}

function shellCommand(event: ToolCallEvent): string | undefined {
	if (isToolCallEventType("bash", event) || isToolCallEventType("powershell", event)) return event.input.command;
}

function explicitGhRepo(command: string): string | undefined {
	const match = command.match(/(?:^|\s)(?:-R|--repo)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/i);
	return match?.[1] ?? match?.[2] ?? match?.[3];
}

function labelNames(labels: Array<{ name?: string }> | undefined): Set<string> {
	return new Set((labels ?? []).flatMap((label) => (label.name ? [label.name] : [])));
}

function containsSensitiveArg(args: string[]): boolean {
	return args.some((arg) => /(?:^|[_-])(?:api[_-]?key|password|secret|token)(?:=|$)/i.test(arg));
}

async function preflight(pi: ExtensionAPI, cwd: string): Promise<Result<RepoContext>> {
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
	if (branch.stdout.trim() !== "main") return { ok: false, error: "Checkout main before z-implement." };
	if (status.stdout.trim()) return { ok: false, error: "Commit or remove all worktree changes before z-implement." };
	if (remoteMain.stdout.trim().split(/\s+/)[0]?.toLowerCase() !== localHead.stdout.trim().toLowerCase()) {
		return { ok: false, error: "Local main must equal origin/main before z-implement." };
	}
	return { ok: true, value: { repo: info.nameWithOwner, root: root.stdout.trim() } };
}

async function validateSpec(pi: ExtensionAPI, cwd: string, repo: string, number: number): Promise<Result<SpecInfo>> {
	const result = await pi.exec(
		"gh",
		["issue", "view", String(number), "--repo", repo, "--json", "number,title,state,url,labels,blockedBy"],
		{ cwd, timeout: 15_000 },
	);
	if (result.code !== 0) return { ok: false, error: `Cannot read ${repo}#${number}.` };
	let issue: {
		number: number;
		title: string;
		state: string;
		url: string;
		labels?: Array<{ name?: string }>;
		blockedBy?: Array<{ state?: string }>;
	};
	try {
		issue = JSON.parse(result.stdout);
	} catch {
		return { ok: false, error: "The selected spec metadata was invalid." };
	}
	const labels = labelNames(issue.labels);
	if (issue.state !== "OPEN") return { ok: false, error: `Spec #${number} is not open.` };
	for (const required of ["z-design", "z-design:spec", "z-design:complete"]) {
		if (!labels.has(required)) return { ok: false, error: `Spec #${number} is missing ${required}.` };
	}
	if ((issue.blockedBy ?? []).some((blocker) => blocker.state !== "CLOSED")) {
		return { ok: false, error: `Spec #${number} has an open blocker.` };
	}
	return { ok: true, value: { number: issue.number, title: issue.title, url: issue.url } };
}

async function chooseSpec(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	repo: string,
	rawReference: string,
): Promise<Result<SpecInfo>> {
	let number: number;
	if (rawReference.trim()) {
		const parsed = parseSpecReference(rawReference, repo);
		if ("error" in parsed) return { ok: false, error: parsed.error };
		number = parsed.number;
	} else {
		const result = await pi.exec(
			"gh",
			[
				"issue",
				"list",
				"--repo",
				repo,
				"--state",
				"open",
				"--label",
				"z-design",
				"--label",
				"z-design:spec",
				"--label",
				"z-design:complete",
				"--limit",
				"50",
				"--json",
				"number,title,url",
			],
			{ cwd: ctx.cwd, timeout: 15_000 },
		);
		if (result.code !== 0) return { ok: false, error: "Cannot list completed z-design specs." };
		let issues: SpecInfo[];
		try {
			issues = JSON.parse(result.stdout);
		} catch {
			return { ok: false, error: "The z-design spec list was invalid." };
		}
		if (issues.length === 0) return { ok: false, error: "No open completed z-design spec exists." };
		const choices = issues.map((issue) => `#${issue.number} ${issue.title}`);
		const selected = await ctx.ui.select("Select one z-design spec", choices);
		if (!selected) return { ok: false, error: "Spec selection was cancelled." };
		number = Number(selected.match(/^#(\d+)/)?.[1]);
		if (!Number.isSafeInteger(number)) return { ok: false, error: "The selected spec number was invalid." };
	}
	return validateSpec(pi, ctx.cwd, repo, number);
}

async function issueBelongsToRun(pi: ExtensionAPI, ctx: ExtensionContext, run: RunMarker, number: number): Promise<boolean> {
	const result = await pi.exec(
		"gh",
		["issue", "view", String(number), "--repo", run.repo, "--json", "number,labels,parent,body"],
		{ cwd: run.root, timeout: 15_000 },
	);
	if (result.code !== 0) return false;
	try {
		const issue = JSON.parse(result.stdout) as {
			number: number;
			labels?: Array<{ name?: string }>;
			parent?: { number?: number } | null;
			body?: string;
		};
		const labels = labelNames(issue.labels);
		if (number === run.specNumber) return labels.has("z-design") && labels.has("z-design:spec");
		if (!labels.has("z-design") || !labels.has("z-design:ticket")) return false;
		return issue.parent?.number === run.specNumber || new RegExp(`(?:#|issues/)${run.specNumber}\\b`).test(issue.body ?? "");
	} catch {
		return false;
	}
}

async function validateMerge(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	run: RunMarker,
	command: string,
): Promise<Result<string>> {
	const number = extractGhTarget(command, "pr", "merge");
	if (!number) return { ok: false, error: "Use an explicit PR number for merge." };
	if (/(?:^|\s)--admin(?:\s|$)/i.test(command)) return { ok: false, error: "z-implement never uses an administrator merge bypass." };
	const result = await pi.exec(
		"gh",
		[
			"pr",
			"view",
			String(number),
			"--repo",
			run.repo,
			"--json",
			"number,state,isDraft,baseRefName,headRefOid,isCrossRepository,closingIssuesReferences,labels,body",
		],
		{ cwd: run.root, timeout: 15_000 },
	);
	if (result.code !== 0) return { ok: false, error: `Cannot read PR #${number}.` };
	let pr: {
		number: number;
		state: string;
		isDraft: boolean;
		baseRefName: string;
		headRefOid: string;
		isCrossRepository: boolean;
		closingIssuesReferences?: Array<{ number?: number }>;
		labels?: Array<{ name?: string }>;
		body?: string;
	};
	try {
		pr = JSON.parse(result.stdout);
	} catch {
		return { ok: false, error: "PR metadata was invalid." };
	}
	if (pr.state !== "OPEN" || pr.isDraft || pr.baseRefName !== "main" || pr.isCrossRepository) {
		return { ok: false, error: `PR #${number} is not an open, same-repository PR to main.` };
	}
	if (matchHeadCommit(command)?.toLowerCase() !== pr.headRefOid.toLowerCase()) {
		return { ok: false, error: `Merge PR #${number} with --match-head-commit ${pr.headRefOid}.` };
	}
	const labels = labelNames(pr.labels);
	let target = "design artifact";
	if (labels.has("z-design:artifact") && new RegExp(`z-design-spec:${run.specNumber}\\b`).test(pr.body ?? "")) {
		target = `design artifact for spec #${run.specNumber}`;
	} else {
		const closing = (pr.closingIssuesReferences ?? []).flatMap((issue) => (issue.number ? [issue.number] : []));
		if (closing.length !== 1 || !(await issueBelongsToRun(pi, ctx, run, closing[0]))) {
			return { ok: false, error: `PR #${number} must close exactly one ticket from spec #${run.specNumber}.` };
		}
		if (!(await currentHeadIsVerified(pi, ctx, run, "ticket")) || latestVerification(ctx, "ticket")?.head.toLowerCase() !== pr.headRefOid.toLowerCase()) {
			return { ok: false, error: `PR #${number} head lacks matching local verification.` };
		}
		target = `ticket #${closing[0]}`;
	}
	const checks = await pi.exec(
		"gh",
		["pr", "checks", String(number), "--repo", run.repo, "--json", "bucket,name,state"],
		{ cwd: run.root, timeout: 30_000 },
	);
	const noChecks = !checks.stdout.trim() && /no checks reported/i.test(checks.stderr);
	if (checks.code !== 0 && !noChecks) return { ok: false, error: `PR #${number} checks are not complete and passing.` };
	if (!noChecks) {
		try {
			const rows = JSON.parse(checks.stdout) as Array<{ bucket?: string }>;
			if (rows.some((row) => row.bucket !== "pass")) return { ok: false, error: `PR #${number} has a non-passing check.` };
		} catch {
			return { ok: false, error: `PR #${number} check data was invalid.` };
		}
	}
	return { ok: true, value: `PR #${number} at ${pr.headRefOid} for ${target}` };
}

async function validateIssueClose(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	run: RunMarker,
	command: string,
): Promise<Result<string>> {
	if (/\bgh(?:\.exe|\.cmd)?\s+pr\s+close\b/i.test(command)) return { ok: false, error: "z-implement does not close pull requests." };
	const number = extractGhTarget(command, "issue", "close");
	if (!number) return { ok: false, error: "Use an explicit issue number for closure." };
	if (!(await issueBelongsToRun(pi, ctx, run, number))) {
		return { ok: false, error: `Issue #${number} does not belong to spec #${run.specNumber}.` };
	}
	if (number === run.specNumber) {
		const open = await pi.exec(
			"gh",
			[
				"issue",
				"list",
				"--repo",
				run.repo,
				"--state",
				"open",
				"--label",
				"z-design",
				"--label",
				"z-design:ticket",
				"--limit",
				"200",
				"--json",
				"number,parent,body",
			],
			{ cwd: run.root, timeout: 15_000 },
		);
		if (open.code !== 0) return { ok: false, error: "Cannot verify the parent spec's open tickets." };
		try {
			const issues = JSON.parse(open.stdout) as Array<{ parent?: { number?: number } | null; body?: string }>;
			const related = issues.filter(
				(issue) => issue.parent?.number === run.specNumber || new RegExp(`(?:#|issues/)${run.specNumber}\\b`).test(issue.body ?? ""),
			);
			if (related.length > 0) return { ok: false, error: `Spec #${run.specNumber} still has ${related.length} open ticket(s).` };
		} catch {
			return { ok: false, error: "Open-ticket metadata was invalid." };
		}
	}
	return { ok: true, value: `issue #${number} from spec #${run.specNumber}` };
}

function safeDocumentPath(root: string, input: string): string | undefined {
	const cleaned = input.replace(/^@/, "");
	if (!cleaned || isAbsolute(cleaned)) return;
	const full = resolve(root, cleaned);
	const rel = relative(root, full);
	if (!rel || rel.startsWith("..") || isAbsolute(rel)) return;
	if (!/(?:^|[/\\])(?:readme|agents|claude)(?:\.[a-z0-9]+)?$|\.(?:md|mdx|txt)$/i.test(rel)) return;
	return full;
}

export default function zImplement(pi: ExtensionAPI): void {
	pi.registerCommand("z-implement", {
		description: "Implement one completed z-design spec through reviewed ticket PRs",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			if (ctx.mode !== "tui") return void ctx.ui.notify("z-implement requires an interactive TUI.", "warning");
			if (!ctx.isProjectTrusted()) return void ctx.ui.notify("Trust this project before z-implement.", "warning");
			const checked = await preflight(pi, ctx.cwd);
			if (!checked.ok) return void ctx.ui.notify(checked.error, "warning");
			const selected = await chooseSpec(pi, ctx, checked.value.repo, args.trim());
			if (!selected.ok) return void ctx.ui.notify(selected.error, "warning");
			const approved = await ctx.ui.confirm(
				"Start z-implement",
				`Repository: ${checked.value.repo}\nBase: main\nSpec: #${selected.value.number} ${selected.value.title}\n\nThis creates a clean session. Push, merge, closure, and deployment have later gates.`,
			);
			if (!approved) return;
			const run: RunMarker = {
				repo: checked.value.repo,
				root: checked.value.root,
				specNumber: selected.value.number,
				specTitle: selected.value.title,
			};
			const previousSession = ctx.sessionManager.getSessionFile();
			const result = await ctx.newSession({
				parentSession: previousSession,
				setup: async (session) => {
					session.appendCustomEntry(MARKER, run);
					session.appendSessionInfo(`z-implement: #${run.specNumber} ${run.specTitle.slice(0, 36)}`);
				},
				withSession: async (replacement) => {
					await replacement.sendUserMessage(implementPrompt(run.specNumber, run.specTitle, run.repo));
				},
			});
			if (result.cancelled) ctx.ui.notify("z-implement session creation was cancelled.", "warning");
		},
	});

	pi.registerTool({
		name: "z_implement_verify",
		label: "Verify z-implement Head",
		description: "Run one or more local validation argv entries and bind their success to the current Git HEAD.",
		parameters: Type.Object({
			phase: Type.String({ description: "Use ticket before publication or main after all merges" }),
			checks: Type.Array(
				Type.Object({
					program: Type.String({ minLength: 1, maxLength: 100 }),
					args: Type.Array(Type.String({ maxLength: 1_000 }), { maxItems: 64 }),
				}),
				{ minItems: 1, maxItems: 20 },
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const run = runMarker(ctx);
			if (!run) throw new Error("z_implement_verify requires a marked z-implement session.");
			if (!ctx.isProjectTrusted()) throw new Error("The project is not trusted.");
			if (params.phase !== "ticket" && params.phase !== "main") throw new Error("Verification phase must be ticket or main.");
			for (const check of params.checks) {
				if (/^(?:git|gh|codegraph)(?:\.exe|\.cmd)?$/i.test(check.program)) throw new Error("Git, GitHub, and CodeGraph are not validation programs.");
				if (containsSensitiveArg(check.args)) throw new Error("Validation argv cannot contain credential arguments.");
				if (!/^[a-z0-9._-]+$/i.test(check.program) || check.args.some((arg) => /[\u0000\r\n]/.test(arg))) {
					throw new Error("Validation argv contains an invalid program or control character.");
				}
				if (/^(?:bash|sh|powershell|powershell\.exe|pwsh|pwsh\.exe)$/i.test(check.program) && classifyCommand(check.args.join(" ")) !== "none") {
					throw new Error("A validation shell command contains a protected action.");
				}
			}
			const [before, branch] = await Promise.all([
				pi.exec("git", ["status", "--porcelain=v1", "-uall"], { cwd: run.root, signal, timeout: 5_000 }),
				pi.exec("git", ["branch", "--show-current"], { cwd: run.root, signal, timeout: 5_000 }),
			]);
			if (before.code !== 0 || before.stdout.trim()) throw new Error("Commit the intended change and clean the worktree before validation.");
			if (branch.code !== 0 || (params.phase === "ticket" ? branch.stdout.trim() === "main" : branch.stdout.trim() !== "main")) {
				throw new Error(`Verification phase ${params.phase} is invalid on branch ${branch.stdout.trim() || "unknown"}.`);
			}
			const head = await pi.exec("git", ["rev-parse", "HEAD"], { cwd: run.root, signal, timeout: 5_000 });
			if (head.code !== 0) throw new Error("Cannot resolve the validation HEAD.");
			for (const check of params.checks) {
				const result = await pi.exec(check.program, check.args, { cwd: run.root, signal, timeout: 30 * 60_000 });
				if (result.code !== 0) throw new Error(`${check.program} failed with exit code ${result.code}.`);
			}
			const [afterHead, afterStatus] = await Promise.all([
				pi.exec("git", ["rev-parse", "HEAD"], { cwd: run.root, signal, timeout: 5_000 }),
				pi.exec("git", ["status", "--porcelain=v1", "-uall"], { cwd: run.root, signal, timeout: 5_000 }),
			]);
			if (
				afterHead.code !== 0 ||
				afterStatus.code !== 0 ||
				afterStatus.stdout.trim() ||
				afterHead.stdout.trim().toLowerCase() !== head.stdout.trim().toLowerCase()
			) {
				throw new Error("Validation changed HEAD or left the worktree dirty.");
			}
			const checks = params.checks.map((check) => [check.program, ...check.args]);
			const verification: Verification = {
				phase: params.phase,
				head: head.stdout.trim(),
				checks,
				verifiedAt: new Date().toISOString(),
			};
			pi.appendEntry(VERIFIED, verification);
			return {
				content: [{ type: "text", text: `Verified ${params.phase} HEAD ${verification.head} with ${checks.length} local check(s).` }],
				details: verification,
			};
		},
	});

	pi.registerTool({
		name: "z_implement_deploy",
		label: "Approve Exact Local Deploy",
		description: "Run one documented local redeploy argv after CodeGraph sync and interactive approval in z-implement.",
		parameters: Type.Object({
			document: Type.String({ minLength: 1, maxLength: 500, description: "Repository-relative Markdown document with the exact command" }),
			program: Type.String({ minLength: 1, maxLength: 100, description: "Exact executable name" }),
			args: Type.Array(Type.String({ maxLength: 1_000 }), { maxItems: 64, description: "Exact argument vector" }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const run = runMarker(ctx);
			if (!run) throw new Error("z_implement_deploy requires a marked z-implement session.");
			if (!ctx.isProjectTrusted()) throw new Error("The project is not trusted.");
			if (!ctx.hasUI) throw new Error("Local deployment needs an interactive confirmation.");
			if (!(await currentHeadIsVerified(pi, ctx, run, "main", false))) throw new Error("The current main HEAD has no matching local verification.");
			if (!hasStage(ctx, CODEGRAPH_SYNCED) || !awaitsDeploy(ctx)) throw new Error("Run a successful codegraph sync immediately before deployment.");
			if (/^(?:git|gh|codegraph)(?:\.exe|\.cmd)?$/i.test(params.program)) throw new Error("Deployment cannot run Git, GitHub, or CodeGraph as its program.");
			if (containsSensitiveArg(params.args)) throw new Error("Deployment argv cannot contain credential arguments. Use the process environment.");
			if (!/^[a-z0-9._-]+$/i.test(params.program) || params.args.some((arg) => /[\u0000\r\n]/.test(arg))) {
				throw new Error("Deployment argv contains an invalid program or control character.");
			}
			const path = safeDocumentPath(run.root, params.document);
			if (!path) throw new Error("Deployment documentation must be a repository-relative Markdown or text file.");
			let canonicalRoot: string;
			let canonicalPath: string;
			let document: string;
			try {
				[canonicalRoot, canonicalPath, document] = await Promise.all([realpath(run.root), realpath(path), readFile(path, "utf8")]);
			} catch {
				throw new Error("Deployment documentation cannot be read.");
			}
			const rel = relative(canonicalRoot, canonicalPath);
			if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Deployment documentation escapes the repository.");
			const exact = [params.program, ...params.args].join(" ");
			if (!documentContainsCommand(document, exact)) throw new Error(`The document does not contain the exact command: ${exact}`);
			const argv = JSON.stringify([params.program, ...params.args]);
			const approved = await ctx.ui.confirm(
				"Approve local redeploy",
				`Repository: ${run.repo}\nDocument: ${params.document}\nExact argv: ${argv}`,
			);
			if (!approved) throw new Error("Local redeploy was not approved.");
			const result = await pi.exec(params.program, params.args, { cwd: run.root, signal, timeout: 30 * 60_000 });
			if (result.code !== 0) throw new Error(`Local redeploy failed with exit code ${result.code}.`);
			pi.appendEntry(DEPLOYED, { document: params.document, argv, completedAt: new Date().toISOString() });
			return {
				content: [{ type: "text", text: "Local redeploy completed. Run the documented health check now." }],
				details: { code: result.code, killed: result.killed, document: params.document, argv: [params.program, ...params.args] },
			};
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		const run = runMarker(ctx);
		const command = shellCommand(event);
		if (!run || !command) return;
		if (awaitsDeploy(ctx)) {
			return { block: true, reason: "Call z_implement_deploy before any later shell command.", terminate: true };
		}
		const kind = classifyCommand(command);
		if (kind === "none") return;
		const commandRepo = explicitGhRepo(command);
		if (commandRepo && commandRepo.toLowerCase() !== run.repo.toLowerCase()) {
			return { block: true, reason: `z-implement cannot mutate ${commandRepo}.`, terminate: true };
		}
		if (
			kind === "force-push" ||
			kind === "direct-main-push" ||
			kind === "direct-merge" ||
			kind === "destructive-local" ||
			kind === "generated-workflow" ||
			kind === "blocked-remote" ||
			kind === "deploy"
		) {
			return { block: true, reason: `z-implement blocks ${kind} commands.`, terminate: true };
		}
		if (containsGitPush(command)) {
			const current = await pi.exec("git", ["branch", "--show-current"], { cwd: run.root, timeout: 5_000 });
			if (current.code !== 0 || current.stdout.trim() === "main") {
				return { block: true, reason: "z-implement never pushes main.", terminate: true };
			}
		}
		if (!ctx.hasUI) return { block: true, reason: "This GitHub stage needs interactive confirmation.", terminate: true };
		const shown = command.length > 800 ? `${command.slice(0, 800)}…` : command;
		if (kind === "pr-merge") {
			const checked = await validateMerge(pi, ctx, run, command);
			if (!checked.ok) return { block: true, reason: checked.error, terminate: true };
			const ok = await ctx.ui.confirm("Merge reviewed PR", `${checked.value}\n\nExact command:\n${shown}`);
			if (!ok) return { block: true, reason: "PR merge was not confirmed.", terminate: true };
			return;
		}
		if (kind === "issue-close") {
			const checked = await validateIssueClose(pi, ctx, run, command);
			if (!checked.ok) return { block: true, reason: checked.error, terminate: true };
			const ok = await ctx.ui.confirm("Close related issue", `${checked.value}\n\nExact command:\n${shown}`);
			if (!ok) return { block: true, reason: "Issue closure was not confirmed.", terminate: true };
			return;
		}
		if (kind === "publish") {
			const publishesCode = containsGitPush(command) || /\bgh(?:\.exe|\.cmd)?\s+pr\s+create\b/i.test(command);
			if (publishesCode && !(await currentHeadIsVerified(pi, ctx, run, "ticket"))) {
				return { block: true, reason: "Run z_implement_verify for this exact ticket HEAD before publication.", terminate: true };
			}
			const ok = await ctx.ui.confirm("Publish reviewed ticket stage", `Repository: ${run.repo}\nSpec: #${run.specNumber}\n\nExact command:\n${shown}`);
			if (!ok) return { block: true, reason: "Publication was not confirmed.", terminate: true };
		}
	});

	pi.on("tool_result", (event, ctx) => {
		const run = runMarker(ctx);
		if (!run || event.isError || (event.toolName !== "bash" && event.toolName !== "powershell")) return;
		const command = typeof event.input.command === "string" ? event.input.command : "";
		if (isCodegraphSyncCommand(command)) {
			pi.appendEntry(CODEGRAPH_SYNCED, { command, completedAt: new Date().toISOString() });
		}
	});
}

// Run: node check-clean-install.mjs <absolute-path-to-installed-Pi/dist/index.js>
// Downloads configured packages into a new profile. Makes no model requests.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

assert.equal(process.platform, "win32", "This check exercises the documented Windows setup");
const sdkPath = process.argv[2];
assert.ok(sdkPath && isAbsolute(sdkPath) && existsSync(sdkPath), "Supply the installed Pi dist/index.js absolute path");
const source = fileURLToPath(new URL(".", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "pi-clean-"));
const home = join(root, "New User");
const agentDir = join(home, ".pi", "agent");
const sourceClone = join(home, "pi-config");
const cwd = join(home, "project");
const files = execFileSync("git", ["-C", source, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of files) {
  assert.ok(!/(^|\/)(auth\.json|mcp\.json|sessions|node_modules|npm|git)(\/|$)/.test(file), `Private or installed file in source: ${file}`);
  const destination = join(sourceClone, file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(source, file), destination);
}
mkdirSync(cwd, { recursive: true });
mkdirSync(agentDir, { recursive: true });
writeFileSync(join(agentDir, "auth.json"), "{}\n");
writeFileSync(join(agentDir, "private-marker.txt"), "preserve this file");
const setup = readFileSync(join(sourceClone, "docs/windows-setup.md"), "utf8");
const copyBlock = [...setup.matchAll(/```powershell\r?\n([\s\S]*?)```/g)].find(match => match[1].includes("$ErrorActionPreference"));
assert.ok(copyBlock, "The documented backup/copy command must exist");
execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", copyBlock[1].replaceAll("$HOME", "$env:PI_SETUP_TEST_HOME")], {
  env: { ...process.env, PI_SETUP_TEST_HOME: home }, stdio: "inherit",
});
const backup = readdirSync(join(home, ".pi")).find(name => name.startsWith("agent-backup-"));
assert.ok(backup, "The copy command must create a backup");
for (const directory of [agentDir, join(home, ".pi", backup)]) {
  assert.equal(readFileSync(join(directory, "auth.json"), "utf8"), "{}\n");
  assert.equal(readFileSync(join(directory, "private-marker.txt"), "utf8"), "preserve this file");
}

// Isolate package caches, home discovery, and credentials before importing Pi.
for (const key of Object.keys(process.env)) {
  if (/^PI_|API_KEY|TOKEN|SECRET|^NODE_PATH$|^NPM_CONFIG_/i.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  APPDATA: join(home, "AppData", "Roaming"),
  LOCALAPPDATA: join(home, "AppData", "Local"),
  PI_CODING_AGENT_DIR: agentDir,
  PI_SKIP_VERSION_CHECK: "1",
  NPM_CONFIG_CACHE: join(root, "npm-cache"),
  NPM_CONFIG_USERCONFIG: join(root, "empty.npmrc"),
  GIT_CONFIG_GLOBAL: join(root, "empty.gitconfig"),
  GIT_TERMINAL_PROMPT: "0",
});
writeFileSync(process.env.NPM_CONFIG_USERCONFIG, "");
writeFileSync(process.env.GIT_CONFIG_GLOBAL, "");
process.chdir(cwd);
console.log(`Isolated profile: ${agentDir}`);
console.log("Installing package sources and loading resources; no credentials or model requests.");
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(pathToFileURL(resolve(sdkPath)));
const settingsManager = SettingsManager.create(cwd, agentDir);
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
await loader.reload();
const { extensions, errors } = loader.getExtensions();
assert.deepEqual(errors, [], "Every extension must load");
const modelRuntime = await ModelRuntime.create({
  authPath: join(agentDir, "auth.json"),
  modelsPath: join(agentDir, "models.json"),
  allowModelNetwork: false,
});
const { session } = await createAgentSession({ cwd, agentDir, resourceLoader: loader, settingsManager, modelRuntime, sessionManager: SessionManager.inMemory(cwd) });
const { initTheme } = await import(new URL("./modes/interactive/theme/theme.js", pathToFileURL(resolve(sdkPath))));
initTheme(JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")).theme, false);
const startupErrors = [];
await session.bindExtensions({ mode: "print", onError: error => startupErrors.push(error) });
assert.deepEqual(startupErrors, [], "Session startup must succeed");
const tools = extensions.flatMap(extension => [...extension.tools.keys()]);
const skills = loader.getSkills().skills.map(skill => skill.name);
for (const skill of ["ponytail", "pi-subagents", "i-have-adhd", "banner-design", "brand", "design", "design-system", "slides", "ui-styling", "ui-ux-pro-max"]) {
  assert.ok(skills.includes(skill), `Missing skill: ${skill}`);
}
assert.deepEqual(loader.getSkills().diagnostics, [], "Skills must load without warnings");
const commands = extensions.flatMap(extension => [...extension.commands.keys()]);
for (const tool of ["web_search", "ask_user_question", "fffind", "subagent", "codegraph_search", "mcp", "z_implement_verify"]) {
  assert.ok(tools.includes(tool), `Missing tool: ${tool}`);
}
for (const command of ["logo", "z-design", "z-implement"]) assert.ok(commands.includes(command), `Missing command: ${command}`);
const theme = loader.getThemes().themes.find(theme => theme.name === "thinking-colors");
assert.ok(theme, "The original theme must load");
assert.deepEqual(loader.getThemes().diagnostics, []);
assert.ok(theme.getThinkingBorderColor("max")("x").includes("255;0;0"));
assert.ok(loader.getAgentsFiles().agentsFiles.some(file => file.path === join(agentDir, "AGENTS.md")));
for (const file of ["settings.json", "models.json", "themes/thinking-colors.json"]) {
  assert.equal(readFileSync(join(agentDir, file), "utf8"), readFileSync(join(source, file), "utf8"), `${file} must remain unchanged`);
}
if (existsSync(join(agentDir, "auth.json"))) {
  assert.deepEqual(JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf8")), {}, "No credentials were supplied");
}
const report = {
  extensions: extensions.map(extension => extension.path),
  tools,
  commands,
  skills,
  skillDiagnostics: loader.getSkills().diagnostics,
  theme: theme.name,
  limits: "Backup/copy, package installation, resource loading, and session startup only. No provider login, model inference, authenticated MCP services, or external feature operations.",
};
writeFileSync(join(root, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`PASS: Windows backup/copy, isolated package installation, resource loading, and session startup. Evidence retained at ${root}`);
session.dispose();
process.exit(0);

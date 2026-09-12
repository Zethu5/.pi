# Fresh Windows setup

This configuration preserves the owner's main model, subagent models, context-window overrides, and exact theme.
The `thinking-colors/thinking-colors` setting selects the included `thinking-colors` theme for both light and dark terminals.

Use Windows PowerShell. Close Pi before copying configuration.
This setup copies public configuration, not another person's accounts or installed programs.
Extensions run with your account's permissions. Review the source before installation.

## 1. Check prerequisites

Install Node.js 24 LTS and Git for Windows if missing. Pi must already be installed.
Open a new PowerShell window after installation.

```powershell
node --version
git --version
pi.cmd --version
Test-Path 'C:\Program Files\Git\bin\bash.exe'
```

Use Pi 0.85.1 or a compatible newer version. Other versions need separate validation.
The configuration selects `C:/Program Files/Git/bin/bash.exe`. For a nonstandard location, adjust only the recipient's installed `shellPath`.
Use `.cmd` shims if PowerShell blocks `.ps1` files. Do not weaken the machine's execution policy.

## 2. Download and review

Clone outside the active configuration directory:

```powershell
git clone https://github.com/Zethu5/.pi.git "$HOME\pi-config"
if ($LASTEXITCODE -ne 0) { throw 'Clone failed. Do not continue.' }
Set-Location "$HOME\pi-config"
```

Review `settings.json`, `AGENTS.md`, and `extensions` before the next step.
The defaults select `thinking-colors/thinking-colors`, OpenAI Codex, and `gpt-6-astra`.
Subagents use their selected `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` models.
`models.json` preserves the 1,050,000-token context-window overrides for `gpt-6-astra` and `gpt-5.6-sol`.
The recipient needs access to these models. Configuration alone does not grant access or change provider limits.
The relative `skills` entry exposes the existing design package's `.claude/skills` directory to Pi.
It does not change model, thinking-level, theme, or context-window choices.

## 3. Back up and copy

These commands replace public settings and matching extension files.
They preserve credentials, sessions, MCP definitions, and other files outside the copy list.
Existing extra extensions remain installed. This procedure does not remove them.

```powershell
$ErrorActionPreference = 'Stop'
$source = "$HOME\pi-config"
$target = "$HOME\.pi\agent"
$backup = "$HOME\.pi\agent-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
if (Test-Path $target) {
    Copy-Item -LiteralPath $target -Destination $backup -Recurse
    Write-Host "Private backup: $backup"
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
$files = @('settings.json', 'models.json', 'keybindings.json', 'AGENTS.md', '.i-have-adhd-always', 'extensions', 'docs', 'themes')
foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $source $file) -Destination $target -Recurse -Force
}
```

The backup can contain credentials. Keep it private and outside Git.
If copying fails, stop before starting Pi. Restore affected files from the printed backup path.
Do not copy another person's `auth.json`, cookies, tokens, or sessions.
If you set `PI_CODING_AGENT_DIR`, use that directory as `$target` instead.

## 4. Start and authenticate

Start Pi from your project, not the configuration repository:

```powershell
Set-Location $HOME
pi.cmd
```

Pi installs missing configured packages during startup. Network access, Git, and npm must work.
This configuration currently declares 11 package sources. A source can expose several resources, or none if its layout changes.
Wait for installation to finish. Resolve reported package or extension errors before using workflows.

Run `/login` with your own account. Verify access to the configured main model through `/model`.
Also verify each configured subagent model. Changing the main model does not change the subagent overrides.
If access is missing, stop and decide which settings to change on the recipient's machine only.
Do not silently replace the repository's model choices.

Check `/logo pause` and `pi.cmd list` to confirm the custom command and configured package list.
A listed package does not prove that its external services work.

## 5. Configure only the services you use

| Feature | Separate setup |
| --- | --- |
| GitHub design and implementation | Install GitHub CLI. Run `gh auth login` and `gh auth status`. Configure Git author name/email and push access. |
| CodeGraph | Install its CLI if the package reports it missing. Run `codegraph init` in each project before indexed navigation. |
| RTK | Follow the installed optimizer's instructions if the `rtk` executable is missing. |
| Research, media, and design scripts | Configure a research provider. Some media tools need `yt-dlp` and FFmpeg; design search scripts need Python. |
| MCP servers | Configure your own servers through `pi-mcp-adapter`. Remote credentials and local server processes are not supplied. |

No MCP definition is copied from the original machine. Its service addresses and authentication are machine-specific.
Project skills, project instructions, trust decisions, indexes, and deployment services are also separate.

`/z-design` needs a trusted project with a clean `main` matching `origin/main` and GitHub's default branch set to `main`.
`/z-implement` can publish, merge, close issues, and run a documented local deployment after its checks pass.
Use it only in a repository where you authorize those actions.
Both commands use the included [portable workflow guide](workflows.md).

## Updates and checks

Package sources are unpinned. Two installations can receive different upstream versions.
Use `pi.cmd update --extensions` only when you intend to update packages.
For configuration updates, pull the separate `pi-config` clone, review the diff, and repeat the backup/copy step.
Copying again restores the repository's selected models and settings. Back up recipient-specific changes before repeating the copy.

Run the dependency-free repository checks from `pi-config` with Node.js 24:

```powershell
node check-portability.mjs
node extensions/z-design/publication.test.ts
```

These two checks do not authenticate, install packages, contact GitHub, or prove external service availability.

### Maintainer clean-install check

Run the following with the absolute path to the installed Pi package's `dist/index.js`:

```powershell
node check-clean-install.mjs 'C:\path\to\pi-coding-agent\dist\index.js'
```

This Windows check downloads packages. It uses the installed Pi SDK but creates a separate home, configuration directory, and npm cache.
It runs the documented PowerShell backup/copy block and checks preservation of empty credentials and an unrelated private file.
It loads extensions, starts a non-interactive session without prompting a model, and checks tools, skills, theme, and unchanged settings.
The temporary profile and `report.json` remain available at the printed path for inspection.

Verified on Windows with Node.js 24.14.1 and Pi 0.85.1:

- The documented backup/copy commands preserved empty credentials and an unrelated private file.
- All 11 package sources installed in an isolated profile with a separate npm cache.
- Session startup loaded 15 extensions, 25 registered tools, and 19 skills without extension or skill errors.
- The original theme loaded. Main/subagent models, thinking levels, and both context-window overrides remained unchanged.
- Workflow relocation, publication guards, and the existing terminal appearance checks passed.

Provider login, model inference, authenticated MCP services, and external feature operations require separate recipient-side checks.
Package sources remain unpinned. A future upstream version can change these results.

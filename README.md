# Global Pi tools

Personal [Pi coding agent](https://pi.dev) configuration for `~/.pi/agent`.
This repository stores global settings and custom extensions. These resources apply across projects, subject to project overrides.

## Repository contents

| Path | Purpose |
| --- | --- |
| [`settings.json`](settings.json) | Package sources, default model, terminal settings, and subagent configuration. |
| [`models.json`](models.json) | Model context-window overrides. These do not grant provider access. |
| [`extensions/`](extensions/) | Custom extensions and the RTK optimizer configuration. |
| `skills/` | Optional local skills. No local skill files are currently tracked. |

The current defaults select OpenAI Codex, `gpt-6-astra`, medium thinking, and regular terminal mode.
The shell path points to Git Bash on Windows.

## Installed packages

These packages are declared in `settings.json`. Their installed files are not stored in this repository.

| Package | Purpose | Main tools or controls |
| --- | --- | --- |
| [`pi-web-access`](https://www.npmjs.com/package/pi-web-access) | Web research, source checks, page extraction, PDFs, GitHub content, and video analysis. | `web_search`, `source_check`, `fetch_content`, `get_search_content` |
| [`@juicesharp/rpiv-ask-user-question`](https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question) | Structured questions with selectable answers and custom input. | `ask_user_question` |
| [`@dietrichgebert/ponytail`](https://www.npmjs.com/package/@dietrichgebert/ponytail) | Instructions for minimal implementations, reuse, and complexity review. | Ponytail modes and skills listed below. |
| [`@ff-labs/pi-fff`](https://www.npmjs.com/package/@ff-labs/pi-fff) | Git-aware fuzzy file search and content search. | `fffind`, `ffgrep` |
| [`pi-rtk-optimizer`](https://www.npmjs.com/package/pi-rtk-optimizer) | Rewrites supported commands through RTK and compacts tool output. | Automatic command and output handling. |
| [`pi-subagents`](https://www.npmjs.com/package/pi-subagents) | Delegation, parallel work, isolated worktrees, review, and supervisor communication. | `subagent`, `subagent_supervisor`, `bg_wait` |
| [`pi-loop-police`](https://www.npmjs.com/package/pi-loop-police) | Detects repeated thinking and tool-call loops and interrupts them. | Loop monitoring, help, and postmortem skills. |
| [`@vndv/pi-codegraph`](https://www.npmjs.com/package/@vndv/pi-codegraph) | Indexed code navigation and change-impact analysis. | `codegraph_*` tools listed below. |
| [`pi-mcp-adapter`](https://www.npmjs.com/package/pi-mcp-adapter) | Connects MCP servers and exposes their tools. | `mcp`, `mcpScript` |
| [`ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | UI design guidance for layouts, accessibility, typography, colors, charts, and implementation stacks. | Resources exposed by the installed Git package. |

Package sources are not version-pinned. Available tools can change after an update.
Some tools require provider credentials, external programs, or additional configuration.

### Research and questions

- Use `web_search` to research current information.
- Use `source_check` to test a claim against cited passages.
- Use `fetch_content` to read a known URL or supported media source.
- Use `get_search_content` to retrieve more content from an earlier result.
- Use `ask_user_question` when a decision needs user input.

### Code navigation

| Tool | Purpose |
| --- | --- |
| `fffind` | Find files by fuzzy path or glob. |
| `ffgrep` | Search file contents. |
| `codegraph_search` | Find symbol locations by name. |
| `codegraph_explore` | Inspect related symbols and source files. |
| `codegraph_node` | Inspect one symbol, its source, and call relationships. |
| `codegraph_callers` | Find code that calls a symbol. |
| `codegraph_callees` | Find symbols called by a function or method. |
| `codegraph_impact` | Estimate the affected code around a changed symbol. |
| `codegraph_files` | Show the indexed project structure. |
| `codegraph_status` | Check the project index status. |

CodeGraph requires an index in the target project. Use file search when an index is unavailable.

### Subagents

`subagent` discovers agents, starts work, runs workflows, and manages existing runs.
`subagent_supervisor` handles child requests. `bg_wait` supports work that lacks native completion notifications.
Ordinary asynchronous subagent runs notify the parent when they finish.

The global configuration defines these model overrides:

| Agent | Intended work | Model | Thinking |
| --- | --- | --- | --- |
| `scout` | Code discovery | `gpt-5.6-luna` | Low |
| `researcher` | External research | `gpt-5.6-terra` | Medium |
| `worker` | Implementation | `gpt-5.6-terra` | High |
| `reviewer` | Review with `ponytail-review` | `gpt-5.6-terra` | High |
| `oracle` | Difficult technical decisions | `gpt-5.6-sol` | High |
| `delegate` | Small independent tasks | `gpt-5.6-luna` | Medium |

All overrides use `openai-codex`. Tool permissions differ by agent; see `settings.json` for the exact lists.
Watchdog monitoring and blocker follow-up are enabled.

### Ponytail and loop-control skills

- `ponytail`: Prefer existing code, standard libraries, and the smallest correct change.
- `ponytail-review`: Review changes for unnecessary complexity.
- `ponytail-audit`: Report unnecessary complexity across a repository.
- `ponytail-debt`: Collect deliberate `ponytail:` shortcuts.
- `ponytail-gain`: Show measured Ponytail results.
- `ponytail-help`: Explain modes and commands.
- `pi-subagents`: Explain delegation and workflow use.
- `council-mode`: Run a bounded advisor discussion.
- `loop-police-help`: Explain loop-monitor controls and configuration.
- `loop-police-postmortem`: Analyze detections and propose configuration changes.

Skills provide instructions. They are not separate executables.

### MCP connections

Use `mcp` to discover, inspect, connect, and call MCP tools.
Use `mcpScript` when several MCP calls need shared logic.
Server definitions and credentials are local configuration, not part of this repository.
A clone does not reproduce the original machine's MCP connections.

## Custom extensions

### Inline command autocomplete

[`extensions/inline-command-autocomplete.ts`](extensions/inline-command-autocomplete.ts) adds slash-command suggestions inside a prompt, not only at its start.
Normal file completion remains available.

### Prompt history search

[`extensions/z-history-fzf.ts`](extensions/z-history-fzf.ts) registers **Ctrl+R**.
It searches user prompts from saved Pi sessions, removes duplicates, and shows recent prompts first.
Type to filter. Press Enter to copy a prompt into the editor. Press Escape to cancel.
Despite its name, it uses Pi's fuzzy matcher and does not launch `fzf`.

### Feature design: `/z-design <feature goal>`

[`extensions/z-design/`](extensions/z-design/) starts a fresh interactive design session.
It gathers repository facts, asks for decisions, and prepares an approved specification with implementation tickets.
After design approval, the workflow publishes GitHub issues and any required design-artifact branch and pull request.
It does not implement production code, merge, close issues, or deploy.

Requirements include a trusted project, authenticated `gh`, and a clean `main` that matches remote `origin/main`.
The GitHub default branch must be `main`.

### Implementation: `/z-implement`

[`extensions/z-implement/`](extensions/z-implement/) implements a completed `z-design` specification through ticket pull requests.
It processes one eligible ticket per top-level session, with local validation and independent review before publication.
Its workflow includes merging verified pull requests, closing completed issues, updating CodeGraph, and running documented local deployment commands.
This command grants broader authority than `/z-design`; it is not a design-only operation.

| Tool | Purpose |
| --- | --- |
| `z_implement_read_parent_spec` | Read the selected parent specification without child ticket bodies. |
| `z_implement_select_ticket` | Select one eligible ticket and return its body and comments. |
| `z_implement_next_ticket_session` | Start a fresh marked session for the next ticket. |
| `z_implement_verify` | Run local checks and bind success to the current Git HEAD. |
| `z_implement_deploy` | Run an exact documented local deployment command after verification and CodeGraph synchronization. |

`/z-implement-next-ticket` provides the session-transition command used by the workflow.
Both design extensions reference `C:/Users/zvika/.pi/agent/docs/matt-pocock-workflows.md`.
That local guide is not tracked here. A clone alone is insufficient for these workflows.

### Terminal appearance: `z-pretty-pi`

[`extensions/z-pretty-pi/`](extensions/z-pretty-pi/) combines a styled editor, status footer, animated logo, and grouped resource lists.
The footer shows project, branch, MCP connections, extension status, context usage, model, provider, and thinking level.
It does not show cost or subscription details.

- `/logo animate`: Restart the animation.
- `/logo pause`: Freeze the current frame.
- `/logo off`: Restore the built-in header for this session.
- `PI_REDUCED_MOTION=1`: Disable animation before startup.
- A nonempty `NO_COLOR`: Disable colors and animation.

See the [extension README](extensions/z-pretty-pi/README.md) for behavior, checks, and frame regeneration.

### RTK output settings

[`extensions/pi-rtk-optimizer/config.json`](extensions/pi-rtk-optimizer/config.json) enables command rewriting, rewrite notifications, and output compaction.
It strips ANSI escapes and limits compacted output to 12,000 characters.
Test, build, Git, linter, and search output receive specialized compaction.
Read compaction and source-code filtering are disabled.

## Setup and maintenance

1. Install Pi and the required provider authentication.
2. Place the repository contents in `~/.pi/agent` without overwriting existing private configuration.
3. Adjust the Windows shell path and model choices in `settings.json` for your machine.
4. Start Pi and inspect resource-loading errors.
5. Configure research providers, MCP servers, and external programs separately.

The configured `thinking-colors/thinking-colors` theme is not tracked here. Install it separately or select an available theme.
The repository is a configuration snapshot, not a complete backup of the original environment.

```bash
pi list                 # List configured packages
pi config               # Enable or disable resources
pi update --extensions  # Update installed packages
```

Run `/reload` inside Pi after extension changes.
Use Pi's built-in `read`, `bash`, `edit`, and `write` tools for normal file and command operations.

## Private files

`.gitignore` uses an allowlist. Credentials, sessions, caches, installed packages, MCP configuration, and other local state remain excluded.
Do not commit `auth.json`, tokens, cookies, private transcripts, or provider secrets.
Review staged changes before each commit.

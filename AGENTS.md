# Global Agent Instructions

Apply these defaults unless a project file gives a more specific rule.

## Writing Style

Write original text in ASD-STE100 Simplified Technical English, Issue 9 or later.
Use approved words and approved Technical Names.
Use short, active sentences with one topic.
Use one meaning for each word.
Use simple verb forms.
Write instructions in the imperative.
Use no more than 20 words in procedural sentences.
Use no more than 25 words in descriptive sentences.
Do not use slang or idioms.
Apply this style to comments, docstrings, and commit messages when project rules permit.
Keep quotations, identifiers, commands, and error text exact.

## Subagents

Delegate only when a child materially improves speed, evidence, isolation, or review.
Do small tasks directly.
Confirm agent and required tool availability before launch.
Use `scout` for unfamiliar code and `researcher` for external facts.
Use `worker` for approved changes and `delegate` for small independent tasks.
Use `reviewer` for substantial reviews.
Use `oracle` only for high-risk decisions or architecture drift.
Add `ponytail-review` only when complexity risk exists.

## GitHub Tools

Do not use Git or GitHub MCP tools.
Use local `git` and `gh` commands.

## Code Navigation

Use available CodeGraph tools first for architecture, code flow, symbols, and change impact.
Use `fffind` for paths and `ffgrep` for content.
Use built-in tools when an extension is unavailable or fails.
Use `ls` only when alphabetical order matters.
On Windows, use PowerShell and `$env:LOCALAPPDATA\codegraph\current\bin\codegraph.cmd` for a CodeGraph CLI fallback.

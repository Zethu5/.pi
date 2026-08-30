---
name: z-create-ready-for-agent-issue
description: Creates and fully triages one GitHub issue that is ready for an agent. Use when the user asks to create a ready-for-agent issue from an issue description.
---

# Ready for Agent Issue

Use this skill only with an issue description.

1. Read and follow the installed `github-triage` skill, including its AI disclaimer and agent-brief rules.
2. Infer the GitHub repository from `git remote`. Use `gh` for all GitHub work.
3. Inspect the relevant code, tests, specifications, ADRs, and open issues. Check for duplicates before creating an issue.
4. Classify the request as exactly one category: `bug` or `enhancement`.
5. Ask concise questions for every material ambiguity. Do not create or label an issue `ready-for-agent` while a blocking question remains.
6. When all material facts are known, create exactly one new issue. Put the required AI disclaimer first in its body.
7. Add a durable agent brief as a comment. It must state the category, summary, current behavior, desired behavior, key interfaces, testable acceptance criteria, and out-of-scope work.
8. Apply exactly one category label and the `ready-for-agent` label. Remove all other state labels.
9. Verify with `gh issue view` that the issue URL is correct and its labels are exactly one category label plus `ready-for-agent`.

Do not implement, commit, push, or create follow-up issues. Report the issue URL, labels, and any questions that prevented completion.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function buildRoutingPrompt(request: string): string {
  return `Use Superpowers to design the software request below. Do not implement it.

Classify the request internally before repository investigation. Make the applicable skill invocation your first visible action.

- Feature: invoke \`brainstorming\`. Complete its applicable design or specification review, then stop before planning or implementation.
- Bug fix: invoke \`systematic-debugging\`. Establish a reproducible root cause before proposing a fix. Then invoke \`brainstorming\` to design the smallest root-cause fix. Complete its applicable design or specification review, then stop before planning or implementation.
- Ambiguous: invoke \`brainstorming\`, state that classification is ambiguous, and ask one classification question.
- Neither: explain that \`/z-design\` accepts only feature and bug-fix requests, then stop.

Treat the request as an initial problem statement. Inspect the current repository when the selected skill requires it. Do not write code, create an implementation plan, or invoke implementation skills.

## Approved GitHub issue handoff

Only after final user approval, create exactly one GitHub issue in the current repository:

1. Confirm the current directory is a Git repository with a GitHub remote. Use \`gh\` for GitHub operations.
2. Do not create a draft or pre-approval issue.
3. Check for the exact \`approved-design\` label. Create it only when absent, with description \`Approved design ready for implementation\`. Do not replace an existing label.
4. Start the issue body with this exact header:

<!-- z-design:v1 -->
Design-Class: bounded | architectural
Design-Status: approved
Design-Path: issue-body | <repository-relative Markdown path>
Design-Commit: none | <full Git commit SHA>

5. For a bounded design, put the complete approved design in the issue body. Use \`issue-body\` and \`none\` for its source fields.
6. For an architectural design, use the committed approved specification path and the full commit SHA that contains it. Verify that version before issue creation.
7. Include the original request, approved design summary, testable acceptance criteria, and explicit out-of-scope work. Include no secrets.
8. Create a concise issue title and apply \`approved-design\`.
9. Verify the URL, state, labels, and body with \`gh issue view\`.
10. Report the issue URL, then stop. Do not write an implementation plan or implement the request.

If GitHub validation or issue creation fails, report the exact error. Preserve the approved in-session design or committed specification.

## Request

${request}`;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("z-design", {
    description: "Design a feature or bug fix in a clean session",
    handler: async (args, ctx) => {
      const request = args.trim();
      if (!request) {
        ctx.ui.notify("Usage: /z-design <request>", "warning");
        return;
      }

      await ctx.waitForIdle();
      const result = await ctx.newSession({
        withSession: async (replacementCtx) => {
          await replacementCtx.sendUserMessage(buildRoutingPrompt(request));
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("New session cancelled", "info");
      }
    },
  });
}

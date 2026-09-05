import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("z-implement", {
    description: "Implement and land one approved GitHub issue or one repository-relative Markdown path in a clean session",
    handler: async (args, ctx) => {
      const issueReference = args.trim();
      if (!issueReference) {
        ctx.ui.notify(
          "Usage: /z-implement <approved-issue-or-repository-relative-markdown-path>",
          "warning",
        );
        return;
      }

      await ctx.waitForIdle();
      const result = await ctx.newSession({
        withSession: async (replacementCtx) => {
          await replacementCtx.sendUserMessage(
            `/skill:z-implement ${issueReference}`,
            { expandPromptTemplates: true },
          );
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("New session cancelled", "info");
      }
    },
  });
}

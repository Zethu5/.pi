import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("z-implement", {
    description: "Implement an approved Superpowers design in a clean session",
    handler: async (args, ctx) => {
      const designPath = args.trim();
      if (!designPath) {
        ctx.ui.notify("Usage: /z-implement <design-path>", "warning");
        return;
      }

      await ctx.waitForIdle();
      const result = await ctx.newSession({
        withSession: async (replacementCtx) => {
          await replacementCtx.sendUserMessage(
            `/skill:z-implement ${designPath}`,
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

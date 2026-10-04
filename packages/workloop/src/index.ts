import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let continuationCount = 0;
  let maxContinuations = 10;

  const instructions = "Workloop is on. Continue with the next safe, small, verifiable step toward the user's approved overall goal, not just the last completed increment. Do not invent work outside that scope. Do not proceed through unclear product intent, architecture decisions, risky changes, unexplained failures, credentials, permissions, or deployment decisions; ask the user instead. Prefer verify → commit → continue only when commits are authorized. If the approved goal is complete, say so without inventing more work.";

  function updateStatus(ctx: ExtensionContext) {
    const theme = ctx.ui.theme;
    ctx.ui.setStatus("workloop", enabled
      ? theme.fg("accent", `↻ Workloop ${continuationCount}/${maxContinuations}`)
      : theme.fg("dim", "Workloop off"));
  }

  pi.on("session_start", async (_event, ctx) => {
    enabled = false;
    continuationCount = 0;
    updateStatus(ctx);
  });

  pi.on("before_agent_start", () => {
    if (enabled) return {
      message: { customType: "workloop-instructions", content: instructions, display: false },
    };
  });

  pi.registerCommand("workloop", {
    description: "Toggle bounded automatic continuation for unattended work",
    handler: async (arg, ctx) => {
      const command = arg.trim().toLowerCase();
      if (command === "on" || command.startsWith("on ")) {
        const [, limitArg = ""] = command.split(/\s+/, 2);
        const limit = limitArg ? Number(limitArg) : maxContinuations;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          ctx.ui.notify("Usage: /workloop on [1-100]", "warning");
          return;
        }
        maxContinuations = limit;
        enabled = true;
        continuationCount = 0;
        updateStatus(ctx);
        ctx.ui.notify(`Workloop enabled (${continuationCount}/${maxContinuations})`, "info");
        return;
      }
      if (command === "off") {
        enabled = false;
        updateStatus(ctx);
        if (!ctx.isIdle()) ctx.abort();
        ctx.ui.notify("Workloop disabled; any active operation was requested to stop", "info");
        return;
      }
      if (command === "" || command === "status") {
        updateStatus(ctx);
        ctx.ui.notify(`Workloop: ${enabled ? "on" : "off"} (${continuationCount}/${maxContinuations})`, "info");
        return;
      }
      ctx.ui.notify("Usage: /workloop on [1-100] | off | status", "warning");
    },
  });

  pi.on("agent_before_settle", (event, ctx) => {
    if (!enabled) return;
    if (event.outcome !== "completed") {
      enabled = false;
      updateStatus(ctx);
      return;
    }
    if (continuationCount >= maxContinuations) {
      enabled = false;
      updateStatus(ctx);
      return {
        entries: [...event.entries, {
          type: "custom_message",
          customType: "workloop",
          display: true,
          content: "Workloop stopped: reached the continuation limit.",
        }],
      };
    }
    continuationCount += 1;
    updateStatus(ctx);
    // Incoming context can end with an assistant response (canContinue=false).
    // This message makes it runnable; Pi validates after applying our entries.
    return {
      entries: [...event.entries, {
        type: "custom_message",
        customType: "workloop",
        display: true,
        content: instructions,
      }],
      continue: true,
    };
  });
}

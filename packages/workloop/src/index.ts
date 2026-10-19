import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let continuationCount = 0;
  let maxContinuations = 10;
  let stopRequested = false;

  const stopMarker = "[[WORKLOOP_STOP]]";
  const instructions = `Workloop is on. Continue with the next safe, small, verifiable step toward the user's approved overall goal, not just the last completed increment. Do not invent work outside that scope. Enabling Workloop authorizes local Git commits for completed work units within that scope, unless the user or repository instructions prohibit commits or require review first. For each coherent work unit: review the diff, run relevant checks, commit only that unit's changes, then continue to the next step without asking for routine review or commit approval. Inspect the working tree and staged changes before committing; preserve unrelated or pre-existing changes and never include them in your commit. Do not use blanket staging, amend existing commits, rewrite history, push, or deploy without separate explicit authorization. If commits are prohibited, continue safe approved work without committing; lack of commit authorization alone is not a reason to stop. Stop and ask only for genuine blockers such as unclear product intent, architecture decisions, risky changes, unexplained failures, credentials, permissions, or changes that cannot be safely isolated. A completed increment is a checkpoint, not completion of the overall goal. If the approved overall goal is complete or no safe next step exists without user input, include ${stopMarker} at the end of the response.`;

  function textFrom(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join("\n");
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    return ["content", "text", "message", "response", "markdown"]
      .map((key) => textFrom(record[key]))
      .filter(Boolean)
      .join("\n");
  }

  function hasStopMarker(value: unknown): boolean {
    return textFrom(value).includes(stopMarker);
  }

  function updateStatus(ctx: ExtensionContext) {
    const theme = ctx.ui.theme;
    ctx.ui.setStatus("workloop", enabled
      ? theme.fg("accent", `↻ Workloop ${continuationCount}/${maxContinuations}`)
      : theme.fg("dim", "Workloop off"));
  }

  pi.on("session_start", async (_event, ctx) => {
    enabled = false;
    continuationCount = 0;
    stopRequested = false;
    updateStatus(ctx);
  });

  pi.on("message_end", (event) => {
    if (!enabled) return;
    if (event.message.role === "assistant" && hasStopMarker(event.message)) {
      stopRequested = true;
    }
  });

  pi.on("before_agent_start", () => {
    if (enabled) return {
      message: { customType: "workloop-instructions", content: instructions, display: false },
    };
  });

  pi.registerCommand("workloop", {
    description: "Toggle bounded work with per-unit review, verification, and local commits",
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
        stopRequested = false;
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
    // Check the final projected conversation too: message_end may not observe the
    // final rendered assistant response in every Pi/model integration. Only inspect
    // the most recent assistant message, never injected Workloop instructions.
    const lastReply = [...event.context.contextMessages].reverse()
      .find((message) => message.role === "assistant" || message.role === "user");
    if (stopRequested || (lastReply?.role === "assistant" && hasStopMarker(lastReply)) || hasStopMarker(event.entries)) {
      enabled = false;
      stopRequested = false;
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
        display: false,
        content: instructions,
      }],
      continue: true,
    };
  });
}

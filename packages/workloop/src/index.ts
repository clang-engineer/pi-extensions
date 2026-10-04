import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let reportedState: "continue" | "done" | "blocked" | undefined;
  let enabled = false;
  let continuationCount = 0;
  let maxContinuations = 10;

  function statusText() {
    return `Workloop: ${enabled ? "on" : "off"} (${continuationCount}/${maxContinuations})`;
  }

  function updateStatus(ctx: ExtensionContext) {
    const theme = ctx.ui.theme;
    const label = enabled
      ? theme.fg("accent", `↻ Workloop ${continuationCount}/${maxContinuations}`)
      : theme.fg("dim", "Workloop off");
    ctx.ui.setStatus("workloop", label);
  }

  function parseLimit(value: string): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return null;
    return parsed;
  }

  const instructions = "Workloop is enabled. Before your final response, call workloop_report with continue, done, or blocked. Continue ONLY when unfinished implementation or verification remains within the user's requested or approved scope and a safe next step needs no further user decision. New improvement ideas are not remaining work. Greetings and completed requests are done. Ambiguous requirements, unexplained failures, credentials, permissions, deployment, risky changes, or product/architecture decisions are blocked. Never invent work to keep the loop running. Report after the work and verification, not before it. Missing reports stop automatic continuation.";

  pi.registerTool({
    name: "workloop_report",
    label: "Workloop status",
    description: "Report whether the approved task has safe remaining work (continue), is complete (done), or requires user input (blocked). Report only when Workloop is enabled, after work and verification and before the final response.",
    parameters: Type.Object({
      state: Type.Union([Type.Literal("continue"), Type.Literal("done"), Type.Literal("blocked")]),
      reason: Type.String({ minLength: 1, description: "For continue, identify the concrete next approved step; otherwise explain completion or the blocker." }),
    }),
    async execute(_id, params) {
      if (enabled) reportedState = params.reason.trim() ? params.state : undefined;
      return {
        content: [{ type: "text", text: enabled ? `Workloop report: ${reportedState ?? "missing"}.` : "Workloop is off." }],
        details: { enabled, state: reportedState },
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    enabled = false;
    continuationCount = 0;
    reportedState = undefined;
    updateStatus(ctx);
  });

  pi.on("before_agent_start", () => {
    reportedState = undefined;
    if (enabled) return {
      message: { customType: "workloop-instructions", content: instructions, display: false },
    };
  });

  pi.on("message_start", (event) => {
    if (event.message.role === "user") reportedState = undefined;
  });

  pi.registerCommand("workloop", {
    description: "Toggle bounded automatic continuation for unattended work",
    handler: async (arg, ctx) => {
      const command = arg.trim().toLowerCase();

      if (command === "on" || command.startsWith("on ")) {
        const [, limitArg = ""] = command.split(/\s+/, 2);
        const limit = parseLimit(limitArg);
        if (limitArg && limit === null) {
          ctx.ui.notify("Usage: /workloop on [1-100]", "warning");
          return;
        }
        if (limit !== null) maxContinuations = limit;
        enabled = true;
        continuationCount = 0;
        reportedState = undefined;
        updateStatus(ctx);
        ctx.ui.notify(`Workloop enabled (${continuationCount}/${maxContinuations})`, "info");
        return;
      }

      if (command === "off") {
        enabled = false;
        reportedState = undefined;
        updateStatus(ctx);
        ctx.ui.notify("Workloop disabled", "info");
        return;
      }

      if (command === "" || command === "status") {
        updateStatus(ctx);
        ctx.ui.notify(statusText(), "info");
        return;
      }

      ctx.ui.notify("Usage: /workloop on [1-100] | off | status", "warning");
    },
  });

  pi.on("agent_before_settle", (event, ctx) => {
    if (!enabled) return;

    const state = reportedState;
    reportedState = undefined;
    if (event.outcome !== "completed" || !event.context.canContinue || state !== "continue") return;

    if (continuationCount >= maxContinuations) {
      enabled = false;
      updateStatus(ctx);
      return {
        entries: [
          ...event.entries,
          {
            type: "custom_message",
            customType: "workloop",
            display: true,
            content: "Workloop stopped: reached the continuation limit.",
          },
        ],
      };
    }

    continuationCount += 1;
    updateStatus(ctx);

    return {
      entries: [
        ...event.entries,
        {
          type: "custom_message",
          customType: "workloop",
          display: true,
          content:
            `Continue with the next safe, approved step you reported. ${instructions}`,
        },
      ],
      continue: true,
    };
  });
}

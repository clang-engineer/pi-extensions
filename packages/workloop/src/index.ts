import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let enabled = false;
let continuationCount = 0;
let maxContinuations = 10;

function statusText() {
  return `Workloop: ${enabled ? "on" : "off"} (${continuationCount}/${maxContinuations})`;
}

function parseLimit(value: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return null;
  return parsed;
}

export default function (pi: ExtensionAPI) {
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
        ctx.ui.notify(`Workloop enabled (${continuationCount}/${maxContinuations})`, "info");
        return;
      }

      if (command === "off") {
        enabled = false;
        ctx.ui.notify("Workloop disabled", "info");
        return;
      }

      if (command === "" || command === "status") {
        ctx.ui.notify(statusText(), "info");
        return;
      }

      ctx.ui.notify("Usage: /workloop on [1-100] | off | status", "warning");
    },
  });

  pi.on("agent_before_settle", (event) => {
    if (!enabled) return;

    if (continuationCount >= maxContinuations) {
      enabled = false;
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

    return {
      entries: [
        ...event.entries,
        {
          type: "custom_message",
          customType: "workloop",
          display: true,
          content:
            "Workloop is on. Continue with the next safe, small, verifiable step toward the current task. Do not ask the user unless product intent, architecture direction, risky changes, unexplained failures, credentials, permissions, or deployment decisions are required. Prefer verify → commit → continue when appropriate.",
        },
      ],
      continue: true,
    };
  });
}

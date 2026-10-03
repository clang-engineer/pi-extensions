import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

type NotifyEvent = "agent_settled" | "permission_ask";
type Backend = "auto" | "macos" | "terminal" | "off";

type NotifyConfig = {
  backend: Backend;
  title: string;
  settledMessage: string;
  permissionMessage: string;
  permissionAsk: boolean;
  includeInput: boolean;
  maxInputLength: number;
  skipWhenFrontmost: boolean;
  frontmostProcess: string;
  sound: string | false;
  script?: string;
};

type NotifyPayload = {
  event: NotifyEvent;
  title: string;
  message: string;
  timestamp: number;
  cwd: string;
  pid: number;
};

type RawConfig = Partial<NotifyConfig> & { notify?: Partial<NotifyConfig> };

const DEFAULT_CONFIG: NotifyConfig = {
  backend: "auto",
  title: "Pi",
  settledMessage: "Agent 작업 완료",
  permissionMessage: "Permission required: {tool}",
  permissionAsk: true,
  includeInput: true,
  maxInputLength: 80,
  skipWhenFrontmost: false,
  frontmostProcess: "ghostty",
  sound: "Glass",
};

function execFileAsync(file: string, args: string[], input?: string, timeout = 5000): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(file, args, { timeout }, (error, stdout) => {
      if (error) reject(error);
      else resolvePromise(String(stdout || ""));
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

function escapeAppleScript(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function frontmostProcessName(): Promise<string | undefined> {
  try {
    return (
      await execFileAsync("/usr/bin/osascript", [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ])
    )
      .trim()
      .toLowerCase();
  } catch {
    return undefined;
  }
}

async function shouldSkip(config: NotifyConfig): Promise<boolean> {
  if (!config.skipWhenFrontmost || process.platform !== "darwin") return false;
  // App-level frontmost detection cannot distinguish tmux sessions/windows/panes.
  // If Pi runs inside tmux, prefer notifying rather than incorrectly suppressing
  // while the user is in another tmux context in the same terminal app.
  if (process.env.TMUX) return false;
  return (await frontmostProcessName()) === config.frontmostProcess.toLowerCase();
}

function notifyTerminal(title: string, message: string): void {
  if (process.env.KITTY_WINDOW_ID) {
    process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
    process.stdout.write(`\x1b]99;i=1:p=body;${message}\x1b\\`);
    return;
  }
  process.stdout.write(`\x1b]777;notify;${title};${message}\x07`);
}

async function notifyMacos(title: string, message: string, sound: string | false): Promise<void> {
  const soundClause = sound ? ` sound name "${escapeAppleScript(sound)}"` : "";
  await execFileAsync("/usr/bin/osascript", [
    "-e",
    `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"${soundClause}`,
  ]);
}

async function sendNotification(config: NotifyConfig, payload: NotifyPayload): Promise<void> {
  if (config.backend === "off") return;
  if (config.backend === "macos" || (config.backend === "auto" && process.platform === "darwin")) {
    await notifyMacos(payload.title, payload.message, config.sound);
    return;
  }
  notifyTerminal(payload.title, payload.message);
}

async function runScript(config: NotifyConfig, payload: NotifyPayload): Promise<void> {
  if (!config.script) return;
  await execFileAsync(config.script, [], JSON.stringify(payload), 5000);
}

function configPaths(cwd: string): string[] {
  return [join(homedir(), ".pi", "agent", "notify.json"), resolve(cwd, ".pi", "notify.json")];
}

function readJson(path: string): RawConfig {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as RawConfig;
  return typeof parsed.notify === "object" && parsed.notify !== null ? parsed.notify : parsed;
}

function loadConfig(cwd: string): NotifyConfig {
  const merged = Object.assign({}, ...configPaths(cwd).map(readJson)) as Partial<NotifyConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...merged,
    backend: ["auto", "macos", "terminal", "off"].includes(String(merged.backend))
      ? (merged.backend as Backend)
      : DEFAULT_CONFIG.backend,
  };
}

function permissionToolName(value: unknown): string {
  if (typeof value !== "object" || value === null) return "unknown";
  const toolName = (value as { toolName?: unknown }).toolName;
  return typeof toolName === "string" && toolName.trim() ? toolName : "unknown";
}

function summarizeInput(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1))}…`;
}

export default function (pi: any) {
  let cwd = process.cwd();
  let config = loadConfig(cwd);
  let lastInput = "";

  async function handle(event: NotifyEvent, message: string) {
    config = loadConfig(cwd);
    const inputTitle = event === "agent_settled" && config.includeInput && lastInput ? ` 완료: ${lastInput}` : "";
    const payload: NotifyPayload = {
      event,
      title: `${config.title}${inputTitle}`,
      message,
      timestamp: Date.now(),
      cwd,
      pid: process.pid,
    };

    if (!(await shouldSkip(config))) {
      await sendNotification(config, payload);
    }

    try {
      await runScript(config, payload);
    } catch (error) {
      console.warn(`notify script failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  pi.on("session_start", async (_event: unknown, ctx: { cwd: string }) => {
    cwd = ctx.cwd;
    config = loadConfig(cwd);
  });

  pi.on("input", (event: { source?: string; text?: string }) => {
    if (event.source === "extension") return { action: "continue" };
    if (typeof event.text === "string") {
      config = loadConfig(cwd);
      lastInput = summarizeInput(event.text, config.maxInputLength);
    }
    return { action: "continue" };
  });

  pi.on("agent_settled", async () => {
    await handle("agent_settled", config.settledMessage);
  });

  pi.events.on("permissions:ask", (event: unknown) => {
    if (!config.permissionAsk) return;
    const tool = permissionToolName(event);
    void handle("permission_ask", config.permissionMessage.replaceAll("{tool}", tool));
  });
}

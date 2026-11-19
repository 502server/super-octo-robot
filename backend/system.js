import os from "node:os";
import { readFileSync } from "node:fs";
import rateLimit from "express-rate-limit";
import { Router } from "express";
import { z } from "zod";
import { listExecutionLogs, logExecution } from "./execution-logs.js";

const packageMetadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const diagnosticCommands = ["status", "version", "kernel", "uptime", "whoami", "date"];
const shellCommand = z.object({ command: z.enum(diagnosticCommands) }).strict();

export function getSystemMetadata({
  appVersion = packageMetadata.version,
  nodeVersion = process.version,
  kernelName = os.type(),
  kernelVersion = os.release(),
  platform = os.platform(),
  architecture = os.arch(),
  uptimeSeconds = process.uptime(),
} = {}) {
  return {
    service: "fivezero2.group",
    appVersion,
    nodeVersion,
    kernelName,
    kernelVersion,
    platform,
    architecture,
    uptimeSeconds: Math.max(0, Math.floor(uptimeSeconds)),
  };
}

export function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${days}d ${hours}h ${minutes}m ${remainder}s`;
}

export function runCloudShellCommand(
  command,
  user,
  metadata = getSystemMetadata(),
  currentDate = new Date(),
) {
  switch (command) {
    case "status":
      return [
        `${metadata.service}: online`,
        `Application release: ${metadata.appVersion}`,
        `Runtime: Node.js ${metadata.nodeVersion}`,
        `Kernel: ${metadata.kernelName} ${metadata.kernelVersion}`,
        `Process uptime: ${formatUptime(metadata.uptimeSeconds)}`,
      ].join("\n");
    case "version":
      return `${metadata.service} ${metadata.appVersion}\nNode.js ${metadata.nodeVersion}`;
    case "kernel":
      return `${metadata.kernelName} ${metadata.kernelVersion} (${metadata.platform}/${metadata.architecture})`;
    case "uptime":
      return `Application process uptime: ${formatUptime(metadata.uptimeSeconds)}`;
    case "whoami":
      return `${user.username} (${user.role}) · authenticated workspace session`;
    case "date":
      return currentDate.toISOString();
    default:
      return "Command unavailable. Type help for supported diagnostics.";
  }
}

export function createSystemRouter(auth, executionLogService = { logExecution, listExecutionLogs }) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  router.use(auth);
  router.get("/metadata", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ system: getSystemMetadata() });
  });
  router.get("/execution-logs", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ logs: executionLogService.listExecutionLogs(req.workspaceId, "cloudshell") });
  });
  router.post("/shell", limiter, async (req, res) => {
    const parsed = shellCommand.safeParse(req.body);
    if (!parsed.success) {
      await executionLogService.logExecution({
        workspaceId: req.workspaceId,
        userId: req.user.id,
        surface: "cloudshell",
        command: "unsupported",
        status: "rejected",
        output: "Command is not available in the read-only CloudShell.",
      });
      return res.status(400).json({ error: "Command is not available in the read-only CloudShell." });
    }

    const output = runCloudShellCommand(parsed.data.command, req.user);
    await executionLogService.logExecution({
      workspaceId: req.workspaceId,
      userId: req.user.id,
      surface: "cloudshell",
      command: parsed.data.command,
      status: "succeeded",
      output,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ command: parsed.data.command, output });
  });

  return router;
}

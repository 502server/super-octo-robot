import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createSystemRouter, formatUptime, getSystemMetadata, runCloudShellCommand } from "./system.js";

test("system metadata reports the configured app, runtime, and kernel versions", () => {
  const metadata = getSystemMetadata({
    appVersion: "2.4.1",
    nodeVersion: "v24.16.0",
    kernelName: "Linux",
    kernelVersion: "6.8.0",
    platform: "linux",
    architecture: "x64",
    uptimeSeconds: 3661,
  });

  assert.deepEqual(metadata, {
    service: "fivezero2.group",
    appVersion: "2.4.1",
    nodeVersion: "v24.16.0",
    kernelName: "Linux",
    kernelVersion: "6.8.0",
    platform: "linux",
    architecture: "x64",
    uptimeSeconds: 3661,
  });
});

test("read-only CloudShell formats supported diagnostics without executing arbitrary input", () => {
  const metadata = {
    service: "fivezero2.group",
    appVersion: "0.3.0",
    nodeVersion: "v24.16.0",
    kernelName: "Linux",
    kernelVersion: "6.8.0",
    platform: "linux",
    architecture: "x64",
    uptimeSeconds: 61,
  };

  assert.equal(formatUptime(3661), "0d 1h 1m 1s");
  assert.match(runCloudShellCommand("kernel", {}, metadata), /Linux 6\.8\.0/);
  assert.match(
    runCloudShellCommand("whoami", { username: "analyst", role: "viewer" }, metadata),
    /analyst \(viewer\)/,
  );
  assert.equal(
    runCloudShellCommand("bash -c id", {}, metadata),
    "Command unavailable. Type help for supported diagnostics.",
  );
});

test("CloudShell stores diagnostic output and returns workspace-scoped execution history", async (context) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "user-1", username: "analyst", role: "analyst" };
    req.workspaceId = "workspace-1";
    next();
  });
  const entries = [];
  app.use(
    "/api/system",
    createSystemRouter((_req, _res, next) => next(), {
      logExecution: async (entry) => entries.unshift({ ...entry, createdAt: new Date().toISOString() }),
      listExecutionLogs: (workspaceId, surface) =>
        entries.filter((entry) => entry.workspaceId === workspaceId && entry.surface === surface),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(
    () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  );

  const call = (path, method, body) =>
    new Promise((resolve, reject) => {
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path,
          method,
          headers: { "content-type": "application/json" },
        },
        (response) => {
          let text = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => (text += chunk));
          response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
        },
      );
      request.on("error", reject);
      if (body) request.write(JSON.stringify(body));
      request.end();
    });

  const run = await call("/api/system/shell", "POST", { command: "version" });
  assert.equal(run.status, 200);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].workspaceId, "workspace-1");
  assert.equal(entries[0].status, "succeeded");
  assert.match(entries[0].output, /fivezero2\.group/);

  const history = await call("/api/system/execution-logs", "GET");
  assert.equal(history.status, 200);
  assert.equal(history.body.logs.length, 1);
  assert.equal(history.body.logs[0].command, "version");
});

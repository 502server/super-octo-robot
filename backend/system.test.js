import test from "node:test";
import assert from "node:assert/strict";
import { formatUptime, getSystemMetadata, runCloudShellCommand } from "./system.js";

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

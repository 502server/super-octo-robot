import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createPlaygroundRouter } from "./playground.js";

function request(server, path, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        path,
        method,
        headers: body ? { "content-type": "application/json" } : {},
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      },
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function makeServer(context) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "user-123", role: "owner" };
    next();
  });
  app.use(
    "/api/playground",
    createPlaygroundRouter((_req, _res, next) => next()),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(
    () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  );
  return server;
}

test("OpenShift playground state reads only the authenticated user's lab labels", async (context) => {
  const previousToken = process.env.OPENSHIFT_USER_TOKEN;
  const previousFetch = globalThis.fetch;
  context.after(() => {
    if (previousToken === undefined) delete process.env.OPENSHIFT_USER_TOKEN;
    else process.env.OPENSHIFT_USER_TOKEN = previousToken;
    globalThis.fetch = previousFetch;
  });
  process.env.OPENSHIFT_USER_TOKEN = "server-only-test-token";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const items = url.includes("/deployments?") ? [] : [];
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const server = await makeServer(context);
  const result = await request(server, "/api/playground/state");
  assert.equal(result.status, 200);
  assert.equal(result.body.state.namespace, "gecko111gamers-dev");
  assert.equal(requests.length, 3);
  assert.ok(requests.every(({ url }) => url.includes("labelSelector=")));
  assert.ok(
    requests.every(({ options }) => options.headers.Authorization === "Bearer server-only-test-token"),
  );
  assert.equal(JSON.stringify(result.body).includes("server-only-test-token"), false);
});

test("deployment commands create restricted real OpenShift workloads with bounded resources", async (context) => {
  const previousToken = process.env.OPENSHIFT_USER_TOKEN;
  const previousFetch = globalThis.fetch;
  context.after(() => {
    if (previousToken === undefined) delete process.env.OPENSHIFT_USER_TOKEN;
    else process.env.OPENSHIFT_USER_TOKEN = previousToken;
    globalThis.fetch = previousFetch;
  });
  process.env.OPENSHIFT_USER_TOKEN = "server-only-test-token";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const isCreate = options.method === "POST" && url.endsWith("/deployments");
    return new Response(JSON.stringify(isCreate ? {} : { items: [] }), {
      status: isCreate ? 201 : 200,
      headers: { "content-type": "application/json" },
    });
  };
  const server = await makeServer(context);
  const result = await request(server, "/api/playground/command", {
    method: "POST",
    body: { command: "kubectl create deployment web --image=registry.access.redhat.com/ubi9/nginx-124" },
  });
  assert.equal(result.status, 200);
  const createRequest = requests.find(({ options }) => options.method === "POST");
  assert.ok(createRequest.url.includes("/apis/apps/v1/namespaces/gecko111gamers-dev/deployments"));
  const deployment = JSON.parse(createRequest.options.body);
  assert.match(deployment.metadata.name, /^lab-[a-f0-9]{8}-web$/);
  assert.equal(deployment.spec.template.spec.automountServiceAccountToken, false);
  assert.equal(deployment.spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation, false);
  assert.deepEqual(deployment.spec.template.spec.containers[0].securityContext.capabilities.drop, ["ALL"]);
  assert.equal(deployment.spec.template.spec.containers[0].resources.limits.memory, "256Mi");
});

test("the terminal rejects shell commands and non-allowlisted images before contacting OpenShift", async (context) => {
  const previousToken = process.env.OPENSHIFT_USER_TOKEN;
  const previousFetch = globalThis.fetch;
  context.after(() => {
    if (previousToken === undefined) delete process.env.OPENSHIFT_USER_TOKEN;
    else process.env.OPENSHIFT_USER_TOKEN = previousToken;
    globalThis.fetch = previousFetch;
  });
  process.env.OPENSHIFT_USER_TOKEN = "server-only-test-token";
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("unexpected request");
  };
  const server = await makeServer(context);
  for (const command of [
    "kubectl get secrets",
    "bash -c id",
    "kubectl create deployment x --image=evil/image",
    "kubectl get pods; id",
  ]) {
    const result = await request(server, "/api/playground/command", { method: "POST", body: { command } });
    assert.notEqual(result.status, 200, command);
  }
  assert.equal(fetchCalls, 0);
});

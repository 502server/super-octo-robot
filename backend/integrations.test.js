import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import {createIntegrationRouter} from "./integrations.js";

function post(server, path) {
  return new Promise((resolve, reject) => {
    const request = http.request({hostname: "127.0.0.1", port: server.address().port, path, method: "POST"}, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({status: response.statusCode, body: JSON.parse(body)}));
    });
    request.on("error", reject);
    request.end();
  });
}

test("OpenShift identity check uses a fixed read-only API request and keeps its token server-side", async (context) => {
  const previousToken = process.env.OPENSHIFT_USER_TOKEN;
  const previousFetch = globalThis.fetch;
  context.after(() => {
    if (previousToken === undefined) delete process.env.OPENSHIFT_USER_TOKEN;
    else process.env.OPENSHIFT_USER_TOKEN = previousToken;
    globalThis.fetch = previousFetch;
  });

  process.env.OPENSHIFT_USER_TOKEN = "test-token-only";
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestOptions = {url, options};
    return new Response(JSON.stringify({metadata: {name: "test-analyst", uid: "not-returned"}}), {
      status: 200,
      headers: {"content-type": "application/json"},
    });
  };

  const app = express();
  app.use((request, _response, next) => { request.user = {role: "analyst"}; next(); });
  app.use("/api/integrations", createIntegrationRouter((_request, _response, next) => next()));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const success = await post(server, "/api/integrations/openshift/test");
  assert.equal(success.status, 200);
  assert.deepEqual(success.body, {ok: true, state: "valid", httpStatus: 200, message: "Authenticated as test-analyst."});
  assert.equal(requestOptions.url, "https://api.rm2.thpm.p1.openshiftapps.com:6443/apis/user.openshift.io/v1/users/~");
  assert.equal(requestOptions.options.headers.Authorization, "Bearer test-token-only");
  assert.equal(requestOptions.options.redirect, "error");
  assert.equal(JSON.stringify(success.body).includes("test-token-only"), false);

  delete process.env.OPENSHIFT_USER_TOKEN;
  const missing = await post(server, "/api/integrations/openshift/test");
  assert.equal(missing.status, 409);
  assert.match(missing.body.error, /OPENSHIFT_USER_TOKEN/);
});

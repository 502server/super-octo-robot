import { createHash } from "node:crypto";
import rateLimit from "express-rate-limit";
import { Router } from "express";
import { z } from "zod";
import { roleGuard } from "./access.js";
import { OPENSHIFT_API_BASE } from "./integrations.js";

const namespace = "gecko111gamers-dev";
const managerLabel = "app.kubernetes.io/managed-by";
const ownerLabel = "fivezero2.group/owner";
const namePattern = "([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)";
const allowedImages = new Map([
  ["registry.access.redhat.com/ubi9/nginx-124", 8080],
  ["registry.access.redhat.com/ubi9/redis-7", 6379],
]);
const commandSchema = z.object({ command: z.string().trim().min(1).max(180) }).strict();

class OpenShiftError extends Error {
  constructor(status) {
    super(status === 404 ? "Resource not found." : `OpenShift request failed (${status}).`);
    this.status = status;
  }
}

function ownerKey(user) {
  return createHash("sha256").update(String(user.id)).digest("hex").slice(0, 12);
}

function ownedLabels(key) {
  return {
    [managerLabel]: "fivezero2-playground",
    [ownerLabel]: key,
  };
}

function resourceName(key, name) {
  return `lab-${key.slice(0, 8)}-${name}`;
}

async function requestOpenShift(path, token, { method = "GET", body, patch = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${OPENSHIFT_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": patch ? "application/merge-patch+json" : "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new OpenShiftError(response.status);
    if (response.status === 204) return null;
    return response.json();
  } catch (error) {
    if (error instanceof OpenShiftError) throw error;
    throw new OpenShiftError(502);
  } finally {
    clearTimeout(timer);
  }
}

function labelQuery(key) {
  return new URLSearchParams({
    labelSelector: `${managerLabel}=fivezero2-playground,${ownerLabel}=${key}`,
  }).toString();
}

async function getState(key, token) {
  const query = labelQuery(key);
  const [podList, deploymentList, serviceList] = await Promise.all([
    requestOpenShift(`/api/v1/namespaces/${namespace}/pods?${query}`, token),
    requestOpenShift(`/apis/apps/v1/namespaces/${namespace}/deployments?${query}`, token),
    requestOpenShift(`/api/v1/namespaces/${namespace}/services?${query}`, token),
  ]);
  const prefix = `lab-${key.slice(0, 8)}-`;
  const deployments = (deploymentList.items || []).map((item) => ({
    name: item.metadata.name.slice(prefix.length),
    image: item.spec.template.spec.containers[0].image,
    replicas: item.spec.replicas || 0,
    ready: item.status.readyReplicas || 0,
    fullName: item.metadata.name,
  }));
  return {
    namespace,
    connected: true,
    containers: (podList.items || []).map((item) => ({
      name: item.metadata.name,
      status: item.status.phase || "Unknown",
      ready: (item.status.containerStatuses || []).filter((container) => container.ready).length,
      restarts: (item.status.containerStatuses || []).reduce(
        (total, container) => total + container.restartCount,
        0,
      ),
    })),
    deployments,
    services: (serviceList.items || []).map((item) => ({
      name: item.metadata.name.slice(prefix.length),
      type: item.spec.type,
      ports: (item.spec.ports || []).map((port) => ({ port: port.port, targetPort: port.targetPort })),
      dns: `${item.metadata.name}.${namespace}.svc.cluster.local`,
    })),
  };
}

function formatTable(headers, rows) {
  if (!rows.length) return [headers.join("  "), "No resources found."];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index]).length)),
  );
  const format = (row) =>
    row
      .map((cell, index) => String(cell).padEnd(widths[index]))
      .join("  ")
      .trimEnd();
  return [format(headers), format(widths.map((width) => "-".repeat(width))), ...rows.map(format)];
}

async function runCommand(rawCommand, user, token) {
  const command = rawCommand.trim();
  const key = ownerKey(user);
  if (command === "clear") return { lines: [], state: await getState(key, token) };

  if (/^kubectl get (pods|deployments|services)$/.test(command)) {
    const state = await getState(key, token);
    if (command.endsWith("pods")) {
      return {
        lines: formatTable(
          ["NAME", "STATUS", "READY", "RESTARTS"],
          state.containers.map((pod) => [pod.name, pod.status, pod.ready, pod.restarts]),
        ),
        state,
      };
    }
    if (command.endsWith("deployments")) {
      return {
        lines: formatTable(
          ["NAME", "READY", "IMAGE"],
          state.deployments.map((item) => [item.name, `${item.ready}/${item.replicas}`, item.image]),
        ),
        state,
      };
    }
    return {
      lines: formatTable(
        ["NAME", "TYPE", "PORT(S)", "CLUSTER DNS"],
        state.services.map((item) => [
          item.name,
          item.type,
          item.ports.map((port) => port.port).join(","),
          item.dns,
        ]),
      ),
      state,
    };
  }

  let match = command.match(new RegExp(`^kubectl create deployment ${namePattern} --image=([^\\s]+)$`));
  if (match) {
    const [, shortName, image] = match;
    const containerPort = allowedImages.get(image);
    if (!containerPort) throw new Error("Image is not in the playground allowlist.");
    const state = await getState(key, token);
    if (state.deployments.length >= 3) throw new Error("Maximum of three deployments per user reached.");
    const name = resourceName(key, shortName);
    const labels = { ...ownedLabels(key), app: name };
    await requestOpenShift(`/apis/apps/v1/namespaces/${namespace}/deployments`, token, {
      method: "POST",
      body: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name, labels },
        spec: {
          replicas: 1,
          selector: { matchLabels: labels },
          template: {
            metadata: { labels },
            spec: {
              automountServiceAccountToken: false,
              securityContext: { seccompProfile: { type: "RuntimeDefault" } },
              containers: [
                {
                  name: "app",
                  image,
                  imagePullPolicy: "IfNotPresent",
                  ports: [{ name: "app", containerPort }],
                  resources: {
                    requests: { cpu: "50m", memory: "64Mi" },
                    limits: { cpu: "250m", memory: "256Mi" },
                  },
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    capabilities: { drop: ["ALL"] },
                    runAsNonRoot: true,
                  },
                },
              ],
            },
          },
        },
      },
    });
    return {
      lines: [`deployment.apps/${shortName} created in OpenShift project ${namespace}.`],
      state: await getState(key, token),
    };
  }

  match = command.match(new RegExp(`^kubectl scale deployment ${namePattern} --replicas=(\\d+)$`));
  if (match) {
    const [, shortName, countText] = match;
    const count = Number(countText);
    if (count > 3) throw new Error("Replica count must be between 0 and 3.");
    const state = await getState(key, token);
    const deployment = state.deployments.find((item) => item.name === shortName);
    if (!deployment) throw new Error(`Deployment '${shortName}' not found in your lab.`);
    const total =
      state.deployments.reduce((sum, item) => sum + item.replicas, 0) - deployment.replicas + count;
    if (total > 5) throw new Error("Maximum of five total replicas per user reached.");
    await requestOpenShift(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${deployment.fullName}`,
      token,
      {
        method: "PATCH",
        patch: true,
        body: { spec: { replicas: count } },
      },
    );
    return {
      lines: [`deployment.apps/${shortName} scaled to ${count} replicas.`],
      state: await getState(key, token),
    };
  }

  match = command.match(new RegExp(`^kubectl expose deployment ${namePattern} --port=(\\d{1,5})$`));
  if (match) {
    const [, shortName, portText] = match;
    const port = Number(portText);
    if (port < 1 || port > 65535) throw new Error("Service port must be between 1 and 65535.");
    const state = await getState(key, token);
    const deployment = state.deployments.find((item) => item.name === shortName);
    if (!deployment) throw new Error(`Deployment '${shortName}' not found in your lab.`);
    if (state.services.some((item) => item.name === shortName))
      throw new Error(`Service '${shortName}' already exists.`);
    const name = deployment.fullName;
    const appLabel = name;
    await requestOpenShift(`/api/v1/namespaces/${namespace}/services`, token, {
      method: "POST",
      body: {
        apiVersion: "v1",
        kind: "Service",
        metadata: { name, labels: ownedLabels(key) },
        spec: {
          type: "ClusterIP",
          selector: { app: appLabel },
          ports: [{ name: "app", port, targetPort: allowedImages.get(deployment.image) }],
        },
      },
    });
    return {
      lines: [`service/${shortName} created as ClusterIP; internal DNS only.`],
      state: await getState(key, token),
    };
  }

  match = command.match(new RegExp(`^kubectl delete (deployment|service) ${namePattern}$`));
  if (match) {
    const [, kind, shortName] = match;
    const state = await getState(key, token);
    const items = kind === "deployment" ? state.deployments : state.services;
    const resource = items.find((item) => item.name === shortName);
    if (!resource) throw new Error(`${kind} '${shortName}' not found in your lab.`);
    const apiPath =
      kind === "deployment"
        ? `apis/apps/v1/namespaces/${namespace}/deployments`
        : `api/v1/namespaces/${namespace}/services`;
    await requestOpenShift(
      `/${apiPath}/${resource.fullName || `lab-${key.slice(0, 8)}-${shortName}`}`,
      token,
      { method: "DELETE" },
    );
    return { lines: [`${kind}/${shortName} deleted from your lab.`], state: await getState(key, token) };
  }

  throw new Error("Command unavailable. Type help to see supported OpenShift commands.");
}

export function createPlaygroundRouter(auth) {
  const router = Router();
  const allowLabAccess = roleGuard("owner", "admin", "analyst");
  const limiter = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });
  router.use(auth, allowLabAccess);

  router.get("/state", limiter, async (req, res) => {
    const token = process.env.OPENSHIFT_USER_TOKEN?.trim();
    if (!token) return res.status(409).json({ error: "OpenShift access is not configured server-side." });
    try {
      res.set("Cache-Control", "no-store");
      return res.json({ state: await getState(ownerKey(req.user), token) });
    } catch (error) {
      return res.status(error.status || 502).json({ error: error.message || "OpenShift is unavailable." });
    }
  });

  router.post("/command", limiter, async (req, res) => {
    const parsed = commandSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter one supported command." });
    if (parsed.data.command === "help") {
      return res.json({
        lines: [
          "Commands run against your real OpenShift project, not a local Docker daemon.",
          "  kubectl get pods|deployments|services",
          "  kubectl create deployment NAME --image=registry.access.redhat.com/ubi9/nginx-124",
          "  kubectl create deployment NAME --image=registry.access.redhat.com/ubi9/redis-7",
          "  kubectl scale deployment NAME --replicas=COUNT (0-3)",
          "  kubectl expose deployment NAME --port=PORT (internal ClusterIP only)",
          "  kubectl delete deployment|service NAME",
          "  clear",
        ],
      });
    }
    const token = process.env.OPENSHIFT_USER_TOKEN?.trim();
    if (!token) return res.status(409).json({ error: "OpenShift access is not configured server-side." });
    try {
      const result = await runCommand(parsed.data.command, req.user, token);
      res.set("Cache-Control", "no-store");
      return res.json(result);
    } catch (error) {
      const status = error instanceof OpenShiftError ? error.status : 400;
      return res.status(status).json({ error: error.message || "OpenShift command failed." });
    }
  });

  return router;
}

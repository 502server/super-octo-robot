const tabs = [
  ["overview", "Overview"],
  ["containers", "Containers"],
  ["networking", "Networking"],
  ["kubernetes", "Kubernetes"],
  ["terminal", "Terminal"],
];

const imageOptions = [
  ["registry.access.redhat.com/ubi9/nginx-124", "Red Hat UBI Nginx 124 · port 8080"],
  ["registry.access.redhat.com/ubi9/redis-7", "Red Hat UBI Redis 7 · port 6379"],
];

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

async function api(path, options = {}) {
  const response = await fetch(`/api/playground${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "OpenShift request failed.");
  return result;
}

function table(headers, rows, emptyMessage) {
  return `<div class="playground-table-wrap"><table class="playground-table"><thead><tr>${headers.map((item) => `<th scope="col">${escapeHTML(item)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}">${escapeHTML(emptyMessage)}</td></tr>`}</tbody></table></div>`;
}

function imageSelect(name = "image") {
  return `<label>Container image<select name="${name}">${imageOptions.map(([value, label]) => `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`).join("")}</select></label>`;
}

function deploymentRows(state) {
  return state.deployments.map(
    (deployment) => `<tr>
    <td><code>${escapeHTML(deployment.name)}</code></td>
    <td><code>${escapeHTML(deployment.image)}</code></td>
    <td>${deployment.ready}/${deployment.replicas}</td>
    <td><form class="playground-scale-form" data-name="${escapeHTML(deployment.name)}">
      <label class="sr-only" for="replicas-${escapeHTML(deployment.name)}">Replicas for ${escapeHTML(deployment.name)}</label>
      <select id="replicas-${escapeHTML(deployment.name)}" name="replicas">${[0, 1, 2, 3].map((count) => `<option value="${count}" ${count === deployment.replicas ? "selected" : ""}>${count}</option>`).join("")}</select>
      <button type="submit" class="playground-action">Scale</button>
      <button type="button" class="playground-action danger" data-delete-deployment="${escapeHTML(deployment.name)}">Delete</button>
    </form></td>
  </tr>`,
  );
}

function renderContent(tab, state, history) {
  const podRows = state.containers.map(
    (pod) =>
      `<tr><td><code>${escapeHTML(pod.name)}</code></td><td>${escapeHTML(pod.status)}</td><td>${pod.ready}</td><td>${pod.restarts}</td></tr>`,
  );
  const serviceRows = state.services.map(
    (service) =>
      `<tr><td><code>${escapeHTML(service.name)}</code></td><td>${escapeHTML(service.type)}</td><td>${service.ports.map((port) => port.port).join(", ")}</td><td><code>${escapeHTML(service.dns)}</code></td><td><button type="button" class="playground-action danger" data-delete-service="${escapeHTML(service.name)}">Delete</button></td></tr>`,
  );
  const deployments = state.deployments
    .map((item) => `<option value="${escapeHTML(item.name)}">${escapeHTML(item.name)}</option>`)
    .join("");
  const form = `<form class="playground-create-form" id="playground-deployment-form">
    <label>Deployment name<input name="name" required pattern="[a-z0-9][a-z0-9-]{0,30}[a-z0-9]" minlength="2" maxlength="32" placeholder="web-app" /></label>
    ${imageSelect()}
    <button type="submit" class="primary-button">Deploy to OpenShift</button>
  </form>`;
  const networkingForm = state.deployments.length
    ? `<form class="playground-create-form" id="playground-service-form">
    <label>Deployment<select name="name">${deployments}</select></label>
    <label>ClusterIP service port<input name="port" type="number" min="1" max="65535" value="8080" required /></label>
    <button type="submit" class="primary-button">Create internal service</button>
  </form>`
    : `<p class="empty-state">Create a deployment before adding an internal service.</p>`;
  const terminal = `<section class="playground-surface playground-terminal">
    <div class="playground-panel-heading"><div><span>OPENSHIFT / PROJECT: ${escapeHTML(state.namespace)}</span><h3>Cluster command console</h3><p>Commands execute against your real OpenShift project. Arbitrary shell, exec, secrets, and cluster-wide access are disabled.</p></div><span class="subtle-tag">Restricted</span></div>
    <div class="playground-terminal-window"><div class="playground-terminal-bar"><span><i></i><i></i><i></i> oc-compatible console</span><button type="button" class="playground-clear" data-clear-history>Clear</button></div>
      <div class="playground-terminal-output" id="playground-terminal-output" role="log" aria-live="polite" aria-relevant="additions text"><p class="playground-output-line system">Connected to OpenShift project ${escapeHTML(state.namespace)}. Type help for supported commands.</p>${history.map(({ command, lines }) => `<p class="playground-output-line command">$ ${escapeHTML(command)}</p>${lines.map((line) => `<p class="playground-output-line result">${escapeHTML(line)}</p>`).join("")}`).join("")}</div>
      <form class="playground-terminal-form" id="playground-terminal-form"><label class="sr-only" for="playground-command-input">Run a supported OpenShift command</label><span aria-hidden="true">$</span><input id="playground-command-input" name="command" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="kubectl get pods" /><button type="submit">Run</button></form>
    </div><div class="playground-shortcuts"><span>Try:</span><button type="button" data-command="kubectl get pods">kubectl get pods</button><button type="button" data-command="kubectl get deployments">kubectl get deployments</button><button type="button" data-command="kubectl get services">kubectl get services</button><button type="button" data-command="help">help</button></div>
  </section>`;

  if (tab === "containers")
    return `<div class="playground-surface"><div class="playground-panel-heading"><div><span>OPENSHIFT / PODS</span><h3>Running containers</h3><p>These are real pods scheduled by OpenShift&apos;s CRI-O runtime. This service does not expose a Docker daemon.</p></div><span class="subtle-tag">${state.containers.length} pods</span></div>${table(["POD", "PHASE", "READY CONTAINERS", "RESTARTS"], podRows, "No lab pods yet.")}${form}</div>`;
  if (tab === "networking")
    return `<div class="playground-surface"><div class="playground-panel-heading"><div><span>OPENSHIFT / SERVICE NETWORKING</span><h3>Internal services</h3><p>ClusterIP services route traffic inside this project only; no public routes or host ports are created.</p></div><span class="subtle-tag">${state.services.length} services</span></div>${table(["SERVICE", "TYPE", "PORT", "CLUSTER DNS", "ACTIONS"], serviceRows, "No internal services yet.")}${networkingForm}</div>`;
  if (tab === "kubernetes")
    return `<div class="playground-surface"><div class="playground-panel-heading"><div><span>KUBERNETES / ${escapeHTML(state.namespace)}</span><h3>Deployments</h3><p>Manage real Kubernetes deployments. Limits: three deployments, three replicas each, five total replicas.</p></div><span class="subtle-tag">${state.deployments.length} deployments</span></div>${table(["DEPLOYMENT", "IMAGE", "READY", "ACTIONS"], deploymentRows(state), "No lab deployments yet.")}${form}</div>`;
  if (tab === "terminal") return terminal;
  return `<div class="playground-overview-grid">
    <article class="playground-surface"><div class="playground-card-heading"><div><span>01 / CONTAINERS</span><h3>${state.containers.length} pods</h3></div></div><p>Live pod state from OpenShift. Manage actual containers under the account-scoped lab label.</p><button type="button" class="playground-inline-link" data-tab="containers">Open containers <span aria-hidden="true">→</span></button></article>
    <article class="playground-surface"><div class="playground-card-heading"><div><span>02 / NETWORKING</span><h3>${state.services.length} internal services</h3></div></div><p>ClusterIP services provide real in-cluster DNS and routing without exposing public ports.</p><button type="button" class="playground-inline-link" data-tab="networking">Open networking <span aria-hidden="true">→</span></button></article>
    <article class="playground-surface"><div class="playground-card-heading"><div><span>03 / ORCHESTRATION</span><h3>${state.deployments.length} deployments</h3></div></div><p>Inspect and scale live Kubernetes workloads within the user-scoped lab.</p><button type="button" class="playground-inline-link" data-tab="kubernetes">Open Kubernetes <span aria-hidden="true">→</span></button></article>
    <article class="playground-surface"><div class="playground-card-heading"><div><span>04 / COMMAND LINE</span><h3>Restricted terminal</h3></div></div><p>Allowlisted commands call the OpenShift API directly; this is not a simulated terminal or an unrestricted shell.</p><button type="button" class="playground-inline-link" data-tab="terminal">Open terminal <span aria-hidden="true">→</span></button></article>
  </div>`;
}

export function renderOpenShiftPlayground(root) {
  let state = null;
  let activeTab = "overview";
  let history = [];
  let error = "";
  let loading = true;

  async function refresh() {
    loading = true;
    render();
    try {
      ({ state } = await api("/state"));
      error = "";
    } catch (cause) {
      error = cause.message;
    } finally {
      loading = false;
      render();
    }
  }

  async function run(command) {
    const trimmed = command.trim();
    if (!trimmed) return;
    try {
      const result = await api("/command", { method: "POST", body: JSON.stringify({ command: trimmed }) });
      if (trimmed === "clear") history = [];
      else history.push({ command: trimmed, lines: result.lines || [] });
      if (result.state) state = result.state;
      else if (trimmed !== "help") ({ state } = await api("/state"));
      error = "";
    } catch (cause) {
      error = cause.message;
      history.push({ command: trimmed, lines: [cause.message] });
    }
    history = history.slice(-40);
    render();
  }

  function render() {
    if (!state) {
      root.innerHTML = `<section class="playground-surface"><div class="playground-panel-heading"><div><span>LIVE OPENSHIFT PROJECT</span><h3>${loading ? "Connecting to cluster…" : "Cluster unavailable"}</h3><p>${loading ? "Reading real project resources; no resources are created during connection." : "The live cluster could not be loaded."}</p></div><button type="button" class="secondary-button" id="playground-refresh">Retry</button></div>${error ? `<p class="form-message" role="alert">${escapeHTML(error)}</p>` : ""}</section>`;
      root.querySelector("#playground-refresh")?.addEventListener("click", refresh);
      return;
    }

    const pods = state.containers.length;
    const replicas = state.deployments.reduce((total, item) => total + item.replicas, 0);
    root.innerHTML = `<header class="page-heading"><div><span class="page-eyebrow">LIVE OPENSHIFT / USER-SCOPED LAB</span><h1>Container playground</h1><p>Real workloads in project <code>${escapeHTML(state.namespace)}</code>. Only resources created by this account&apos;s lab are managed.</p></div><button type="button" class="secondary-button" id="playground-refresh">Refresh cluster</button></header>
      <div class="playground-banner playground-banner-live" role="note"><span class="playground-banner-mark" aria-hidden="true">i</span><p><strong>Connected to OpenShift.</strong> Workloads are real and changes persist in the cluster. This account cannot create a separate project, so lab resources use a unique per-user label in its existing namespace. Existing objects are not targeted, but namespace quota and network policies are shared. Docker Engine is unavailable; workloads run on OpenShift&apos;s CRI-O runtime.</p></div>
      <section class="playground-metrics" aria-label="Live project status"><article><span>LIVE PODS</span><strong>${pods}</strong><small>OpenShift API</small></article><article><span>DEPLOYMENTS</span><strong>${state.deployments.length}</strong><small>${replicas} requested replicas</small></article><article><span>INTERNAL SERVICES</span><strong>${state.services.length}</strong><small>ClusterIP only</small></article></section>
      <div class="playground-tabs" role="tablist" aria-label="OpenShift playground tools">${tabs.map(([id, label]) => `<button type="button" role="tab" id="playground-tab-${id}" aria-selected="${activeTab === id}" aria-controls="playground-panel" tabindex="${activeTab === id ? "0" : "-1"}" class="${activeTab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</div>
      <div id="playground-panel" role="tabpanel" aria-labelledby="playground-tab-${activeTab}" class="playground-panel">${renderContent(activeTab, state, history)}</div>
      ${error ? `<p class="form-message" role="alert">${escapeHTML(error)}</p>` : ""}`;

    root.querySelector("#playground-refresh")?.addEventListener("click", refresh);
    root.querySelectorAll("[data-tab]").forEach((button) =>
      button.addEventListener("click", () => {
        activeTab = button.dataset.tab;
        render();
      }),
    );
    root
      .querySelectorAll("[data-command]")
      .forEach((button) => button.addEventListener("click", () => run(button.dataset.command)));
    root.querySelector("[data-clear-history]")?.addEventListener("click", () => {
      history = [];
      render();
    });
    root.querySelector("#playground-deployment-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      void run(`kubectl create deployment ${formData.get("name")} --image=${formData.get("image")}`);
    });
    root.querySelector("#playground-service-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      void run(`kubectl expose deployment ${formData.get("name")} --port=${formData.get("port")}`);
    });
    root.querySelectorAll(".playground-scale-form").forEach((form) =>
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const replicas = new FormData(form).get("replicas");
        void run(`kubectl scale deployment ${form.dataset.name} --replicas=${replicas}`);
      }),
    );
    root
      .querySelectorAll("[data-delete-deployment]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          run(`kubectl delete deployment ${button.dataset.deleteDeployment}`),
        ),
      );
    root
      .querySelectorAll("[data-delete-service]")
      .forEach((button) =>
        button.addEventListener("click", () => run(`kubectl delete service ${button.dataset.deleteService}`)),
      );
    const terminalForm = root.querySelector("#playground-terminal-form");
    const commandInput = root.querySelector("#playground-command-input");
    commandInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    terminalForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const command = commandInput.value;
      void run(command);
      commandInput.value = "";
    });
    const output = root.querySelector("#playground-terminal-output");
    if (output) output.scrollTop = output.scrollHeight;
  }

  void refresh();
}

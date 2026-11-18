const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const auth = $("#auth");
const dashboard = $("#dashboard");
const viewRoot = $("#view-root");
const authMessage = $("#auth-message");
const navGroups = [
  { label: "OVERVIEW", items: [["dashboard", "Dashboard", "DB"], ["threat-overview", "Threat overview", "TR"], ["hunt-center", "Hunt center", "HN"]] },
  { label: "INTELLIGENCE", items: [["iocs", "IOC search", "IOC"], ["actors", "Threat actors", "TA"], ["campaigns", "Campaigns", "CA"], ["feeds", "Feeds & sources", "FS"], ["mitre", "MITRE ATT&CK", "MIT"]] },
  { label: "EXPOSURE", items: [["attack-surface", "Attack surface", "AS"], ["assets", "Assets & domains", "AD"], ["vulnerabilities", "Vulnerabilities", "VUL"], ["cloud", "Cloud exposure", "CL"]] },
  { label: "MONITORING", items: [["dark-web", "Dark web", "DW"], ["credentials", "Credential leaks", "CR"], ["brand", "Brand protection", "BR"], ["phishing", "Phishing detection", "PH"], ["watchlists", "Watchlists", "WL"]] },
  { label: "OPERATIONS", items: [["alerts", "Alerts", "AL"], ["cases", "Cases & incidents", "CI"], ["reports", "Reports", "RP"], ["tasks", "Task queue", "TQ"]] },
  { label: "INTEGRATIONS", items: [["integrations", "Connections", "CN"], ["exports", "Data export", "EX"]] },
  { label: "ADMIN", items: [["team", "Team & workspace", "TM"], ["audit", "Audit log", "AU"], ["settings", "Settings", "ST"]] },
];
const pageInfo = {
  "threat-overview": ["Threat overview", "Strategic context for the threats most relevant to your organization.", "Intelligence sources"],
  "hunt-center": ["Hunt center", "Investigate telemetry and indicators through repeatable hypotheses.", "Telemetry sources"],
  actors: ["Threat actors", "Track adversary profiles, motivations, and observed techniques.", "Actor intelligence"],
  campaigns: ["Campaigns", "Follow active campaigns and their related indicators and incidents.", "Campaign intelligence"],
  feeds: ["Feeds & sources", "Monitor the quality, freshness, and coverage of intelligence feeds.", "Feed connections"],
  mitre: ["MITRE ATT&CK coverage", "Understand detection coverage and prioritize technique gaps.", "Detection coverage"],
  "attack-surface": ["Attack surface", "Review externally exposed assets and prioritize remediation.", "Asset discovery"],
  vulnerabilities: ["Vulnerabilities", "Prioritize vulnerabilities by severity, exposure, and asset impact.", "Vulnerability sources"],
  cloud: ["Cloud exposure", "Find cloud resources and endpoints that need configuration review.", "Cloud connections"],
  "dark-web": ["Dark web monitoring", "Triage brand mentions and emerging exposure signals.", "Dark web sources"],
  credentials: ["Credential leaks", "Review verified credential exposure and coordinate remediation.", "Credential monitoring"],
  brand: ["Brand protection", "Track lookalike domains, impersonation, and takedown work.", "Brand monitoring"],
  phishing: ["Phishing detection", "Review phishing infrastructure and coordinate block or takedown actions.", "Phishing sources"],
  cases: ["Cases & incidents", "Document investigations, evidence, and response milestones.", "Case management"],
  reports: ["Reports", "Prepare operational briefings and executive-ready summaries.", "Reporting data"],
  tasks: ["Task queue", "Coordinate triage, hunting, and remediation work across the team.", "Task management"],
  exports: ["Data export", "Prepare filtered intelligence for approved downstream workflows.", "Export connections"],
  settings: ["Settings", "Manage workspace preferences and organization policy.", "Workspace settings"],
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setMobileNavigation(open, { restoreFocus = false } = {}) {
  if (!window.matchMedia("(max-width: 620px)").matches) return;
  const wasOpen = dashboard.classList.contains("sidebar-open");
  dashboard.classList.toggle("sidebar-open", open);
  $("#mobile-menu-toggle").setAttribute("aria-expanded", String(open));
  $("#mobile-menu-toggle").setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  $("#nav-scrim").hidden = !open;
  if (open) $("#sidebar-nav [data-page]")?.focus({ preventScroll: true });
  else if (restoreFocus && wasOpen) $("#mobile-menu-toggle").focus({ preventScroll: true });
}

function renderNavigation(active = "dashboard") {
  $("#sidebar-nav").innerHTML = navGroups.map((group) => `
    <div class="nav-group"><p class="nav-label">${group.label}</p>
      ${group.items.map(([id, label, icon]) => `<button type="button" class="nav-link ${id === active ? "active" : ""}" data-page="${id}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}" ${id === active ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icon}</span><span>${escapeHTML(label)}</span>${id === "alerts" ? '<span class="nav-count" id="nav-alert-count">0</span>' : ""}</button>`).join("")}
    </div>`).join("");
  $$('[data-page]', $("#sidebar-nav")).forEach((button) => button.addEventListener("click", () => {
    navigate(button.dataset.page);
    setMobileNavigation(false);
  }));
}

function navigate(page) {
  const title = pageInfo[page]?.[0] || ({ dashboard: "Dashboard", iocs: "IOC search & enrichment", assets: "Assets & domains", alerts: "Alerts", watchlists: "Watchlists", integrations: "Connections", team: "Team & workspace", audit: "Audit log" })[page] || "Dashboard";
  renderNavigation(page);
  $("#breadcrumb-current").textContent = title;
  if (page === "dashboard") renderDashboard();
  else if (page === "iocs") renderIOCPage();
  else if (page === "alerts") renderAlertsPage();
  else if (page === "assets" || page === "attack-surface") renderAssetsPage(page);
  else if (page === "watchlists") renderWatchlistsPage();
  else if (page === "integrations") renderIntegrationsPage();
  else if (page === "team") renderTeamPage();
  else if (page === "audit") renderAuditPage();
  else if (page === "cloud") renderCloudShell();
  else renderModulePage(page);
  viewRoot.focus({ preventScroll: true });
}

function pageHeading(eyebrow, title, subtitle, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>${action}</div>`;
}

function metricCard(label, value, note, tone = "cyan", icon = "◈") {
  return `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon ${tone}">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
}

function renderDashboard() {
  viewRoot.innerHTML = `${pageHeading("SECURITY OPERATIONS / OVERVIEW", "Good day, analyst", "Here’s your organization’s threat posture at a glance.", '<button class="secondary-button" id="export-report">⇧ <span>Export snapshot</span></button>')}
    <div class="overview-strip"><span class="live-indicator"><i></i> LIVE WORKSPACE</span><span id="last-updated">Updated just now</span><span class="strip-divider"></span><span class="strip-label">Workspace scope</span><strong id="scope-name">Organization</strong></div>
    <section class="metric-grid" aria-label="Security overview metrics" id="metric-grid"></section>
    <section class="dashboard-grid dashboard-primary">
      <article class="surface-card trend-card"><div class="card-heading"><div><p class="section-kicker">THREAT ACTIVITY</p><h2>Alert severity</h2></div><span class="subtle-tag">Current open alerts</span></div><div id="severity-chart" class="severity-chart"></div></article>
      <article class="surface-card score-card"><div class="card-heading"><div><p class="section-kicker">EXPOSURE POSTURE</p><h2>Asset verification</h2></div><span class="card-more">•••</span></div><div id="exposure-score" class="exposure-score"></div></article>
    </section>
    <section class="dashboard-grid dashboard-secondary">
      <article class="surface-card alerts-card"><div class="card-heading"><div><p class="section-kicker">TRIAGE QUEUE</p><h2>Recent alerts <span class="inline-count" id="recent-alert-count">0</span></h2></div><button class="text-button" data-page="alerts">View all <span aria-hidden="true">→</span></button></div><div id="recent-alerts" class="alert-list"></div></article>
      <article class="surface-card assets-card"><div class="card-heading"><div><p class="section-kicker">EXTERNAL FOOTPRINT</p><h2>Assets & findings</h2></div><button class="text-button" data-page="assets">View assets <span aria-hidden="true">→</span></button></div><div id="top-assets" class="asset-list"></div><div id="finding-summary" class="finding-summary"></div></article>
    </section>
    <section class="dashboard-grid dashboard-tertiary">
      <article class="surface-card workflow-card"><div class="card-heading"><div><p class="section-kicker">ANALYST WORKFLOW</p><h2>Start with a signal</h2></div></div><div class="quick-actions"><button data-page="iocs"><span class="quick-icon">⌕</span><span><strong>Enrich an IOC</strong><small>Investigate a suspicious indicator</small></span><b>→</b></button><button data-page="alerts"><span class="quick-icon amber">◉</span><span><strong>Triage an alert</strong><small>Review and update open detections</small></span><b>→</b></button><button data-page="hunt-center"><span class="quick-icon violet">⌘</span><span><strong>Start a hunt</strong><small>Explore a threat hypothesis</small></span><b>→</b></button></div></article>
      <article class="surface-card health-card"><div class="card-heading"><div><p class="section-kicker">PLATFORM HEALTH</p><h2>Connected services</h2></div><button class="text-button" data-page="integrations">Manage <span aria-hidden="true">→</span></button></div><div id="health-summary" class="health-summary"></div></article>
    </section>`;
  $$('[data-page]', viewRoot).forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
  $("#export-report").addEventListener("click", exportSnapshot);
  loadDashboardData();
}

async function loadDashboardData() {
  try {
    const [summaryData, alertData, assetData, findingData, integrationData] = await Promise.all([
      api("/intel/summary"), api("/intel/alerts"), api("/assets"), api("/findings"), api("/integrations/status"),
    ]);
    const summary = summaryData.summary;
    const activeAlerts = alertData.alerts.filter((alert) => !["resolved", "false_positive"].includes(alert.status));
    const critical = activeAlerts.filter((alert) => alert.severity === "critical").length;
    const assets = assetData.assets;
    const findings = findingData.findings.filter((finding) => finding.status === "open");
    const openExposure = findings.filter((finding) => finding.severity === "critical" || finding.severity === "high").length;
    $("#metric-grid").innerHTML = [
      metricCard("OPEN ALERTS", activeAlerts.length, `${critical} critical · ${activeAlerts.length - critical} other priorities`, critical ? "red" : "cyan", "◉"),
      metricCard("CRITICAL ALERTS", critical, "Active alerts marked critical", critical ? "red" : "cyan", "!"),
      metricCard("TRACKED INDICATORS", summary.iocCount, `${summary.watchlisted} watchlisted · analyst-provided`, "blue", "⌗"),
      metricCard("CRITICAL EXPOSURE", openExposure, `${findings.length} open findings across assets`, openExposure ? "amber" : "cyan", "△"),
      metricCard("DARK WEB MENTIONS", "—", "No authorized source connected", "muted", "◌"),
      metricCard("PHISHING SIGNALS", "—", "No authorized source connected", "muted", "◌"),
    ].join("");
    $("#nav-alert-count").textContent = activeAlerts.length;
    $("#recent-alert-count").textContent = activeAlerts.length;
    $("#last-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const workspace = await api("/workspace");
    $("#scope-name").textContent = workspace.workspace.name;
    $("#workspace-name").textContent = workspace.workspace.name;
    renderSeverityChart(activeAlerts);
    renderExposureScore(assets, findings);
    renderRecentAlerts(activeAlerts.slice(0, 5));
    renderTopAssets(assets, findings);
    renderHealth(integrationData.integrations);
  } catch (error) {
    if (error.message.includes("Authentication")) showAuth();
    else viewRoot.insertAdjacentHTML("afterbegin", `<div class="inline-error" role="alert">Could not load workspace data: ${escapeHTML(error.message)}</div>`);
  }
}

function renderSeverityChart(alerts) {
  const counts = ["critical", "high", "medium", "low"].map((severity) => ({ severity, count: alerts.filter((alert) => alert.severity === severity).length }));
  const max = Math.max(1, ...counts.map((item) => item.count));
  $("#severity-chart").innerHTML = `<div class="chart-summary"><strong>${alerts.length}</strong><span>active alerts</span></div><div class="bar-chart" role="img" aria-label="Open alerts by severity: ${counts.map((item) => `${item.severity} ${item.count}`).join(", ")}">${counts.map(({ severity, count }) => `<div class="bar-row"><span class="severity-label"><i class="severity-dot ${severity}"></i>${severity}</span><div class="bar-track"><i class="bar-fill ${severity}" style="width:${count ? Math.max(8, count / max * 100) : 0}%"></i></div><strong>${count}</strong></div>`).join("")}</div><p class="chart-caption">Severity is calculated from your active workspace alerts.</p>`;
}

function renderExposureScore(assets, findings) {
  const verified = assets.filter((asset) => asset.verified).length;
  const ratio = assets.length ? Math.round(verified / assets.length * 100) : 0;
  const highRisk = findings.filter((finding) => ["critical", "high"].includes(finding.severity)).length;
  $("#exposure-score").innerHTML = `<div class="verification-ring" style="--progress:${ratio * 3.6}deg"><div><strong>${ratio}<small>%</small></strong><span>verified</span></div></div><div class="exposure-details"><div><span class="mini-dot mint"></span><span>Verified assets</span><strong>${verified}</strong></div><div><span class="mini-dot muted-dot"></span><span>Awaiting verification</span><strong>${assets.length - verified}</strong></div><div><span class="mini-dot coral"></span><span>High / critical findings</span><strong>${highRisk}</strong></div></div><button class="quiet-link" data-page="assets">Review asset inventory <span>→</span></button>`;
  $("[data-page]", $("#exposure-score")).addEventListener("click", () => navigate("assets"));
}

function renderRecentAlerts(alerts) {
  $("#recent-alerts").innerHTML = alerts.length ? alerts.map((alert) => `<div class="alert-row"><span class="severity-mark ${escapeHTML(alert.severity)}"></span><div class="alert-copy"><strong>${escapeHTML(alert.title)}</strong><small>${escapeHTML(alert.source || "Manual")}${alert.description ? ` · ${escapeHTML(alert.description)}` : ""}</small></div><span class="severity-pill ${escapeHTML(alert.severity)}">${escapeHTML(alert.severity)}</span><time>${formatTime(alert.createdAt)}</time></div>`).join("") : emptyState("No active alerts", "New alerts will appear here when your workspace detects activity.");
}

function renderTopAssets(assets, findings) {
  const visible = assets.slice(0, 4);
  $("#top-assets").innerHTML = visible.length ? visible.map((asset) => {
    const related = findings.filter((finding) => finding.assetId === asset.id).length;
    return `<div class="asset-row"><span class="asset-icon">${asset.url.startsWith("https:") ? "⌑" : "◇"}</span><div><strong>${escapeHTML(asset.name)}</strong><small>${escapeHTML(new URL(asset.url).hostname)}</small></div><span class="asset-state ${asset.verified ? "verified" : "pending"}"><i></i>${asset.verified ? "Verified" : "Pending"}</span><span class="asset-findings">${related || "—"}</span></div>`;
  }).join("") : emptyState("No assets registered", "Add an organization-owned domain to begin tracking exposure.");
  $("#finding-summary").innerHTML = `<span class="mini-dot coral"></span><span>${findings.length} open finding${findings.length === 1 ? "" : "s"}</span><span class="finding-divider"></span><button class="quiet-link" id="view-findings">View findings →</button>`;
  $("#view-findings").addEventListener("click", () => renderAssetsPage("assets", true));
}

function renderHealth(integrations) {
  const configured = integrations.filter((integration) => ["configured", "valid"].includes(integration.state)).length;
  $("#health-summary").innerHTML = `<div class="health-number"><strong>${configured}</strong><span>of ${integrations.length} services configured</span></div><div class="health-list">${integrations.slice(0, 4).map((integration) => `<div><i class="health-dot ${["configured", "valid"].includes(integration.state) ? "good" : "waiting"}"></i>${escapeHTML(integration.name)}<span>${["configured", "valid"].includes(integration.state) ? "Connected" : "Not connected"}</span></div>`).join("")}</div>`;
}

function renderIOCPage() {
  viewRoot.innerHTML = `${pageHeading("INTELLIGENCE / INDICATORS", "IOC search & enrichment", "Search, review, and watch indicators in your organization’s workspace.", '<button class="secondary-button" id="refresh-iocs">↻ <span>Refresh</span></button>')}
    <section class="surface-card form-card"><div class="card-heading"><div><p class="section-kicker">ADD INDICATOR</p><h2>Enrich an IOC</h2></div><span class="subtle-tag">Workspace scoped</span></div><form id="ioc-form" class="inline-form"><label>Type<select name="type"><option value="domain">Domain</option><option value="ip">IP address</option><option value="url">URL</option><option value="hash">File hash</option><option value="email">Email</option><option value="cert">Certificate</option></select></label><label class="wide-field">Indicator value<input name="value" placeholder="suspicious.example" required minlength="3" maxlength="2048" /></label><label>Confidence<input name="confidence" type="number" min="0" max="100" value="50" /></label><label>Severity<select name="severity"><option>low</option><option selected>medium</option><option>high</option><option>critical</option></select></label><label>Source<input name="source" value="manual" maxlength="120" /></label><button class="primary-button">Add indicator <span>→</span></button></form><p id="ioc-message" class="form-message" role="status"></p></section>\n    <details class="surface-card bulk-import-card"><summary><span><strong>Bulk import</strong><small>Paste a JSON array of up to 500 indicators</small></span><span class="details-chevron" aria-hidden="true">⌄</span></summary><form id="bulk-ioc-form" class="bulk-import-form"><label for="bulk-ioc-input">Indicator records</label><textarea id="bulk-ioc-input" name="items" rows="6" placeholder='[{"type":"domain","value":"suspicious.example","source":"analyst","severity":"high","confidence":80}]' required></textarea><p class="helper-copy">Each record needs a supported type and value. Available types: IP, domain, URL, hash, email, certificate.</p><div class="form-footer"><p id="bulk-ioc-message" class="form-message" role="status"></p><button class="primary-button">Import indicators <span>→</span></button></div></form></details>\n    <section class="surface-card table-card"><div class="card-heading"><div><p class="section-kicker">INDICATOR LIBRARY</p><h2>Tracked indicators</h2></div><div class="table-actions"><label class="table-search"><span aria-hidden="true">⌕</span><input id="ioc-filter" type="search" placeholder="Filter indicators" aria-label="Filter indicators" /></label><button type="button" class="secondary-button compact-button" id="export-iocs">↓ <span>Export CSV</span></button><button type="button" class="secondary-button compact-button" id="export-iocs-json">↓ <span>Export JSON</span></button></div></div><div id="ioc-table" class="table-wrap"></div></section>`;
  $("#ioc-form").addEventListener("submit", createIOC);
  $("#bulk-ioc-form").addEventListener("submit", importBulkIOCs);
  $("#export-iocs").addEventListener("click", () => exportIOCs("csv"));
  $("#export-iocs-json").addEventListener("click", () => exportIOCs("json"));
  $("#refresh-iocs").addEventListener("click", loadIOCs);
  $("#ioc-filter").addEventListener("input", (event) => loadIOCs(event.target.value));
  loadIOCs();
}

async function importBulkIOCs(event) {
  event.preventDefault();
  const message = $("#bulk-ioc-message");
  let items;
  try {
    items = JSON.parse(new FormData(event.currentTarget).get("items"));
    if (!Array.isArray(items) || !items.length || items.length > 500) throw new Error("Paste a JSON array containing 1 to 500 indicators.");
  } catch (error) {
    message.textContent = error instanceof SyntaxError ? "That JSON could not be parsed. Check the brackets and quotes." : error.message;
    return;
  }
  try {
    const result = await api("/intel/iocs/bulk", { method: "POST", body: JSON.stringify({ items }) });
    message.textContent = `Imported ${result.created} new, refreshed ${result.deduplicated}, rejected ${result.rejected.length}.`;
    loadIOCs($("#ioc-filter").value);
  } catch (error) { message.textContent = error.message; }
}

function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

async function exportIOCs(format) {
  const buttons = [$("#export-iocs"), $("#export-iocs-json")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const query = $("#ioc-filter").value.trim();
    const { iocs } = await api(`/intel/iocs${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const isJSON = format === "json";
    let content;
    if (isJSON) content = JSON.stringify(iocs, null, 2);
    else {
      const columns = ["type", "value", "severity", "confidence", "sources", "firstSeen", "lastSeen", "watchlisted", "tags"];
      const rows = iocs.map((ioc) => columns.map((column) => csvCell(Array.isArray(ioc[column]) ? ioc[column].join("; ") : ioc[column])).join(","));
      content = [columns.join(","), ...rows].join("\r\n");
    }
    const mimeType = isJSON ? "application/json;charset=utf-8" : "text/csv;charset=utf-8";
    const extension = isJSON ? "json" : "csv";
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fivezero2-indicators-${new Date().toISOString().slice(0, 10)}.${extension}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    $("#bulk-ioc-message").textContent = error.message;
  } finally { buttons.forEach((button) => { button.disabled = false; }); }
}

async function loadIOCs(query = "") {
  try {
    const result = await api(`/intel/iocs${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    $("#ioc-table").innerHTML = result.iocs.length ? `<table><thead><tr><th>Indicator</th><th>Confidence</th><th>Severity</th><th>Last seen</th><th>Watchlist</th></tr></thead><tbody>${result.iocs.slice(0, 100).map((ioc) => `<tr><td><span class="ioc-type">${escapeHTML(ioc.type)}</span><code>${escapeHTML(ioc.value)}</code>${ioc.tags?.length ? `<small>${ioc.tags.map(escapeHTML).join(", ")}</small>` : ""}</td><td>${Number(ioc.confidence)}%</td><td><span class="severity-pill ${escapeHTML(ioc.severity)}">${escapeHTML(ioc.severity)}</span></td><td>${formatDate(ioc.lastSeen)}</td><td><button class="watch-toggle ${ioc.watchlisted ? "selected" : ""}" data-watch="${escapeHTML(ioc.id)}" aria-label="${ioc.watchlisted ? "Remove from" : "Add to"} watchlist">${ioc.watchlisted ? "★ Watching" : "☆ Add"}</button></td></tr>`).join("")}</tbody></table>` : emptyState("No indicators found", "Add an IOC above or adjust your search.");
    $$('[data-watch]', $("#ioc-table")).forEach((button) => button.addEventListener("click", async () => {
      await api(`/intel/iocs/${encodeURIComponent(button.dataset.watch)}`, { method: "PATCH", body: JSON.stringify({ watchlisted: !button.classList.contains("selected") }) });
      loadIOCs($("#ioc-filter").value);
    }));
  } catch (error) { $("#ioc-table").innerHTML = `<div class="inline-error">${escapeHTML(error.message)}</div>`; }
}

async function createIOC(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.confidence = Number(data.confidence);
  try {
    const result = await api("/intel/iocs", { method: "POST", body: JSON.stringify(data) });
    $("#ioc-message").textContent = result.deduplicated ? "Indicator already existed and was refreshed." : "Indicator added to this workspace.";
    form.reset();
    loadIOCs($("#ioc-filter").value);
  } catch (error) { $("#ioc-message").textContent = error.message; }
}

function renderAlertsPage() {
  viewRoot.innerHTML = `${pageHeading("OPERATIONS / TRIAGE", "Alerts", "Triage detections, document disposition, and keep response moving.", '<button class="secondary-button" id="refresh-alerts">↻ <span>Refresh</span></button>')}
    <section class="surface-card form-card"><div class="card-heading"><div><p class="section-kicker">MANUAL TRIAGE SIGNAL</p><h2>Create an alert</h2></div></div><form id="alert-form" class="inline-form alert-form"><label class="wide-field">Title<input name="title" required minlength="3" maxlength="180" placeholder="Describe the detection" /></label><label>Severity<select name="severity"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label><label>Source<input name="source" value="manual" /></label><label class="wide-field">Description<input name="description" maxlength="2000" placeholder="Optional investigation context" /></label><button class="primary-button">Create alert <span>→</span></button></form></section>
    <section class="surface-card table-card"><div class="card-heading"><div><p class="section-kicker">WORKSPACE ALERTS</p><h2>All alerts</h2></div><label class="table-search"><span aria-hidden="true">⌕</span><input id="alert-filter" type="search" placeholder="Filter alerts" aria-label="Filter alerts" /></label></div><div id="alerts-list" class="alert-list full-alert-list"></div></section>`;
  $("#alert-form").addEventListener("submit", createAlert);
  $("#refresh-alerts").addEventListener("click", loadAlerts);
  $("#alert-filter").addEventListener("input", (event) => loadAlerts(event.target.value));
  loadAlerts();
}

async function loadAlerts(query = "") {
  try {
    const { alerts } = await api("/intel/alerts");
    const filtered = alerts.filter((alert) => `${alert.title} ${alert.description} ${alert.source} ${alert.severity} ${alert.status}`.toLowerCase().includes(query.toLowerCase()));
    $("#alerts-list").innerHTML = filtered.length ? filtered.map((alert) => `<article class="alert-row alert-row-full"><span class="severity-mark ${escapeHTML(alert.severity)}"></span><div class="alert-copy"><strong>${escapeHTML(alert.title)}</strong><small>${escapeHTML(alert.description || "No description provided")} · ${escapeHTML(alert.source || "Manual")}</small></div><span class="severity-pill ${escapeHTML(alert.severity)}">${escapeHTML(alert.severity)}</span><span class="status-pill ${escapeHTML(alert.status)}">${escapeHTML(alert.status.replaceAll("_", " "))}</span><time>${formatTime(alert.createdAt)}</time><div class="alert-actions">${alert.status === "open" ? `<button data-alert-status="acknowledged" data-alert-id="${escapeHTML(alert.id)}">Acknowledge</button>` : ""}${!["resolved", "false_positive"].includes(alert.status) ? `<button data-alert-status="investigating" data-alert-id="${escapeHTML(alert.id)}">Investigate</button><button data-alert-status="resolved" data-alert-id="${escapeHTML(alert.id)}">Resolve</button>` : ""}</div></article>`).join("") : emptyState("Nothing in the queue", "Alerts in this workspace will appear here.");
    $$('[data-alert-id]', $("#alerts-list")).forEach((button) => button.addEventListener("click", async () => {
      try { await api(`/intel/alerts/${encodeURIComponent(button.dataset.alertId)}`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.alertStatus }) }); loadAlerts($("#alert-filter").value); }
      catch (error) { viewRoot.insertAdjacentHTML("afterbegin", `<div class="inline-error">${escapeHTML(error.message)}</div>`); }
    }));
  } catch (error) { $("#alerts-list").innerHTML = `<div class="inline-error">${escapeHTML(error.message)}</div>`; }
}

async function createAlert(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try { await api("/intel/alerts", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }); form.reset(); loadAlerts(); }
  catch (error) { viewRoot.insertAdjacentHTML("afterbegin", `<div class="inline-error">${escapeHTML(error.message)}</div>`); }
}

function renderAssetsPage(page = "assets", showFindings = false) {
  viewRoot.innerHTML = `${pageHeading(page === "attack-surface" ? "EXPOSURE / DISCOVERY" : "EXPOSURE / INVENTORY", page === "attack-surface" ? "Attack surface" : "Assets & domains", "Register organization-owned domains, verify control, and track findings.", '<button class="secondary-button" id="refresh-assets">↻ <span>Refresh</span></button>')}
    <section class="surface-card form-card"><div class="card-heading"><div><p class="section-kicker">ORGANIZATION INVENTORY</p><h2>Register an asset</h2></div><span class="subtle-tag">Ownership verification required</span></div><form id="asset-form" class="inline-form"><label>Asset name<input name="name" minlength="2" maxlength="100" required placeholder="Primary website" /></label><label class="wide-field">Origin URL<input name="url" type="url" required placeholder="https://example.org" /></label><label class="wide-field">Notes<input name="notes" maxlength="500" placeholder="Team, environment, or context" /></label><button class="primary-button">Add asset <span>→</span></button></form><p id="asset-message" class="form-message" role="status"></p></section>
    <section class="surface-card table-card"><div class="card-heading"><div><p class="section-kicker">REGISTERED ASSETS</p><h2>Asset inventory</h2></div></div><div id="assets-list" class="asset-management-list"></div></section>
    <section class="surface-card table-card"><div class="card-heading"><div><p class="section-kicker">EXPOSURE FINDINGS</p><h2>Open findings</h2></div></div><div id="findings-list" class="findings-list"></div></section>`;
  $("#asset-form").addEventListener("submit", createAsset);
  $("#refresh-assets").addEventListener("click", loadAssets);
  loadAssets(showFindings);
}

async function loadAssets(showFindings = false) {
  try {
    const [{ assets }, { findings }] = await Promise.all([api("/assets"), api("/findings")]);
    $("#assets-list").innerHTML = assets.length ? assets.map((asset) => `<article class="asset-management-row"><span class="asset-icon">◇</span><div class="asset-management-copy"><strong>${escapeHTML(asset.name)}</strong><small>${escapeHTML(asset.url)}${asset.notes ? ` · ${escapeHTML(asset.notes)}` : ""}</small>${asset.verified ? `<small>Ownership verified ${formatDate(asset.verifiedAt)}</small>` : `<small class="verification-record">Add TXT record <code>_fivezero2-verify.${escapeHTML(new URL(asset.url).hostname)}</code> with challenge <code>${escapeHTML(asset.challenge)}</code></small>`}</div><span class="asset-state ${asset.verified ? "verified" : "pending"}"><i></i>${asset.verified ? "Verified" : "Unverified"}</span><div class="asset-buttons">${asset.verified ? `<button data-check-asset="${escapeHTML(asset.id)}">Run passive check</button>` : `<button data-verify-asset="${escapeHTML(asset.id)}">Verify DNS</button>`}</div></article>`).join("") : emptyState("No assets registered", "Register a domain you own. DNS verification is required before passive checks.");
    $("#findings-list").innerHTML = findings.length ? findings.map((finding) => `<article class="finding-row"><span class="severity-mark ${escapeHTML(finding.severity)}"></span><div><strong>${escapeHTML(finding.title || finding.name)}</strong><small>${escapeHTML(finding.description || "No additional detail")}</small></div><span class="severity-pill ${escapeHTML(finding.severity)}">${escapeHTML(finding.severity)}</span><span class="status-pill">${escapeHTML(finding.status)}</span>${finding.status === "open" ? `<select data-finding-id="${escapeHTML(finding.id)}" aria-label="Update finding status"><option value="open" selected>Open</option><option value="accepted">Accepted</option><option value="fixed">Fixed</option><option value="false_positive">False positive</option></select>` : ""}</article>`).join("") : emptyState("No findings recorded", "Findings from authorized asset checks will appear here.");
    $$('[data-verify-asset]', $("#assets-list")).forEach((button) => button.addEventListener("click", async () => {
      try { await api(`/assets/${encodeURIComponent(button.dataset.verifyAsset)}/verify`, { method: "POST" }); loadAssets(); }
      catch (error) { $("#asset-message").textContent = error.message; }
    }));
    $$('[data-check-asset]', $("#assets-list")).forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try { const { result } = await api(`/assets/${encodeURIComponent(button.dataset.checkAsset)}/check`, { method: "POST" }); $("#asset-message").textContent = `Passive check complete · HTTP ${result.status ?? "unavailable"} · ${result.ok ? "reachable" : "not reachable"}`; }
      catch (error) { $("#asset-message").textContent = error.message; }
      finally { button.disabled = false; }
    }));
    $$('[data-finding-id]').forEach((select) => select.addEventListener("change", async () => {
      try { await api(`/findings/${encodeURIComponent(select.dataset.findingId)}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); loadAssets(); }
      catch (error) { $("#asset-message").textContent = error.message; }
    }));
    if (showFindings) $("#findings-list").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) { $("#assets-list").innerHTML = `<div class="inline-error">${escapeHTML(error.message)}</div>`; }
}

async function createAsset(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try { await api("/assets", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }); form.reset(); $("#asset-message").textContent = "Asset registered. Verify its DNS ownership to continue."; loadAssets(); }
  catch (error) { $("#asset-message").textContent = error.message; }
}

async function renderWatchlistsPage() {
  viewRoot.innerHTML = `${pageHeading("MONITORING / CONTINUOUS REVIEW", "Watchlists", "Keep important indicators close and review monitored changes.")}
    <section class="surface-card table-card"><div class="card-heading"><div><p class="section-kicker">MONITORED INDICATORS</p><h2>Active watchlist</h2></div><button class="secondary-button" id="refresh-watchlist">↻ <span>Refresh</span></button></div><div id="watchlist-table" class="table-wrap"></div></section>`;
  $("#refresh-watchlist").addEventListener("click", loadWatchlists);
  loadWatchlists();
}
async function loadWatchlists() {
  try { const { iocs } = await api("/intel/iocs"); const watched = iocs.filter((ioc) => ioc.watchlisted); $("#watchlist-table").innerHTML = watched.length ? `<table><thead><tr><th>Indicator</th><th>Confidence</th><th>Last seen</th><th></th></tr></thead><tbody>${watched.map((ioc) => `<tr><td><span class="ioc-type">${escapeHTML(ioc.type)}</span><code>${escapeHTML(ioc.value)}</code></td><td>${ioc.confidence}%</td><td>${formatDate(ioc.lastSeen)}</td><td><button class="watch-toggle selected" data-unwatch="${escapeHTML(ioc.id)}">★ Remove</button></td></tr>`).join("")}</tbody></table>` : emptyState("Your watchlist is clear", "Add indicators to your watchlist from IOC search."); $$('[data-unwatch]').forEach((button) => button.addEventListener("click", async () => { await api(`/intel/iocs/${encodeURIComponent(button.dataset.unwatch)}`, { method: "PATCH", body: JSON.stringify({ watchlisted: false }) }); loadWatchlists(); })); }
  catch (error) { $("#watchlist-table").innerHTML = `<div class="inline-error">${escapeHTML(error.message)}</div>`; }
}

function renderCloudShell() {
  viewRoot.innerHTML = `${pageHeading("CLOUD / SAFE CONSOLE", "CloudShell", "A Linux-style command console for safe workspace orientation.")}
    <section class="surface-card cloudshell-card" aria-label="CloudShell safe command console">
      <header class="cloudshell-toolbar"><div class="cloudshell-identity"><span class="cloudshell-led" aria-hidden="true"></span><div><strong>fivezero2-cloudshell</strong><small>Linux command preview · isolated demo</small></div></div><span class="subtle-tag">Safe demo mode</span></header>
      <p class="cloudshell-notice" role="note"><span aria-hidden="true">!</span><span><strong>Demo console:</strong> commands use a small read-only browser allowlist. This terminal never runs commands on the server or OpenShift cluster; Connections provides a separate read-only identity check.</span></p>
      <div class="terminal-window"><div class="terminal-titlebar" aria-hidden="true"><i></i><i></i><i></i><span>cloudshell — safe demo</span></div><div id="cloud-terminal-output" class="terminal-output" role="log" aria-live="polite" aria-relevant="additions text"><p class="terminal-line terminal-system">Welcome to fivezero2 CloudShell demo. Type help to see supported commands.</p></div>
        <form id="cloud-terminal-form" class="terminal-form"><label class="sr-only" for="cloud-terminal-input">Enter a supported demo command</label><span class="terminal-prompt" aria-hidden="true">analyst@cloudshell:~$</span><input id="cloud-terminal-input" name="command" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="try help" aria-describedby="cloudshell-footnote" /><button class="terminal-run" type="submit">Run</button></form>
      </div>
      <div class="terminal-shortcuts" aria-label="Example commands"><span>Try:</span><button type="button" data-terminal-command="help">help</button><button type="button" data-terminal-command="pwd">pwd</button><button type="button" data-terminal-command="ls">ls</button><button type="button" data-terminal-command="uname -s">uname -s</button></div>
      <p id="cloudshell-footnote" class="cloudshell-footnote"><strong>Powered by Red Hat &amp; Linux.</strong> Environment details are illustrative; this demo does not access live shell resources.</p>
    </section>`;

  const output = $("#cloud-terminal-output");
  const form = $("#cloud-terminal-form");
  const input = $("#cloud-terminal-input");
  const commandResults = {
    help: "Supported commands: clear, date, help, ls, pwd, uname -s, whoami",
    date: () => new Date().toString(),
    ls: "README.txt  indicators/  reports/",
    pwd: "/home/analyst",
    "uname -s": "Linux (illustrative demo environment)",
    whoami: "analyst (demo session)",
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  });

  function writeTerminalLine(className, content) {
    const line = document.createElement("p");
    line.className = `terminal-line ${className}`;
    line.textContent = content;
    output.append(line);
    output.scrollTop = output.scrollHeight;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = input.value.trim();
    if (!command) return;
    writeTerminalLine("terminal-command", `analyst@cloudshell:~$ ${command}`);
    input.value = "";

    if (command === "clear") {
      output.replaceChildren();
      return;
    }

    const supported = Object.hasOwn(commandResults, command);
    const result = supported ? commandResults[command] : null;
    writeTerminalLine(supported ? "terminal-result" : "terminal-warning", typeof result === "function" ? result() : result || `Command unavailable in safe demo mode: ${command}. Type help for supported commands.`);
  });

  $$('[data-terminal-command]').forEach((button) => button.addEventListener("click", () => {
    input.value = button.dataset.terminalCommand;
    form.requestSubmit();
    input.focus();
  }));
}

function renderModulePage(page) {
  const [title, description, connection] = pageInfo[page] || ["Workspace module", "Review threat intelligence and operational status for your organization.", "Data source"];
  viewRoot.innerHTML = `${pageHeading("THREAT INTELLIGENCE / WORKSPACE", title, description)}
    <section class="module-hero surface-card"><div class="module-symbol">${escapeHTML(navGroups.flatMap((group) => group.items).find((item) => item[0] === page)?.[2] || "◈")}</div><div><p class="section-kicker">READY FOR YOUR WORKSPACE</p><h2>Connect a source to activate this view</h2><p>This workspace currently exposes organization assets, findings, indicators, alerts, team access, and integration health. ${escapeHTML(title)} data is not available from a connected source yet, so no sample intelligence is shown as live information.</p><button class="primary-button" data-go-integrations>Review connections <span>→</span></button></div></section>
    <section class="module-info-grid"><article class="surface-card"><span class="module-info-icon">⌘</span><h3>${escapeHTML(connection)}</h3><p>Choose and configure a trusted source before this module reports operational data.</p></article><article class="surface-card"><span class="module-info-icon">◈</span><h3>Workspace scoped</h3><p>Connected information will remain isolated to this organization and its member roles.</p></article><article class="surface-card"><span class="module-info-icon">↗</span><h3>Ready for analyst workflows</h3><p>When a source is connected, findings can be reviewed alongside alerts and assets.</p></article></section>`;
  $("[data-go-integrations]").addEventListener("click", () => navigate("integrations"));
}

async function renderIntegrationsPage() {
  viewRoot.innerHTML = `${pageHeading("INTEGRATIONS / PLATFORM HEALTH", "Connections", "Review server-side integration configuration and connection health.", '<button class="secondary-button" id="refresh-integrations">↻ <span>Refresh status</span></button>')}
    <section class="surface-card table-card"><div class="card-heading"><div><p class="section-kicker">CONFIGURED SERVICES</p><h2>Integration status</h2></div><span class="subtle-tag">Credentials never shown</span></div><div id="integrations-list" class="integration-list"></div><p id="integration-message" class="form-message" role="status"></p></section>`;
  $("#refresh-integrations").addEventListener("click", loadIntegrations);
  await loadIntegrations();
}
async function loadIntegrations() {
  try {
    const { integrations } = await api("/integrations/status");
    $("#integrations-list").innerHTML = integrations.map((integration) => {
      const configured = ["configured", "valid"].includes(integration.state);
      const details = integration.id === "deepseek" ? `Model: ${escapeHTML(integration.model)} · Credential: ${integration.credentialPresent ? "present" : "not set"}` : integration.id === "hasura" ? `Endpoint: ${integration.endpointPresent ? "set" : "missing"} · Credentials: ${integration.adminSecretPresent && integration.jwtSecretPresent ? "present" : "incomplete"}` : integration.id === "openshift" ? `Endpoint: ${escapeHTML(integration.endpoint)} · Token: ${integration.credentialPresent ? "present" : "not set"}` : escapeHTML(integration.note || "Server-side configuration");
      const canTest = (["owner", "admin"].includes(window.currentRole) && ["deepseek", "hasura"].includes(integration.id)) || (["owner", "admin", "analyst"].includes(window.currentRole) && integration.id === "openshift");
      return `<article class="integration-row"><span class="integration-icon">${integration.id === "deepseek" ? "D" : integration.id === "hasura" ? "H" : integration.id === "openshift" ? "O" : "⌘"}</span><div><strong>${escapeHTML(integration.name)}</strong><small>${details}</small></div><span class="asset-state ${configured ? "verified" : "pending"}"><i></i>${configured ? "Configured" : "Not configured"}</span>${canTest ? `<button data-test-integration="${escapeHTML(integration.id)}">Test connection</button>` : ""}</article>`;
    }).join("") || emptyState("No connections listed", "Integration status is not available.");
    $$('[data-test-integration]').forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try { const result = await api(`/integrations/${encodeURIComponent(button.dataset.testIntegration)}/test`, { method: "POST" }); $("#integration-message").textContent = result.message; }
      catch (error) { $("#integration-message").textContent = error.message; }
      finally { button.disabled = false; }
    }));
  } catch (error) { $("#integrations-list").innerHTML = `<div class="inline-error">${escapeHTML(error.message)}</div>`; }
}

async function renderTeamPage() {
  viewRoot.innerHTML = `${pageHeading("ADMIN / ACCESS CONTROL", "Team & workspace", "Manage workspace membership and least-privilege access.")}
    <section class="surface-card form-card"><div class="card-heading"><div><p class="section-kicker">INVITE A COLLEAGUE</p><h2>Create a one-time invitation</h2></div></div><form id="invite-form" class="inline-form"><label>Workspace role<select name="role"><option value="viewer">Viewer</option><option value="analyst">Analyst</option><option value="admin">Admin</option></select></label><button class="primary-button">Create invitation <span>→</span></button></form><p id="invite-result" class="form-message" role="status"></p></section>
    <section class="surface-card table-card"><div class="card-heading"><div><p class="section-kicker">MEMBERS</p><h2>Workspace access</h2></div><button class="secondary-button" id="refresh-team">↻ <span>Refresh</span></button></div><div id="member-list" class="integration-list"></div></section>`;
  $("#refresh-team").addEventListener("click", loadTeam);
  $("#invite-form").addEventListener("submit", async (event) => { event.preventDefault(); try { const result = await api("/workspace/invitations", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); $("#invite-result").textContent = `One-time token (expires ${formatDate(result.invitation.expiresAt)}): ${result.invitation.token}. Copy it now; it will not be shown again.`; } catch (error) { $("#invite-result").textContent = error.message; } });
  loadTeam();
}
async function loadTeam() {
  try {
    const { role } = await api("/workspace");
    if (!["owner", "admin"].includes(role)) { $("#invite-form").classList.add("hidden"); $("#member-list").innerHTML = emptyState("Admin access required", "Ask a workspace owner or admin to review membership."); return; }
    const { members } = await api("/workspace/members");
    $("#member-list").innerHTML = members.map((member) => `<article class="integration-row"><span class="profile-avatar">${escapeHTML(member.username.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHTML(member.username)}</strong><small>Member since ${formatDate(member.createdAt)}</small></div><span class="status-pill">${escapeHTML(member.role)}</span>${member.role !== "owner" ? `<select data-member-role="${escapeHTML(member.id)}" aria-label="Role for ${escapeHTML(member.username)}"><option value="viewer" ${member.role === "viewer" ? "selected" : ""}>Viewer</option><option value="analyst" ${member.role === "analyst" ? "selected" : ""}>Analyst</option><option value="admin" ${member.role === "admin" ? "selected" : ""}>Admin</option></select>` : ""}</article>`).join("") || emptyState("No members", "Workspace members will appear here.");
    $$('[data-member-role]').forEach((select) => select.addEventListener("change", async () => { try { await api(`/workspace/members/${encodeURIComponent(select.dataset.memberRole)}`, { method: "PATCH", body: JSON.stringify({ role: select.value }) }); loadTeam(); } catch (error) { $("#member-list").insertAdjacentHTML("afterbegin", `<div class="inline-error">${escapeHTML(error.message)}</div>`); loadTeam(); } }));
  } catch (error) { $("#member-list").innerHTML = `<div class="inline-error">${escapeHTML(error.message)}</div>`; }
}

async function renderAuditPage() {
  viewRoot.innerHTML = `${pageHeading("ADMIN / ACTIVITY", "Audit log", "Review recent workspace activity and access-related actions.", '<button class="secondary-button" id="refresh-audit">↻ <span>Refresh</span></button>')}
    <section class="surface-card table-card"><div class="card-heading"><div><p class="section-kicker">RECENT EVENTS</p><h2>Workspace activity</h2></div></div><div id="audit-list" class="audit-list"></div></section>`;
  $("#refresh-audit").addEventListener("click", loadAudit);
  loadAudit();
}
async function loadAudit() {
  try { const { events } = await api("/audit"); $("#audit-list").innerHTML = events.length ? events.map((event) => `<article class="audit-row"><span class="audit-icon">≡</span><div><strong>${escapeHTML(event.action)}</strong><small>${escapeHTML(event.detail || "Workspace event")}</small></div><time>${formatDate(event.at)} · ${new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>`).join("") : emptyState("No activity yet", "Workspace actions will be recorded here."); }
  catch (error) { $("#audit-list").innerHTML = `<div class="inline-error">${escapeHTML(error.message)}</div>`; }
}

function emptyState(title, body) { return `<div class="empty-state"><span class="empty-mark">⌁</span><strong>${title}</strong><p>${body}</p></div>`; }
function formatTime(value) { if (!value) return "—"; return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function formatDate(value) { if (!value) return "—"; return new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }); }

async function exportSnapshot() {
  try {
    const [summary, alertResponse, iocResponse, assetResponse] = await Promise.all([api("/intel/summary"), api("/intel/alerts"), api("/intel/iocs"), api("/assets")]);
    const report = { generatedAt: new Date().toISOString(), workspace: $("#scope-name").textContent, summary: summary.summary, alerts: alertResponse.alerts, indicators: iocResponse.iocs, assets: assetResponse.assets.map(({ challenge, ...asset }) => asset) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `fivezero2-security-snapshot-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  } catch (error) { viewRoot.insertAdjacentHTML("afterbegin", `<div class="inline-error">${escapeHTML(error.message)}</div>`); }
}

function showAuth() { dashboard.classList.add("hidden"); auth.classList.remove("hidden"); $("#auth-message").textContent = ""; }
async function showDashboard() {
  try {
    const { user } = await api("/me");
    window.currentRole = user.role;
    auth.classList.add("hidden"); dashboard.classList.remove("hidden");
    $("#profile-name").textContent = user.username;
    $("#profile-role").textContent = user.role;
    $("#profile-avatar").textContent = user.username.slice(0, 1).toUpperCase();
    $("#top-avatar").textContent = user.username.slice(0, 1).toUpperCase();
    renderNavigation();
    navigate("dashboard");
  } catch { showAuth(); }
}

$$('[data-tab]').forEach((button) => button.addEventListener("click", () => {
  const bootstrap = button.dataset.tab === "bootstrap";
  $$('[data-tab]').forEach((tab) => { const selected = tab === button; tab.classList.toggle("active", selected); tab.setAttribute("aria-selected", String(selected)); });
  $("#login-form").classList.toggle("hidden", bootstrap);
  $("#bootstrap-form").classList.toggle("hidden", !bootstrap);
  $("#social-login").classList.toggle("hidden", bootstrap);
  $(".auth-divider").classList.toggle("hidden", bootstrap);
  authMessage.textContent = "";
}));
$$("[data-provider]").forEach((button) => button.addEventListener("click", () => {
  authMessage.textContent = `${button.dataset.provider} sign-in has not been configured for this workspace yet.`;
}));
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await api("/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); await showDashboard(); }
  catch (error) { authMessage.textContent = error.message; }
});
$("#bootstrap-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await api("/auth/bootstrap", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); await showDashboard(); }
  catch (error) { authMessage.textContent = error.message; }
});
$("#logout").addEventListener("click", async () => { try { await api("/auth/logout", { method: "POST" }); } finally { showAuth(); } });
$("#refresh").addEventListener("click", () => navigate("dashboard"));
$("#global-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.nativeEvent?.isComposing && event.keyCode !== 229) {
    const query = event.currentTarget.value.trim();
    if (!query) return;
    navigate("iocs");
    $("#ioc-filter").value = query;
    loadIOCs(query);
  }
});
$("#mobile-menu-toggle").addEventListener("click", () => setMobileNavigation(!dashboard.classList.contains("sidebar-open"), { restoreFocus: true }));
$("#nav-scrim").addEventListener("click", () => setMobileNavigation(false, { restoreFocus: true }));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dashboard.classList.contains("sidebar-open")) {
    setMobileNavigation(false, { restoreFocus: true });
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#global-search").focus(); }
});
api("/me").then(showDashboard).catch(showAuth);

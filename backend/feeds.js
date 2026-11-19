import { Router } from "express";
import { read, write, id, now } from "./store.js";
import { roleGuard, sameWorkspace } from "./access.js";

const cisaKevUrl = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const maxFeedBytes = 5 * 1024 * 1024;
const maxImportItems = 500;

export function normalizeKevEntry(item) {
  if (!item || !/^CVE-\d{4}-\d{4,}$/.test(item.cveID || "")) return null;
  const cveId = item.cveID;
  const title = `${cveId}: ${String(item.vulnerabilityName || "Known exploited vulnerability").slice(0, 140)}`;
  const details = [
    item.shortDescription,
    item.vendorProject && `Vendor: ${item.vendorProject}`,
    item.product && `Product: ${item.product}`,
    item.dateAdded && `Added to KEV: ${item.dateAdded}`,
    item.dueDate && `Action due: ${item.dueDate}`,
    item.requiredAction && `Required action: ${item.requiredAction}`,
    item.knownRansomwareCampaignUse === "Known" && "CISA reports known ransomware campaign use.",
  ].filter(Boolean);

  return {
    title,
    summary: details.join(" · ").slice(0, 2000),
    source: "CISA Known Exploited Vulnerabilities",
    severity: item.knownRansomwareCampaignUse === "Known" ? "critical" : "high",
    status: "open",
    reference: `https://nvd.nist.gov/vuln/detail/${cveId}`,
    tags: ["CISA KEV", ...(item.vendorProject ? [String(item.vendorProject).slice(0, 48)] : [])],
    feedMetadata: {
      cveId,
      dateAdded: item.dateAdded || null,
      dueDate: item.dueDate || null,
      ransomwareUse: item.knownRansomwareCampaignUse === "Known",
    },
  };
}

async function fetchKevCatalog() {
  const response = await fetch(cisaKevUrl, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { accept: "application/json", "user-agent": "fivezero2-threat-intel/1.0" },
  });
  if (!response.ok) throw new Error(`CISA feed returned HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxFeedBytes) throw new Error("CISA feed exceeded the allowed response size");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxFeedBytes) throw new Error("CISA feed exceeded the allowed response size");

  let catalog;
  try {
    catalog = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("CISA feed returned invalid JSON");
  }
  if (!catalog || !Array.isArray(catalog.vulnerabilities)) {
    throw new Error("CISA feed did not contain a vulnerabilities list");
  }

  return catalog.vulnerabilities
    .map(normalizeKevEntry)
    .filter(Boolean)
    .sort((a, b) => String(b.feedMetadata.dateAdded || "").localeCompare(String(a.feedMetadata.dateAdded || "")))
    .slice(0, maxImportItems);
}

export function createFeedsRouter(auth) {
  const router = Router();

  router.get("/status", auth, (req, res) => {
    const records = read((state) =>
      (state.moduleRecords || []).filter(
        (record) => sameWorkspace(record, req.workspaceId) && record.module === "feeds" && record.feedMetadata?.cveId,
      ),
    );
    const mostRecent = records.reduce((latest, record) => {
      const timestamp = Date.parse(record.lastSeenAt || record.createdAt || "");
      return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
    }, 0);
    res.json({
      source: "CISA Known Exploited Vulnerabilities",
      url: cisaKevUrl,
      records: records.length,
      lastSyncAt: mostRecent ? new Date(mostRecent).toISOString() : null,
    });
  });

  router.post(
    "/sync",
    auth,
    roleGuard("owner", "admin", "analyst"),
    async (req, res) => {
      let imported;
      try {
        imported = await fetchKevCatalog();
      } catch (error) {
        return res.status(502).json({ error: `Could not refresh the CISA feed: ${error.message}` });
      }

      const result = await write((state) => {
        state.moduleRecords ||= [];
        let created = 0;
        let updated = 0;
        const timestamp = now();

        for (const entry of imported) {
          const existing = state.moduleRecords.find(
            (record) =>
              sameWorkspace(record, req.workspaceId) &&
              record.module === "feeds" &&
              record.feedMetadata?.cveId === entry.feedMetadata.cveId,
          );
          if (existing) {
            Object.assign(existing, {
              title: entry.title,
              summary: entry.summary,
              severity: entry.severity,
              reference: entry.reference,
              tags: entry.tags,
              feedMetadata: entry.feedMetadata,
              lastSeenAt: timestamp,
              updatedAt: timestamp,
            });
            updated += 1;
          } else {
            state.moduleRecords.unshift({
              id: id(),
              workspaceId: req.workspaceId,
              module: "feeds",
              ...entry,
              createdBy: req.user.id,
              createdAt: timestamp,
              updatedAt: timestamp,
              lastSeenAt: timestamp,
            });
            created += 1;
          }
        }

        state.moduleRecords = state.moduleRecords.slice(0, 10000);
        state.audit.unshift({
          id: id(),
          workspaceId: req.workspaceId,
          userId: req.user.id,
          action: "feed.cisa_kev.sync",
          detail: `created=${created}, updated=${updated}`,
          at: timestamp,
        });
        state.audit = state.audit.slice(0, 1000);
        return { created, updated, imported: imported.length, syncedAt: timestamp };
      });

      res.json({ source: "CISA Known Exploited Vulnerabilities", ...result });
    },
  );

  return router;
}

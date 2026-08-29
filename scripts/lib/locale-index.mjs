import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { factsDigest } from "./locale-digest.mjs";
import { validateEnglishOverlay } from "./locale-overlay.mjs";
import { localeArchivePath, localeStatusPath } from "./bilingual-publisher.mjs";

const dataRoot = resolve("public/data");

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function unavailableReason(code, errors = []) {
  if (code === "overlay-missing") return "English version has not been prepared for this edition.";
  if (code === "overlay-stale") return "English version is temporarily unavailable because its verified fact boundary is stale.";
  return `English version is temporarily unavailable because locale validation failed${errors.length ? `: ${errors.join("; ")}` : "."}`;
}

async function persistedUnavailableStatus(item, digest) {
  const statusFile = resolve(dataRoot, localeStatusPath(item.id));
  if (!(await exists(statusFile))) return null;
  try {
    const status = JSON.parse(await readFile(statusFile, "utf8"));
    if (
      status?.schemaVersion !== 1 ||
      status?.locale !== "en" ||
      status?.editionId !== item.id ||
      typeof status?.reasonCode !== "string" ||
      typeof status?.summary !== "string" ||
      typeof status?.observedAt !== "string"
    ) {
      return { invalid: true, reasonCode: "status-invalid", summary: "Persisted English availability status is invalid." };
    }
    if (status.factsDigest !== digest) {
      return { invalid: true, reasonCode: "status-stale", summary: "Persisted English availability status is stale for current canonical facts." };
    }
    return status;
  } catch (error) {
    return {
      invalid: true,
      reasonCode: "status-invalid-json",
      summary: `Persisted English availability status is unreadable: ${error instanceof Error ? error.message : "invalid JSON"}`,
    };
  }
}

export async function buildEnglishLocaleIndex({ write = true } = {}) {
  const manifest = JSON.parse(await readFile(resolve(dataRoot, "manifest.json"), "utf8"));
  const editions = [];
  let latestAvailableEditionId = null;
  for (const item of manifest.editions ?? []) {
    const canonical = JSON.parse(await readFile(resolve(dataRoot, item.path), "utf8"));
    const digest = factsDigest(canonical);
    const relativePath = localeArchivePath(item.id);
    const overlayFile = resolve(dataRoot, relativePath);
    if (!(await exists(overlayFile))) {
      const persisted = await persistedUnavailableStatus(item, digest);
      if (persisted?.invalid) {
        editions.push({
          editionId: item.id,
          status: "unavailable",
          reasonCode: persisted.reasonCode,
          summary: persisted.summary,
          observedAt: manifest.updatedAt,
          factsDigest: digest,
        });
      } else if (persisted) {
        editions.push({
          editionId: item.id,
          status: "unavailable",
          reasonCode: persisted.reasonCode,
          summary: persisted.summary,
          observedAt: persisted.observedAt,
          factsDigest: digest,
        });
      } else {
        editions.push({
          editionId: item.id,
          status: "unavailable",
          reasonCode: "overlay-missing",
          summary: unavailableReason("overlay-missing"),
          observedAt: manifest.updatedAt,
          factsDigest: digest,
        });
      }
      continue;
    }
    let overlay;
    try {
      overlay = JSON.parse(await readFile(overlayFile, "utf8"));
    } catch (error) {
      editions.push({
        editionId: item.id,
        status: "unavailable",
        reasonCode: "overlay-invalid-json",
        summary: unavailableReason("overlay-invalid", [error instanceof Error ? error.message : "invalid JSON"]),
        observedAt: manifest.updatedAt,
        factsDigest: digest,
      });
      continue;
    }
    const validation = validateEnglishOverlay(canonical, overlay);
    if (!validation.valid) {
      const stale = validation.errors.some((message) => message.includes("factsDigest is stale"));
      editions.push({
        editionId: item.id,
        status: "unavailable",
        reasonCode: stale ? "overlay-stale" : "overlay-invalid",
        summary: unavailableReason(stale ? "overlay-stale" : "overlay-invalid", validation.errors),
        observedAt: manifest.updatedAt,
        factsDigest: digest,
      });
      continue;
    }
    editions.push({
      editionId: item.id,
      path: relativePath,
      archiveTitle: overlay.archiveTitle,
      factsDigest: digest,
      status: "available",
    });
    latestAvailableEditionId = item.id;
  }
  const index = {
    schemaVersion: 1,
    locale: "en",
    updatedAt: manifest.updatedAt,
    latestCanonicalEditionId: manifest.latest,
    latestAvailableEditionId,
    editions,
  };
  if (write) {
    const target = resolve(dataRoot, "locales/en/index.json");
    await mkdir(resolve(dataRoot, "locales/en"), { recursive: true });
    await writeFile(target, JSON.stringify(index, null, 2) + "\n", "utf8");
  }
  return index;
}

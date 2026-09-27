import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const allowedStatuses = new Set(["official_simplified", "official_traditional", "common_translation"]);

export function applySecondaryTitlePatch(registry, request) {
  if (request?.schemaVersion !== 1 || request?.kind !== "title_backfill") throw new Error("title backfill request must use schemaVersion=1 and kind=title_backfill");
  if (!request.translations || typeof request.translations !== "object" || Array.isArray(request.translations)) throw new Error("title backfill request requires translations");
  const current = registry?.translations || {};
  const next = { ...current };
  let added = 0;

  for (const [key, entry] of Object.entries(request.translations)) {
    if (!key.trim() || !entry?.titleZhCn?.trim() || !allowedStatuses.has(entry?.titleZhStatus)) throw new Error(`invalid title patch entry: ${key}`);
    if (!entry.evidence?.kind) throw new Error(`title patch entry requires evidence: ${key}`);
    const existing = current[key];
    if (existing) {
      if (existing.titleZhCn !== entry.titleZhCn || existing.titleZhStatus !== entry.titleZhStatus) throw new Error(`title patch conflicts with existing registry entry: ${key}`);
      continue;
    }
    next[key] = entry;
    added += 1;
  }

  return {
    registry: {
      ...registry,
      updatedAt: request.updatedAt || registry.updatedAt,
      translations: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b, "en"))),
    },
    added,
  };
}

async function main() {
  const [requestPath, registryPath = "config/title-translations.json"] = process.argv.slice(2);
  if (!requestPath) throw new Error("usage: node scripts/apply-secondary-title-patch.mjs <request> [registry]");
  const [request, registry] = await Promise.all([
    readFile(requestPath, "utf8").then(JSON.parse),
    readFile(registryPath, "utf8").then(JSON.parse),
  ]);
  const result = applySecondaryTitlePatch(registry, request);
  await writeFile(registryPath, JSON.stringify(result.registry, null, 2) + "\n");
  console.log(`Secondary title patch: added=${result.added}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// This adapter selects an existing canonical target; it never edits content or media.
export function validateSecondaryMediaRequest(request, { manifest, readArchive }) {
  if (request?.schemaVersion !== 1 || request?.kind !== "media_repair") throw new Error("media repair requires schemaVersion=1 and kind=media_repair");
  const allowed = new Set(["schemaVersion", "kind", "editionId", "recordId"]);
  if (Object.keys(request).some((key) => !allowed.has(key))) throw new Error("unexpected media repair request field");
  const match = typeof request.editionId === "string" && /^(\d{4}-\d{2}-\d{2})-(am|pm|daily)$/.exec(request.editionId);
  if (!match || match[0] !== request.editionId || !Number.isFinite(Date.parse(`${match[1]}T00:00:00Z`)) || new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) throw new Error("invalid edition identity/date");
  const [, date, period] = match;
  const archivePath = `archive/${date.slice(0, 4)}/${date.slice(5, 7)}/${request.editionId}.json`;
  const matches = manifest?.editions?.filter((item) => item.id === request.editionId) || [];
  if (matches.length !== 1) throw new Error("media repair requires an existing unique manifest edition");
  const item = matches[0];
  if (item.date !== date || item.period !== period || item.path !== archivePath) throw new Error("manifest edition identity/path mismatch");
  const archive = readArchive(archivePath);
  if (archive?.id !== request.editionId || archive.date !== date || archive.period !== period || archive.issueNumber !== item.issueNumber) throw new Error("archive edition identity mismatch");
  if (Object.hasOwn(request, "recordId")) {
    if (typeof request.recordId !== "string" || (!request.recordId || /[^A-Za-z0-9_-]/.test(request.recordId))) throw new Error("invalid recordId");
    if (archive.upcoming?.filter((record) => record.id === request.recordId).length !== 1) throw new Error("recordId must identify an existing unique upcoming record in the target edition");
  }
  return { editionId: request.editionId, recordId: request.recordId || "" };
}

function main() {
  const [requestPath] = process.argv.slice(2);
  if (!requestPath) throw new Error("usage: node scripts/validate-secondary-media-request.mjs <request>");
  const result = validateSecondaryMediaRequest(JSON.parse(readFileSync(requestPath, "utf8")), {
    manifest: JSON.parse(readFileSync("public/data/manifest.json", "utf8")),
    readArchive: (path) => JSON.parse(readFileSync(`public/data/${path}`, "utf8")),
  });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `edition=${result.editionId}\nrecord=${result.recordId}\n`);
  console.log(`Validated media repair target: ${result.editionId}${result.recordId ? ` / ${result.recordId}` : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

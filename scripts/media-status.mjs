import fs from "node:fs";
import { pathToFileURL } from "node:url";

function hasVerifiedEditorialMedia(entry) {
  return entry?.image_status === "verified"
    || (Array.isArray(entry?.images) && entry.images.length > 0);
}

function hasVerifiedCover(item) {
  return item?.cover_status === "verified" || Boolean(item?.cover);
}

export function summarizeEditionMedia(edition) {
  const entries = Array.isArray(edition?.entries) ? edition.entries : [];
  const upcoming = Array.isArray(edition?.upcoming) ? edition.upcoming : [];
  const statuses = [
    ...entries.map((entry) => hasVerifiedEditorialMedia(entry)),
    ...upcoming.map((item) => hasVerifiedCover(item)),
  ];

  const verified = statuses.filter(Boolean).length;
  const unresolved = statuses.length - verified;
  const status = unresolved === 0 && statuses.length > 0
    ? "available"
    : verified > 0
      ? "partial"
      : "unavailable";

  return {
    status,
    verified,
    unresolved,
    total: statuses.length,
    reason: `verified-${verified}-unresolved-${unresolved}`,
  };
}

function main() {
  const [editionPath] = process.argv.slice(2);
  if (!editionPath) {
    console.error("Usage: node scripts/media-status.mjs <edition.json>");
    process.exit(1);
  }
  const edition = JSON.parse(fs.readFileSync(editionPath, "utf8"));
  const result = summarizeEditionMedia(edition);
  console.log(`${result.status}|${result.reason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

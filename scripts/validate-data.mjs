import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const dataRoot = resolve("public/data");
const errors = [];

function hasValidImage(asset, kind) {
  if (!asset || typeof asset !== "object" || asset.placeholder === true) return false;
  const remote = /^https:\/\//.test(asset.url ?? "");
  const local = /^media\/briefs\/\d{4}\/\d{2}\/[^/]+\/.+\.(avif|jpe?g|png|webp)$/i.test(
    asset.url ?? "",
  );
  return (
    (remote || local) &&
    asset.kind === kind &&
    typeof asset.alt === "string" &&
    asset.alt.trim().length > 0 &&
    typeof asset.credit === "string" &&
    asset.credit.trim().length > 0 &&
    /^https:\/\//.test(asset.sourceUrl ?? "")
  );
}


async function readJson(path) {
  try {
    return JSON.parse(await readFile(resolve(dataRoot, path), "utf8"));
  } catch (error) {
    errors.push(`${path}: ${error.message}`);
    return null;
  }
}

function validateEdition(edition, path) {
  if (!edition || typeof edition !== "object" || Array.isArray(edition)) {
    errors.push(`${path}: edition must be an object`);
    return;
  }

  if (!new Set([1, 2]).has(edition.schemaVersion)) {
    errors.push(`${path}: schemaVersion must be 1 or 2`);
  }
  if (edition.id !== `${edition.date}-${edition.period}`) {
    errors.push(`${path}: id must match date and period`);
  }
  if (!Number.isInteger(edition.issueNumber) || edition.issueNumber < 1) {
    errors.push(`${path}: issueNumber must be a positive integer`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(edition.date ?? "")) {
    errors.push(`${path}: date must use YYYY-MM-DD`);
  }
  if (!new Set(["am", "pm"]).has(edition.period)) {
    errors.push(`${path}: period must be am or pm`);
  }
  if (edition.timezone !== "Asia/Shanghai") {
    errors.push(`${path}: timezone must be Asia/Shanghai`);
  }
  if (!Array.isArray(edition.entries)) {
    errors.push(`${path}: entries must be an array`);
    return;
  }

  const requiresImages = edition.schemaVersion === 2;
  const ids = new Set();
  for (const entry of edition.entries) {
    if (!entry?.id) {
      errors.push(`${path}: every entry needs an id`);
      continue;
    }
    if (ids.has(entry.id)) errors.push(`${path}: duplicate entry id ${entry.id}`);
    ids.add(entry.id);
    if (
      entry.fact_status === "official" &&
      !entry.sources?.some((source) => source.kind === "primary")
    ) {
      errors.push(`${path}: official entry ${entry.id} needs a primary source`);
    }
    if (
      requiresImages &&
      (!Array.isArray(entry.images) ||
        !entry.images.some((asset) => hasValidImage(asset, "editorial")))
    ) {
      errors.push(`${path}: entry ${entry.id} needs a non-placeholder editorial image`);
    }
  }

  if (requiresImages && !Array.isArray(edition.upcoming)) {
    errors.push(`${path}: upcoming must be an array`);
  } else if (requiresImages) {
    for (const item of edition.upcoming) {
      if (!hasValidImage(item.cover, "cover")) {
        errors.push(`${path}: upcoming ${item.id} needs a cover image`);
      }
    }
  }

  if (
    !edition.sourceReport ||
    !Array.isArray(edition.sourceReport.checked) ||
    !Array.isArray(edition.sourceReport.limited) ||
    typeof edition.sourceReport.note !== "string"
  ) {
    errors.push(`${path}: sourceReport is required`);
  }
}

const manifest = await readJson("manifest.json");
const latest = await readJson("latest.json");
if (latest) validateEdition(latest, "latest.json");

if (manifest) {
  if (manifest.schemaVersion !== 1) errors.push("manifest.json: schemaVersion must be 1");
  if (!Array.isArray(manifest.editions) || manifest.editions.length === 0) {
    errors.push("manifest.json: editions must be a non-empty array");
  } else {
    const seen = new Set();
    let previousIssue = null;

    for (const item of manifest.editions) {
      if (seen.has(item.id)) errors.push(`manifest.json: duplicate id ${item.id}`);
      seen.add(item.id);
      if (!/^archive\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-(am|pm)\.json$/.test(item.path ?? "")) {
        errors.push(`manifest.json: invalid archive path for ${item.id}`);
        continue;
      }
      if (previousIssue !== null && item.issueNumber !== previousIssue + 1) {
        errors.push(`manifest.json: issue ${item.issueNumber} is not continuous`);
      }
      previousIssue = item.issueNumber;

      const archived = await readJson(item.path);
      if (archived) {
        validateEdition(archived, item.path);
        if (archived.id !== item.id || archived.issueNumber !== item.issueNumber) {
          errors.push(`manifest.json: metadata mismatch for ${item.id}`);
        }
      }
    }

    const latestItem = manifest.editions.at(-1);
    if (manifest.latest !== latestItem.id) {
      errors.push("manifest.json: latest must reference the final edition");
    }
    if (latest && JSON.stringify(latest) !== JSON.stringify(await readJson(latestItem.path))) {
      errors.push("latest.json must match the latest archived edition");
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${manifest.editions.length} archived edition(s).`);

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const dataRoot = resolve("public/data");
const errors = [];
const mediaFiles = new Map();

function hasValidImage(asset, kind) {
  if (!asset || typeof asset !== "object" || asset.placeholder === true) return false;
  const remote = /^https:\/\//.test(asset.url ?? "");
  const local = /^media\/briefs\/\d{4}\/\d{2}\/[^/]+\/.+\.(avif|jpe?g|png|webp)$/i.test(
    asset.url ?? "",
  );
  const validAspect = asset.aspect === undefined ||
    new Set(["square", "portrait", "landscape"]).has(asset.aspect);
  return (
    (remote || local) &&
    asset.kind === kind &&
    typeof asset.alt === "string" &&
    asset.alt.trim().length > 0 &&
    typeof asset.credit === "string" &&
    asset.credit.trim().length > 0 &&
    /^https:\/\//.test(asset.sourceUrl ?? "") &&
    validAspect
  );
}

function trackLocalMedia(asset, context) {
  if (/^media\/briefs\/\d{4}\/\d{2}\/[^/]+\/.+\.(avif|jpe?g|png|webp)$/i.test(asset?.url ?? "")) {
    mediaFiles.set(asset.url, context);
  }
}

function hasValidArchiveTitle(title, period) {
  const prefix = period === "am" ? "早报｜" : "晚报｜";
  return (
    typeof title === "string" &&
    title.trim().startsWith(prefix) &&
    [...title.trim()].length >= 8 &&
    [...title.trim()].length <= 40
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
    for (const asset of entry.images || []) trackLocalMedia(asset, `${path}: entry ${entry.id}`);
    if (
      entry.fact_status === "official" &&
      !entry.sources?.some((source) => source.kind === "primary")
    ) {
      errors.push(`${path}: official entry ${entry.id} needs a primary source`);
    }
    if (requiresImages) {
      const hasImage =
        Array.isArray(entry.images) &&
        entry.images.some((asset) => hasValidImage(asset, "editorial"));
      const explainsAbsence =
        entry.image_status === "unavailable" &&
        typeof entry.imageNote === "string" &&
        entry.imageNote.trim().length > 0;

      if (!hasImage && !explainsAbsence) {
        errors.push(
          `${path}: entry ${entry.id} needs an editorial image or an unavailable reason`,
        );
      }
    }
  }

  if (edition.schemaVersion === 2) {
    if (!hasValidArchiveTitle(edition.archiveTitle, edition.period)) {
      errors.push(
        `${path}: archiveTitle must match the edition period and contain 8–40 characters`,
      );
    }
    if (
      typeof edition.leadEntryId !== "string" ||
      !ids.has(edition.leadEntryId)
    ) {
      errors.push(`${path}: leadEntryId must reference an entry in this edition`);
    }
  }

  if (requiresImages && !Array.isArray(edition.upcoming)) {
    errors.push(`${path}: upcoming must be an array`);
  } else if (requiresImages) {
    for (const item of edition.upcoming) {
      trackLocalMedia(item.cover, `${path}: upcoming ${item.id}`);
      const explainsAbsence =
        item.cover_status === "unavailable" &&
        typeof item.coverNote === "string" &&
        item.coverNote.trim().length > 0;

      if (!hasValidImage(item.cover, "cover") && !explainsAbsence) {
        errors.push(
          `${path}: upcoming ${item.id} needs a cover or an unavailable reason`,
        );
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
      if (!hasValidArchiveTitle(item.archiveTitle, item.period)) {
        errors.push(`manifest.json: invalid archiveTitle for ${item.id}`);
      }
      if (typeof item.leadEntryId !== "string" || item.leadEntryId.length === 0) {
        errors.push(`manifest.json: missing leadEntryId for ${item.id}`);
      }
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
        if (!archived.entries.some((entry) => entry.id === item.leadEntryId)) {
          errors.push(`manifest.json: leadEntryId is not in archive ${item.id}`);
        }
        if (
          archived.schemaVersion === 2 &&
          (archived.archiveTitle !== item.archiveTitle ||
            archived.leadEntryId !== item.leadEntryId)
        ) {
          errors.push(`manifest.json: archive title metadata mismatch for ${item.id}`);
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

for (const [url, context] of mediaFiles) {
  try {
    const info = await stat(resolve("public", url));
    if (!info.isFile()) errors.push(`${context}: media path is not a file: ${url}`);
    if (info.size > 500 * 1024) {
      errors.push(`${context}: media exceeds 500 KB: ${url}`);
    }
  } catch (error) {
    errors.push(`${context}: missing local media ${url}: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${manifest.editions.length} archived edition(s).`);

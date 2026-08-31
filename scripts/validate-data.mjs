import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { archiveTitlePrefix, expectedEditorialWindow, isEditionPeriod } from "./lib/edition-window.mjs";
import { verifiedWindowTimeError } from "./lib/time-window.mjs";

const dataRoot = resolve("public/data");
const errors = [];
const warnings = [];
const mediaFiles = new Map();
const factStatuses = new Set([
  "official",
  "media_relay_official",
  "media_report",
  "multi_source_verified",
  "unconfirmed",
]);
const timeStatuses = new Set(["verified", "date_only", "time_unverified", "uncertain"]);
const sections = new Set([
  "releases",
  "reviews",
  "news",
  "industry",
  "features",
  "rumors",
  "observations",
]);
const titleZhStatuses = new Set([
  "official_simplified",
  "official_traditional",
  "common_translation",
  "unavailable",
]);
const entryFlags = new Set([
  "supplement",
  "rumor",
  "time_uncertain",
  "platform_difference",
  "region_difference",
]);
const sourceKinds = new Set(["primary", "secondary", "discovery"]);

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
  if (!isEditionPeriod(period)) return false;
  const prefix = archiveTitlePrefix(period);
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

function sourceHost(source) {
  try {
    return new URL(source.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function validateSource(source, context) {
  if (!source || typeof source !== "object") {
    errors.push(`${context}: source must be an object`);
    return;
  }
  if (typeof source.label !== "string" || source.label.trim().length === 0) {
    errors.push(`${context}: source needs a label`);
  }
  if (!/^https:\/\//.test(source.url ?? "")) {
    errors.push(`${context}: source URL must use HTTPS`);
  }
  if (!sourceKinds.has(source.kind)) {
    errors.push(`${context}: invalid source kind ${source.kind}`);
  }
}

function validateTitle(title, context) {
  if (!title || typeof title !== "object") {
    errors.push(`${context}: title is required`);
    return;
  }
  if (typeof title.title_key !== "string" || title.title_key.trim().length === 0) {
    errors.push(`${context}: title_key is required`);
  }
  if (!title.title_en && !title.title_zh_cn && !title.title_ja) {
    errors.push(`${context}: title needs at least one displayed language name`);
  }
  if (!titleZhStatuses.has(title.title_zh_status)) {
    errors.push(`${context}: invalid title_zh_status ${title.title_zh_status}`);
  }
  if (title.title_zh_status === "unavailable" && title.title_zh_cn) {
    errors.push(`${context}: unavailable Chinese title must not include title_zh_cn`);
  }
  if (title.title_zh_status !== "unavailable" &&
      (typeof title.title_zh_cn !== "string" || title.title_zh_cn.trim().length === 0)) {
    errors.push(`${context}: ${title.title_zh_status} requires title_zh_cn`);
  }
}

function upcomingTimestamp(editionDate, value) {
  if (!/^\d{2}\.\d{2}$/.test(value ?? "")) return NaN;
  const [month, day] = value.split(".").map(Number);
  const baseYear = Number(editionDate.slice(0, 4));
  const baseMonth = Number(editionDate.slice(5, 7));
  const year = month < baseMonth ? baseYear + 1 : baseYear;
  return Date.UTC(year, month - 1, day);
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
  if (!isEditionPeriod(edition.period)) {
    errors.push(`${path}: period must be am, pm, or daily`);
  }
  if (edition.timezone !== "Asia/Shanghai") {
    errors.push(`${path}: timezone must be Asia/Shanghai`);
  }
  const expectedWindow = expectedEditorialWindow(edition.id);
  if (!expectedWindow) {
    errors.push(`${path}: edition id does not resolve to a supported fixed window`);
  } else {
    for (const key of ["plannedAt", "windowStart", "windowEnd"]) {
      if (edition[key] !== expectedWindow[key]) errors.push(`${path}: ${key} does not match the fixed ${edition.period} window`);
    }
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
    const context = `${path}: entry ${entry.id}`;
    if (!sections.has(entry.section)) errors.push(`${context}: invalid section ${entry.section}`);
    if (!factStatuses.has(entry.fact_status)) {
      errors.push(`${context}: invalid fact_status ${entry.fact_status}`);
    }
    if (!timeStatuses.has(entry.time_status)) {
      errors.push(`${context}: invalid time_status ${entry.time_status}`);
    }
    if (!Array.isArray(entry.entry_flags) ||
        entry.entry_flags.some((flag) => !entryFlags.has(flag))) {
      errors.push(`${context}: invalid entry_flags`);
    }
    validateTitle(entry.title, context);
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
      errors.push(`${context}: at least one source is required`);
    } else {
      entry.sources.forEach((source, index) => validateSource(source, `${context}: source ${index}`));
    }
    for (const asset of entry.images || []) trackLocalMedia(asset, `${path}: entry ${entry.id}`);
    if (
      entry.fact_status === "official" &&
      !entry.sources?.some((source) => source.kind === "primary")
    ) {
      errors.push(`${path}: official entry ${entry.id} needs a primary source`);
    }
    if (entry.fact_status === "multi_source_verified") {
      const independentHosts = new Set((entry.sources || []).map(sourceHost).filter(Boolean));
      if (independentHosts.size < 2) {
        errors.push(`${context}: multi_source_verified needs two independent source hosts`);
      }
    }
    if (entry.fact_status === "unconfirmed" && entry.tracking !== true) {
      errors.push(`${context}: unconfirmed entries must remain tracking:true`);
    }
    if (entry.time_status === "verified" && !entry.entry_flags?.includes("supplement")) {
      const timeError = verifiedWindowTimeError({
        beijingTime: entry.beijingTime,
        timeEvidenceAt: entry.timeEvidenceAt,
        windowStart: edition.windowStart,
        windowEnd: edition.windowEnd,
      });
      if (timeError) errors.push(`${context}: ${timeError}`);
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
    const editionDay = Date.parse(`${edition.date}T00:00:00Z`);
    const upcomingStart = editionDay + 24 * 60 * 60 * 1000;
    const upcomingEnd = editionDay + 15 * 24 * 60 * 60 * 1000;
    for (const item of edition.upcoming) {
      const context = `${path}: upcoming ${item.id}`;
      validateTitle(item.title, context);
      validateSource(item.source, `${context}: source`);
      const releaseDays = String(item.date || "").split(/[／/、,]/).map((value) =>
        upcomingTimestamp(edition.date, value.trim()),
      );
      if (!releaseDays.length || releaseDays.some((releaseDay) =>
        !Number.isFinite(releaseDay) || releaseDay < upcomingStart || releaseDay > upcomingEnd
      )) {
        errors.push(`${context}: date must fall in the next-15-day window`);
      }
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
  const strictAudit = edition.plannedAt >= "2026-08-26 00:00";
  if (strictAudit) {
    for (const key of [
      "checkedGroups",
      "trackingResults",
      "excludedMajorCandidates",
      "limitedSources",
    ]) {
      if (!Array.isArray(edition.sourceReport?.[key])) {
        errors.push(`${path}: sourceReport.${key} must be an array`);
      }
    }
    if (!edition.sourceReport?.auditStats || typeof edition.sourceReport.auditStats !== "object") {
      errors.push(`${path}: sourceReport.auditStats is required`);
    }
    if (edition.plannedAt >= "2026-08-27 00:00" &&
        edition.sourceReport?.auditStats?.discoveryQueries > 14) {
      errors.push(`${path}: discoveryQueries exceeds the hard limit of 14`);
    } else if (edition.sourceReport?.auditStats?.discoveryQueries > 14) {
      warnings.push(`${path}: historical discoveryQueries exceeded 14`);
    }
    if (!Array.isArray(edition.tracking) || edition.tracking.length !== 0) {
      errors.push(`${path}: top-level tracking must remain an empty compatibility array`);
    }
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
      if (!isEditionPeriod(item.period)) errors.push(`manifest.json: invalid period for ${item.id}`);
      if (!hasValidArchiveTitle(item.archiveTitle, item.period)) {
        errors.push(`manifest.json: invalid archiveTitle for ${item.id}`);
      }
      if (typeof item.leadEntryId !== "string" || item.leadEntryId.length === 0) {
        errors.push(`manifest.json: missing leadEntryId for ${item.id}`);
      }
      if (!/^archive\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-(am|pm|daily)\.json$/.test(item.path ?? "")) {
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
    const latestArchive = await readJson(latestItem.path);
    if (latest && JSON.stringify(latest) !== JSON.stringify(latestArchive)) {
      errors.push("latest.json must match the latest archived edition");
    }
    if (latest) {
      const [latestText, archiveText] = await Promise.all([
        readFile(resolve(dataRoot, "latest.json"), "utf8"),
        readFile(resolve(dataRoot, latestItem.path), "utf8"),
      ]);
      if (latestText !== archiveText) {
        errors.push("latest.json must be byte-identical to the latest archived edition");
      }
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

if (warnings.length > 0) {
  console.warn(warnings.map((warning) => `- warning: ${warning}`).join("\n"));
}

console.log(`Validated ${manifest.editions.length} archived edition(s).`);

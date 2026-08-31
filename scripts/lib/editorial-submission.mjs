import { validateEditorialOutput } from "./editorial-contract.mjs";
import { validateFinalizedEditorialPacket } from "./editorial-packet.mjs";

const editionPattern = /^\d{4}-\d{2}-\d{2}-(?:am|pm|daily)$/;

function isHttps(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function editionPeriod(editionId) {
  return String(editionId || "").split("-").at(-1) || "";
}

function archivePrefix(period) {
  if (period === "am") return "早报｜";
  if (period === "pm") return "晚报｜";
  return "日报｜";
}

export function validateEditorialSubmission({ branchName, packet, editorial, packetBlobSha, publicationMode = "publish" }) {
  const errors = [];
  const branchMatch = String(branchName || "").match(/^automation\/editorial\/(\d{4}-\d{2}-\d{2}-(?:am|pm|daily))$/);
  if (!branchMatch) return ["branch must be automation/editorial/<YYYY-MM-DD-am|pm|daily>"];
  const editionId = branchMatch[1];
  const period = editionPeriod(editionId);
  const input = packet?.editorialInput;
  errors.push(...validateFinalizedEditorialPacket(packet, { editionId, period }));
  if (!input?.window || !Array.isArray(input.packages)) errors.push("packet.editorialInput is invalid");
  if (input?.window?.id !== editionId) errors.push("packet window does not match the submission branch");
  const cutoffAt = Date.parse(`${input?.window?.windowEnd?.replace(" ", "T")}:00+08:00`);
  const finalizedAt = Date.parse(packet?.finalizedAt);
  if (!Number.isFinite(cutoffAt) || !Number.isFinite(finalizedAt) || finalizedAt < cutoffAt) {
    errors.push("packet was not finalized at or after the fixed cutoff");
  }
  if (packet?.coverageThrough !== input?.window?.windowEnd) {
    errors.push("packet coverage does not reach the fixed cutoff");
  }
  if (!editionPattern.test(editorial?.editionId || "") || editorial?.editionId !== editionId) {
    errors.push("editorial editionId does not match the submission branch");
  }
  const strictNormalSubmission = publicationMode !== "locale-repair";
  if (strictNormalSubmission) {
    if (editorial?.contractVersion !== 2) errors.push("normal editorial submission must use contractVersion 2");
    if (!/^[0-9a-f]{40}$/u.test(String(editorial?.packetBlobSha || ""))) errors.push("normal editorial submission requires packetBlobSha");
    if (editorial?.packetBlobSha !== packetBlobSha) errors.push("editorial packetBlobSha does not match the restored packet blob");
  }
  const prefix = archivePrefix(period);
  if (typeof editorial?.archiveTitle !== "string" || !editorial.archiveTitle.startsWith(prefix)) {
    errors.push(`archiveTitle must start with ${prefix}`);
  }
  for (const key of ["decisions", "removeUpcomingIds", "upcoming", "checkedExtra", "limitedExtra"]) {
    if (!Array.isArray(editorial?.[key])) errors.push(`${key} must be an array`);
  }
  const expectedMode = period === "pm" ? "inherit_and_patch" : "replace";
  if (editorial?.upcomingMode !== expectedMode) errors.push(`upcomingMode must be ${expectedMode}`);
  if (typeof editorial?.editorialNote !== "string" || !editorial.editorialNote.trim()) {
    errors.push("editorialNote is required");
  }
  for (const [index, decision] of (editorial?.decisions || []).entries()) {
    if (!Array.isArray(decision.sourceIndexes)) errors.push(`decisions[${index}].sourceIndexes must be an array`);
    if (!Array.isArray(decision.additionalSources)) errors.push(`decisions[${index}].additionalSources must be an array`);
    if (!Array.isArray(decision.entryFlags)) errors.push(`decisions[${index}].entryFlags must be an array`);
    if (!Array.isArray(decision.platforms)) errors.push(`decisions[${index}].platforms must be an array`);
    for (const [sourceIndex, source] of (decision.additionalSources || []).entries()) {
      if (!isHttps(source?.url)) errors.push(`decisions[${index}].additionalSources[${sourceIndex}] must use HTTPS`);
    }
  }
  if (input?.packages && strictNormalSubmission) {
    try { errors.push(...validateEditorialOutput(editorial, input)); }
    catch (error) { errors.push(`editorial evidence validation threw: ${error.message}`); }
  }
  const lead = (editorial?.decisions || []).find((item) =>
    item.eventKey === editorial?.leadEventKey && item.decision === "include"
  );
  if (!lead) errors.push("leadEventKey must reference an included decision");
  return [...new Set(errors)];
}

export function assertEditorialSubmission(value) {
  const errors = validateEditorialSubmission(value);
  if (errors.length) throw new Error(`Editorial submission is invalid:\n- ${errors.join("\n- ")}`);
}

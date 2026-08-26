import { validateEditorialOutput } from "./editorial-contract.mjs";

const editionPattern = /^\d{4}-\d{2}-\d{2}-(?:am|pm)$/;

function isHttps(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function validateEditorialSubmission({ branchName, packet, editorial }) {
  const errors = [];
  const branchMatch = String(branchName || "").match(/^automation\/editorial\/(\d{4}-\d{2}-\d{2}-(?:am|pm))$/);
  if (!branchMatch) return ["branch must be automation/editorial/<YYYY-MM-DD-am|pm>"];
  const editionId = branchMatch[1];
  const input = packet?.editorialInput;
  if (!input?.window || !Array.isArray(input.packages)) errors.push("packet.editorialInput is invalid");
  if (input?.window?.id !== editionId) errors.push("packet window does not match the submission branch");
  if (!editionPattern.test(editorial?.editionId || "") || editorial?.editionId !== editionId) {
    errors.push("editorial editionId does not match the submission branch");
  }
  const prefix = editionId.endsWith("-am") ? "早报｜" : "晚报｜";
  if (typeof editorial?.archiveTitle !== "string" || !editorial.archiveTitle.startsWith(prefix)) {
    errors.push(`archiveTitle must start with ${prefix}`);
  }
  for (const key of ["decisions", "removeUpcomingIds", "upcoming", "checkedExtra", "limitedExtra"]) {
    if (!Array.isArray(editorial?.[key])) errors.push(`${key} must be an array`);
  }
  const expectedMode = editionId.endsWith("-am") ? "replace" : "inherit_and_patch";
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
  if (input?.packages) {
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

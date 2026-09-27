import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { titleIdentity } from "./release-calendar-discovery.mjs";
import { aggregateCalendarLeads } from "./release-calendar-identity.mjs";
import { selectCalendarPacket } from "./release-calendar-packet.mjs";

const DEFAULT_FIXTURE_ROOT = resolve("scripts/fixtures/release-calendar");
const FAILED_STATUSES = new Set(["failed", "partial_failure"]);
const PLATFORM_FAMILIES = ["PC", "PlayStation", "Xbox", "Nintendo"];

const asRows = (value, label) => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};

const asCount = (value, label) => {
  const count = Number(value ?? 0);
  if (!Number.isInteger(count) || count < 0) throw new Error(`${label} must be a non-negative integer`);
  return count;
};

const platformFamily = (platform) => {
  if (/^pc$/i.test(platform)) return "PC";
  if (/^(ps|playstation)/i.test(platform)) return "PlayStation";
  if (/^(xbox|xs)/i.test(platform)) return "Xbox";
  if (/^(nintendo|ns)/i.test(platform)) return "Nintendo";
  return "Unknown";
};

function collectNameDiagnostics(rows, leadKey) {
  const counts = new Map();
  for (const [index, row] of rows.entries()) {
    const key = leadKey(row, index);
    if (!key) throw new Error(`candidate ${index} has no normalized lead name`);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicated = [...counts.values()].filter((count) => count > 1);
  return {
    leadCount: counts.size,
    duplicatedNameCount: duplicated.length,
    duplicatedRows: duplicated.reduce((total, count) => total + count, 0),
    duplicateExtraRows: duplicated.reduce((total, count) => total + count - 1, 0),
  };
}

function collectPlatformCoverage(rows, leadKey) {
  const platforms = new Map();
  const families = new Map(PLATFORM_FAMILIES.map((family) => [family, new Set()]));
  let unknownPlatformRows = 0;
  for (const [index, row] of rows.entries()) {
    const lead = leadKey(row, index);
    if (!lead) throw new Error(`candidate ${index} has no normalized lead name`);
    const values = [...new Set((Array.isArray(row.platforms) ? row.platforms : []).map((platform) => String(platform || "").trim()).filter(Boolean))];
    if (!values.length) unknownPlatformRows++;
    for (const platform of values) {
      const leads = platforms.get(platform) || new Set();
      leads.add(lead);
      platforms.set(platform, leads);
      const family = platformFamily(platform);
      const familyLeads = families.get(family) || new Set();
      familyLeads.add(lead);
      families.set(family, familyLeads);
    }
  }
  return {
    byPlatform: Object.fromEntries([...platforms.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([platform, leads]) => [platform, leads.size])),
    byFamily: Object.fromEntries([...families.entries()].map(([family, leads]) => [family, leads.size])),
    unknownPlatformRows,
  };
}

function collectKindCoverage(rows, leadKey) {
  const byKind = new Map();
  for (const [index, row] of rows.entries()) {
    const kind = String(row.kind || "unknown");
    const entry = byKind.get(kind) || { rows: 0, leads: new Set() };
    entry.rows++;
    entry.leads.add(leadKey(row, index));
    byKind.set(kind, entry);
  }
  return Object.fromEntries([...byKind.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, entry]) => [kind, { rows: entry.rows, leads: entry.leads.size }]));
}

function collectPhaseDiagnostics(coverage, field) {
  let known = 0;
  let unknown = 0;
  let failed = 0;
  let observed = 0;
  for (const entry of coverage) {
    const value = typeof entry[field] === "string" ? entry[field].trim().toLowerCase() : "";
    if (!value || value === "unknown") {
      unknown++;
      continue;
    }
    observed++;
    if (FAILED_STATUSES.has(value)) failed++;
    else known++;
  }
  return { known, unknown, failed: observed ? failed : null };
}

function collectSourceDiagnostics(report, rows) {
  const coverage = asRows(report.coverage || [], "report.coverage");
  const knownSourceIds = new Set(coverage.map((entry) => entry.sourceId).filter(Boolean));
  const hasParsedCount = (entry) => entry.parsedCount !== null && entry.parsedCount !== undefined && entry.parsedCount !== "" && Number.isInteger(Number(entry.parsedCount));
  const candidateSourceUnknown = rows.filter((row) => !row.sourceId || !knownSourceIds.has(row.sourceId)).length;
  return {
    // The historical `status` field is aggregate coverage metadata. It cannot
    // distinguish transport/source failures from parser failures.
    source: collectPhaseDiagnostics(coverage, "sourceStatus"),
    parser: collectPhaseDiagnostics(coverage, "parserStatus"),
    reportStatusFailures: coverage.filter((entry) => FAILED_STATUSES.has(entry.status)).length,
    // `inWindow` is already deduplicated within each source in the saved report;
    // it is not a raw HTML row count.
    reportedInWindowRows: coverage.reduce((total, entry) => total + (Number.isInteger(Number(entry.inWindow)) ? Number(entry.inWindow) : 0), 0),
    candidateSourceUnknown,
    coverage: coverage.map((entry) => ({
      sourceId: entry.sourceId || null,
      platform: entry.platform || null,
      status: entry.status || "unknown",
      sourceStatus: entry.sourceStatus || null,
      parserStatus: entry.parserStatus || null,
      parsedCount: hasParsedCount(entry) ? Number(entry.parsedCount) : null,
      inWindow: Number.isInteger(Number(entry.inWindow)) ? Number(entry.inWindow) : null,
    })),
  };
}

const candidateChars = (rows) => JSON.stringify(rows).length;

export async function loadReplayFixture(edition, fixtureRoot = DEFAULT_FIXTURE_ROOT) {
  const directory = resolve(fixtureRoot, edition);
  const [reportText, packetText, provenanceText] = await Promise.all([
    readFile(resolve(directory, "report.json"), "utf8"),
    readFile(resolve(directory, "packet-calendar.json"), "utf8"),
    readFile(resolve(directory, "provenance.json"), "utf8"),
  ]);
  return { edition, report: JSON.parse(reportText), packet: JSON.parse(packetText), provenance: JSON.parse(provenanceText) };
}

export function replayCalendarBaseline({ report, packet }, { leadKey = (candidate) => titleIdentity(candidate.title) } = {}) {
  const reportRows = asRows(report?.candidates, "report.candidates");
  const packetRows = asRows(packet?.candidates, "packet.candidates");
  const capOmittedRows = asCount(report?.omittedCandidates, "report.omittedCandidates");
  const packetOmittedTotal = asCount(packet?.omittedCandidates, "packet.omittedCandidates");
  if (packetOmittedTotal < capOmittedRows) throw new Error("packet omittedCandidates cannot be below report cap omission");

  const reportAvailableRows = reportRows.length;
  const capBeforeGroups = reportAvailableRows + capOmittedRows;
  const budgetOmittedRows = Math.max(0, reportAvailableRows - packetRows.length);
  const numericReconciliation = reportAvailableRows + capOmittedRows === packetRows.length + packetOmittedTotal;
  const packetLeadDiagnostics = collectNameDiagnostics(packetRows, leadKey);
  const packetCandidateChars = candidateChars(packetRows);
  const sourceDiagnostics = collectSourceDiagnostics(report, reportRows);
  const observations = reportRows.flatMap((row) => (Array.isArray(row.observations) && row.observations.length ? row.observations : [row]).map((observation) => ({
    ...observation,
    knownTitle: observation.knownTitle ?? row.knownTitle,
    inBaseline: observation.inBaseline ?? row.inBaseline,
  })));
  const uniqueTasks = aggregateCalendarLeads(observations);
  const proposed = selectCalendarPacket({ report: { ...report, candidates: uniqueTasks }, maxCandidates: 100, maxChars: 24000 });
  const compactChars = jsonLength({ candidates: proposed.candidates, candidateDictionary: proposed.candidateDictionary, observationDictionary: proposed.observationDictionary });
  const visibleTasksNotPacket = Math.max(0, uniqueTasks.length - proposed.candidates.length);

  return {
    editionDate: report.editionDate,
    window: report.window,
    omissionAccounting: {
      reportAvailableRows,
      capBeforeGroups,
      capOmittedRows,
      capOmittedUnit: report?.omissionTelemetry?.legacyOmittedUnit || "unknown_rows_or_groups",
      capBeforeUnit: report?.omissionTelemetry?.legacyOmittedUnit || "unknown_rows_or_groups",
      packetRows: packetRows.length,
      packetOmittedTotal,
      packetOmittedUnit: report?.omissionTelemetry?.legacyOmittedUnit || "unknown_rows_or_groups",
      budgetOmittedRows,
      reconciles: numericReconciliation,
      reconcilesNumerically: numericReconciliation,
      reconciliationUnit: report?.omissionTelemetry?.legacyOmittedUnit || "unknown_rows_or_groups",
      capOmissionRecovery: "unknown",
    },
    report: {
      availableRows: reportAvailableRows,
      capBeforeGroups,
      capOmittedRows,
      nameDiagnostics: collectNameDiagnostics(reportRows, leadKey),
      platformCoverage: collectPlatformCoverage(reportRows, leadKey),
      kindCoverage: collectKindCoverage(reportRows, leadKey),
      sourceDiagnostics,
    },
    packet: {
      rows: packetRows.length,
      budgetOmittedRows,
      omittedCandidatesTotal: packetOmittedTotal,
      nameDiagnostics: packetLeadDiagnostics,
      platformCoverage: collectPlatformCoverage(packetRows, leadKey),
      kindCoverage: collectKindCoverage(packetRows, leadKey),
      candidateJsonChars: packetCandidateChars,
      charsPerLead: packetLeadDiagnostics.leadCount ? Math.round((packetCandidateChars / packetLeadDiagnostics.leadCount) * 100) / 100 : 0,
    },
    proposed: {
      visibleRawRows: reportRows.length,
      uniqueTasks: uniqueTasks.length,
      dedupeReduction: Math.max(0, reportRows.length - uniqueTasks.length),
      duplicateRatio: reportRows.length ? Math.round((Math.max(0, reportRows.length - uniqueTasks.length) / reportRows.length) * 10000) / 10000 : 0,
      packetTasks: proposed.candidates.length,
      visibleTasksNotPacket,
      capOmittedTasks: proposed.omissionTelemetry.packetCapOmittedTasks,
      budgetOmittedTasks: proposed.omissionTelemetry.budgetOmittedTasks,
      reportStageOmittedCandidates: proposed.omissionTelemetry.reportStageOmittedCandidates,
      reportStageOmittedUnit: proposed.omissionTelemetry.reportStageOmittedUnit,
      linkOmitted: proposed.omissionTelemetry.linkOmitted,
      platformFinalTaskCounts: proposed.omissionTelemetry.platformFinalTaskCounts,
      calendarChars: jsonLength(proposed),
      compactTaskChars: compactChars,
      charsPerTask: proposed.candidates.length ? Math.round((compactChars / proposed.candidates.length) * 100) / 100 : 0,
      overBudget: jsonLength(proposed) > 24000,
      discoveryPhases: { source: sourceDiagnostics.source, parser: sourceDiagnostics.parser },
    },
    comparison: {
      historicalPacketRows: packetRows.length,
      historicalPacketTasks: packetLeadDiagnostics.leadCount,
      proposedPacketTasks: proposed.candidates.length,
      taskGain: proposed.candidates.length - packetLeadDiagnostics.leadCount,
      historicalCharsPerTask: packetLeadDiagnostics.leadCount ? Math.round((packetCandidateChars / packetLeadDiagnostics.leadCount) * 100) / 100 : 0,
      proposedCharsPerTask: proposed.candidates.length ? Math.round((compactChars / proposed.candidates.length) * 100) / 100 : 0,
    },
    sourceDiagnostics,
  };
}

const jsonLength = (value) => JSON.stringify(value).length;

export async function replayFixture(edition, fixtureRoot = DEFAULT_FIXTURE_ROOT, options) {
  const fixture = await loadReplayFixture(edition, fixtureRoot);
  return { ...replayCalendarBaseline(fixture, options), provenance: fixture.provenance };
}

export async function replayHoldoutDirectory(directory, options) {
  const root = resolve(directory);
  const [reportText, editorialText] = await Promise.all([
    readFile(resolve(root, "release-calendar-discovery.json"), "utf8"),
    readFile(resolve(root, "editorial-packet.json"), "utf8"),
  ]);
  const report = JSON.parse(reportText);
  const editorial = JSON.parse(editorialText);
  const packet = editorial?.editorialInput?.upcomingDiscovery;
  if (!packet || !Array.isArray(packet.candidates)) throw new Error("holdout editorial packet has no calendar discovery candidates");
  const result = replayCalendarBaseline({ report, packet }, options);
  return { ...result, provenance: null, holdout: { directory: root, source: "read-only local artifact", rawHtmlAvailable: false } };
}

export { DEFAULT_FIXTURE_ROOT };

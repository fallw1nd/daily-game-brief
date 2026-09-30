import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeCalendarHealthReport, updateCalendarHealth } from "./release-calendar-health.mjs";

export async function readOptionalJson(path, { allowMalformed = false } = {}) {
  let contents;
  try { contents = await readFile(path, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
  if (!contents.trim()) {
    if (allowMalformed) return { schemaVersion: -1 };
    throw new Error(`JSON file is empty: ${path}`);
  }
  try { return JSON.parse(contents); }
  catch (error) {
    if (allowMalformed) return { schemaVersion: -1 };
    throw error;
  }
}

function assertHealthReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)
    || !/^\d{4}-\d{2}-\d{2}$/.test(report.editionDate || "")
    || !Number.isFinite(Date.parse(report.fetchedAt || ""))
    || !Array.isArray(report.coverage) || report.coverage.length === 0) {
    throw new Error("Invalid release calendar health report");
  }
  const normalized = normalizeCalendarHealthReport(report);
  if (normalized.diagnostics.length || normalized.entries.length !== report.coverage.length) {
    throw new Error("Invalid release calendar health coverage entries");
  }
}

export async function persistCalendarHealth({ previousPath, reportPath, outputPath, report }) {
  const previous = previousPath ? await readOptionalJson(previousPath, { allowMalformed: true }) : undefined;
  const currentReport = report || await readOptionalJson(reportPath);
  assertHealthReport(currentReport);
  const ledger = updateCalendarHealth(previous, currentReport);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(ledger, null, 2) + "\n");
  return ledger;
}

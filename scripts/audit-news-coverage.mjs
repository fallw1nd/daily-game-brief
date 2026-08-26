import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { auditCoverage } from "./lib/coverage-audit.mjs";

const EVIDENCE_PATH = resolve(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json");
const OUTPUT_PATH = resolve(process.env.NEWS_COVERAGE_AUDIT_PATH || "artifacts/news-coverage-audit.json");
const payload = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
const evidence = payload.editorialInput || payload;
const id = evidence.window?.id;
if (!/^\d{4}-\d{2}-\d{2}-(?:am|pm)$/.test(id || "")) throw new Error("evidence window has an invalid edition ID");
const [year, month] = id.split("-");
const archivePath = resolve(`public/data/archive/${year}/${month}/${id}.json`);
let edition = null;
try {
  edition = JSON.parse(await readFile(archivePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const audit = { schemaVersion: 1, generatedAt: new Date().toISOString(), ...auditCoverage(evidence, edition) };
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(audit, null, 2) + "\n");
console.log(`Coverage audit: status=${audit.status}; covered=${audit.totals.covered}; high omissions=${audit.totals.highConfidenceOmissions}; review omissions=${audit.totals.reviewOmissions}`);
if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, [
    `coverage_status=${audit.status}`,
    `high_omissions=${audit.totals.highConfidenceOmissions}`,
    `review_omissions=${audit.totals.reviewOmissions}`,
  ].join("\n") + "\n", { flag: "a" });
}

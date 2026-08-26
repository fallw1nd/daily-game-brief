import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildDegradedDecision } from "./lib/degraded-decision.mjs";

const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
const OUTPUT_PATH = resolve(process.env.EDITORIAL_DECISION_PATH || "artifacts/editorial-decisions.json");
const packet = JSON.parse(await readFile(PACKET_PATH, "utf8"));
const output = buildDegradedDecision(packet);
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.log(`Degraded editorial decision: ${output.decisions.filter((item) => item.decision === "include").length} included from ${output.decisions.length} packages.`);

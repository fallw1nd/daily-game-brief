import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { applyRevisionSubjectIdentityOverrides, validateRevisionPacket } from "./lib/revision-packet.mjs";

const [statePath, wakePath, outputPath] = process.argv.slice(2);
const wake = JSON.parse(readFileSync(wakePath, "utf8"));
if (wake.packetBlobSha) {
  if (!/^[0-9a-f]{40}$/.test(wake.packetBlobSha)) throw new Error("Invalid packet SHA");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const bytes = execFileSync("git", ["cat-file", "blob", wake.packetBlobSha], { maxBuffer: 20_000_000 });
  const original = JSON.parse(bytes.toString("utf8"));
  const sha = validateRevisionPacket(state, wake, original);
  const repaired = applyRevisionSubjectIdentityOverrides(original, wake);
  if (repaired === original) {
    writeFileSync(outputPath, bytes);
  } else {
    writeFileSync(outputPath, JSON.stringify(repaired, null, 2) + "\n");
  }
  process.stdout.write(sha);
}

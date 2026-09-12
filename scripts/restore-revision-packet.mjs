import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validateRevisionPacket } from "./lib/revision-packet.mjs";

const [statePath, wakePath, outputPath] = process.argv.slice(2);
const wake = JSON.parse(readFileSync(wakePath, "utf8"));
if (wake.packetBlobSha) {
  if (!/^[0-9a-f]{40}$/.test(wake.packetBlobSha)) throw new Error("Invalid packet SHA");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const bytes = execFileSync("git", ["cat-file", "blob", wake.packetBlobSha], { maxBuffer: 20_000_000 });
  const sha = validateRevisionPacket(state, wake, JSON.parse(bytes.toString("utf8")));
  writeFileSync(outputPath, bytes);
  process.stdout.write(sha);
}

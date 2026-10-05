import { execFileSync } from "node:child_process";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateFinalizedEditorialPacket, expectedEditorialWindow } from "./lib/editorial-packet.mjs";
import { gitBlobSha } from "./lib/edition-state.mjs";

export function restoreAcknowledgedPacket({ editionId, ref = "origin/automation/state", cwd = process.cwd() }) {
  const window = expectedEditorialWindow(editionId);
  if (!window) throw new Error("invalid exact edition ID");
  const git = args => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8_000_000 });
  // Ref/access errors must remain failures; missing edition files are normal
  // recovery inputs and must not terminate Bash under -e -o pipefail.
  git(["rev-parse", "--verify", `${ref}^{commit}`]);
  const readPath = path => {
    const paths = git(["ls-tree", "--name-only", ref, "--", path]).trim();
    return paths ? git(["show", `${ref}:${path}`]) : null;
  };
  const stateText = readPath(`automation/status/${editionId}.json`);
  let sha;
  if (stateText) {
    try { sha = JSON.parse(stateText)?.packet?.blobSha; }
    catch { return { available: false, reason: "invalid durable state JSON" }; }
  }
  let text;
  if (sha) {
    if (!/^[0-9a-f]{40}$/.test(sha)) return { available: false, reason: "invalid acknowledged blob SHA" };
    try { text = git(["cat-file", "blob", sha]); }
    catch { return { available: false, reason: "acknowledged packet blob unavailable" }; }
  } else {
    text = readPath(`automation/packets/${editionId}.json`);
    if (!text) return { available: false, reason: "exact edition packet is missing" };
    sha = gitBlobSha(text);
  }
  let packet;
  try { packet = JSON.parse(text); }
  catch { return { available: false, reason: "invalid packet JSON" }; }
  const errors = validateFinalizedEditorialPacket(packet, { editionId, period: window.period });
  if (errors.length) return { available: false, reason: errors.join("; ") };
  return { available: true, blobSha: sha, text };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const editionId = process.argv.find(arg => arg.startsWith("--edition="))?.slice(10);
  const output = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
  const result = restoreAcknowledgedPacket({ editionId });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.available ? result.text : "");
  const outputs = `available=${result.available}\n${result.available ? `packet_blob_sha=${result.blobSha}\n` : ""}`;
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, outputs);
  console.log(result.available ? `Restored exact packet ${result.blobSha}` : `Packet recovery required: ${result.reason}`);
}

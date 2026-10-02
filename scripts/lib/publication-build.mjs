import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

export async function runPublicationBuild(args, validationPath) {
  let diagnostics = "";
  const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    process.stdout.write(chunk);
    diagnostics = (diagnostics + chunk.toString()).slice(-12000);
  });
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
  if (code === 0) return;
  const validation = JSON.parse(await readFile(validationPath, "utf8"));
  await writeFile(validationPath, JSON.stringify({ ...validation, valid: false, stage: "publication-build", errors: [diagnostics.trim() || `Publisher exited with code ${code}`] }, null, 2) + "\n");
  throw new Error("Publication construction failed; exact diagnostics saved for editorial repair");
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";

const packetPath = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
const editionArg = process.argv.find((arg) => arg.startsWith("--edition="));
const periodArg = process.argv.find((arg) => arg.startsWith("--period="));
const editionId = editionArg?.slice("--edition=".length);
const period = periodArg?.slice("--period=".length);

if (!editionId) throw new Error("--edition=<YYYY-MM-DD-am|pm> is required");
const packet = JSON.parse(await readFile(packetPath, "utf8"));
const errors = validateFinalizedEditorialPacket(packet, { editionId, period });
if (errors.length) throw new Error(`Editorial packet is not usable:\n- ${errors.join("\n- ")}`);
console.log(`Validated finalized editorial packet ${editionId}.`);

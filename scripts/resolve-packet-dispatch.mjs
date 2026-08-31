import { pathToFileURL } from "node:url";
import { plannedWindow } from "./lib/edition-window.mjs";

export const MAX_EARLY_RECOVERY_MS = 5 * 60 * 1000;

function cutoffMs(window) {
  return Date.parse(`${window.windowEnd.replace(" ", "T")}:00+08:00`);
}

export function resolvePacketDispatchTarget({ period, edition = "", now = new Date() }) {
  if (!new Set(["am", "pm", "daily"]).has(period)) {
    throw new Error("period must be am, pm, or daily");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("now must be a valid Date");
  }

  const requested = String(edition || "").trim();
  const targetId = requested || plannedWindow(period, now).id;
  const match = targetId.match(/^(\d{4}-\d{2}-\d{2})-(am|pm|daily)$/);
  if (!match || match[2] !== period) {
    throw new Error(`edition ${targetId} does not match period ${period}`);
  }

  const window = plannedWindow(period, new Date(`${match[1]}T12:00:00+08:00`));
  if (window.id !== targetId) {
    throw new Error(`invalid edition ${targetId}`);
  }

  const endMs = cutoffMs(window);
  return {
    window,
    waitMs: endMs - now.getTime(),
    referenceNow: new Date(endMs).toISOString(),
    explicit: Boolean(requested),
  };
}

async function main() {
  const period = process.argv.find((arg) => arg.startsWith("--period="))?.split("=")[1];
  const edition = process.argv.find((arg) => arg.startsWith("--edition="))?.slice("--edition=".length) || "";
  const now = process.env.BRIEF_NOW ? new Date(process.env.BRIEF_NOW) : new Date();
  const target = resolvePacketDispatchTarget({ period, edition, now });

  if (target.waitMs > MAX_EARLY_RECOVERY_MS) {
    throw new Error(
      `recovery target ${target.window.id} is more than five minutes before its fixed cutoff; refusing early collection`,
    );
  }
  if (target.waitMs > 0) {
    console.error(`Waiting ${Math.ceil(target.waitMs / 1000)}s for ${target.window.id} fixed cutoff.`);
    await new Promise((resolve) => setTimeout(resolve, target.waitMs));
  }

  console.log(`edition=${target.window.id}`);
  console.log(`reference_now=${target.referenceNow}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

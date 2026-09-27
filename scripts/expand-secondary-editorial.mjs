import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function blankTrackingDecision(item, { close = false, staleHours = 72 } = {}) {
  return {
    eventKey: item.eventKey,
    decision: close ? "exclude" : "needs_review",
    section: null,
    titleKey: null,
    titleZhCn: null,
    titleEn: null,
    titleZhStatus: null,
    headline: null,
    summary: null,
    factStatus: null,
    timeStatus: null,
    entryFlags: [],
    tracking: !close,
    verification: "",
    reason: close
      ? `连续超过${staleHours}小时没有新的已打开证据，二次发布关闭陈旧跟踪；如后续出现新证据，发现层仍可重新进入候选。`
      : "本次二次发布没有新的已打开证据，保留既有跟踪状态等待后续事实增量。",
    beijingTime: null,
    timeNote: null,
    platforms: [],
    region: null,
    releaseType: null,
    sourceIndexes: [],
    additionalSources: [],
  };
}

export function expandSecondaryEditorial(request, packet) {
  if (request?.schemaVersion !== 1 || request?.kind !== "edition") throw new Error("secondary edition request must use schemaVersion=1 and kind=edition");
  const input = packet?.editorialInput;
  if (!input?.window?.id || request.editionId !== input.window.id) throw new Error("secondary request edition does not match packet");
  if (!/^[0-9a-f]{40}$/u.test(String(request.packetBlobSha || ""))) throw new Error("secondary request requires packetBlobSha");
  if (!Array.isArray(request.decisions)) throw new Error("secondary request decisions must be an array");

  const packageKeys = (input.packages || []).map((item) => item.eventKey);
  const packageSet = new Set(packageKeys);
  const seen = new Set();
  for (const decision of request.decisions) {
    if (!packageSet.has(decision?.eventKey)) throw new Error(`secondary request contains non-package decision: ${decision?.eventKey || "missing"}`);
    if (seen.has(decision.eventKey)) throw new Error(`secondary request duplicates package decision: ${decision.eventKey}`);
    seen.add(decision.eventKey);
  }
  for (const key of packageKeys) if (!seen.has(key)) throw new Error(`secondary request is missing package decision: ${key}`);

  const trackingPolicy = request.trackingPolicy || "carry";
  if (!new Set(["carry", "close_stale"]).has(trackingPolicy)) throw new Error("trackingPolicy must be carry or close_stale");
  const staleHours = Number(request.staleTrackingHours || 72);
  if (!Number.isFinite(staleHours) || staleHours < 24) throw new Error("staleTrackingHours must be at least 24");
  const referenceAt = Date.parse(packet.finalizedAt || packet.generatedAt || "");
  if (!Number.isFinite(referenceAt)) throw new Error("packet finalization time is invalid");

  const trackingDecisions = (input.trackingQueue || []).map((item) => {
    const lastSeenAt = Date.parse(item.lastSeenAt || item.firstSeenAt || "");
    const stale = trackingPolicy === "close_stale" && Number.isFinite(lastSeenAt) && referenceAt - lastSeenAt >= staleHours * 3600000;
    return blankTrackingDecision(item, { close: stale, staleHours });
  });

  const {
    kind,
    schemaVersion,
    trackingPolicy: _trackingPolicy,
    staleTrackingHours: _staleTrackingHours,
    recoverFailedPublication: _recoverFailedPublication,
    ...editorial
  } = request;
  return {
    ...editorial,
    contractVersion: 2,
    decisions: [...request.decisions, ...trackingDecisions],
  };
}

async function main() {
  const [requestPath, packetPath, outputPath] = process.argv.slice(2);
  if (!requestPath || !packetPath || !outputPath) throw new Error("usage: node scripts/expand-secondary-editorial.mjs <request> <packet> <output>");
  const [request, packet] = await Promise.all([
    readFile(requestPath, "utf8").then(JSON.parse),
    readFile(packetPath, "utf8").then(JSON.parse),
  ]);
  const output = expandSecondaryEditorial(request, packet);
  await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`Expanded secondary editorial ${output.editionId}: packages=${request.decisions.length}, tracking=${output.decisions.length - request.decisions.length}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

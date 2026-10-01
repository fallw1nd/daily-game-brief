import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function blankDecision(eventKey, { decision, tracking, reason }) {
  return {
    eventKey,
    decision,
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
    tracking,
    verification: "",
    reason,
    beijingTime: null,
    timeNote: null,
    platforms: [],
    region: null,
    releaseType: null,
    sourceIndexes: [],
    additionalSources: [],
  };
}

function blankTrackingDecision(item, { close = false, staleHours = 72 } = {}) {
  return blankDecision(item.eventKey, {
    decision: close ? "exclude" : "needs_review",
    tracking: !close,
    reason: close
      ? `连续超过${staleHours}小时没有新的已打开证据，二次发布关闭陈旧跟踪；如后续出现新证据，发现层仍可重新进入候选。`
      : "本次二次发布没有新的已打开证据，保留既有跟踪状态等待后续事实增量。",
  });
}

function blankPackageExclusion(item) {
  const needsIdentity = item?.publishability && item.publishability !== "direct";
  return blankDecision(item.eventKey, {
    decision: "exclude",
    tracking: false,
    reason: needsIdentity
      ? "packet 标记 requires_subject_identity，二次发布不得从标题推断或自造规范主体身份。"
      : "二次发布人工复核后不收录：本条未达到本期正式稿的信息增量与编辑优先级，且不存在需要继续跟踪的实质阻塞。",
  });
}

export function expandSecondaryEditorial(request, packet) {
  if (request?.schemaVersion !== 1 || request?.kind !== "edition") throw new Error("secondary edition request must use schemaVersion=1 and kind=edition");
  const input = packet?.editorialInput;
  if (!input?.window?.id || request.editionId !== input.window.id) throw new Error("secondary request edition does not match packet");
  if (!/^[0-9a-f]{40}$/u.test(String(request.packetBlobSha || ""))) throw new Error("secondary request requires packetBlobSha");
  if (!Array.isArray(request.decisions)) throw new Error("secondary request decisions must be an array");
  if (request.excludePackageKeys !== undefined && !Array.isArray(request.excludePackageKeys)) throw new Error("excludePackageKeys must be an array");

  const packages = input.packages || [];
  const packageKeys = packages.map((item) => item.eventKey);
  const packageSet = new Set(packageKeys);
  const manual = new Map();
  for (const decision of request.decisions) {
    if (!packageSet.has(decision?.eventKey)) throw new Error(`secondary request contains non-package decision: ${decision?.eventKey || "missing"}`);
    if (manual.has(decision.eventKey)) throw new Error(`secondary request duplicates package decision: ${decision.eventKey}`);
    manual.set(decision.eventKey, decision);
  }

  const excluded = new Set();
  for (const key of request.excludePackageKeys || []) {
    if (!packageSet.has(key)) throw new Error(`secondary request contains non-package exclusion: ${key}`);
    if (manual.has(key)) throw new Error(`secondary request both authors and excludes package: ${key}`);
    if (excluded.has(key)) throw new Error(`secondary request duplicates package exclusion: ${key}`);
    excluded.add(key);
  }

  for (const key of packageKeys) {
    if (!manual.has(key) && !excluded.has(key)) throw new Error(`secondary request is missing package decision: ${key}`);
  }
  const packageDecisions = packages.map((item) => manual.get(item.eventKey) || blankPackageExclusion(item));

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
    excludePackageKeys: _excludePackageKeys,
    trackingPolicy: _trackingPolicy,
    staleTrackingHours: _staleTrackingHours,
    recoverFailedPublication: _recoverFailedPublication,
    historicalInsertion: _historicalInsertion,
    ...editorial
  } = request;
  return {
    ...editorial,
    contractVersion: 2,
    decisions: [...packageDecisions, ...trackingDecisions],
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
  console.log(`Expanded secondary editorial ${output.editionId}: packages=${packet.editorialInput.packages.length}, tracking=${output.decisions.length - packet.editorialInput.packages.length}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

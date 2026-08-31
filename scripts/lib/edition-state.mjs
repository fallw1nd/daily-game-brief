import { createHash } from "node:crypto";

import { expectedEditorialWindow } from "./editorial-packet.mjs";

export const EDITION_STATE_SCHEMA_VERSION = 1;

const editorialStatuses = new Set(["pending", "submitted", "invalid", "valid", "timed_out"]);
const publicationStatuses = new Set(["pending", "committed", "failed"]);
const publicationSources = new Set(["editorial", "degraded"]);
const optionalStatuses = new Set(["pending", "available", "partial", "unavailable", "failed"]);
const deploymentStatuses = new Set(["pending", "deployed", "failed"]);
const revisionStatuses = new Set(["open", "completed"]);
const revisionReason = "user_authorized_same_edition_revision";

export function gitBlobSha(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
  return createHash("sha1")
    .update(Buffer.from(`blob ${buffer.length}\0`))
    .update(buffer)
    .digest("hex");
}

export function editionStatePath(editionId) {
  if (!expectedEditorialWindow(editionId)) throw new Error(`invalid edition ID: ${editionId}`);
  return `automation/status/${editionId}.json`;
}

function emptyLane(status) {
  return { status, updatedAt: null };
}

export function createEditionState(editionId, at = new Date().toISOString()) {
  const window = expectedEditorialWindow(editionId);
  if (!window) throw new Error(`invalid edition ID: ${editionId}`);
  return {
    schemaVersion: EDITION_STATE_SCHEMA_VERSION,
    editionId,
    period: window.period,
    plannedAt: window.plannedAt,
    fixedWindow: { startExclusive: window.windowStart, endInclusive: window.windowEnd },
    packet: { status: "pending", blobSha: null, producerRunId: null, completedAt: null },
    editorial: { status: "pending", packetBlobSha: null, submissionSha: null, validationErrors: [], updatedAt: null },
    publication: { status: "pending", mainSha: null, source: null, updatedAt: null, error: null },
    deployment: { status: "pending", mainSha: null, runId: null, updatedAt: null, error: null },
    localeEn: emptyLane("pending"),
    media: emptyLane("pending"),
    retry: { owner: "github-orchestrator", attempt: 0, updatedAt: at },
    revisionRequest: null,
    revision: 0,
    transitions: [],
  };
}

function assertSha(value, name) {
  if (!/^[0-9a-f]{40}$/u.test(String(value || ""))) throw new Error(`${name} must be a 40-character Git SHA`);
}

export function validateEditionState(state) {
  const errors = [];
  const expected = expectedEditorialWindow(state?.editionId);
  if (!state || typeof state !== "object") return ["state must be an object"];
  if (state.schemaVersion !== EDITION_STATE_SCHEMA_VERSION) errors.push(`state.schemaVersion must be ${EDITION_STATE_SCHEMA_VERSION}`);
  if (!expected) errors.push("state.editionId is invalid");
  if (expected && state.period !== expected.period) errors.push("state.period does not match editionId");
  if (expected && state.plannedAt !== expected.plannedAt) errors.push("state.plannedAt does not match the fixed edition cutoff");
  if (expected && state.fixedWindow?.startExclusive !== expected.windowStart) errors.push("state.fixedWindow.startExclusive is invalid");
  if (expected && state.fixedWindow?.endInclusive !== expected.windowEnd) errors.push("state.fixedWindow.endInclusive is invalid");
  if (!new Set(["pending", "ready", "failed"]).has(state.packet?.status)) errors.push("state.packet.status is invalid");
  if (!editorialStatuses.has(state.editorial?.status)) errors.push("state.editorial.status is invalid");
  if (!publicationStatuses.has(state.publication?.status)) errors.push("state.publication.status is invalid");
  if (!deploymentStatuses.has(state.deployment?.status)) errors.push("state.deployment.status is invalid");
  for (const [name, value] of [
    ["state.packet.blobSha", state.packet?.blobSha],
    ["state.editorial.packetBlobSha", state.editorial?.packetBlobSha],
    ["state.editorial.submissionSha", state.editorial?.submissionSha],
    ["state.publication.mainSha", state.publication?.mainSha],
  ]) {
    try { if (value !== null) assertSha(value, name); } catch (error) { errors.push(error.message); }
  }
  if (!optionalStatuses.has(state.localeEn?.status)) errors.push("state.localeEn.status is invalid");
  if (!optionalStatuses.has(state.media?.status)) errors.push("state.media.status is invalid");
  if (state.revisionRequest != null) {
    if (typeof state.revisionRequest !== "object") errors.push("state.revisionRequest must be null or an object");
    else {
      if (!revisionStatuses.has(state.revisionRequest.status)) errors.push("state.revisionRequest.status is invalid");
      if (state.revisionRequest.reason !== revisionReason) errors.push("state.revisionRequest.reason is invalid");
      try { assertSha(state.revisionRequest.previousMainSha, "state.revisionRequest.previousMainSha"); } catch (error) { errors.push(error.message); }
      if (typeof state.revisionRequest.openedAt !== "string" || !state.revisionRequest.openedAt) errors.push("state.revisionRequest.openedAt is required");
      if (state.revisionRequest.status === "completed" && (typeof state.revisionRequest.completedAt !== "string" || !state.revisionRequest.completedAt)) {
        errors.push("completed revisionRequest requires completedAt");
      }
    }
  }
  if (!Number.isInteger(state.revision) || state.revision < 0) errors.push("state.revision must be a non-negative integer");
  if (!Array.isArray(state.transitions)) errors.push("state.transitions must be an array");
  return errors;
}

function record(state, event, at, actor, runId, details = {}) {
  state.revision += 1;
  state.transitions.push({ revision: state.revision, event, at, actor, runId: runId || null, ...details });
  state.retry.updatedAt = at;
  return state;
}

function requirePacket(state, packetBlobSha) {
  if (state.packet.status !== "ready") throw new Error("packet must be ready before editorial acknowledgement");
  assertSha(packetBlobSha, "packetBlobSha");
  if (packetBlobSha !== state.packet.blobSha) throw new Error("packetBlobSha does not match the durable packet acknowledgement");
}

export function applyEditionStateEvent(current, event, data = {}) {
  const at = data.at || new Date().toISOString();
  const actor = data.actor || "github-orchestrator";
  const runId = data.runId || null;
  const state = structuredClone(current || createEditionState(data.editionId, at));
  if (data.editionId && state.editionId !== data.editionId) throw new Error("state edition does not match event edition");
  const initialErrors = validateEditionState(state);
  if (initialErrors.length) throw new Error(`invalid prior edition state: ${initialErrors.join("; ")}`);

  if (event === "revision-opened") {
    if (!current) throw new Error("same-edition revision requires an existing durable state");
    if (data.reason !== revisionReason) throw new Error("same-edition revision requires explicit user authorization");
    if (state.publication.status !== "committed") throw new Error("same-edition revision requires an already committed publication");
    const previousMainSha = state.deployment.mainSha || state.publication.mainSha;
    assertSha(previousMainSha, "previousMainSha");
    if (state.revisionRequest?.status === "open") return state;
    state.packet = { status: "pending", blobSha: null, producerRunId: null, completedAt: null };
    state.editorial = { status: "pending", packetBlobSha: null, submissionSha: null, validationErrors: [], updatedAt: at };
    state.publication = { status: "pending", mainSha: null, source: null, updatedAt: at, error: null };
    state.deployment = { status: "pending", mainSha: null, runId: null, updatedAt: at, error: null };
    state.localeEn = emptyLane("pending");
    state.media = emptyLane("pending");
    state.retry.attempt = 0;
    state.revisionRequest = {
      status: "open",
      reason: revisionReason,
      previousMainSha,
      openedAt: at,
      completedAt: null,
    };
    return record(state, event, at, actor, runId, { reason: revisionReason, previousMainSha });
  }
  if (event === "packet-ready") {
    assertSha(data.packetBlobSha, "packetBlobSha");
    if (["submitted", "invalid", "valid", "timed_out"].includes(state.editorial.status) && state.packet.blobSha !== data.packetBlobSha) throw new Error("cannot replace a packet after editorial consumption");
    if (state.packet.status === "ready" && state.packet.blobSha === data.packetBlobSha) return state;
    state.packet = { status: "ready", blobSha: data.packetBlobSha, producerRunId: runId, completedAt: at };
    state.editorial.packetBlobSha = data.packetBlobSha;
    state.editorial.updatedAt = at;
    return record(state, event, at, actor, runId, { packetBlobSha: data.packetBlobSha });
  }
  if (event === "packet-failed") {
    if (state.packet.status === "ready") return state;
    state.packet.status = "failed";
    state.packet.completedAt = at;
    state.retry.attempt += 1;
    return record(state, event, at, actor, runId, { error: String(data.error || "packet production failed") });
  }
  if (event === "editorial-submitted") {
    requirePacket(state, data.packetBlobSha);
    assertSha(data.submissionSha, "submissionSha");
    if (state.editorial.submissionSha === data.submissionSha && state.editorial.status !== "pending") return state;
    if (["submitted", "valid"].includes(state.editorial.status)) throw new Error("editorial submission is already owned by the GitHub publication lane");
    if (state.editorial.status === "timed_out") throw new Error("timed-out editorial work is owned by the GitHub SLA lane");
    state.editorial = { status: "submitted", packetBlobSha: data.packetBlobSha, submissionSha: data.submissionSha, validationErrors: [], updatedAt: at };
    return record(state, event, at, actor, runId, { submissionSha: data.submissionSha, packetBlobSha: data.packetBlobSha });
  }
  if (event === "editorial-valid" || event === "editorial-invalid") {
    requirePacket(state, data.packetBlobSha);
    assertSha(data.submissionSha, "submissionSha");
    if (state.editorial.submissionSha !== data.submissionSha) throw new Error("validation does not match the acknowledged submission");
    const valid = event === "editorial-valid";
    state.editorial.status = valid ? "valid" : "invalid";
    state.editorial.validationErrors = valid ? [] : [...new Set((data.validationErrors || []).map(String))];
    state.editorial.updatedAt = at;
    return record(state, event, at, actor, runId, { submissionSha: data.submissionSha, validationErrorCount: state.editorial.validationErrors.length });
  }
  if (event === "editorial-timeout") {
    if (state.editorial.status === "valid" || state.publication.status === "committed") return state;
    state.editorial.status = "timed_out";
    state.editorial.updatedAt = at;
    return record(state, event, at, actor, runId);
  }
  if (event === "publication-committed") {
    assertSha(data.mainSha, "mainSha");
    const source = data.source || "editorial";
    if (!publicationSources.has(source)) throw new Error("publication source must be editorial or degraded");
    if (source === "editorial" && state.editorial.status !== "valid") throw new Error("normal publication requires a valid editorial submission");
    if (source === "degraded" && state.editorial.status !== "timed_out") throw new Error("degraded publication requires an editorial timeout acknowledgement");
    if (state.publication.status === "committed" && state.publication.mainSha === data.mainSha) return state;
    state.publication = { status: "committed", mainSha: data.mainSha, source, updatedAt: at, error: null };
    state.deployment.mainSha = data.mainSha;
    if (state.revisionRequest?.status === "open") {
      state.revisionRequest = { ...state.revisionRequest, status: "completed", completedAt: at };
    }
    return record(state, event, at, actor, runId, { mainSha: data.mainSha, source });
  }
  if (event === "publication-failed") {
    if (state.publication.status === "committed") return state;
    state.publication.status = "failed";
    state.publication.updatedAt = at;
    state.publication.error = String(data.error || "publication failed");
    state.retry.attempt += 1;
    return record(state, event, at, actor, runId, { error: state.publication.error });
  }
  if (event === "deployment-succeeded" || event === "deployment-failed") {
    if (data.mainSha) assertSha(data.mainSha, "mainSha");
    const deployed = event === "deployment-succeeded";
    state.deployment = { status: deployed ? "deployed" : "failed", mainSha: data.mainSha || state.publication.mainSha, runId, updatedAt: at, error: deployed ? null : String(data.error || "deployment failed") };
    return record(state, event, at, actor, runId, { mainSha: state.deployment.mainSha });
  }
  if (event === "locale-status" || event === "media-status") {
    const lane = event === "locale-status" ? "localeEn" : "media";
    const status = String(data.status || "pending");
    if (!optionalStatuses.has(status)) throw new Error(`${lane} status is invalid`);
    state[lane] = { status, updatedAt: at, reason: data.reason || null };
    return record(state, event, at, actor, runId, { status: state[lane].status });
  }
  throw new Error(`unsupported edition state event: ${event}`);
}

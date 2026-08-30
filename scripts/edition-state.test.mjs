import { describe, expect, it } from "vitest";

import {
  applyEditionStateEvent,
  createEditionState,
  gitBlobSha,
  validateEditionState,
} from "./lib/edition-state.mjs";
import { resolveDueEdition } from "./resolve-due-edition.mjs";

const packetSha = "1".repeat(40);
const submissionSha = "2".repeat(40);
const mainSha = "3".repeat(40);
const editionId = "2026-08-30-am";

function readyState() {
  return applyEditionStateEvent(createEditionState(editionId), "packet-ready", {
    editionId,
    packetBlobSha: packetSha,
    runId: "100",
    at: "2026-08-30T02:11:00.000Z",
  });
}

function submittedState() {
  return applyEditionStateEvent(readyState(), "editorial-submitted", {
    packetBlobSha: packetSha,
    submissionSha,
    at: "2026-08-30T02:20:00.000Z",
  });
}

function validState() {
  return applyEditionStateEvent(submittedState(), "editorial-valid", {
    packetBlobSha: packetSha,
    submissionSha,
    at: "2026-08-30T02:21:00.000Z",
  });
}

describe("durable per-edition state machine", () => {
  it("creates a valid immutable fixed-window state", () => {
    const state = createEditionState(editionId);
    expect(validateEditionState(state)).toEqual([]);
    expect(state.fixedWindow).toEqual({ startExclusive: "2026-08-29 17:00", endInclusive: "2026-08-30 10:10" });
  });

  it("rejects an invalid edition identity", () => {
    expect(() => createEditionState("today-am")).toThrow("invalid edition ID");
  });

  it("computes the canonical Git blob SHA", () => {
    expect(gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });

  it("acknowledges a finalized packet by immutable blob SHA", () => {
    const state = readyState();
    expect(state.packet).toMatchObject({ status: "ready", blobSha: packetSha, producerRunId: "100" });
    expect(state.editorial.packetBlobSha).toBe(packetSha);
  });

  it("makes duplicate packet acknowledgements idempotent", () => {
    const state = readyState();
    const duplicate = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: packetSha });
    expect(duplicate).toEqual(state);
  });

  it("allows packet production to recover after a failure", () => {
    const failed = applyEditionStateEvent(createEditionState(editionId), "packet-failed", { error: "network" });
    const recovered = applyEditionStateEvent(failed, "packet-ready", { packetBlobSha: packetSha });
    expect(recovered.packet.status).toBe("ready");
    expect(recovered.retry.attempt).toBe(1);
  });

  it("forbids replacing a packet after editorial consumption", () => {
    expect(() => applyEditionStateEvent(submittedState(), "packet-ready", { packetBlobSha: "4".repeat(40) }))
      .toThrow("cannot replace a packet after editorial consumption");
  });

  it("requires packet readiness before accepting a submission", () => {
    expect(() => applyEditionStateEvent(createEditionState(editionId), "editorial-submitted", { packetBlobSha: packetSha, submissionSha }))
      .toThrow("packet must be ready");
  });

  it("rejects a stale submission bound to another packet", () => {
    expect(() => applyEditionStateEvent(readyState(), "editorial-submitted", { packetBlobSha: "4".repeat(40), submissionSha }))
      .toThrow("does not match the durable packet acknowledgement");
  });

  it("records invalid editorial output as machine-readable state", () => {
    const state = applyEditionStateEvent(submittedState(), "editorial-invalid", {
      packetBlobSha: packetSha,
      submissionSha,
      validationErrors: ["missing field", "missing field", "wrong edition"],
    });
    expect(state.editorial.status).toBe("invalid");
    expect(state.editorial.validationErrors).toEqual(["missing field", "wrong edition"]);
  });

  it("acknowledges validation only for the exact submitted commit", () => {
    expect(() => applyEditionStateEvent(submittedState(), "editorial-valid", {
      packetBlobSha: packetSha,
      submissionSha: "5".repeat(40),
    })).toThrow("validation does not match the acknowledged submission");
  });

  it("moves an exact validated submission to valid", () => {
    expect(validState().editorial.status).toBe("valid");
  });

  it("blocks normal publication before editorial validation", () => {
    expect(() => applyEditionStateEvent(submittedState(), "publication-committed", { mainSha, source: "editorial" }))
      .toThrow("normal publication requires a valid editorial submission");
  });

  it("allows the GitHub-owned degraded publisher after timeout", () => {
    const timedOut = applyEditionStateEvent(readyState(), "editorial-timeout");
    const published = applyEditionStateEvent(timedOut, "publication-committed", { mainSha, source: "degraded" });
    expect(published.publication).toMatchObject({ status: "committed", mainSha, source: "degraded" });
  });

  it("does not overwrite a valid editorial acknowledgement with timeout", () => {
    expect(applyEditionStateEvent(validState(), "editorial-timeout")).toEqual(validState());
  });

  it("makes duplicate publication acknowledgement idempotent", () => {
    const published = applyEditionStateEvent(validState(), "publication-committed", { mainSha, source: "editorial" });
    expect(applyEditionStateEvent(published, "publication-committed", { mainSha, source: "editorial" })).toEqual(published);
  });

  it("records publication failures and retry ownership", () => {
    const failed = applyEditionStateEvent(validState(), "publication-failed", { error: "push race" });
    expect(failed.publication).toMatchObject({ status: "failed", error: "push race" });
    expect(failed.retry).toMatchObject({ owner: "github-orchestrator", attempt: 1 });
  });

  it("keeps a committed publication terminal when a late failure arrives", () => {
    const published = applyEditionStateEvent(validState(), "publication-committed", { mainSha });
    expect(applyEditionStateEvent(published, "publication-failed", { error: "late" })).toEqual(published);
  });

  it("binds deployment success to the published main commit", () => {
    const published = applyEditionStateEvent(validState(), "publication-committed", { mainSha });
    const deployed = applyEditionStateEvent(published, "deployment-succeeded", { mainSha, runId: "200" });
    expect(deployed.deployment).toMatchObject({ status: "deployed", mainSha, runId: "200", error: null });
  });

  it("keeps English and media availability nonblocking", () => {
    const locale = applyEditionStateEvent(readyState(), "locale-status", { status: "unavailable", reason: "invalid overlay" });
    const media = applyEditionStateEvent(locale, "media-status", { status: "partial", reason: "one image missing" });
    expect(media.localeEn.status).toBe("unavailable");
    expect(media.media.status).toBe("partial");
    expect(media.publication.status).toBe("pending");
  });
});

describe("oldest-due edition compensation", () => {
  const manifest = { editions: [{ id: "2026-08-27-pm", date: "2026-08-27", period: "pm", issueNumber: 10 }] };
  const now = new Date("2026-08-30T04:00:00.000Z");

  it("selects the oldest unpublished due morning edition after downtime", () => {
    const result = resolveDueEdition({ period: "am", now, manifest, purpose: "publication" });
    expect(result).toMatchObject({ needed: true, window: { id: "2026-08-28-am" } });
  });

  it("skips a packet already acknowledged while preserving the next backlog item", () => {
    const states = { "2026-08-28-am": { packet: { status: "ready" } } };
    const result = resolveDueEdition({ period: "am", now, manifest, states, purpose: "packet" });
    expect(result).toMatchObject({ needed: true, window: { id: "2026-08-29-am" } });
  });

  it("does not regenerate an edition already present in the manifest", () => {
    const published = { editions: [
      ...manifest.editions,
      { id: "2026-08-28-am", date: "2026-08-28", period: "am", issueNumber: 11 },
    ] };
    const result = resolveDueEdition({ period: "am", now, manifest: published, purpose: "publication" });
    expect(result.window.id).toBe("2026-08-29-am");
  });
});
  it("requires the timeout acknowledgement before degraded publication", () => {
    expect(() => applyEditionStateEvent(readyState(), "publication-committed", { mainSha, source: "degraded" }))
      .toThrow("degraded publication requires an editorial timeout acknowledgement");
  });

  it("rejects unknown publication sources", () => {
    expect(() => applyEditionStateEvent(validState(), "publication-committed", { mainSha, source: "manual" }))
      .toThrow("publication source must be editorial or degraded");
  });


  it("rejects an unknown optional-lane status", () => {
    expect(() => applyEditionStateEvent(readyState(), "media-status", { status: "probably" }))
      .toThrow("media status is invalid");
  });

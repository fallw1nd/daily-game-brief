import { describe, expect, it } from "vitest";
import { applyEditionStateEvent, createEditionState } from "./lib/edition-state.mjs";

const editionId = "2026-08-31-daily";
const firstPacketSha = "1".repeat(40);
const firstSubmissionSha = "2".repeat(40);
const firstMainSha = "3".repeat(40);
const revisionPacketSha = "4".repeat(40);
const revisionSubmissionSha = "5".repeat(40);
const correctedSubmissionSha = "6".repeat(40);
const revisedMainSha = "7".repeat(40);

function openValidatedRevision() {
  let state = createEditionState(editionId, "2026-08-31T02:11:00.000Z");
  state = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: firstPacketSha });
  state = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: firstPacketSha, submissionSha: firstSubmissionSha });
  state = applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: firstPacketSha, submissionSha: firstSubmissionSha });
  state = applyEditionStateEvent(state, "publication-committed", { mainSha: firstMainSha, source: "editorial" });
  state = applyEditionStateEvent(state, "deployment-succeeded", { mainSha: firstMainSha });
  state = applyEditionStateEvent(state, "revision-opened", { reason: "user_authorized_same_edition_revision" });
  state = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: revisionPacketSha });
  state = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: revisionPacketSha, submissionSha: revisionSubmissionSha });
  return applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: revisionPacketSha, submissionSha: revisionSubmissionSha });
}

describe("corrected editorial submission during an authorized same-edition revision", () => {
  it("replaces a validated but unpublished submission against the same packet and requires validation again", () => {
    const state = openValidatedRevision();
    const corrected = applyEditionStateEvent(state, "editorial-submitted", {
      packetBlobSha: revisionPacketSha,
      submissionSha: correctedSubmissionSha,
    });
    expect(corrected.editorial).toMatchObject({
      status: "submitted",
      packetBlobSha: revisionPacketSha,
      submissionSha: correctedSubmissionSha,
      validationErrors: [],
    });
    expect(corrected.publication.status).toBe("pending");
    expect(corrected.revisionRequest.status).toBe("open");
  });

  it("keeps a repeated acknowledgement of the same submission idempotent", () => {
    const state = openValidatedRevision();
    expect(applyEditionStateEvent(state, "editorial-submitted", {
      packetBlobSha: revisionPacketSha,
      submissionSha: revisionSubmissionSha,
    })).toEqual(state);
  });

  it("rejects a corrected submission bound to a different packet", () => {
    const state = openValidatedRevision();
    expect(() => applyEditionStateEvent(state, "editorial-submitted", {
      packetBlobSha: "8".repeat(40),
      submissionSha: correctedSubmissionSha,
    })).toThrow("does not match the durable packet acknowledgement");
  });

  it("rejects replacement after the revised publication commits", () => {
    let state = openValidatedRevision();
    state = applyEditionStateEvent(state, "publication-committed", { mainSha: revisedMainSha, source: "editorial" });
    expect(state.revisionRequest.status).toBe("completed");
    expect(() => applyEditionStateEvent(state, "editorial-submitted", {
      packetBlobSha: revisionPacketSha,
      submissionSha: correctedSubmissionSha,
    })).toThrow("GitHub publication lane");
  });
});

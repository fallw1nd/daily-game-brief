import { validateEnglishOverlay } from "./locale-overlay.mjs";
import { editorialDecisionDigest } from "./locale-digest.mjs";

// This recognizes a receipt, not a new revision authorization. The caller may
// acknowledge it again but must not rebuild Canonical or replay old English.
export async function isExactCommittedPublicationReplay({ state, editorial, canonical, archivePath, archiveText, git }) {
  const receipt = state?.transitions?.findLast(item => item.event === "publication-committed");
  const digest = editorialDecisionDigest(editorial);
  if (state?.editionId !== editorial.editionId || canonical?.id !== editorial.editionId ||
      state.revisionRequest?.status !== "completed" || state.publication?.status !== "committed" ||
      state.packet?.status !== "ready" || state.packet.blobSha !== editorial.packetBlobSha ||
      state.editorial?.packetBlobSha !== editorial.packetBlobSha ||
      receipt?.source !== "editorial" || receipt.mainSha !== state.publication.mainSha ||
      receipt.packetBlobSha !== editorial.packetBlobSha || receipt.decisionDigest !== digest ||
      receipt.submissionSha !== state.editorial?.submissionSha ||
      canonical.sourceReport?.editorialDecisionDigest !== digest ||
      !/^[a-f0-9]{40}$/.test(receipt.mainSha || "") || !/^[a-f0-9]{40}$/.test(receipt.submissionSha || "")) return false;
  try {
    await git(["merge-base", "--is-ancestor", receipt.mainSha, "HEAD"]);
    const published = await git(["show", `${receipt.mainSha}:${archivePath}`]);
    if (published !== archiveText) return false;
    // Editorial identity excludes locale copy, so also verify the complete
    // acknowledged submission. A changed English draft is not an exact replay.
    const submitted = JSON.parse(await git(["show", `${receipt.submissionSha}:automation/inbox/${editorial.editionId}.json`]));
    return JSON.stringify(submitted) === JSON.stringify(editorial);
  } catch {
    return false;
  }
}

export function retainedLocaleAvailability(canonical, overlay, status) {
  const valid = overlay && validateEnglishOverlay(canonical, overlay).valid;
  return {
    localeStatus: valid ? "available" : "unavailable",
    localeReasonCode: valid ? "retained-existing-state" : status?.reasonCode || (overlay ? "editorial-overlay-invalid" : "editorial-overlay-missing"),
  };
}

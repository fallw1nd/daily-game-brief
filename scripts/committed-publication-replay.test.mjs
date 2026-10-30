import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { editorialDecisionDigest } from "./lib/locale-digest.mjs";
import { isExactCommittedPublicationReplay, retainedLocaleAvailability } from "./lib/committed-publication-replay.mjs";

function fixture() {
  const editorial = { editionId: "2026-10-07-daily", packetBlobSha: "a".repeat(40), decisions: [], locales: { en: { archiveTitle: "Daily | Original" } } };
  const digest = editorialDecisionDigest(editorial);
  const receipt = { event: "publication-committed", source: "editorial", mainSha: "b".repeat(40), submissionSha: "c".repeat(40), packetBlobSha: editorial.packetBlobSha, decisionDigest: digest };
  const canonical = { id: editorial.editionId, sourceReport: { editorialDecisionDigest: digest } };
  const state = { editionId: editorial.editionId, packet: { status: "ready", blobSha: editorial.packetBlobSha }, editorial: { status: "invalid", packetBlobSha: editorial.packetBlobSha, submissionSha: receipt.submissionSha }, publication: { status: "committed", mainSha: receipt.mainSha }, revisionRequest: { status: "completed" }, transitions: [receipt] };
  const archiveText = JSON.stringify(canonical);
  const archivePath = `public/data/archive/2026/10/${editorial.editionId}.json`;
  return { state, editorial, canonical, archiveText, archivePath, git: async args => {
    if (args[0] === "merge-base") return "";
    if (args[1] === `${receipt.mainSha}:${archivePath}`) return archiveText;
    if (args[1] === `${receipt.submissionSha}:automation/inbox/${editorial.editionId}.json`) return JSON.stringify(editorial);
    throw new Error("unexpected Git read");
  } };
}

describe("exact committed publication receipts", () => {
  it("accepts the failed acknowledgement retry without granting revision authority", async () => {
    const input = fixture();
    const before = JSON.stringify(input);
    expect(await isExactCommittedPublicationReplay(input)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });
  it.each([
    ["state edition", x => x.state.editionId = "2026-10-08-daily"],
    ["canonical edition", x => x.canonical.id = "2026-10-08-daily"],
    ["completed state", x => x.state.revisionRequest.status = "open"],
    ["committed lane", x => x.state.publication.status = "failed"],
    ["packet identity", x => x.state.packet.blobSha = "d".repeat(40)],
    ["submission identity", x => x.state.editorial.submissionSha = "d".repeat(40)],
    ["receipt digest", x => x.state.transitions[0].decisionDigest = "d".repeat(64)],
    ["Canonical digest", x => x.canonical.sourceReport.editorialDecisionDigest = "d".repeat(64)],
    ["latest receipt", x => x.state.transitions.push({ event: "publication-committed", decisionDigest: "old" })],
    ["current archive bytes", x => x.archiveText += "\n"],
  ])("rejects changed %s", async (_name, mutate) => {
    const input = fixture(); mutate(input);
    expect(await isExactCommittedPublicationReplay(input)).toBe(false);
  });
  it("rejects an unavailable or divergent committed main", async () => {
    const input = fixture(); input.git = async () => { throw new Error("not an ancestor"); };
    expect(await isExactCommittedPublicationReplay(input)).toBe(false);
  });
  it("rejects changed locale copy even though editorial digests exclude it", async () => {
    const input = fixture();
    const oldGit = input.git;
    const acknowledged = JSON.stringify(input.editorial);
    input.git = args => args[1]?.includes(":automation/inbox/") ? Promise.resolve(acknowledged) : oldGit(args);
    input.editorial.locales.en.archiveTitle = "Daily | Changed";
    expect(await isExactCommittedPublicationReplay(input)).toBe(false);
  });
});

describe("retained locale availability is a validated state, never unchanged", () => {
  it("reports available only for a valid current overlay and keeps missing/invalid explicit", async () => {
    const canonical = JSON.parse(await readFile("public/data/archive/2026/10/2026-10-07-daily.json", "utf8"));
    const overlay = JSON.parse(await readFile("public/data/locales/en/archive/2026/10/2026-10-07-daily.json", "utf8"));
    expect(retainedLocaleAvailability(canonical, overlay).localeStatus).toBe("available");
    expect(retainedLocaleAvailability(canonical, null)).toEqual({ localeStatus: "unavailable", localeReasonCode: "editorial-overlay-missing" });
    expect(retainedLocaleAvailability(canonical, { ...overlay, factsDigest: `sha256:${"0".repeat(64)}` })).toEqual({ localeStatus: "unavailable", localeReasonCode: "editorial-overlay-invalid" });
    expect(retainedLocaleAvailability(canonical, null, { reasonCode: "editorial-overlay-rejected" }).localeReasonCode).toBe("editorial-overlay-rejected");
  });
});

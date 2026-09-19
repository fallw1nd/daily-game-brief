import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const publisher = await readFile(".github/workflows/publish-editorial-decision.yml", "utf8");
const sla = await readFile(".github/workflows/brief-sla-watchdog.yml", "utf8");
const queueScript = await readFile("scripts/advance-showcase-queue.mjs", "utf8");
const queueLib = await readFile("scripts/lib/editorial-queue.mjs", "utf8");
const stateLib = await readFile("scripts/lib/edition-state.mjs", "utf8");
const publisherLib = await readFile("scripts/publish-editorial-decision.mjs", "utf8");
const queueUpdater = await readFile("scripts/update-showcase-queue-branch.sh", "utf8");

describe("editorial continuation queue orchestration", () => {
  it("advances the publishing edition and keeps one oldest global continuation lane", () => {
    expect(publisher).toContain('node scripts/advance-showcase-queue.mjs --state-root="$state_dir" --edition="${{ steps.submission.outputs.edition }}" --max-activations=1');
    expect(publisher).toContain("Activate one oldest pending continuation");
    expect(publisher).toContain("bash scripts/update-showcase-queue-branch.sh --no-refresh-sources");
    expect(sla).toContain("bash scripts/update-showcase-queue-branch.sh --refresh-sources");
    expect(queueUpdater).toContain('edition_filter=""');
    expect(queueUpdater).toContain('queue_args+=(--edition="$edition_filter")');
    expect(queueScript).toContain("(a.issueNumber || 0) - (b.issueNumber || 0)");
    expect(queueScript).toContain('"continuation-already-open"');
    expect(queueScript).toContain('--max-activations=');
    expect(queueScript).toContain('advanceEditorialQueue');
  });

  it("keeps queue authorization separate from showcase completion", () => {
    expect(stateLib).toContain('event === "continuation-opened"');
    expect(queueLib).toContain('reason: EDITORIAL_CONTINUATION_REASON');
    expect(queueLib).toContain('reason: SHOWCASE_COMPLETION_REASON');
    expect(queueLib).toContain('packet.continuation?.scope !== batch.scope');
    expect(queueLib).toContain('news batch ${batch.name} event identities do not match');
    expect(publisherLib).toContain("editorial continuation requires a matching durable state authorization");
    expect(publisherLib).toContain("packet.editorialInput.packages.every(item => !item.showcaseRefs?.length)");
  });
});

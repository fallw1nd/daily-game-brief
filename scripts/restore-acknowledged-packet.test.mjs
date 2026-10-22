// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { restoreAcknowledgedPacket } from "./restore-acknowledged-packet.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";

it("recovers missing/invalid packets without mistaking an unreadable ref for absence", () => {
  const cwd = mkdtempSync(join(tmpdir(), "packet-restore-"));
  const git = args => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init"]); git(["config", "user.email", "test@example.test"]); git(["config", "user.name", "Test"]);
  git(["commit", "--allow-empty", "-m", "initial"]);
  const options = { cwd, ref: "HEAD", editionId: "2026-10-05-daily" };
  expect(restoreAcknowledgedPacket(options)).toMatchObject({ available: false, reason: "exact edition packet is missing" });
  expect(() => restoreAcknowledgedPacket({ ...options, ref: "missing-ref" })).toThrow();
  const path = join(cwd, "automation/packets/2026-10-05-daily.json");
  mkdirSync(join(cwd, "automation/packets"), { recursive: true });
  const commit = () => { git(["add", "."]); git(["commit", "-m", "fixture"]); };
  writeFileSync(path, "{"); commit();
  expect(restoreAcknowledgedPacket(options)).toMatchObject({ available: false, reason: "invalid packet JSON" });
  const packet = { schemaVersion: 3, mode: "chatgpt-handoff", finalizedAt: "2026-10-05T02:11:00Z", coverageThrough: "2026-10-05 10:10", outputSchema: {}, editorialInput: { schemaVersion: 2, window: expectedEditorialWindow(options.editionId), packages: [], trackingQueue: [] } };
  writeFileSync(path, JSON.stringify(packet)); commit();
  const ready = restoreAcknowledgedPacket(options);
  expect(ready.available).toBe(true);
  const state = join(cwd, "automation/status/2026-10-05-daily.json");
  mkdirSync(join(cwd, "automation/status"));
  writeFileSync(state, JSON.stringify({ packet: { blobSha: ready.blobSha } }));
  writeFileSync(path, JSON.stringify({ ...packet, coverageThrough: "2026-10-04 10:10" })); commit();
  expect(restoreAcknowledgedPacket(options).text).toBe(ready.text);
  writeFileSync(state, JSON.stringify({ packet: { blobSha: "a".repeat(40) } })); commit();
  expect(restoreAcknowledgedPacket(options)).toMatchObject({ available: false, reason: "acknowledged packet blob unavailable" });
});

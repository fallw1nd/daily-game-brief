import { describe, expect, it } from "vitest";
import {
  classifyEvidenceReadiness,
  resolveEvidencePublishedAt,
} from "./lib/evidence-readiness.mjs";

describe("evidence readiness", () => {
  it("treats one opened primary source as a publishable evidence shape", () => {
    expect(classifyEvidenceReadiness([
      { status: "opened", kind: "primary", independenceKey: "publisher.example" },
    ])).toBe("primary-only");
  });

  it("distinguishes one curated media source from discovery-only evidence", () => {
    expect(classifyEvidenceReadiness([
      { status: "opened", kind: "secondary", independenceKey: "media.example" },
    ])).toBe("single-media");
    expect(classifyEvidenceReadiness([
      { status: "opened", kind: "discovery", independenceKey: "discovery.example" },
    ])).toBe("discovery-only");
  });

  it("recognizes two independent media sources without requiring a primary", () => {
    expect(classifyEvidenceReadiness([
      { status: "opened", kind: "secondary", independenceKey: "media-a.example" },
      { status: "opened", kind: "secondary", independenceKey: "media-b.example" },
    ])).toBe("two-media-no-primary");
  });
});

describe("evidence publication time fallback", () => {
  it("preserves the RSS/feed timestamp when the opened article has no timestamp", () => {
    expect(resolveEvidencePublishedAt({
      listingPublishedAt: "2026-09-21T03:15:00.000Z",
    })).toBe("2026-09-21T03:15:00.000Z");
  });

  it("prefers article metadata over visible and listing timestamps", () => {
    expect(resolveEvidencePublishedAt({
      metadataPublishedAt: "2026-09-21T03:20:00.000Z",
      visiblePublishedAt: "2026-09-21T03:18:00.000Z",
      listingPublishedAt: "2026-09-21T03:15:00.000Z",
    })).toBe("2026-09-21T03:20:00.000Z");
  });
});

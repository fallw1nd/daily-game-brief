import { describe, expect, it } from "vitest";
import { summarizeEditionMedia } from "./media-status.mjs";

describe("edition-wide media status", () => {
  it("keeps an edition partial when verified media already exists and one cover remains unavailable", () => {
    const result = summarizeEditionMedia({
      entries: [
        { image_status: "verified", images: [{ url: "media/story.jpg" }] },
        { image_status: "verified", images: [{ url: "media/story-2.jpg" }] },
      ],
      upcoming: [
        { cover_status: "verified", cover: { url: "media/cover.jpg" } },
        { cover_status: "unavailable", coverNote: "not found" },
      ],
    });

    expect(result).toEqual({
      status: "partial",
      verified: 3,
      unresolved: 1,
      total: 4,
      reason: "verified-3-unresolved-1",
    });
  });

  it("reports available only when every edition media item is verified", () => {
    const result = summarizeEditionMedia({
      entries: [{ image_status: "verified", images: [{ url: "media/story.jpg" }] }],
      upcoming: [{ cover_status: "verified", cover: { url: "media/cover.jpg" } }],
    });

    expect(result.status).toBe("available");
    expect(result.unresolved).toBe(0);
  });

  it("reports unavailable when the edition has media requirements but none are verified", () => {
    const result = summarizeEditionMedia({
      entries: [{ image_status: "unavailable", imageNote: "not found" }],
      upcoming: [{ cover_status: "unavailable", coverNote: "not found" }],
    });

    expect(result.status).toBe("unavailable");
    expect(result.verified).toBe(0);
    expect(result.unresolved).toBe(2);
  });

  it("treats existing legacy media assets as verified even when status fields are absent", () => {
    const result = summarizeEditionMedia({
      entries: [{ images: [{ url: "media/story.jpg" }] }],
      upcoming: [{ cover: { url: "media/cover.jpg" } }],
    });

    expect(result.status).toBe("available");
  });
});

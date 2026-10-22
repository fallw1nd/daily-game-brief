// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { fetchLimited } from "./enrich-media.mjs";

const lookupHost = vi.fn(async () => [{ address: "203.0.113.1", family: 4 }]);
const bytes = (text) => new TextEncoder().encode(text);

function streamResponse(chunks, headers = {}) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(bytes(chunks[index++]));
      else controller.close();
    },
    cancel,
  }, { highWaterMark: 0 });
  return { response: new Response(body, { headers }), cancel, reads: () => index };
}

describe("bounded media fetch", () => {
  it("follows a safe relative redirect with one deadline and the final URL", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/image.jpg" } }))
      .mockResolvedValueOnce(new Response("image", { headers: { "content-type": "image/jpeg" } }));
    const result = await fetchLimited("https://example.com/start", 5, "image/*", { fetcher, lookupHost });
    expect(result.bytes.toString()).toBe("image");
    expect(result.url).toBe("https://example.com/image.jpg");
    expect(fetcher.mock.calls.every(([, options]) => options.redirect === "manual")).toBe(true);
    expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal);
  });

  it.each(["http://example.com/image", "https://localhost/image", "https://internal.example/image"])("rejects unsafe redirect %s before fetching it", async (target) => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: target } }));
    const lookup = vi.fn(async (host) => [{ address: host === "internal.example" ? "10.0.0.1" : "203.0.113.1", family: 4 }]);
    await expect(fetchLimited("https://example.com/start", 50, "image/*", { fetcher, lookupHost: lookup })).rejects.toThrow(/HTTPS|local host|private network/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds redirect loops and rejects missing Location", async () => {
    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/loop" } }));
    await expect(fetchLimited("https://example.com/start", 50, "image/*", { fetcher: loop, lookupHost })).rejects.toThrow("too many redirects");
    expect(loop).toHaveBeenCalledTimes(6);
    await expect(fetchLimited("https://example.com/start", 50, "image/*", { fetcher: async () => new Response(null, { status: 302 }), lookupHost })).rejects.toThrow("missing a location");
  });

  it.each([{}, { "content-length": "1" }])("stops and cancels an oversized stream even without an honest length header: %j", async (headers) => {
    const stream = streamResponse(["123", "456", "never-read"], headers);
    await expect(fetchLimited("https://example.com/image", 5, "image/*", { fetcher: async () => stream.response, lookupHost })).rejects.toThrow("exceeds 5 bytes");
    expect(stream.reads()).toBe(2);
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects a declared oversized body without reading it", async () => {
    const stream = streamResponse(["never-read"], { "content-length": "100" });
    await expect(fetchLimited("https://example.com/image", 5, "image/*", { fetcher: async () => stream.response, lookupHost })).rejects.toThrow("exceeds 5 bytes");
    expect(stream.reads()).toBe(0);
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it("requires validation again after rebasing media onto concurrent production changes", async () => {
    const workflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");
    const retry = workflow.split("for attempt in 1 2 3; do")[1].split("          done")[0];
    expect(retry).toMatch(/git rebase origin\/main\n\s*#[^\n]*\n\s*npm run check/);
  });
});

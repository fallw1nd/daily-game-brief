import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReadingApp from "./ReadingApp";
import { JSON_REQUEST_TIMEOUT_MS } from "./data/fetchJson";
import published from "../public/data/archive/2026/09/2026-09-07-daily.json";
import previous from "../public/data/archive/2026/09/2026-09-06-daily.json";
import type { BriefEdition, BriefManifest } from "./types";

const edition = published as BriefEdition;
const oldEdition = previous as BriefEdition;
const manifest: BriefManifest = {
  schemaVersion: 1, updatedAt: edition.generatedAt, latest: edition.id,
  editions: [{ ...edition, path: `archive/2026/09/${edition.id}.json` }],
};
const json = (value: unknown) => new Response(JSON.stringify(value));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
let root: Root;
let container: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const mount = async (english = false) => {
  await act(async () => root.render(<ReadingApp english={english} />));
};
const navigate = async (id: string) => {
  await act(async () => {
    window.history.pushState(null, "", `/daily-game-brief/?view=reading&edition=${encodeURIComponent(id)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
};
const callsTo = (suffix: string) => fetcher.mock.calls.filter(([url]) => String(url).endsWith(suffix));
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!;

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  window.history.replaceState(null, "", "/daily-game-brief/?view=reading");
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("manifest.json")) return json(manifest);
    if (url.endsWith("search-index.json")) return json({ schemaVersion: 1, updatedAt: "", entries: [] });
    if (url.endsWith("locales/en/index.json")) return json({ schemaVersion: 1, locale: "en", editions: [] });
    return json(edition);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  // jsdom queues zero-delay disclosure toggle events; flush those, not request deadlines.
  await act(async () => vi.advanceTimersByTimeAsync(0));
  const remaining = vi.getTimerCount();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(remaining).toBe(0);
});

describe("ReadingApp request recovery", () => {
  it("keeps injected editions isolated without leaving missing navigation or calendar loading forever", async () => {
    await act(async () => root.render(<ReadingApp initialEdition={edition} initialSearchIndex={{ schemaVersion: 1, updatedAt: "", entries: [] }} />));
    expect(fetcher).not.toHaveBeenCalled();
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
    expect(container.textContent).toContain("归档目录暂时无法读取");
    expect(container.textContent).not.toContain("正在读取");
    expect(button("重试归档目录")).toBeUndefined();
  });

  it("renders latest content despite manifest failure and retries only navigation", async () => {
    const otherwise = fetcher.getMockImplementation()!;
    let fail = true;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith("manifest.json") && fail
      ? new Response("Unavailable", { status: 503 }) : otherwise(input, init));
    await mount();
    const lead = container.querySelector(".r-lead");
    expect(lead?.textContent).toContain(edition.archiveTitle);
    expect(container.textContent).toContain("归档目录暂时无法读取");
    expect(container.textContent).not.toContain("正在读取发售日历");
    expect(container.querySelector(".r-pager")).toBeNull();
    fail = false;
    await act(async () => button("重试归档目录").click());
    expect(container.querySelector(".r-lead")).toBe(lead);
    expect(container.querySelector(".r-archive-list a")).not.toBeNull();
    expect(callsTo("latest.json")).toHaveLength(1);
    expect(callsTo("manifest.json")).toHaveLength(2);
  });

  it("opens a historical deep link while optional navigation hangs, without requesting latest", async () => {
    window.history.replaceState(null, "", `/daily-game-brief/?edition=${edition.id}`);
    const otherwise = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith("manifest.json")
      ? new Promise<Response>(() => {}) : otherwise(input, init));
    await mount();
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
    expect(callsTo("latest.json")).toHaveLength(0);
    expect(callsTo(`archive/2026/09/${edition.id}.json`)).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(JSON_REQUEST_TIMEOUT_MS));
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
    expect(button("重试归档目录")).toBeDefined();
  });

  it("keeps recent archive recovery available after latest fails, then retries latest successfully", async () => {
    const otherwise = fetcher.getMockImplementation()!;
    let fail = true;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith("latest.json") && fail
      ? new Response("Unavailable", { status: 503 }) : otherwise(input, init));
    await mount();
    expect(container.querySelector("h1")?.textContent).toBe("暂时无法打开这份简报");
    expect(container.querySelector<HTMLAnchorElement>(".r-loading a")?.href).toContain(`edition=${edition.id}`);
    fail = false;
    await act(async () => button("重试").click());
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
    expect(callsTo("latest.json")).toHaveLength(2);
    expect(callsTo("manifest.json")).toHaveLength(1);
  });

  it.each(["headers", "body"])("recovers from a never-settling latest %s with a finite failure and working retry", async (stage) => {
    const otherwise = fetcher.getMockImplementation()!;
    let stalled = true;
    fetcher.mockImplementation(async (input, init) => {
      if (!String(input).endsWith("latest.json") || !stalled) return otherwise(input, init);
      return stage === "headers" ? new Promise<Response>(() => {}) : { ok: true, json: () => new Promise(() => {}) } as Response;
    });
    await mount();
    expect(container.querySelector("h1")?.textContent).toBe("正在读取简报");
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.textContent).toContain("连接较慢");
    await act(async () => vi.advanceTimersByTimeAsync(JSON_REQUEST_TIMEOUT_MS - 10_000));
    expect(container.querySelector("h1")?.textContent).toBe("暂时无法打开这份简报");
    expect(callsTo("latest.json")[0][1]?.signal?.aborted).toBe(true);
    stalled = false;
    await act(async () => button("重试").click());
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
  });

  it("cancels the previous body read and ignores its late result after history navigation", async () => {
    window.history.replaceState(null, "", `/daily-game-brief/?edition=${oldEdition.id}`);
    const oldBody = deferred<BriefEdition>();
    const otherwise = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith(`${oldEdition.id}.json`)
      ? { ok: true, json: () => oldBody.promise } as Response : otherwise(input, init));
    await mount();
    await navigate(edition.id);
    expect(callsTo(`${oldEdition.id}.json`)[0][1]?.signal?.aborted).toBe(true);
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
    await act(async () => oldBody.resolve(oldEdition));
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
  });

  it("hides already rendered content immediately while another edition is loading", async () => {
    await mount();
    const nextBody = deferred<BriefEdition>();
    const otherwise = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith(`${oldEdition.id}.json`)
      ? { ok: true, json: () => nextBody.promise } as Response : otherwise(input, init));
    await navigate(oldEdition.id);
    expect(container.querySelector(".r-lead")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("正在读取简报");
    await act(async () => nextBody.resolve(oldEdition));
    expect(container.querySelector("h1")?.textContent).toBe(oldEdition.archiveTitle);
  });

  it("does not retain Chinese content when switching to unavailable English", async () => {
    await mount();
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
    await mount(true);
    expect(container.querySelector(".r-lead")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("This edition is unavailable");
    expect(container.textContent).toContain("Read in Chinese");
  });

  it("retains the English fact-digest safety gate even when the locale index says available", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: async () => new Uint8Array(32).buffer } });
    const otherwise = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("locales/en/index.json")) return json({
        schemaVersion: 1, locale: "en", editions: [{ editionId: edition.id, status: "available", archiveTitle: "English test" }],
      });
      if (url.includes("/locales/en/archive/")) return json({
        schemaVersion: 1, locale: "en", editionId: edition.id, baseSchemaVersion: 2,
        factsDigest: `sha256:${"1".repeat(64)}`, entries: [], upcoming: [],
      });
      return otherwise(input, init);
    });
    await mount(true);
    expect(container.querySelector(".r-lead")).toBeNull();
    expect(container.textContent).toContain("English version is temporarily unavailable for this edition.");
  });

  it("retries a failed search without refetching or hiding readable content", async () => {
    window.history.replaceState(null, "", "/daily-game-brief/?q=test");
    const otherwise = fetcher.getMockImplementation()!;
    let fail = true;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith("search-index.json") && fail
      ? new Response("Unavailable", { status: 503 }) : otherwise(input, init));
    await mount();
    const lead = container.querySelector(".r-lead");
    expect(container.textContent).toContain("搜索暂时不可用");
    fail = false;
    await act(async () => button("重新加载").click());
    expect(container.querySelector(".r-lead")).toBe(lead);
    expect(container.textContent).not.toContain("搜索暂时不可用");
    expect(callsTo("latest.json")).toHaveLength(1);
    expect(callsTo("search-index.json")).toHaveLength(2);
  });

  it("rejects a mismatched canonical archive instead of showing the wrong edition", async () => {
    window.history.replaceState(null, "", `/daily-game-brief/?edition=${oldEdition.id}`);
    await mount();
    expect(container.querySelector(".r-lead")).toBeNull();
    expect(container.textContent).toContain("does not match the requested edition");
  });

  it("rejects a malformed deep link without fetching archive or latest content", async () => {
    window.history.replaceState(null, "", "/daily-game-brief/?edition=..%2Flatest");
    await mount();
    expect(container.querySelector(".r-lead")).toBeNull();
    expect(container.textContent).toContain("Invalid archive edition ID");
    expect(callsTo("latest.json")).toHaveLength(0);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/archive/"))).toBe(false);
  });

  it("aborts all outstanding header and body reads on unmount", async () => {
    fetcher.mockImplementation(async (input) => String(input).endsWith("latest.json")
      ? { ok: true, json: () => new Promise(() => {}) } as Response : new Promise<Response>(() => {}));
    await mount();
    const signals = fetcher.mock.calls.map(([, init]) => init?.signal);
    await act(async () => root.unmount());
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal?.aborted)).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(vi.getTimerCount()).toBe(0);
  });
});

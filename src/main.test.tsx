import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({ reading: vi.fn(), classic: vi.fn(), english: vi.fn() }));
let root: Root | undefined;
vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  return { ...actual, default: { ...actual, createRoot: (container: HTMLElement) => {
    root = actual.createRoot(container);
    return root;
  } } };
});
vi.mock("./ReadingApp", () => {
  loaded.reading();
  return { default: ({ english }: { english: boolean }) => <main>{english ? "reading-en" : "reading-zh"}</main> };
});
vi.mock("./App", () => {
  loaded.classic();
  return { default: () => <main><header className="topbar" />classic-zh</main> };
});
vi.mock("./EnglishApp", () => {
  loaded.english();
  return { default: () => <main><header className="topbar" />classic-en</main> };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function open(query: string) {
  window.history.replaceState(null, "", `/daily-game-brief/${query}`);
  await act(async () => { await import("./main"); });
}

describe("entry-point route splitting", () => {
  it("loads the default reader without importing either classic app", async () => {
    await open("");
    expect(document.body.textContent).toContain("reading-zh");
    expect(loaded.reading).toHaveBeenCalledOnce();
    expect(loaded.classic).not.toHaveBeenCalled();
    expect(loaded.english).not.toHaveBeenCalled();
  });
  it("keeps the explicit English reader route", async () => {
    await open("?view=reading&lang=en");
    expect(document.body.textContent).toContain("reading-en");
    expect(document.documentElement.lang).toBe("en");
    expect(loaded.classic).not.toHaveBeenCalled();
    expect(loaded.english).not.toHaveBeenCalled();
  });
  it("keeps the Chinese classic route and its locale switch", async () => {
    await open("?view=classic&edition=2026-10-22-daily#story");
    expect(document.body.textContent).toContain("classic-zh");
    expect(loaded.english).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLAnchorElement>(".locale-toggle")?.href).toContain("lang=en#story");
  });
  it("keeps the English classic route and its locale switch", async () => {
    await open("?view=classic&lang=en#story");
    expect(document.body.textContent).toContain("classic-en");
    expect(document.querySelector<HTMLAnchorElement>(".locale-toggle")?.href).toMatch(/\?view=classic#story$/);
  });
});

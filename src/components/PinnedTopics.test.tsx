import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Catchup } from "./Catchup";
import { pinnedTopicsKey } from "../lib/pinned-topics";
import type { BriefSearchIndex } from "../types";

let root: Root;
const index: BriefSearchIndex = { schemaVersion: 1, updatedAt: "2026-11-09", entries: [
  { editionId: "2026-11-01-daily", entryId: "original-a", issueNumber: 1, date: "2026-11-01", period: "daily", titleKey: "gta-6", titleEn: "Grand Theft Auto VI", titleZhCn: "侠盗猎车手VI", headline: "Original rumor", summary: "Unchanged summary", platforms: ["PS5"], region: "Global", factStatus: "unconfirmed", section: "rumors" },
  { editionId: "2026-11-09-daily", entryId: "original-b", issueNumber: 2, date: "2026-11-09", period: "daily", titleKey: "grand-theft-auto-vi", titleEn: "Grand Theft Auto VI", titleZhCn: "侠盗猎车手VI", headline: "Original news", summary: "Original report", platforms: ["PS5"], region: "Global", factStatus: "media_report", section: "news" },
  { editionId: "2026-11-09-daily", entryId: "original-c", issueNumber: 2, date: "2026-11-09", period: "daily", titleKey: "gta-online", titleEn: "GTA Online", titleZhCn: "GTA Online", headline: "Other game", summary: "Separate story", platforms: ["PS5"], region: "Global", factStatus: "official", section: "news" },
] };
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/daily-game-brief/?catchup=1&cuTopic=gta-6");
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); localStorage.clear(); });
async function render(english = false, data = index) { await act(async () => root.render(<StrictMode><Catchup index={data} english={english} error={false} onRetry={() => {}} onClose={() => {}} /></StrictMode>)); }
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent === text);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function choose(value: string) {
  const select = document.querySelector("select")!;
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function storage(value: string | null, key: string | null = pinnedTopicsKey, area = localStorage) {
  if (key === null) area.clear(); else if (value === null) area.removeItem(key); else area.setItem(key, value);
  await act(async () => window.dispatchEvent(new StorageEvent("storage", { key, newValue: value, storageArea: area })));
}

it("does not write preferences on mount, and pinning does not change dates, history or published stories", async () => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  const before = structuredClone(index);
  const url = window.location.href;
  await render();
  expect(write).not.toHaveBeenCalled();
  await click("设为常看主题");
  expect(JSON.parse(localStorage.getItem(pinnedTopicsKey)!)).toEqual(["grand-theft-auto-vi"]);
  expect(window.location.href).toBe(url);
  expect(document.querySelectorAll(".cu-story")).toHaveLength(1);
  expect(document.querySelector(".cu-pin-count")?.textContent).toBe("1");
  expect(index).toEqual(before);
  expect(document.querySelector(".cu-pins")?.textContent).toContain("不同步、不发送通知");
});
it("restores pins with current-language labels on remount, retaining canonical identity and current date counts", async () => {
  await render(); await click("设为常看主题");
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root")!);
  await render(true);
  expect(document.querySelector(".cu-pin-topic")?.textContent).toBe("Grand Theft Auto VI1");
  await click("All indexed");
  expect(document.querySelector(".cu-pin-count")?.textContent).toBe("2");
  await choose("gta-online");
  await act(async () => document.querySelector<HTMLButtonElement>(".cu-pin-topic")!.click());
  expect(document.querySelector("select")?.value).toBe("grand-theft-auto-vi");
  expect(new URLSearchParams(window.location.search).get("cuDays")).toBe("all");
  expect(document.querySelectorAll(".cu-story")).toHaveLength(2);
  expect(document.querySelector(".cu-timeline")?.textContent).toContain("Rumor / unconfirmed");
  expect(document.querySelector(".cu-story-links a")?.getAttribute("href")).toContain("#original-a");
});
it("shares only the selected topic, never the private pin list", async () => {
  localStorage.setItem(pinnedTopicsKey, '["gta-online","grand-theft-auto-vi"]');
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } });
  await render(); await click("复制这份补课");
  const url = new URL(write.mock.calls[0][0]);
  expect(url.searchParams.get("cuTopic")).toBe("grand-theft-auto-vi");
  expect(url.href).not.toContain("gta-online");
  expect(url.href).not.toContain("pinned");
});
it("keeps missing-language pins removable and never substitutes a same-name game", async () => {
  localStorage.setItem(pinnedTopicsKey, '["unreviewed-same-name"]');
  await render(true);
  expect(document.querySelector(".cu-pin-topic")?.textContent).toContain("Not indexed in this language: unreviewed-same-name");
  await act(async () => document.querySelector<HTMLButtonElement>(".cu-pin-topic")!.click());
  expect(document.querySelector(".cu-pin-topic")?.getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelectorAll(".cu-story")).toHaveLength(0);
  await act(async () => document.querySelector<HTMLButtonElement>(".cu-pin-remove")!.click());
  expect(document.querySelectorAll(".cu-pin-topic")).toHaveLength(0);
  expect(localStorage.getItem(pinnedTopicsKey)).toBe("[]");
});
it("syncs changes and clearing from other tabs without writing back, ignoring session storage and unrelated keys", async () => {
  await render();
  await storage('["gta-online"]');
  expect(document.querySelectorAll(".cu-pin-topic")).toHaveLength(1);
  await storage('["grand-theft-auto-vi"]', pinnedTopicsKey, sessionStorage);
  await storage('"dark"', "brief-theme");
  expect(document.querySelector(".cu-pin-topic")?.textContent).toBe("GTA Online1");
  const write = vi.spyOn(Storage.prototype, "setItem");
  await storage(null, null);
  expect(document.querySelectorAll(".cu-pin-topic")).toHaveLength(0);
  expect(write).not.toHaveBeenCalled();
});
it("merges an action with another tab's newest list even before its event arrives", async () => {
  await render();
  localStorage.setItem(pinnedTopicsKey, '["gta-online"]');
  await click("设为常看主题");
  expect(JSON.parse(localStorage.getItem(pinnedTopicsKey)!)).toEqual(["gta-online", "grand-theft-auto-vi"]);
  await click("取消常看");
  expect(JSON.parse(localStorage.getItem(pinnedTopicsKey)!)).toEqual(["gta-online"]);
});
it("bounds pins to twelve, permits removals at the limit, and restores adding afterward", async () => {
  localStorage.setItem(pinnedTopicsKey, JSON.stringify(Array.from({ length: 12 }, (_, i) => `unknown-${i}`)));
  await render();
  const button = [...document.querySelectorAll("button")].find(item => item.textContent === "设为常看主题")!;
  expect(button.disabled).toBe(true);
  expect(document.querySelector(".cu-pins")?.textContent).toContain("最多保留12个");
  await act(async () => document.querySelector<HTMLButtonElement>(".cu-pin-remove")!.click());
  expect(button.disabled).toBe(false);
  await click("设为常看主题");
  expect(document.querySelectorAll(".cu-pin-topic")).toHaveLength(12);
  await click("取消常看");
  expect(document.querySelectorAll(".cu-pin-topic")).toHaveLength(11);
});
it("retains temporary choices and warns when storage writes fail, without claiming persistence", async () => {
  await render();
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await click("设为常看主题");
  expect(document.querySelector(".cu-pins [role=status]")?.textContent).toContain("刷新后可能丢失");
  expect(document.querySelectorAll(".cu-pin-topic")).toHaveLength(1);
  await choose("gta-online"); await click("设为常看主题");
  expect(document.querySelectorAll(".cu-pin-topic")).toHaveLength(2);
  write.mockRestore();
  await click("取消常看");
  expect(JSON.parse(localStorage.getItem(pinnedTopicsKey)!)).toEqual(["grand-theft-auto-vi"]);
  expect(document.querySelector(".cu-pins [role=status]")).toBeNull();
});
it("handles blocked storage reads and malformed data without crashing or dropping the reader", async () => {
  localStorage.setItem(pinnedTopicsKey, "{broken");
  await render();
  expect(document.querySelectorAll(".cu-story")).toHaveLength(1);
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Denied"); });
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Denied"); });
  await click("设为常看主题");
  expect(document.querySelectorAll(".cu-pin-topic")).toHaveLength(1);
  expect(document.querySelector(".cu-pins [role=status]")).toBeTruthy();
  read.mockRestore(); write.mockRestore();
});

it.each([false, true])("keeps focus in the pin shelf after removing first, last and only pins (English=%s)", async english => {
  localStorage.setItem(pinnedTopicsKey, '["grand-theft-auto-vi","gta-online","missing"]');
  await render(english);
  async function removeAt(i: number) {
    const button = document.querySelectorAll<HTMLButtonElement>(".cu-pin-remove")[i];
    button.focus();
    await act(async () => button.click());
  }
  await removeAt(0);
  expect(document.activeElement).toBe(document.querySelector(".cu-pin-topic"));
  await removeAt(1);
  expect(document.activeElement).toBe(document.querySelector(".cu-pin-topic"));
  await removeAt(0);
  expect(document.activeElement?.id).toBe("cu-pins-title");
  expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
});

it("does not move focus during pin initialization or a cross-tab update", async () => {
  await render();
  const select = document.querySelector("select")!;
  select.focus();
  await storage('["gta-online"]');
  expect(document.activeElement).toBe(select);
  await storage(null);
  expect(document.activeElement).toBe(select);
});

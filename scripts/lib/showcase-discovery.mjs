import { JSDOM } from "jsdom";

const clean = value => String(value || "").replace(/\s+/g, " ").trim();
export function showcaseDate(text, url = "") {
  const compact = url.match(/\/(20\d{2})(\d{2})(\d{2})(?:\/|_)/);
  const iso = compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : null;
  if (iso) return iso;
  const usPath = url.match(/\/nintendo-direct\/(\d{1,2})-(\d{1,2})-(20\d{2})\//);
  if (usPath) return `${usPath[3]}-${usPath[1].padStart(2, "0")}-${usPath[2].padStart(2, "0")}`;
  const jp = text.match(/(?:Direct|State of Play)[^\n]{0,45}?(20\d{2})[.年/-](\d{1,2})[.月/-](\d{1,2})/i);
  if (jp) return `${jp[1]}-${jp[2].padStart(2, "0")}-${jp[3].padStart(2, "0")}`;
  const us = text.match(/(?:Direct|State of Play)[^\n]{0,45}?(\d{1,2})\.(\d{1,2})\.(20\d{2})/i);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const eu = text.match(/(?:Direct|State of Play)[^\n]{0,45}?(\d{1,2})\/(\d{1,2})\/(20\d{2})/i);
  return eu ? `${eu[3]}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}` : null;
}

export function officialShowcaseSchedule(text, url) {
  const date = showcaseDate(text, url);
  if (!date) return null;
  const time = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\s*(PT|ET)\b/i);
  if (!time) return null;
  const hour = Number(time[1]) % 12 + (/^p/i.test(time[3]) ? 12 : 0);
  const minute = Number(time[2] || 0);
  if (Number(time[1]) > 12 || minute > 59) return null;
  const local = Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const zone = time[4].toUpperCase() === "PT" ? "America/Los_Angeles" : "America/New_York";
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date(local)).find(part => part.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!offset) return null;
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1);
  return { date, startsAt: new Date(local - minutes * 60000).toISOString(), timeBasis: { url, excerpt: clean(text).slice(0, 700), timezone: zone } };
}

export function discoverShowcaseLinks(html, source) {
  const document = new JSDOM(html, { url: source.url }).window.document;
  const links = [...document.querySelectorAll("a[href]")].filter(node => /direct|state-of-play/i.test(node.href) && /Direct|State of Play|ダイレクト|テキスト版/i.test(node.textContent));
  return links.map(node => ({ url: node.href, date: showcaseDate(clean(node.textContent), node.href), schedule: officialShowcaseSchedule(clean(node.textContent), source.url), transcript: /テキスト版/.test(node.textContent) && /\/description\//.test(node.href) }));
}

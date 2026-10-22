import { generatedEditorialAlt } from "./media-alt.mjs";

// Two generated descriptions left behind by 4f9ac246 (headline recovery).
// d1468b45 proves the original generated format; 448fb0a2 subsequently
// localized names. Never infer generated provenance from a suffix or marker.
const repairs = [
  {
    "entryId": "2026-09-02-daily-news-0",
    "titleKey": "turok-origins",
    "sourceUrl": "https://news.xbox.com/en-us/2026/09/01/turok-origins-gamescom-2026-preview-xbox/",
    "imageUrl": "media/briefs/2026/09/2026-09-02-daily/2026-09-02-daily-news-0-editorial.jpg",
    "oldAlt": "恐龙猎人：起源：[自动事实清单] 恐龙猎人：起源 &#8211; A Classic, Arcade-Style Shooter That Celebrates What Shooters Do Best相关配图"
  },
  {
    "entryId": "2026-09-02-daily-news-2",
    "titleKey": "no-rest-for-the-wicked",
    "sourceUrl": "https://automaton-media.com/articles/newsjp/20260902-464521/",
    "imageUrl": "media/briefs/2026/09/2026-09-02-daily/2026-09-02-daily-news-2-editorial.jpg",
    "oldAlt": "恶意不息：[自动事实清单] 協力マルチ対応・大人気残酷美ARPG『恶意不息』正式リリースを来年3月へ延期。期待される水準目指し、パフォーマンス・クラスシステムなどさらに磨き込み相关配图"
  }
];

export function repairLegacyGeneratedAlts(editionId, entry, { apply = false } = {}) {
  if (editionId !== "2026-09-02-daily" || entry.image_status !== "verified") return [];
  const binding = repairs.find(item => item.entryId === entry.id && item.titleKey === entry.title?.title_key);
  if (!binding) return [];
  const results = [];
  for (const image of entry.images || []) {
    if (image.kind !== "editorial" || image.placeholder || image.url !== binding.imageUrl
      || image.sourceUrl !== binding.sourceUrl || image.alt !== binding.oldAlt) continue;
    const alt = generatedEditorialAlt(entry);
    if (apply) image.alt = alt;
    results.push({ status: apply ? "applied" : "candidate", recordId: entry.id, kind: "editorial",
      source: image.sourceUrl, action: "refresh-generated-alt", previousAlt: binding.oldAlt, alt });
  }
  return results;
}

import type { GameTitle } from "../types";

/** Calendar presentation only. Canonical names and their research status stay intact. */
export function calendarTitle(title: GameTitle, english = false): { primary: string; original?: string } {
  const original = title.title_en.trim();
  if (english || title.title_zh_status === "unavailable" || !title.title_zh_cn?.trim()) {
    return { primary: original };
  }
  let primary = title.title_zh_cn.trim();
  // Older audited provisional names embedded this exact provenance suffix. Match
  // the structured original, not arbitrary parentheses (which may be part of a name).
  if (title.title_zh_status === "provisional_translation") {
    const suffix = `（${original}，暂译）`;
    if (primary.endsWith(suffix)) primary = primary.slice(0, -suffix.length).trim();
  }
  if (!primary) return { primary: original };
  const sameName = primary.normalize("NFKC").toLocaleLowerCase() === original.normalize("NFKC").toLocaleLowerCase();
  return { primary, ...(!sameName && original ? { original } : {}) };
}

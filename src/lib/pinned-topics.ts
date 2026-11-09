import { resolveCatchupTopic } from "./catchup";

export const pinnedTopicsKey = "brief-pinned-topics";
export const pinnedTopicsLimit = 12;

/** Store identities only, never story copy, dates, evidence or language-specific labels. */
export function parsePinnedTopics(value: string | null): string[] {
  if (!value || value.length > 8192) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((key): key is string => typeof key === "string"
      && key.length > 0 && key.length <= 256 && key === key.trim()
      && !/[\u0000-\u001f\u007f]/.test(key)).map(resolveCatchupTopic))].slice(0, pinnedTopicsLimit);
  } catch { return []; }
}

export function readPinnedTopics(): { keys: string[]; persistent: boolean } {
  try { return { keys: parsePinnedTopics(localStorage.getItem(pinnedTopicsKey)), persistent: true }; }
  catch { return { keys: [], persistent: false }; }
}

import type { BriefEdition, BriefEntry, EnglishLocaleOverlay, ImageAsset, UpcomingEntry } from "../types";
import { assetKey } from "./locale-projection.js";
import { resolveEnglishEntryLabels, resolveEnglishUpcomingLabels } from "./locale";

function translatedImage(
  ownerId: string,
  asset: ImageAsset,
  overlay: EnglishLocaleOverlay["entries"][number],
): ImageAsset {
  const translatedAlt = overlay.mediaAlts?.find((item) => item.assetKey === assetKey(ownerId, asset))?.alt;
  return translatedAlt ? { ...asset, alt: translatedAlt } : asset;
}

function projectEntry(
  canonical: BriefEntry,
  overlay: EnglishLocaleOverlay["entries"][number],
): BriefEntry | null {
  const labels = resolveEnglishEntryLabels(canonical, overlay);
  if (!labels) return null;
  return {
    ...canonical,
    title: {
      ...canonical.title,
      title_zh_cn: undefined,
    },
    headline: overlay.headline,
    summary: overlay.summary,
    verification: overlay.verification,
    timeNote: overlay.timeNote,
    region: labels.regionLabel,
    ...(labels.releaseTypeLabel ? { releaseType: labels.releaseTypeLabel } : { releaseType: undefined }),
    sources: labels.sources.map((source) => ({
      label: source.displayLabel!,
      url: source.url,
      kind: source.kind,
    })),
    ...(canonical.images ? {
      images: canonical.images.map((asset) => translatedImage(canonical.id, asset, overlay)),
    } : {}),
  };
}

function projectUpcoming(
  canonical: UpcomingEntry,
  overlay: EnglishLocaleOverlay["upcoming"][number],
): UpcomingEntry | null {
  const labels = resolveEnglishUpcomingLabels(canonical, overlay);
  if (!labels) return null;
  return {
    ...canonical,
    title: {
      ...canonical.title,
      title_zh_cn: undefined,
    },
    region: labels.regionLabel,
    releaseType: labels.releaseTypeLabel,
    source: { ...canonical.source, label: labels.sourceLabel },
    ...(canonical.cover && overlay.coverAlt
      ? { cover: { ...canonical.cover, alt: overlay.coverAlt } }
      : {}),
  };
}

export function projectEnglishEdition(
  canonical: BriefEdition,
  overlay: EnglishLocaleOverlay,
): BriefEdition | null {
  if (overlay.entries.length !== canonical.entries.length || overlay.upcoming.length !== canonical.upcoming.length) {
    return null;
  }
  const entries = canonical.entries.map((entry, index) => projectEntry(entry, overlay.entries[index]));
  const upcoming = canonical.upcoming.map((item, index) => projectUpcoming(item, overlay.upcoming[index]));
  if (entries.some((entry) => entry === null) || upcoming.some((item) => item === null)) return null;
  return {
    ...canonical,
    archiveTitle: overlay.archiveTitle,
    entries: entries as BriefEntry[],
    upcoming: upcoming as UpcomingEntry[],
    sourceReport: overlay.sourceReport,
  };
}

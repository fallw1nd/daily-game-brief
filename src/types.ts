export type FactStatus =
  | "official"
  | "multi_source_verified"
  | "media_report"
  | "media_relay_official"
  | "unconfirmed";
export type TimeStatus = "verified" | "date_only" | "time_unverified";
export type Locale = "zh-CN" | "en";
export type EditionPeriod = "am" | "pm" | "daily";
export type EntryFlag = "supplement" | "rumor" | "corrected" | "region_difference" | "platform_difference";
export type SectionKey = "focus" | "releases" | "reviews" | "news" | "industry" | "features" | "rumors" | "observations" | "upcoming" | "tracking" | "search-report";

export interface SourceLink { label: string; url: string; kind: "primary" | "secondary" | "discovery"; }
export interface ImageAsset { url: string; alt: string; credit: string; sourceUrl: string; kind: "editorial" | "cover"; aspect?: "square" | "portrait" | "landscape"; placeholder?: boolean; }
export type ImageAvailabilityStatus = "verified" | "unavailable";
export interface GameTitle {
  title_key: string;
  title_zh_cn?: string;
  title_en: string;
  title_zh_status: "official_simplified" | "official_traditional" | "common_translation" | "unavailable";
  edition_zh?: string;
}
export interface BriefEntry {
  id: string; section: SectionKey; title: GameTitle; headline: string; summary: string; beijingTime: string; timeEvidenceAt?: string; timeNote: string;
  fact_status: FactStatus; time_status: TimeStatus; entry_flags: EntryFlag[]; platforms: string[]; region: string; releaseType?: string; sources: SourceLink[];
  verification: string; tracking?: boolean; sharedFactFrameDigest?: string; imageSeed: string; images?: ImageAsset[]; image_status?: ImageAvailabilityStatus; imageNote?: string;
}
export interface UpcomingEntry {
  id: string; date: string; title: GameTitle; platforms: string[]; region: string; releaseType: string; source: SourceLink; mediaSources?: SourceLink[]; note: string;
  cover?: ImageAsset; cover_status?: ImageAvailabilityStatus; coverNote?: string;
}
export interface SourceReport { checked: string[]; limited: string[]; note: string; }
export interface BriefEdition {
  schemaVersion?: 1 | 2; archiveTitle?: string; leadEntryId?: string; id: string; issueNumber: number; date: string; period: EditionPeriod; plannedAt: string;
  generatedAt: string; windowStart: string; windowEnd: string; timezone: "Asia/Shanghai"; nextEditionAt: string; revised: boolean; entries: BriefEntry[];
  upcoming: UpcomingEntry[]; tracking: string[]; sourceReport?: SourceReport;
}
export interface BriefManifestItem { archiveTitle?: string; leadEntryId?: string; id: string; issueNumber: number; date: string; period: EditionPeriod; plannedAt?: string; generatedAt: string; revised: boolean; path: string; }
export interface BriefManifest { schemaVersion: 1; updatedAt: string; latest: string; editions: BriefManifestItem[]; }

export interface EnglishSourceLabel { sourceIndex: number; label: string; }
export interface EnglishMediaAlt { assetKey: string; alt: string; creditLabel?: string; }
export interface EnglishEntryOverlay {
  entryId: string; headline: string; summary: string; verification: string; timeNote: string; regionLabel?: string; releaseTypeLabel?: string;
  sourceLabels?: EnglishSourceLabel[]; mediaAlts?: EnglishMediaAlt[];
}
export interface EnglishUpcomingOverlay { upcomingId?: string; upcomingKey?: string; regionLabel?: string; releaseTypeLabel?: string; sourceLabel?: string; coverAlt?: string; }
export interface EnglishLocaleOverlay {
  schemaVersion: 1; locale: "en"; editionId: string; baseSchemaVersion: 1 | 2; factsDigest: string; canonicalCopyDigest: string; localeDigest: string;
  archiveTitle: string; entries: EnglishEntryOverlay[]; upcoming: EnglishUpcomingOverlay[]; sourceReport?: SourceReport;
}
export type EnglishLocaleAvailability =
  | { editionId: string; status: "available"; path: string; archiveTitle: string; factsDigest: string; }
  | { editionId: string; status: "unavailable"; reasonCode: string; summary: string; observedAt: string; factsDigest: string; };
export interface EnglishLocaleIndex { schemaVersion: 1; locale: "en"; updatedAt: string; latestCanonicalEditionId: string; latestAvailableEditionId: string | null; editions: EnglishLocaleAvailability[]; }

export interface BriefSearchEntry {
  editionId: string; issueNumber: number; tracking?: boolean; date: string; period: EditionPeriod; entryId: string; titleZhCn?: string; titleEn: string;
  headline: string; summary: string; platforms: string[]; region: string; factStatus: FactStatus;
}
export interface BriefSearchIndex { schemaVersion: 1; updatedAt: string; entries: BriefSearchEntry[]; }
export interface BriefSearchCopy { subject: string; headline: string; summary: string; }
export interface BriefSearchItemV2 {
  editionId: string; entryId: string; issue: number; date: string; period: EditionPeriod; section: SectionKey; tracking: boolean; availableLocales: Locale[];
  titleKey: string; titleZhCn?: string; titleEn: string; copy: { "zh-CN": BriefSearchCopy; en?: BriefSearchCopy; }; platforms: string[]; region: string;
  factStatus: FactStatus; titleStatus?: GameTitle["title_zh_status"];
}
export interface BriefSearchIndexV2 { schemaVersion: 2; updatedAt: string; items: BriefSearchItemV2[]; }
export type BriefSearchIndexPayload = BriefSearchIndex | BriefSearchIndexV2;

export type FactStatus =
  | "official"
  | "multi_source_verified"
  | "media_report"
  | "media_relay_official"
  | "unconfirmed";

export type TimeStatus = "verified" | "date_only" | "time_unverified";

export type EntryFlag =
  | "supplement"
  | "rumor"
  | "corrected"
  | "region_difference"
  | "platform_difference";

export type SectionKey =
  | "focus"
  | "releases"
  | "reviews"
  | "news"
  | "industry"
  | "features"
  | "rumors"
  | "observations"
  | "upcoming"
  | "tracking"
  | "search-report";

export interface SourceLink {
  label: string;
  url: string;
  kind: "primary" | "secondary" | "discovery";
}

export interface GameTitle {
  title_key: string;
  title_zh_cn?: string;
  title_en: string;
  title_zh_status:
    | "official_simplified"
    | "official_traditional"
    | "common_translation"
    | "unavailable";
  edition_zh?: string;
}

export interface BriefEntry {
  id: string;
  section: SectionKey;
  title: GameTitle;
  headline: string;
  summary: string;
  beijingTime: string;
  timeNote: string;
  fact_status: FactStatus;
  time_status: TimeStatus;
  entry_flags: EntryFlag[];
  platforms: string[];
  region: string;
  releaseType?: string;
  sources: SourceLink[];
  verification: string;
  tracking?: boolean;
  imageSeed: string;
}

export interface UpcomingEntry {
  id: string;
  date: string;
  title: GameTitle;
  platforms: string[];
  region: string;
  releaseType: string;
  source: SourceLink;
  note: string;
}

export interface BriefEdition {
  id: string;
  issueNumber: number;
  date: string;
  period: "am" | "pm";
  plannedAt: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  timezone: "Asia/Shanghai";
  nextEditionAt: string;
  revised: boolean;
  entries: BriefEntry[];
  upcoming: UpcomingEntry[];
  tracking: string[];
}

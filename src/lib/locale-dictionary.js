export const localeDictionary = {
  factStatus: {
    official: "Official",
    multi_source_verified: "Verified by multiple sources",
    media_report: "Media report",
    media_relay_official: "Media relay of official statement",
    unconfirmed: "Unconfirmed",
  },
  timeStatus: {
    verified: "Time verified",
    date_only: "Date verified only",
    time_unverified: "Time unverified",
  },
  titleStatus: {
    official_simplified: "Official Simplified Chinese",
    official_traditional: "Official Traditional Chinese",
    common_translation: "Common Chinese translation",
    unavailable: "No established Chinese title",
  },
  sourceKind: {
    primary: "Primary source",
    secondary: "Secondary source",
    discovery: "Discovery lead",
  },
  period: {
    am: "Morning",
    pm: "Evening",
  },
  section: {
    releases: "Releases and launches",
    reviews: "Reviews",
    news: "News",
    industry: "Companies and industry",
    features: "Features and interviews",
    rumors: "Leaks and rumors",
    observations: "Further observations",
  },
};

const regionLabels = new Map([
  ["全球", "Global"],
  ["日本", "Japan"],
  ["中国大陆", "Mainland China"],
  ["中国香港", "Hong Kong"],
  ["香港", "Hong Kong"],
  ["台湾", "Taiwan"],
  ["北美", "North America"],
  ["欧洲", "Europe"],
  ["全球／商店时区不同", "Global / store timing varies"],
]);

const releaseTypeLabels = new Map([
  ["正式发售", "Full release"],
  ["正式上线", "Launch"],
  ["版本更新", "Version update"],
  ["大型更新", "Major update"],
  ["抢先体验", "Early Access"],
  ["抢先体验转正式版", "Full release from Early Access"],
  ["开发者访谈", "Developer interview"],
  ["资本与业务联盟", "Capital and business alliance"],
  ["反作弊与执法", "Anti-cheat and enforcement"],
]);

const sourceLabels = new Map([
  ["Steam商店", "Steam store"],
  ["Steam官方商店", "Official Steam store"],
  ["PlayStation Store 香港", "PlayStation Store Hong Kong"],
  ["Xbox商店", "Xbox Store"],
  ["微软商店", "Microsoft Store"],
  ["任天堂eShop", "Nintendo eShop"],
]);

function isLanguageNeutral(value) {
  return typeof value === "string" && value.trim().length > 0 && !/[\u3400-\u9fff]/u.test(value);
}

export function programmaticRegionLabel(value) {
  if (regionLabels.has(value)) return regionLabels.get(value);
  return isLanguageNeutral(value) ? value : null;
}

export function programmaticReleaseTypeLabel(value) {
  if (value == null || value === "") return "";
  if (releaseTypeLabels.has(value)) return releaseTypeLabels.get(value);
  return isLanguageNeutral(value) ? value : null;
}

export function programmaticSourceLabel(value) {
  if (sourceLabels.has(value)) return sourceLabels.get(value);
  return isLanguageNeutral(value) ? value : null;
}

export function programmaticPlatformLabel(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

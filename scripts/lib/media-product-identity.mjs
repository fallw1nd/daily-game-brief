function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[™®©]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function stripStoreSuffix(value) {
  return String(value || "")
    .replace(/\s+on\s+steam\s*$/i, "")
    .replace(/\s*[|–—-]\s*(?:steam(?:\s+store)?|xbox(?:\s+(?:games\s+)?store)?|official\s+playstation\s+store(?:\s+[a-z]{2}(?:-[a-z]{2})?)?|nintendo\s+official\s+site|the\s+official\s+(?:game\s+)?(?:site|website|product\s+page))\s*$/i, "")
    .trim();
}

const genericStoreTitles = new Set([
  "steam", "steam store", "xbox", "xbox store", "xbox games store",
  "microsoft store", "playstation store", "official playstation store",
  "nintendo", "nintendo official site", "official website", "official site", "home",
  "welcome to xbox", "welcome to steam", "xbox official site", "xbox official website",
  "microsoft official site", "playstation official site", "steam community",
]);

const interstitialTitle = /^(?:access denied|age(?: verification| check)(?: required)?|checking your browser|just a moment|attention required|security check|captcha|error(?: [0-9]+)?|page not found|not found|unavailable|verify you are human)$/i;

function isGenericStoreTitle(value) {
  const normalized = normalizeTitle(value);
  return genericStoreTitles.has(normalized);
}

function isInterstitialTitle(value) {
  return interstitialTitle.test(String(value || "").trim());
}

export function identifyProductTitle(record, metadata = {}, pageUrl = "") {
  const aliases = [
    record?.title?.title_en,
    record?.title?.title_zh_cn,
    ...(record?.titleAliases || []),
  ].filter((value) => typeof value === "string" && value.trim());
  if (!aliases.length) return { status: "unknown", pageTitle: null };

  const expected = new Set(aliases.map(normalizeTitle).filter(Boolean));
  const visibleTitles = [metadata.documentTitle, metadata.openGraphTitle, metadata.twitterTitle]
    .filter((value) => typeof value === "string" && value.trim());
  if (visibleTitles.some(isInterstitialTitle)) return { status: "unknown", pageTitle: visibleTitles.find(isInterstitialTitle) };

  const host = (() => {
    try { return new URL(pageUrl).hostname.toLowerCase(); } catch { return ""; }
  })();
  const isSteamStore = host === "store.steampowered.com" || host.endsWith(".steampowered.com");
  const identifiedTitles = [...new Set(visibleTitles
    .map(stripStoreSuffix)
    .filter((value) => value && !isGenericStoreTitle(value))
    .map(normalizeTitle))];
  if (!isSteamStore && identifiedTitles.length > 1) {
    return { status: "unknown", pageTitle: visibleTitles[0], reason: "page title metadata conflicts" };
  }
  const productTitle = isSteamStore
    ? metadata.steamAppName
    : metadata.openGraphTitle || metadata.twitterTitle || metadata.documentTitle;
  if (!productTitle || typeof productTitle !== "string" || !productTitle.trim()) {
    return { status: "unknown", pageTitle: null };
  }

  const exactProductTitle = stripStoreSuffix(productTitle);
  if (isGenericStoreTitle(exactProductTitle)) return { status: "unknown", pageTitle: exactProductTitle };
  return expected.has(normalizeTitle(exactProductTitle))
    ? { status: "match", pageTitle: exactProductTitle }
    : { status: "mismatch", pageTitle: exactProductTitle };
}

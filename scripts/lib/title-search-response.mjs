export function parseTitleSearchResponse(data) {
  const blocks = data.content || [];
  const results = blocks.filter(item => item.type === "web_search_tool_result");
  if (!results.some(item => Array.isArray(item.content))) {
    throw Object.assign(new Error("DeepSeek response did not execute a completed web search"), { code: "SEARCH_NOT_EXECUTED" });
  }
  if (data.stop_reason === "max_tokens") throw new Error("DeepSeek title search output exceeded its token budget");
  const text = blocks.filter(item => item.type === "text").map(item => item.text || "").join("\n").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!text) throw new Error("DeepSeek title search returned no candidate JSON");
  const candidates = JSON.parse(text).candidates;
  if (!Array.isArray(candidates) || candidates.length > 2) throw new Error("invalid title candidate count");
  return candidates.map(item => {
    if (typeof item.name !== "string" || !Array.isArray(item.urls) || item.urls.length > 3 || item.urls.some(url => typeof url !== "string")) throw new Error("invalid title candidate fields");
    return { titleZhCn: item.name, sources: item.urls.map(url => ({ url })) };
  });
}

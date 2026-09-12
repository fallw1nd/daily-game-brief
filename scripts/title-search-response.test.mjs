import { expect, it } from "vitest";
import { parseTitleSearchResponse } from "./lib/title-search-response.mjs";

it("rejects model-only empty answers instead of caching them as a searched miss", () => {
  expect(() => parseTitleSearchResponse({ content: [{ type: "text", text: '{"candidates":[]}' }] })).toThrow("completed web search");
  expect(() => parseTitleSearchResponse({ content: [{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error" } }] })).toThrow("completed web search");
});
it("accepts searched empty results and bounded candidates but rejects truncation", () => {
  const content = [{ type: "text", text: "I'll search for that title." }, { type: "web_search_tool_result", content: [] }, { type: "text", text: '{"candidates":[]}' }];
  expect(parseTitleSearchResponse({ content })).toEqual([]);
  content[2].text = 'No verified title found.\n\n{ "candidates": [] }';
  expect(parseTitleSearchResponse({ content })).toEqual([]);
  content[2].text = '{"candidates":[]}{"candidates":[]}';
  expect(() => parseTitleSearchResponse({ content })).toThrow();
  expect(() => parseTitleSearchResponse({ content, stop_reason: "max_tokens" })).toThrow("token budget");
  content[2].text = '{"candidates":[{"name":"样例","urls":["https://example.com/game"]}]}';
  expect(parseTitleSearchResponse({ content })[0].sources).toEqual([{ url: "https://example.com/game" }]);
});

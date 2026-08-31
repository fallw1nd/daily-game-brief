import { describe, expect, it } from "vitest";
import { classifyOfficialUrl, extractExplicitOfficialLinks } from "./lib/primary-resolver.mjs";

const registry = {domains:[{id:"steam",hosts:["store.steampowered.com"],independenceKey:"valve-steam"},{id:"publisher",hosts:["publisher.example"],independenceKey:"publisher"}]};

describe("bounded primary resolver infrastructure", () => {
  it("only recognizes registered HTTPS official domains", () => {
    expect(classifyOfficialUrl("https://store.steampowered.com/app/123", registry)?.domainId).toBe("steam");
    expect(classifyOfficialUrl("http://store.steampowered.com/app/123", registry)).toBeNull();
    expect(classifyOfficialUrl("https://fake.example/app/123", registry)).toBeNull();
  });
  it("extracts only explicit outbound official links from opened HTML", () => {
    const links = extractExplicitOfficialLinks('<a href="https://publisher.example/news/game">official</a><a href="https://search.example/result">search</a>', "https://media.example/story", registry);
    expect(links).toEqual([{domainId:"publisher",independenceKey:"publisher",url:"https://publisher.example/news/game"}]);
  });
});

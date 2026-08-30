import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let styles;
let localeStyles;
let editorialMotion;
let englishApp;

beforeAll(async () => {
  [styles, localeStyles, editorialMotion, englishApp] = await Promise.all([
    readFile(resolve("src/styles.css"), "utf8"),
    readFile(resolve("src/locale.css"), "utf8"),
    readFile(resolve("src/lib/useEditorialMotion.ts"), "utf8"),
    readFile(resolve("src/EnglishApp.tsx"), "utf8"),
  ]);
});

describe("pending marker layout", () => {
  it("prevents page-level overflow at mobile widths", () => {
    expect(styles).not.toMatch(/\.site-shell\s*\{[^}]*overflow(?:-x)?:\s*(?:clip|hidden)/s);
    expect(styles).toMatch(/\.site-shell\s*\{[^}]*min-width:\s*0/s);
    expect(styles).toMatch(/\.pending-mark\s*\{[^}]*max-width:\s*100%/s);
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.pending-mark/);
  });

  it("wraps critical edition metadata instead of truncating it", () => {
    expect(styles).toMatch(/\.edition-facts dd\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*white-space:\s*normal/s);
    expect(styles).not.toMatch(/\.edition-facts dd\s*\{[^}]*(?:text-overflow:\s*ellipsis|white-space:\s*nowrap)/s);
  });
});

describe("focus desk layout", () => {
  it("fills the desktop row according to the actual number of secondary focus stories", () => {
    expect(localeStyles).toMatch(/\.focus-list\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*260px\),\s*1fr\)\)/s);
  });

  it("keeps the medium layout balanced for one or three secondary stories", () => {
    expect(localeStyles).toMatch(/@media \(max-width: 1180px\)[\s\S]*?\.focus-list:has\(> \.focus-item:only-child\)[^}]*grid-template-columns:\s*1fr/s);
    expect(localeStyles).toMatch(/\.focus-list:has\(> \.focus-item:nth-child\(3\):last-child\) > \.focus-item:last-child\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  });

  it("keeps focus cards single-column on narrow screens", () => {
    expect(localeStyles).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.focus-list\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });
});

describe("editorial decoration hierarchy", () => {
  it("defines shared accent intensities for both themes", () => {
    expect(styles).toContain("--accent-wash:");
    expect(styles).toContain("--accent-hairline:");
    expect(styles).toContain("--accent-frame:");
    expect(styles).toMatch(/:root\[data-theme="light"\][\s\S]*?--accent-frame:/);
  });

  it("frames media with a square accent keyline and registration corner", () => {
    expect(styles).toMatch(/\.media-slot\s*\{[^}]*border:\s*1px solid var\(--accent-frame\)/s);
    expect(styles).toMatch(/\.media-slot::before\s*\{[^}]*border:\s*1px solid rgba\(var\(--accent-rgb\),\s*\.2\)/s);
    expect(styles).toMatch(/\.media-slot::after\s*\{[^}]*border-top:\s*2px solid var\(--accent\)[^}]*border-right:\s*2px solid var\(--accent\)/s);
  });

  it("keeps status, source and neutral fact labels visually distinct", () => {
    expect(styles).toMatch(/\.status-mark\s*\{[^}]*border:\s*1px solid currentColor/s);
    expect(styles).toMatch(/\.source-list a span\s*\{[^}]*border:\s*1px solid var\(--accent-hairline\)/s);
    expect(styles).toMatch(/\.story-facts > span:not\(\.pending-mark\):not\(\.status-mark\)\s*\{[^}]*border-left:\s*2px solid var\(--accent-hairline\)[^}]*background:\s*transparent/s);
  });
});

describe("calendar cover rails and edition navigation", () => {
  it("preserves the three verified cover families without cropping", () => {
    expect(styles).toMatch(/\.media-slot--cover\.media-slot--aspect-square\s*\{[^}]*aspect-ratio:\s*1/s);
    expect(styles).toMatch(/\.media-slot--cover\.media-slot--aspect-portrait\s*\{[^}]*aspect-ratio:\s*57 \/ 80/s);
    expect(styles).toMatch(/\.media-slot--cover\.media-slot--aspect-landscape\s*\{[^}]*aspect-ratio:\s*16 \/ 9/s);
    expect(styles).toMatch(/\.media-slot--cover img\s*\{[^}]*object-fit:\s*contain/s);
    expect(styles).toMatch(/\.media-slot--cover:hover img\s*\{[^}]*transform:\s*none/s);
    expect(styles).not.toMatch(/\.upcoming-item\s*\{[^}]*min-height:/s);
  });

  it("uses category-specific rails and a responsive two-way edition pager", () => {
    expect(styles).toMatch(/\.upcoming-item \.media-slot--aspect-landscape\s*\{[^}]*width:\s*144px/s);
    expect(styles).toMatch(/\.upcoming-item \.media-slot--aspect-square\s*\{[^}]*width:\s*112px/s);
    expect(styles).toMatch(/\.upcoming-item \.media-slot--aspect-portrait\s*\{[^}]*width:\s*80px/s);
    expect(styles).toMatch(/\.edition-pager\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.edition-pager\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(englishApp).toContain('ariaLabel="Edition navigation"');
    expect(englishApp).toContain("englishEditionSequence");
  });
});

describe("accessible theme and interaction tokens", () => {
  const relativeLuminance = (hex) => {
    const channels = [1, 3, 5]
      .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) => channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const contrast = (foreground, background) => {
    const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
    const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
    return (light + 0.05) / (dark + 0.05);
  };

  it("keeps every accent text token AA-safe across its theme surfaces", () => {
    const darkAccentInk = ["#ec5d12", "#7ca5ff", "#4dd9a7", "#c58aff", "#ff8fc7"];
    const darkSurfaces = ["#000000", "#171614", "#24211f", "#10100f", "#1c1815"];
    const lightAccentInk = ["#8f3300", "#173f9d", "#075f42", "#57257f", "#8e194c"];
    const lightSurfaces = ["#f6f1e8", "#eee6da", "#e2d7c8", "#e6dccd"];

    for (const foreground of darkAccentInk) {
      expect(styles.toLowerCase()).toContain(foreground);
      for (const background of darkSurfaces) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    for (const foreground of lightAccentInk) {
      expect(styles.toLowerCase()).toContain(foreground);
      for (const background of lightSurfaces) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("provides two-layer focus and minimum inline target sizes", () => {
    expect(styles).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\)[^}]*box-shadow:\s*0 0 0 1px var\(--focus-gap\)/s);
    expect(styles).toMatch(/\.read-link\s*\{[^}]*min-height:\s*24px/s);
    expect(styles).toMatch(/\.source-list a\s*\{[^}]*min-height:\s*24px/s);
    expect(styles).toMatch(/details summary\s*\{[^}]*min-height:\s*24px/s);
    expect(styles).toMatch(/\.footer-links > a\s*\{[^}]*min-height:\s*24px/s);
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.search-field input\s*\{[^}]*height:\s*44px/s);
    expect(styles).toMatch(/\.search-field > div:focus-within\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\)/s);
  });

  it("uses a one-time accent signal and exposes the accent picker in English", () => {
    expect(styles).toMatch(/\.accent-signal::after\s*\{[^}]*animation:\s*signal-scan[^}]*1 both/s);
    expect(styles).not.toMatch(/signal-scan[^;}]*infinite/);
    expect(englishApp).toContain('className="accent-picker"');
    expect(englishApp).toContain('window.localStorage.setItem("brief-accent", accent)');
  });
});

describe("shared editorial motion", () => {
  it("uses one reduced-motion-aware hook for restrained media and rule reveals", () => {
    expect(editorialMotion).toContain("prefers-reduced-motion: reduce");
    expect(editorialMotion).toContain(".lead-story > .media-slot");
    expect(editorialMotion).toContain(".section-header");
    expect(editorialMotion).toContain("clearProps:");
  });
});

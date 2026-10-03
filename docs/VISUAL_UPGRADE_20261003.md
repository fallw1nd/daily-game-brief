# ReadingApp visual refinement — 2026-10-03

## Direction

Preserve the editorial news hierarchy and compact archive. Warm paper and rust form the default identity; a deep teal companion distinguishes navigation, calendar and reading aids. Dark mode uses calibrated warm and green highlights. Reader-selected cobalt, jade, violet and rose remain available. Thin rules, restrained paper washes, image frames and small hatch details add depth without turning articles into marketing cards.

ReadingApp tokens in `src/reading.css` are authoritative for this refinement. Default light primary/companion: `#a13c26` / `#23645b`; dark: `#f4a27e` / `#92cdbb`. Classic-view guidance remains unchanged.

## Interaction

Shared durations: feedback 160 ms, reveal 240 ms, entrance 480 ms; entrance stagger 70 ms. The masthead gains section location and reading progress. Lead text and image enter in sequence, section headings receive a one-time arrival treatment, and source disclosures, search, pagination and settings share focus/hover feedback. Loading shimmer stops after three iterations. Reduced-motion mode removes these animations. Scroll measurement is frame-scheduled and all listeners/observers are cleaned up.

Content is visible without IntersectionObserver. Long calendar text wraps at narrow widths. Reading-view anchor offsets account for the sticky header without inheriting the classic view's additional offset.

## Research and references

- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), reference revision `09170eec67eefd46a7ae85de61b40c194020f997`: editorial/Swiss direction, contrast, motion restraint and React cleanup guidance. Generic conversion-page suggestions were not applicable to a news reader.
- [Material motion choreography](https://m1.material.io/motion/choreography.html): clear sequencing and continuity.
- [Material duration and easing](https://m1.material.io/motion/duration-easing.html): consistent timing with context-specific duration.
- [Nielsen Norman Group: animation purpose in UX](https://www.nngroup.com/articles/animation-purpose-ux/): motion supports feedback and orientation.
- [Pentagram editorial design](https://www.pentagram.com/editorial-design): reference for editorial hierarchy and variation within a stable grid.
- [GOV.UK colour guidance](https://design-system.service.gov.uk/styles/colour/): functional colour roles and readable contrast.

These references informed the design; the specific palette and composition are project decisions.

## Verification

- `npm run check`: 103 test files / 571 tests passed, type checking, data checks and production build passed.
- Real Chrome via bundled Playwright: 20 layouts across 320, 390, 768, 1024 and 1440 px, light/dark and Chinese/English. No horizontal overflow, overlapping masthead controls or page errors.
- Settings, accent selection, Escape dismissal, calendar navigation/current location, reading progress and archive search exercised.
- 250 text/background combinations across all five accents, both themes and five surfaces: minimum measured contrast 4.6467:1.
- Loading and entrance animation verified; reduced-motion preference removes active animations.
- Screenshots inspected at desktop/mobile in light/dark. Safari, Firefox and physical devices were not tested; this is not a complete accessibility certification.

Local evidence and browser runners: `D:/Tool/Codex/artifacts/visual-upgrade-20261003/` (`responsive-results.json`, `motion-contrast-results.json`, `full-check.log`, `after-1440-light.png`, `after-390-light.png` and dark variants).

Scope: presentation and reader interaction only. News facts, archives, schemas, task schedules, workflows and dependencies are unchanged.

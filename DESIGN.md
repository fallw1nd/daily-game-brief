# Editorial Product Design System v3

## 1. Product Direction

The site is a twice-daily games news brief for repeat readers. It is an editorial product, not a marketing landing page, SaaS dashboard, or portal homepage.

Design priority is fixed:

1. Scan speed
2. Information hierarchy
3. Reading comfort
4. Evidence clarity
5. Motion
6. Decoration

Use native CSS, the existing React structure, and Phosphor Icons. Do not import a second component design system. WCAG 2.2 is the accessibility baseline. GOV.UK content patterns, Apple HIG, and IBM Carbon may inform typography, adaptive layout, status semantics, and tokens without importing their visual brands.

Normative references:

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- GOV.UK typography and layout: https://design-system.service.gov.uk/styles/
- Apple typography and accessibility: https://developer.apple.com/design/human-interface-guidelines/
- Carbon color tokens: https://carbondesignsystem.com/elements/color/overview/

## 2. Permanent Editorial Hierarchy

Typography and information roles do not change with theme or accent.

| Role | Use | Desktop | Narrow |
| --- | --- | --- | --- |
| L0 | Site chrome and metadata | 12px JetBrains Mono, 600 | 11-12px |
| L1 | Edition title | 40px Inter, 500, 1.05 | 32px |
| L2 | Section title | 28px Inter, 600, 1.2 | 24px |
| L3a | Game, company, or product subject | 18px Inter, 650, 1.28 | 17px |
| L3 | Story headline | 22px Inter, 600, 1.35 | 19px |
| Body | Summary | 15.5px Inter, 1.75, max 66ch | same |
| L4 | Time, source, status, verification | 11-12px JetBrains Mono, 1.5 | minimum 11px |

The subject appears before the event headline. The edition H1 uses archiveTitle, remains full-width, wraps naturally, and is never truncated. English may occupy more lines but must retain the same hierarchy.

## 3. Color and Theme Tokens

Light uses warm paper #F6F1E8 and ink #1A1714. Dark uses #000000 and #FFFFFF as required by the established publication identity. Surfaces must remain distinguishable from the page and from each other.

Every accent exposes separate semantic roles:

- --accent: fills, rules, selection, and decorative signals.
- --accent-strong: darker companion used for light-theme text.
- --accent-ink: accent text with AA contrast on every reading and chrome surface.
- --accent-bright: accent link used over dark image captions.
- --accent-wash: low-emphasis hover or selection wash.
- --focus-ring: solid keyboard focus boundary.

Approved accent families are orange, cobalt, jade, violet, and rose. An accent is selected globally and remains consistent for the whole page. It never becomes a large reading background.

Normal text must reach 4.5:1 against every surface where it appears. Large text and meaningful component boundaries require 3:1. Status must also use text, icon, border, or position and never rely on color alone.

Accent has a density budget: use at most one strong accent boundary within a component group. Default containers and ordinary media use neutral borders. Full accent borders are reserved for pending states, keyboard focus, and current selection. Decorative accent appears only when it explains hierarchy: the lead spine, section rule, first-story number or image crop mark, active archive rail, or interactive state.

Token architecture remains intentionally small and three-layered:

1. Primitive tokens hold neutral, paper, ink, and approved accent source values.
2. Semantic tokens expose page, surface, text, border, accent, focus, typography, spacing, layout, and motion roles.
3. Components consume semantic roles. Transitional aliases may remain while older selectors are migrated, but new component rules must not depend on a named hue such as orange.

The shared spacing rhythm is 4, 8, 12, 16, 24, 32, 48, and 64px. Component internals use the lower half, content groups use 16–32px, and section separation uses 48–64px. The system may use an optical exception only when the component has a clear editorial reason.

## 4. Layout, Density, and Reflow

The content width is capped at 1420px with 24px desktop and 12px mobile side gutters. Group stories with rules, columns, alignment, and spacing instead of large rounded cards.

- Desktop: the lead uses an asymmetric text-first editorial split; its verified image is the only strong media frame in the focus desk.
- Secondary focus stories form a continuous numbered headline index, whether there are one or four items.
- Up to 820px: primary content becomes one column; evidence follows its story.
- Up to 390px: controls, titles, media, and metadata must remain readable without page-level horizontal scrolling.
- At 320 CSS px or 400% zoom: only intentionally scrollable local regions may scroll horizontally.

Do not use clipping to conceal layout errors. Edition facts and evidence wrap rather than truncate. Long English text and user text-spacing overrides must not remove information.

## 5. Shape and Media Language

The system is square-edged. Containers use 0px radius; compact editorial labels may use 2px. Pills and large rounded cards are prohibited.

Verified media uses an offset-print registration language:

- Lead media: accent frame, inset keyline, one registration corner, restrained offset shadow.
- First story in each department: full-width neutral print plate, one small crop mark, and an external caption rail.
- Remaining story media: inset to 88% on desktop, alternately aligned to create a measured evidence rhythm; it returns to full width on narrow screens.
- Covers: neutral paper plinth with restrained baseline shadow; no decorative registration corner.
- Secondary focus stories are typographic strips and do not repeat thumbnails.
- Missing media: neutral border with no stronger decoration than verified media.

Frames never alter the source aspect ratio. News defaults to 16:9. Covers preserve square, portrait, or landscape. Real credits remain functional, not decorative. Editorial captions sit outside the image, remain at least 10px, wrap safely, and never obscure source pixels.

Upcoming covers use three explicit display rails based on the verified aspect field:

- Square: 1:1, typically PSN or Nintendo store artwork.
- Portrait: 57:80, matching the established physical-cover source family.
- Landscape: 16:9, with unusually wide storefront headers contained inside the frame.

Cover art always uses object-fit contain; it must never be cropped to imitate another platform format. The rail width changes by category while the text column remains aligned. Calendar rows are content-sized and do not use a fixed minimum height.

## 6. Labels and Evidence

Labels have distinct jobs:

- Pending: explicit accent-outline rectangle.
- Fact and time status: semantic color, icon, text, and border.
- Source kind and title status: secondary accent hairline.
- Platform, region, release date, and ordinary facts: quiet inline metadata with one accent edge, not a fully boxed chip.

Tags describe state and are not buttons. Keep labels short, allow wrapping, and never create a dense wall of equally prominent chips. Search actions use text plus a Phosphor arrow instead of a tag-shaped container.

## 7. Interaction and Focus

Primary navigation is limited to Content, Calendar, and Archive. Theme and accent controls are available in both languages and persist across language changes.

The calendar ends with a two-way edition pager. It shows the neighboring issue number and archive title, uses disabled text at the first or latest boundary, and becomes a single column on narrow screens. English navigation only targets editions with a validated English Overlay.

- Major mobile controls: minimum 44px height.
- Inline links and disclosure targets: minimum 24px target height or equivalent spacing.
- Keyboard focus: a two-layer, 2px solid focus ring with a contrasting separation edge.
- Hover movement: maximum 4px.
- Active movement: maximum 1px.
- Focus, hover, selected, unavailable, and expanded states remain distinguishable without color alone.

No control label wraps on desktop. Source links, captions, and footer actions remain keyboard operable.

## 8. Motion

Motion intensity is 3 of 10. It communicates hierarchy, feedback, or a state change.

The shared hierarchy is 120ms micro feedback, 180ms component transitions, 240ms section transitions, and at most 320ms for the lead media entrance. Standard, enter, and exit easing are semantic tokens. Entrance movement is limited to 4–8px.

Allowed motion:

- One-time masthead and section entrance.
- One-time accent rail scan.
- Rule reveal.
- Image hover scale up to 1.022.
- Link arrow translation up to 4px.

Do not use continuous ambient loops, parallax, scroll hijacking, animated body copy, or per-row reveals across long news lists. Animate only transform and opacity where possible. Every nonessential transition becomes instant under prefers-reduced-motion.

## 9. Bilingual and Content States

Chinese remains the canonical factual layer. English is a presentation overlay and uses the same DOM roles, theme controls, spacing tokens, and responsive behavior.

Explicitly test:

- Long English edition and archive titles.
- Long game name plus long headline.
- Missing English overlay.
- Missing image.
- Tracking and unconfirmed states.
- Empty departments.
- One to four secondary focus stories.

Empty departments are hidden from content and directories. Missing data is described plainly and never filled with promotional or generic AI copy.

## 10. Acceptance Gates

Automated checks must cover:

- TypeScript, tests, data validation, locale validation, and production build.
- Accent text contrast across page, surface, navigation, and footer.
- No nowrap or ellipsis on critical edition facts.
- 24px minimum inline interaction targets.
- Reduced-motion fallback and no infinite decorative animation.
- Shared Chinese and English theme and accent controls.

Manual acceptance covers desktop, 820px, and 390px; Chinese and English; light and dark; all five accents; keyboard focus; 200% text; long titles; unavailable states; archive search; and reduced motion.

## 11. Prohibited Patterns

Do not add promotional heroes, slogans, glassmorphism, large gradients, generic bento blocks, decorative status dots, floating circles behind labels, repeated rounded cards, duplicate About sections, infinite animation, hidden overflow used as a layout fix, or a second visual language for English.

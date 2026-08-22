# Repository Guidelines

## Project Structure & Module Organization

The site is a Vite, React, and TypeScript application. UI code lives in `src/`, structured brief data in `src/data/`, domain helpers and tests in `src/lib/`, and project documentation at the repository root. Keep archived briefs and production data separate from UI fixtures. `DESIGN.md` defines visual roles; `README.md` covers local setup.

## Build, Test, and Development Commands

Run `npm install` once, then `npm run dev` for local development. Use `npm run typecheck` for TypeScript checks, `npm test` for Vitest, and `npm run build` for a production bundle. `npm run check` executes the complete verification chain. Do not rely on undocumented one-off commands.

## Coding Style & Naming Conventions

Use two-space indentation for Markdown, JSON, TypeScript, TSX, and CSS. TypeScript strict mode is authoritative. Use `PascalCase` for components and types, `camelCase` for functions and variables, and `kebab-case` for routes and asset names. Preserve specification field names such as `fact_status`, `time_status`, and `title_key` at data boundaries; map them explicitly rather than renaming them inconsistently.

## Testing Guidelines

Tests must cover Beijing-time AM/PM window boundaries, continuous issue numbering, adjacent-edition deduplication, title normalization, source-status rules, and append-only archive behavior. Add regression tests for corrections and supplements. UI tests must verify one H1 per page, keyboard operation, visible focus, reduced-motion support, WCAG AA contrast, and no page-level horizontal scrolling at 390px. Name tests `*.test.ts`, `*.test.tsx`, or the framework-equivalent pattern.

## Commit & Pull Request Guidelines

There is no history from which to infer conventions. Start with Conventional Commits, for example `feat(brief): add evening window calculation` or `fix(sources): prevent unverified official status`. PRs should explain scope, verification commands, schema or migration impact, and archive-integrity checks. Include responsive screenshots for UI changes and link the relevant issue or specification section.

## Content, Sources & Design Constraints

Use `Asia/Shanghai` and calculate windows from scheduled, not actual, run times. Never label an item â€œofficialâ€ without opening a primary source, machine-translate game titles, delete historical editions, or let revisions renumber issues. Keep rumor and verified-news states structured and distinct. Visual decisions belong to `DESIGN.md` and the `gpt-taste` skill; do not copy the former `chatgpt.site` presentation.

## Permanent Editorial Hierarchy & Typography

Treat this product as a news publication, not a marketing landing page. This hierarchy and type language remain stable even when the visual theme changes:

- **L0 ¡ª Site chrome:** the sticky top bar contains the publication name, current edition/date, and highest-level links: Today, Releases, Archive, About. Use 12px JetBrains Mono, weight 600, uppercase English labels, and tabular figures.
- **L1 ¡ª Edition masthead:** the single page H1 identifies morning/evening edition. Use Inter with `Noto Sans SC`/system sans fallback, 40px desktop and 32px mobile, weight 500, line-height 1.05, white.
- **L2 ¡ª Section heading:** numbered editorial departments use 28px desktop and 24px mobile, weight 600, line-height 1.2. Section numbers use 12px JetBrains Mono in `#EA580C`.
- **L3 ¡ª Story headline:** use 22px desktop and 19px mobile, weight 600, line-height 1.35, white. Summaries use 15.5px, line-height 1.75, and `#D4D4D8`; keep paragraphs near 65 characters per line.
- **L4 ¡ª Evidence and metadata:** timestamps, platforms, regions, title status, verification state, and source labels use 11¨C12px JetBrains Mono, line-height 1.5, `#A1A1AA`. Source links and active states use `#EA580C`.

Use `#000000` for the page, `#2C2A28` for secondary surfaces and borders, `#FFFFFF` for primary text, and `#A1A1AA` for secondary text. Never introduce oversized promotional slogans, generic AI copy, or display text that competes with the news headline. Use thin rules, columns, and spacing for grouping; do not wrap every story in a large rounded card. The source report belongs near the end of the edition as operational metadata. Publication/about information belongs in the footer.

## Editorial Image Contract

Every newly published `BriefEntry` and `UpcomingEntry` must explicitly resolve its media state. Prefer verified `images` for news and a verified `cover` for upcoming games. If no relevant, traceable asset exists, omit the asset and set `image_status: "unavailable"` plus `imageNote`, or `cover_status: "unavailable"` plus `coverNote`; never force an unrelated image. Prefer repository-hosted WebP/JPEG assets under `public/media/briefs/YYYY/MM/<edition-id>/` and store paths relative to `public/`, for example `media/briefs/2026/08/2026-08-22-pm/story-id.webp`. Remote URLs are allowed only for durable official media/CDN assets. Each asset requires meaningful Chinese `alt`, `credit`, `sourceUrl`, and a `kind` of `editorial` or `cover`. News images use a 16:9 display slot; game covers use 3:4. Keep files below 500 KB where practical.


## Themes, Archive & Search

Maintain both dark and warm-paper light themes with the same hierarchy, typography, orange accent, and rule-based grouping. Use the reference `#EA580C` accent in dark mode and the AA-safe tonal adaptation `#B34200` on light surfaces. Persist the reader's choice and keep the toggle keyboard accessible. Hide empty editorial departments completely, including their directory and top-level links. The archive lists manifest editions, not current-edition stories. Cross-edition search uses the generated compact index and links each result to its source edition and entry anchor.

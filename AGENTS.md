# Repository Guidelines

## Project Structure & Commands

The site is a Vite, React, and TypeScript application. UI code lives in `src/`, production data in `public/data/`, helpers and tests in `src/lib/`, automation scripts in `scripts/`, and contributor documentation at the root or in `docs/`. `DESIGN.md` defines visual roles. Run `npm install` once, `npm run dev` locally, `npm test` for Vitest, `npm run typecheck` for strict TypeScript, `npm run validate:data` for archive integrity, and `npm run check` before every push.

## Code, Tests & Reviews

Use two-space indentation. Name components and types in `PascalCase`, functions and variables in `camelCase`, and routes/assets in `kebab-case`. Preserve boundary fields such as `fact_status`, `time_status`, and `title_key`. Tests must cover Beijing-time windows, continuous issue numbering, adjacent-edition deduplication, title/source rules, append-only archives, keyboard focus, reduced motion, WCAG AA contrast, and 390px layouts. Use Conventional Commits, for example `feat(brief): add evening window calculation`. PRs must state verification commands, schema impact, archive checks, linked issues, and responsive screenshots for UI work.

## Content & Source Rules

Use `Asia/Shanghai` and scheduled—not actual—run times. Never mark an item `official` without opening a primary source, machine-translate game titles, renumber issues, or delete historical editions. Keep rumors structurally distinct and preserve uncertainty in display copy. Visual decisions belong to `DESIGN.md` and the `gpt-taste` skill.

A broadly used community or playful Chinese name may be selected when found on the open web; mark it `common_translation`, never official.

## Permanent Editorial Hierarchy

Treat the product as news, never a marketing landing page. Keep this type language stable across themes:

- L0 site chrome: 12px JetBrains Mono, weight 600, tabular figures.
- L1 edition H1: Inter with Noto Sans SC/system fallback, 40px desktop/32px mobile, weight 500, line-height 1.05.
- L2 section headings: 28px desktop/24px mobile, weight 600, line-height 1.2; 12px semantic-accent mono numbers.
- L3 story headlines: 22px desktop/19px mobile, weight 600, line-height 1.35; summaries 15.5px/1.75 near 65 characters per line.
- L3a story subject: game/product name at 18px desktop/17px mobile, weight 650, line-height 1.28, with a semantic-accent rule; it appears before the event headline.
- L4 evidence: 11–12px JetBrains Mono, line-height 1.5, muted text; semantic-accent links and active states.

Use `#000000`, `#FFFFFF`, `#A1A1AA`, and default `#EA580C` in dark mode; use warm paper `#F6F1E8`, ink `#1A1714`, and default `#B34200` in light mode. Reader-selectable cobalt, jade, violet, and rose accents may replace orange only through the approved `DESIGN.md` semantic tokens; typography and hierarchy never change with accent choice. Group with rules, columns, and spacing—not large rounded story cards. Ban promotional slogans and generic AI copy.

## Archive Titles, Themes & Search

Every manifest item needs a distinctive `archiveTitle` formatted `早报｜本期重磅事实` or `晚报｜本期重磅事实`, plus a `leadEntryId` resolving to that story. Render the same `archiveTitle` as the edition page H1; never fall back to generic `游戏早报` or `游戏晚报` when the field exists. Prefer a major game, publisher/platform decision, or widely discussed event; never overstate rumor status. Schema v2 archives store the same fields. Historical title corrections require explicit approval.

Maintain accessible dark/light themes with persistent keyboard-operable switching. Hide empty departments from content, directories, and top-level links. Archive rows represent editions; cross-edition search links results to their source edition and entry anchor.

Keep top navigation to `内容`, `日历`, and `归档`. Use `DAILY EDITION` as the nonnumeric masthead eyebrow and show `NO.###` only once in top chrome. Let edition H1 titles use the full available width and remain single-line when they fit. Reserve inset space for archive selection rails so they never overlap issue or date text.

## Editorial Media Contract

Each new v2 story and upcoming game must provide verified media or an explicit unavailable reason. Use `images`/`cover` only with meaningful Chinese `alt`, `credit`, HTTPS `sourceUrl`, `kind`, and an optional `aspect`; otherwise set `image_status`/`cover_status` to `unavailable` with a specific note. Never force an unrelated image. Prefer traceable WebP/JPEG files below 500 KB under `public/media/briefs/YYYY/MM/<edition-id>/`. Keep news at 16:9. For covers prefer PSN Hong Kong square, Nintendo eShop Japan square, then Xbox Store rectangle; preserve the verified source ratio as `square`, `portrait`, or `landscape`.

Storefronts are preferred discovery sources, not shape requirements. After listed sources fail, use configured web image search and accept square, portrait, or landscape covers when the game match and source page are clear. Keep cover credit and `sourceUrl` in data, but do not render a visible source caption on cover art.

## Maintenance Ledger

Use `docs/MAINTENANCE_LOG.md` as the append-only operational improvement ledger. When production behavior, Actions/log review, editorial review, or code inspection reveals a persistent reliability bug, data-quality gap, recurring manual burden, cost issue, or misleading observability, add or update a `MNT-*` entry with discovery date, priority, evidence, status, bounded resolution, objective close criteria, and relevant issue/PR/run links.

Do not delete resolved entries or open duplicate entries for the same root cause. A fix PR must reference the existing maintenance entry and, after merge, update that same entry with the resolution and verification evidence. Code written or a PR merged is not sufficient to mark an issue `resolved`; the entry's stated close criteria must be satisfied.

## Visual Acceptance

Do not use the Windows browser sandbox for visual QA. Still run data, type, test, and build checks. Hand UI and design changes to the user with a precise checklist covering desktop/narrow layouts, both themes, hierarchy, wrapping, focus states, and content accuracy. Verified media assets follow the automated Editorial Media Contract above.

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

Use `Asia/Shanghai` and calculate windows from scheduled, not actual, run times. Never label an item “official” without opening a primary source, machine-translate game titles, delete historical editions, or let revisions renumber issues. Keep rumor and verified-news states structured and distinct. Visual decisions belong to `DESIGN.md` and the `gpt-taste` skill; do not copy the former `chatgpt.site` presentation.

# Repository Guidelines

## Project Structure & Commands

The site is a Vite, React, and TypeScript application. UI code lives in `src/`, production data in `public/data/`, helpers and tests in `src/lib/`, automation scripts in `scripts/`, and contributor documentation at the root or in `docs/`. Run `npm install` once, `npm run dev` locally, `npm test` for Vitest, `npm run typecheck` for strict TypeScript, `npm run validate:data` for archive integrity, and `npm run check` before every push.

## Code, Tests & Reviews

Use two-space indentation. Name components and types in `PascalCase`, functions and variables in `camelCase`, and routes/assets in `kebab-case`. Preserve boundary fields such as `fact_status`, `time_status`, and `title_key`. Tests must cover Beijing-time windows, continuous issue numbering, adjacent-edition deduplication, title/source rules, append-only archives, keyboard focus, reduced motion, WCAG AA contrast, and 390px layouts. Use Conventional Commits, for example `feat(brief): add evening window calculation`. PRs must state verification commands, schema impact, archive checks, linked issues, and responsive screenshots for UI work.

默认不新增 hash、冻结 contract、baseline 或 gate。只有能说明一个具体失败场景，并说明 Git、版本号、主键、事务、唯一约束、类型和普通测试为什么不足时，才允许加入。不要为了简化而删除已有安全措施。门禁只放在不可逆、跨系统、安全或正式发布边界。前置检查不得挤掉真正的代码执行、模拟或测量。

## Content & Source Rules

Use `Asia/Shanghai` and scheduled—not actual—run times. Never mark an item `official` without opening a primary source, machine-translate game titles, renumber issues, or delete historical editions. Keep rumors structurally distinct and preserve uncertainty in display copy. For UI work only, read `docs/VISUAL_GUIDELINES.md` and `docs/READING_SAMPLE.md`; use the accepted implementation as the current reference.

Production is Daily (`YYYY-MM-DD-daily`): Asia/Shanghai evidence window `(previous day 10:10, current day 10:10]`, planned publication 12:00. Never extend the window into production time. Historical AM/PM and the one-time 2026-08-31 migration bridge remain immutable; exact orchestration and bridge are in `docs/SCHEDULED_TASK_PROMPT.md`.

A broadly used community or playful Chinese name may be selected when found on the open web; mark it `common_translation`, never official.

Use official mainland Simplified Chinese terminology for titles, versions, characters, classes, modes and mechanics when available. Naming-only lookups may normalize existing terms, never add facts, times, platforms, release claims, source status, tracking decisions or candidates.

Every edition needs a distinctive period-prefixed `archiveTitle` and valid `leadEntryId`; archive and manifest must agree. Historical title corrections require explicit approval.

## Editorial Media Contract

Each new v2 story and upcoming game must provide verified media or an explicit unavailable reason. Use `images`/`cover` only with meaningful Chinese `alt`, `credit`, HTTPS `sourceUrl`, `kind`, and an optional `aspect`; otherwise set `image_status`/`cover_status` to `unavailable` with a specific note. Never force an unrelated image. Prefer traceable WebP/JPEG files below 500 KB under `public/media/briefs/YYYY/MM/<edition-id>/`. Keep news at 16:9. For covers prefer PSN Hong Kong square, Nintendo eShop Japan square, then Xbox Store rectangle; preserve the verified source ratio as `square`, `portrait`, or `landscape`.

Storefronts are preferred discovery sources, not shape requirements. After listed sources fail, use configured web image search and accept square, portrait, or landscape covers when the game match and source page are clear. Keep cover credit and `sourceUrl` in data, but do not render a visible source caption on cover art.

## Maintenance Ledger

Use `docs/MAINTENANCE_LOG.md` as the append-only operational improvement ledger. When production behavior, Actions/log review, editorial review, or code inspection reveals a persistent reliability bug, data-quality gap, recurring manual burden, cost issue, or misleading observability, add or update a `MNT-*` entry with discovery date, priority, evidence, status, bounded resolution, objective close criteria, and relevant issue/PR/run links.

Do not delete resolved entries or open duplicate entries for the same root cause. A fix PR must reference the existing maintenance entry and, after merge, update that same entry with the resolution and verification evidence. Code written or a PR merged is not sufficient to mark an issue `resolved`; the entry's stated close criteria must be satisfied.

## Visual Acceptance

Do not use the Windows browser sandbox for visual QA. Still run data, type, test, and build checks. Hand UI and design changes to the user with a precise checklist covering desktop/narrow layouts, both themes, hierarchy, wrapping, focus states, and content accuracy. Verified media assets follow the automated Editorial Media Contract above.

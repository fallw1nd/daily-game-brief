# Project guidance

Vite/React/TypeScript game-news site. Production is `main`; UI is in `src/`, data in `public/data/`, automation in `scripts/` and `.github/workflows/`. Follow nearby code conventions and preserve public field names.

## Working and verification

Complete authorized work through verification. Decide routine details independently; clarify only material scope or risk. Load skills for the relevant workflow, not keyword matches; explicit user choices and project requirements override generic recipes.

Use `package.json` for commands. Run affected checks during development. Before publishing changes to code, data, workflows or machine-consumed editorial instructions, run `npm run check` once on the final implementation. Reuse passing results when only explanatory documentation changes; rerun affected checks for subsequent functional changes or failures. Do not add tests that merely restate the implementation. Keep existing CI and production validation intact.

Use Conventional Commits; PRs include relevant validation and schema/archive impact. Update the matching `docs/MAINTENANCE_LOG.md` entry for persistent reliability, quality or cost problems; retain history, evidence and closure criteria. Do not turn routine edits into new rules or maintenance work.

Prefer existing types, keys, transactions and tests. Add a new hash, frozen contract, baseline or gate only for a demonstrated failure those mechanisms cannot address; preserve existing safeguards. Formal gates belong at publication, security or cross-system boundaries.

## Editorial boundaries

- Production uses Daily editions: `Asia/Shanghai`, `(previous day 10:10, current day 10:10]`, planned publication 12:00. Preserve packet identity, fixed windows, continuous issue numbers and historical archives. Historical title corrections require explicit user authorization; use the established revision flow.
- News facts must stay within the acknowledged evidence packet. `official` requires an opened primary source; rumors retain their distinct status and uncertainty. Calendar research and terminology lookups have only the exceptions defined in the editorial contract.
- User-specified names take priority. Otherwise use verified mainland Simplified Chinese terminology when available; accepted community names are `common_translation`. Never machine-translate game names or invent identities. Reuse the title registry and verified hints before searching; terminology research cannot add event facts.
- Headlines name their confirmed subject. Archive and manifest share a distinctive period-prefixed `archiveTitle` and valid `leadEntryId`.
- Each new story/calendar item needs verified media or a specific unavailable reason. Keep meaningful Chinese alt, credit, HTTPS source page and kind; no unrelated art. News is 16:9; covers retain their verified ratio and hide visible credit captions. Source preference and file conventions: `docs/MEDIA_PIPELINE.md`.

## Read when relevant

- Scheduled editing/publication: `docs/SCHEDULED_TASK_PROMPT.md`; pipeline/state changes: `docs/DATA_PIPELINE.md` and `docs/AUTOMATION_ARCHITECTURE.md`.
- Showcase supplementation: `docs/SHOWCASE_RECOVERY.md`; release-calendar discovery: `docs/RELEASE_CALENDAR.md`.
- UI: `docs/VISUAL_GUIDELINES.md` and the relevant section of `docs/READING_SAMPLE.md`. The accepted ReadingApp is the default reference; use Phosphor icons. Preserve keyboard access, reduced motion, AA contrast and usable 390px layouts. Do not use the Windows browser sandbox for visual QA; provide a focused manual checklist for affected layouts/themes, wrapping, focus and content.

These are task-specific references, not a mandatory reading list for every edit. Historical design/migration notes and bundled example skills do not override current production guidance.

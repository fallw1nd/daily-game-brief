# Project guidance

Vite/React/TypeScript game-news site. Production is `main`; UI is in `src/`, data in `public/data/`, automation in `scripts/` and `.github/workflows/`. Follow nearby code conventions and preserve public field names.

## Working and verification

Complete authorized work through verification. Decide routine details independently; clarify only material scope or risk. Use `package.json` commands and run affected checks during development. Before publishing code, data, workflow, or machine-consumed editorial changes, run `npm run check` on the final implementation. Documentation-only follow-ups may reuse passing evidence when no executable contract changed.

Use Conventional Commits. Update `docs/MAINTENANCE_LOG.md` only for persistent reliability, quality, or cost problems; it is a historical ledger, not a production contract. Prefer existing types, keys, transactions, and gates. Add new frozen contracts or publication gates only for demonstrated failures.

## Editorial boundaries

- Production cadence is Daily: `Asia/Shanghai`, `(previous day 10:10, current day 10:10]`, planned release 12:00. Preserve packet identity, fixed windows, issue numbers, and historical archives. Historical revisions require explicit user authorization and the established revision flow.
- Facts stay inside the acknowledged packet. `official` requires opened primary evidence. One opened curated media source may support `media_report` when subject, window, and core facts are clear; an explicit media relay of an identifiable official announcement/interview/statement may use `media_relay_official`. Only `multi_source_verified` requires two independent reliable sources. `needs_review` is for material blockers, not merely one-source coverage. Rumors remain explicitly uncertain and tracked.
- User-specified names take priority. Otherwise reuse `config/title-translations.json`, verified title hints, and official mainland Simplified Chinese terminology. Never machine-translate game names or invent identities. Naming/terminology lookups cannot add event facts.
- Headlines name their confirmed game, company, or person. Archive and manifest share the period-prefixed `archiveTitle` and valid `leadEntryId`.
- Every story/calendar item needs verified media or an explicit unavailable reason. Media provenance and file rules live in `docs/MEDIA_PIPELINE.md`.

## Read when relevant

- Editorial scheduling/publication: `docs/SCHEDULED_TASK_PROMPT.md`.
- State, recovery, and publisher behavior: `docs/AUTOMATION_ARCHITECTURE.md`.
- Canonical/evidence/naming/data: `docs/DATA_PIPELINE.md`.
- Showcase, calendar, media, source discovery: the matching focused document under `docs/`.
- UI: `docs/VISUAL_GUIDELINES.md` and the relevant section of `docs/READING_SAMPLE.md`. The accepted ReadingApp is the default reference; use Phosphor icons, preserve keyboard access, reduced motion, AA contrast, and usable 390px layouts.

Do not treat migration plans, incident notes, or maintenance history as live instructions.

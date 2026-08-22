# Scheduled Brief Data Pipeline

The website reads `public/data/latest.json` at runtime. Every published edition is also stored under `public/data/archive/YYYY/MM/`, while `public/data/manifest.json` is the ordered archive index. A malformed payload never replaces the bundled fallback edition.

## ChatGPT task handoff

The scheduled ChatGPT task must finish its research first, then use its connected GitHub capability to commit one atomic change to `fallw1nd/daily-game-brief` on `main`:

1. Add `public/data/archive/YYYY/MM/YYYY-MM-DD-am.json` or `...-pm.json`.
2. Copy the exact same JSON to `public/data/latest.json`.
3. Append one item to `public/data/manifest.json` and update `latest` and `updatedAt`.
4. Open and verify every primary source before using `fact_status: "official"`.
5. Never modify or delete an older archive file. Corrections create a revision commit without changing the issue number.

The edition object must use `schemaVersion: 1`, `timezone: "Asia/Shanghai"`, a continuous positive `issueNumber`, and an `id` equal to `date + "-" + period`. It must include `entries`, `upcoming`, `tracking`, and `sourceReport`. Keep the existing field names, including `fact_status`, `time_status`, and `title_key`.

Before committing, the task should run or request the equivalent of:

```bash
npm run validate:data
npm run check
```

Pushing the data commit starts the Pages workflow. The workflow validates the archive, builds the site, and deploys it. No OpenAI or GitHub token is exposed in browser code.

## Failure behavior

If GitHub is unavailable, the task should report the prepared edition without pretending it was published. If `latest.json` is missing or invalid, the deployed app shows its bundled fallback data. CI rejects schema errors, discontinuous issue numbers, metadata mismatches, and deleted archive files.

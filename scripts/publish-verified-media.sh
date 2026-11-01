#!/usr/bin/env bash
set -euo pipefail

# The first enrichment and full check have already succeeded. Keep this exact
# edition even if another writer advances latest while the push is in flight.
edition="${1:?exact edition required}"
record="${2:-}"
if [[ ! "$edition" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-(am|pm|daily)$ ]]; then
  echo "Invalid edition_id: $edition" >&2
  exit 1
fi
if [[ -n "$record" && ! "$record" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Invalid record_id: $record" >&2
  exit 1
fi

echo "edition=$edition" >> "$GITHUB_OUTPUT"
git config user.name "daily-game-brief[bot]"
git config user.email "daily-game-brief[bot]@users.noreply.github.com"
for attempt in 1 2 3; do
  git add public/data/latest.json public/data/archive public/media
  if git diff --cached --quiet; then
    echo "changed=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  base="$(git rev-parse HEAD)"
  git commit -m "chore(media): enrich $edition"
  if git push origin HEAD:main; then
    echo "changed=true" >> "$GITHUB_OUTPUT"
    echo "commit=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  # A rejected push is not necessarily a race (permissions/network may fail).
  # Never retry unchanged remote state, and never rebase generated Canonical JSON.
  git fetch origin main
  # The server can accept a push even if the client loses its response.
  if git merge-base --is-ancestor HEAD origin/main; then
    echo "changed=true" >> "$GITHUB_OUTPUT"
    echo "commit=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  if [ "$(git rev-parse origin/main)" = "$base" ] || [ "$attempt" = 3 ]; then
    echo "Failed to publish media; remote unchanged or retry budget exhausted" >&2
    exit 1
  fi
  git reset --hard origin/main
  git clean -f -- public/media
  # Main may also have updated code/dependencies. Regenerate only this original
  # edition/record using the fresh trusted implementation, then validate in full.
  npm ci
  args=(--apply "--edition=$edition")
  if [ -n "$record" ]; then args+=("--revalidate-cover-id=$record"); fi
  node scripts/enrich-media.mjs "${args[@]}"
  npm run check
done

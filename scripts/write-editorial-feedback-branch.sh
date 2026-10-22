#!/usr/bin/env bash
set -euo pipefail
# Shared trusted state transaction for ordinary feedback and queue advancement.
: "${EDITION_ID:?Exact edition ID required}"
if [[ ! "$EDITION_ID" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-(am|pm|daily)$ ]]; then
  echo "Invalid feedback edition" >&2; exit 1
fi
if [ "${FEEDBACK_ELIGIBLE:-}" != "true" ] && [ "${FEEDBACK_ELIGIBLE:-}" != "false" ]; then
  echo "Explicit feedback eligibility required" >&2; exit 1
fi
success=false
for attempt in 1 2 3; do
  state_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/editorial-ledger-$attempt-XXXXXX")"
  rmdir "$state_dir"
  git fetch origin +refs/heads/automation/state:refs/remotes/origin/automation/state
  git worktree add --detach "$state_dir" origin/automation/state
  if [ "${FEEDBACK_ELIGIBLE:-}" = "true" ]; then
    EVENT_LEDGER_PATH="$state_dir/automation/ledger/events.json" node scripts/apply-editorial-feedback.mjs
  fi
  node scripts/advance-showcase-queue.mjs --state-root="$state_dir" --edition="$EDITION_ID" --max-activations=1
  git -C "$state_dir" config user.name "daily-game-brief[bot]"
  git -C "$state_dir" config user.email "daily-game-brief[bot]@users.noreply.github.com"
  git -C "$state_dir" add automation/ledger/events.json
  if [ -d "$state_dir/automation/batches" ]; then
    git -C "$state_dir" add automation/batches automation/packets automation/status
  fi
  if git -C "$state_dir" diff --cached --quiet; then
    echo "updated=false" >> "$GITHUB_OUTPUT"
    git worktree remove "$state_dir"
    success=true
    break
  fi
  if [ "${FEEDBACK_ELIGIBLE:-}" != "true" ]; then
    message="chore(automation): advance $EDITION_ID continuation queue"
  else
    message="chore(automation): record $EDITION_ID editorial outcomes"
  fi
  git -C "$state_dir" commit -m "$message"
  if git -C "$state_dir" push origin HEAD:automation/state; then
    echo "updated=true" >> "$GITHUB_OUTPUT"
    git worktree remove "$state_dir"
    success=true
    break
  fi
  git worktree remove "$state_dir"
done
if [ "$success" != "true" ]; then
  echo "Failed to update automation/state after three attempts" >&2
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

edition_filter=""
refresh_sources=true
for argument in "$@"; do
  case "$argument" in
    --no-refresh-sources) refresh_sources=false ;;
    --refresh-sources) refresh_sources=true ;;
    --*) echo "Unknown queue update option: $argument" >&2; exit 1 ;;
    *) if [ -n "$edition_filter" ]; then echo "Only one edition filter is supported" >&2; exit 1; fi; edition_filter="$argument" ;;
  esac
done

for attempt in 1 2 3; do
  state_dir="$RUNNER_TEMP/showcase-state-$GITHUB_RUN_ID-$attempt"
  git fetch origin +refs/heads/automation/state:refs/remotes/origin/automation/state
  git worktree add --detach "$state_dir" origin/automation/state
  if [ ! -d "$state_dir/automation/batches" ]; then
    git worktree remove "$state_dir"
    exit 0
  fi
  queue_args=(--state-root="$state_dir" --max-activations=1)
  if [ -n "$edition_filter" ]; then queue_args+=(--edition="$edition_filter"); fi
  if [ "$refresh_sources" = "true" ]; then queue_args+=(--refresh-sources); fi
  node scripts/advance-showcase-queue.mjs "${queue_args[@]}"
  git -C "$state_dir" config user.name "daily-game-brief[bot]"
  git -C "$state_dir" config user.email "daily-game-brief[bot]@users.noreply.github.com"
  git -C "$state_dir" add automation/batches automation/packets automation/status
  if git -C "$state_dir" diff --cached --quiet; then
    git worktree remove "$state_dir"
    exit 0
  fi
  git -C "$state_dir" commit -m "chore(automation): advance due showcase completion"
  if git -C "$state_dir" push origin HEAD:automation/state; then
    git worktree remove "$state_dir"
    exit 0
  fi
  git worktree remove --force "$state_dir"
done
echo "Showcase queue update conflicted three times; keep durable pending work for the next run."
exit 1

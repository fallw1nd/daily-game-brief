#!/usr/bin/env bash
set -euo pipefail

for attempt in 1 2 3; do
  state_dir="$RUNNER_TEMP/showcase-state-$GITHUB_RUN_ID-$attempt"
  git fetch origin +refs/heads/automation/state:refs/remotes/origin/automation/state
  git worktree add --detach "$state_dir" origin/automation/state
  if [ ! -d "$state_dir/automation/batches" ]; then
    git worktree remove "$state_dir"
    exit 0
  fi
  node scripts/advance-showcase-queue.mjs --state-root="$state_dir" --refresh-sources
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

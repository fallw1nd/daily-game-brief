#!/usr/bin/env bash
set -euo pipefail

main_root="$(pwd)"
state_dir=""
cleanup() {
  if [ -n "$state_dir" ]; then
    git worktree remove --force "$state_dir"
    state_dir=""
  fi
}
trap cleanup EXIT

for attempt in 1 2 3; do
  # Publication or another state writer may advance while Pages is building.
  git fetch origin \
    +refs/heads/main:refs/remotes/origin/main \
    +refs/heads/automation/state:refs/remotes/origin/automation/state
  state_dir="$(mktemp -d "${RUNNER_TEMP:?RUNNER_TEMP is required}/deployment-state-${GITHUB_RUN_ID:-local}-XXXXXX")"
  git worktree add --detach "$state_dir" origin/automation/state

  # Select AND record against this fresh snapshot on every CAS retry. A newer
  # publication cannot be acknowledged using a stale preselected edition list.
  node "$main_root/scripts/reconcile-deployment-state.mjs" --state-root="$state_dir" "$@"
  git -C "$state_dir" config user.name "daily-game-brief[bot]"
  git -C "$state_dir" config user.email "daily-game-brief[bot]@users.noreply.github.com"
  git -C "$state_dir" add automation/status
  if git -C "$state_dir" diff --cached --quiet; then exit 0; fi
  git -C "$state_dir" commit -m "chore(automation): reconcile Pages deployment receipts"
  if git -C "$state_dir" push origin HEAD:automation/state; then exit 0; fi
  cleanup
done
echo "Failed to reconcile Pages deployment receipts after three attempts" >&2
exit 1

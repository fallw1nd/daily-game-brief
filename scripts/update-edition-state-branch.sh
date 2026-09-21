#!/usr/bin/env bash
set -euo pipefail

edition="${1:?edition is required}"
event="${2:?state event is required}"
shift 2
main_root="$(pwd)"
success=false
packet_path=""

for arg in "$@"; do
  case "$arg" in
    --packet=*) packet_path="${arg#--packet=}" ;;
  esac
done

for attempt in 1 2 3; do
  state_dir="${RUNNER_TEMP:?RUNNER_TEMP is required}/edition-state-${GITHUB_RUN_ID:-local}-$attempt"
  git fetch origin +refs/heads/automation/state:refs/remotes/origin/automation/state
  git worktree add --detach "$state_dir" origin/automation/state

  if [ "$event" = "locale-status" ] && [ ! -f "$state_dir/automation/status/$edition.json" ]; then
    if [[ "$edition" =~ -(am|pm)$ ]]; then
      echo "Skipping durable locale acknowledgement for legacy pre-state edition $edition."
      success=true
      git worktree remove --force "$state_dir"
      break
    fi
    echo "Refusing to synthesize missing durable state for Daily locale acknowledgement: $edition" >&2
    git worktree remove --force "$state_dir"
    exit 1
  fi

  node "$main_root/scripts/record-edition-state.mjs" \
    --state-root="$state_dir" \
    --edition="$edition" \
    --event="$event" \
    --run-id="${GITHUB_RUN_ID:-local}" \
    "$@"

  # A pinned historical revision packet normally reuses an existing Git blob.
  # If the authorized wake repaired only subject identity, persist those
  # derived bytes so the new packet SHA is fetchable by the trusted publisher.
  if [ "$event" = "packet-ready" ] && [ -n "$packet_path" ]; then
    mkdir -p "$state_dir/automation/packets"
    cp "$packet_path" "$state_dir/automation/packets/$edition.json"
  fi

  git -C "$state_dir" config user.name "daily-game-brief[bot]"
  git -C "$state_dir" config user.email "daily-game-brief[bot]@users.noreply.github.com"
  git -C "$state_dir" add "automation/status/$edition.json"
  if [ "$event" = "packet-ready" ] && [ -n "$packet_path" ]; then
    git -C "$state_dir" add "automation/packets/$edition.json"
  fi
  if git -C "$state_dir" diff --cached --quiet; then
    success=true
    git worktree remove --force "$state_dir"
    break
  fi
  git -C "$state_dir" commit -m "chore(automation): record $edition $event"
  if git -C "$state_dir" push origin HEAD:automation/state; then
    success=true
    git worktree remove --force "$state_dir"
    break
  fi
  git worktree remove --force "$state_dir"
done

if [ "$success" != "true" ]; then
  echo "Failed to record $edition $event on automation/state after three attempts" >&2
  exit 1
fi

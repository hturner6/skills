#!/usr/bin/env bash
# Remove a PR's review worktree and its generated HTML files.
# Usage: cleanup.sh <PR number or URL>
set -euo pipefail

info="$(gh pr view "$1" --json number,url)"
number="$(jq -r .number <<<"$info")"
repo="$(jq -r .url <<<"$info" | sed -E 's#https://github.com/([^/]+/[^/]+)/pull/.*#\1#')"
dir="${REVIEW_BUDDY_CACHE:-$HOME/.cache/review-buddy}/${repo//\//-}/pr-$number"

[[ -d "$dir" ]] || { echo "nothing to clean: $dir"; exit 0; }
git -C "$dir" worktree remove --force "$dir" 2>/dev/null || rm -rf "$dir"
rm -rf "$dir.visuals"
git worktree prune 2>/dev/null || true
echo "removed $dir"

#!/usr/bin/env bash
# Create (or reuse) a throwaway worktree for a PR with every PR change showing as a staged diff.
# Usage: setup-worktree.sh <PR number or URL>
# Prints: worktree=<path>, repo=<owner/name>, head=<sha>, base=<merge-base sha>
set -euo pipefail

pr="$1"
info="$(gh pr view "$pr" --json number,url,headRefOid,baseRefName)"
number="$(jq -r .number <<<"$info")"
head="$(jq -r .headRefOid <<<"$info")"
base_ref="$(jq -r .baseRefName <<<"$info")"
repo="$(jq -r .url <<<"$info" | sed -E 's#https://github.com/([^/]+/[^/]+)/pull/.*#\1#')"

cache="${REVIEW_BUDDY_CACHE:-$HOME/.cache/review-buddy}/${repo//\//-}"
dir="$cache/pr-$number"
mkdir -p "$cache"

# Use the current checkout when it is this repo, otherwise keep a clone in the cache.
here="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$here" ]] && git -C "$here" remote get-url origin 2>/dev/null | grep -q "$repo"; then
  src="$here"
else
  src="$cache/repo"
  [[ -d "$src" ]] || gh repo clone "$repo" "$src" -- --filter=blob:none --quiet
fi

git -C "$src" fetch --quiet origin "pull/$number/head" "$base_ref"
base="$(git -C "$src" merge-base "$head" "origin/$base_ref")"

if [[ -d "$dir" ]]; then
  # Resume: move to the current head if the PR has new commits.
  git -C "$dir" reset --quiet --hard "$head"
else
  git -C "$src" worktree add --quiet --detach "$dir" "$head"
fi
git -C "$dir" reset --quiet --soft "$base"

echo "worktree=$dir"
echo "repo=$repo"
echo "head=$head"
echo "base=$base"

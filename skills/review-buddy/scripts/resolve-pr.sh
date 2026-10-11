#!/usr/bin/env bash
# Resolve a PR from a number, URL, or title and print its details as JSON.
# Usage: resolve-pr.sh <number | url | title words...>
# Exit 0: one PR, JSON on stdout. Exit 2: several title matches, a table on stdout. Exit 1: error.
set -euo pipefail

query="$*"
[[ -n "$query" ]] || { echo "usage: resolve-pr.sh <number|url|title>" >&2; exit 1; }
fields="number,title,url,body,author,baseRefName,headRefName,headRefOid,state,isDraft,additions,deletions,changedFiles,closingIssuesReferences,statusCheckRollup"

if [[ "$query" =~ ^[0-9]+$ || "$query" =~ ^https://github\.com/.+/pull/[0-9]+ ]]; then
  gh pr view "$query" --json "$fields"
  exit 0
fi

matches="$(gh pr list --state open --search "$query in:title" --json number,title,author --limit 10)"
count="$(jq length <<<"$matches")"
if [[ "$count" -eq 0 ]]; then
  echo "no open PR in this repo matches title: $query" >&2
  exit 1
elif [[ "$count" -eq 1 ]]; then
  gh pr view "$(jq -r '.[0].number' <<<"$matches")" --json "$fields"
else
  jq -r '.[] | "#\(.number)\t\(.title)\t\(.author.login)"' <<<"$matches"
  exit 2
fi

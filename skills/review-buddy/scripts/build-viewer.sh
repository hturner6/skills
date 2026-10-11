#!/usr/bin/env bash
# Build the self-contained review viewer (diffs, notes, flow-ordered stops) and print its path.
# Usage: build-viewer.sh <worktree> <stops.json> [<output.html>]
# stops.json (you write this; the script fills in each file's diff from git). Keep every text field
# short: one to three sentences, or an array of short items. All text is plain text.
# {
#   "title": "PR #2: Add review-buddy skill",
#   "summary": "One or two sentences: what the PR does.",
#   "findings": [{ "title": "Short claim", "detail": "One or two sentences of evidence.",
#                  "severity": "high" | "med" | "low", "stop": "s1" }],        // most important first
#   "lookAt": [{ "text": "pending-review.sh: the only GitHub writer", "stop": "s1" }],  // 3-5 items
#   "ci": "What CI proves, and what was tested.",                               // string or array
#   "skipped": ["mechanical rename across 14 files"],                           // omit when empty
#   "stops": [{
#     "id": "s1", "title": "Pending review script", "tier": "must" | "skim",
#     "why": "What changed and why, in one or two sentences.",
#     "lookFor": ["the judgment call that is the reviewer's", "..."],           // string or array
#     "unverified": ["what the AI could not check"],                            // string or array
#     "visual": "I can make a sequence diagram of ...",                         // concrete, optional
#     "files": [{ "path": "src/a.sh", "range": "33-37", "context": 3,
#                 "notes": [{ "line": 36, "side": "new" | "old", "text": "..." }] }]
#   }]
# }
# Output: <worktree>.visuals/review.html, or the optional third argument.
set -euo pipefail

wt="$1"; stops="$2"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
html="${3:-$wt.visuals/review.html}"; mkdir -p "$(dirname "$html")"
data="$(mktemp)"; trap 'rm -f "$data"' EXIT
cp "$stops" "$data"

nstops="$(jq '.stops | length' "$data")"
for ((i = 0; i < nstops; i++)); do
  nfiles="$(jq ".stops[$i].files | length" "$data")"
  for ((j = 0; j < nfiles; j++)); do
    path="$(jq -r ".stops[$i].files[$j].path" "$data")"
    range="$(jq -r ".stops[$i].files[$j].range // empty" "$data")"
    ctx="$(jq -r ".stops[$i].files[$j].context // 3" "$data")"
    diff="$("$here/show-diff.sh" "$wt" "$path" ${range:+"$range"} --context "$ctx" 2>/dev/null || true)"
    jq --argjson i "$i" --argjson j "$j" --arg d "$diff" '.stops[$i].files[$j].diff = $d' "$data" >"$data.new"
    mv "$data.new" "$data"
  done
done

# Escape every '<' as \u003c so no diff text can open or close a tag, comment or script in the page.
json="$(jq -c . "$data" | sed 's#<#\\u003c#g')"
printf '%s\n' "$json" >"$data"
awk -v f="$data" '$0 == "__DATA__" { while ((getline l < f) > 0) print l; next } { print }' \
  "$here/viewer-template.html" >"$html"
echo "$html"

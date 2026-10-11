#!/usr/bin/env bash
# Build the self-contained review viewer (diffs, notes, flow-ordered stops) and print its path.
# Usage: build-viewer.sh <worktree> <stops.json>
# stops.json (you write this; the script fills in each file's diff from git):
# {
#   "title": "PR #2: Add review-buddy skill",
#   "overview": [{"title": "What it does", "body": "..."}],      // plain text, shown on the Overview page
#   "skipped": ["mechanical rename across 14 files"],           // the groups the reviewer approved to skip
#   "stops": [{
#     "id": "s1", "title": "Pending review script", "tier": "must" | "skim",
#     "why": "...", "lookFor": "...", "unverified": "...",
#     "visual": "I can make a sequence diagram of ...",         // concrete suggestion, optional
#     "files": [{ "path": "src/a.sh", "range": "33-37", "context": 3,
#                 "notes": [{ "line": 36, "side": "new" | "old", "text": "..." }] }]
#   }]
# }
# Output: <worktree>.visuals/review.html. All text fields are plain text (the viewer escapes them).
set -euo pipefail

wt="$1"; stops="$2"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$wt.visuals"; mkdir -p "$out"
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

# Keep the JSON from closing the <script> tag, then splice it into the template.
json="$(jq -c . "$data" | sed 's#</#<\\/#g')"
printf '%s\n' "$json" >"$data"
awk -v f="$data" '$0 == "__DATA__" { while ((getline l < f) > 0) print l; next } { print }' \
  "$here/viewer-template.html" >"$out/review.html"
echo "$out/review.html"

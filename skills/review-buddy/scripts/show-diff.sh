#!/usr/bin/env bash
# Show just the changed code for a file in a review worktree, not the whole file.
# Usage: show-diff.sh <worktree> <path> [<start>-<end>] [options]
#   <start>-<end>   new-side line range; only hunks touching it are shown (default: all hunks)
#   --context N     lines of context around changes (default 3)
#   --html          print an HTML <pre> fragment with coloured +/- lines, to embed in a visual
#   --open snippet  open ONLY this snippet as base-vs-head in the editor's diff view
#   --open file     open the whole file as base-vs-head in the editor's diff view
# With no option, prints the unified diff for the snippet. In the worktree, HEAD is the PR's
# merge-base and the PR's changes are staged, so HEAD:path is "before" and the file is "after".
set -euo pipefail

wt="$1"; path="$2"; shift 2
range=""; ctx=3; mode="text"; open=""
[[ "${1:-}" =~ ^[0-9]+-[0-9]+$ ]] && { range="$1"; shift; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) ctx="$2"; shift 2 ;;
    --html) mode="html"; shift ;;
    --open) open="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vis="$wt.visuals"
s="${range%-*}"; e="${range#*-}"

# Unified diff for the file, trimmed to the lines in the range plus context (hunks are re-cut, so a
# brand-new file still yields only the snippet). No range keeps everything.
filtered="$(git -C "$wt" diff --cached --no-color -U"$ctx" -- "$path" | awk -v s="${s:-}" -v e="${e:-}" -v ctx="$ctx" '
  BEGIN { lo = (s == "" ? 0 : s - ctx); hi = (s == "" ? 1e9 : e + ctx) }
  !inhunk && !/^@@ / { head = head $0 "\n"; next }
  /^@@ / {
    inhunk = 1; hid++
    split($2, a, ","); on = substr(a[1], 2) + 0
    split($3, b, ","); nn = substr(b[1], 2) + 0
    next
  }
  /^\\/ { next }
  {
    c = substr($0, 1, 1); i++; h[i] = hid; t[i] = c; txt[i] = $0
    if (c == " ") { o[i] = on++; n[i] = nn++ }
    else if (c == "-") { o[i] = on++; n[i] = nn }
    else { o[i] = on; n[i] = nn++ }
    sel[i] = (c == "-") ? (n[i] >= lo && n[i] <= hi + 1) : (n[i] >= lo && n[i] <= hi)
  }
  END {
    if (!i) exit
    printf "%s", head
    for (k = 1; k <= i; k++) {
      if (!sel[k]) continue
      r = k; while (r + 1 <= i && sel[r + 1] && h[r + 1] == h[k]) r++
      oc = nc = 0; os = ns = ""
      for (m = k; m <= r; m++) {
        if (t[m] != "+") { oc++; if (os == "") os = o[m] }
        if (t[m] != "-") { nc++; if (ns == "") ns = n[m] }
      }
      if (os == "") os = (o[k] > 0 ? o[k] - 1 : 0)
      if (ns == "") ns = (n[k] > 0 ? n[k] - 1 : 0)
      printf "@@ -%d,%d +%d,%d @@\n", os, oc, ns, nc
      for (m = k; m <= r; m++) print txt[m]
      k = r
    }
  }')"
grep -q '^@@ ' <<<"$filtered" || { echo "no changes to $path in range ${range:-all}" >&2; exit 1; }

case "$open" in
  snippet)
    out="$vis/snippets/${path//\//__}"; mkdir -p "$out"
    base="$out/before-$(basename "$path")"; head="$out/after-$(basename "$path")"
    awk '/^@@ /{h=1; next} h && /^\\/{next} h && /^[ -]/{print substr($0,2)}' <<<"$filtered" >"$base"
    awk '/^@@ /{h=1; next} h && /^\\/{next} h && /^[ +]/{print substr($0,2)}' <<<"$filtered" >"$head"
    "$here/open-editor.sh" --diff "$base" "$head" ;;
  file)
    mkdir -p "$vis/base/$(dirname "$path")"
    git -C "$wt" show "HEAD:$path" >"$vis/base/$path" 2>/dev/null || : >"$vis/base/$path"
    "$here/open-editor.sh" --diff "$vis/base/$path" "$wt/$path" ;;
  "")
    if [[ "$mode" == html ]]; then
      echo '<pre class="diff">'
      awk '{ gsub(/&/,"\\&amp;"); gsub(/</,"\\&lt;"); gsub(/>/,"\\&gt;")
             c = ($0 ~ /^@@/) ? "hunk" : ($0 ~ /^\+/ && $0 !~ /^\+\+\+/) ? "add" : ($0 ~ /^-/ && $0 !~ /^---/) ? "del" : "ctx"
             if ($0 ~ /^(diff|index|---|\+\+\+|new file)/) next
             print "<span class=\"" c "\">" $0 "</span>" }' <<<"$filtered"
      echo '</pre>'
    else
      echo "$filtered"
    fi ;;
  *) echo "--open takes snippet or file" >&2; exit 1 ;;
esac

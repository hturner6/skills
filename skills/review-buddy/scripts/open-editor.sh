#!/usr/bin/env bash
# Open a path (optionally at a line) in the reviewer's editor.
# Usage: open-editor.sh detect          -> print the editor that would be used (or "none")
#        open-editor.sh <dir>           -> open a folder
#        open-editor.sh <file>[:<line>] -> open a file at a line
#        open-editor.sh --diff <before> <after> -> open two files in the editor's diff view
# Editor comes from REVIEW_BUDDY_EDITOR (code, cursor, zed, none, ...), else the first one found.
set -euo pipefail

editor="${REVIEW_BUDDY_EDITOR:-}"
if [[ -z "$editor" ]]; then
  for c in code cursor zed; do
    command -v "$c" >/dev/null && { editor="$c"; break; }
  done
fi
editor="${editor:-none}"

if [[ "${1:-}" == detect ]]; then echo "$editor"; exit 0; fi

if [[ "${1:-}" == --diff ]]; then
  case "$editor" in
    code|cursor|codium) command -v "$editor" >/dev/null && { "$editor" --diff "$2" "$3"; exit 0; } ;;
  esac
  echo "diff: $2 <-> $3"   # no editor with a diff view: show the paths
  exit 0
fi

target="$1"
if [[ "$editor" == none ]] || ! command -v "$editor" >/dev/null; then
  echo "$target"
  exit 0
fi

case "$editor" in
  code|cursor|codium) if [[ "$target" == *:* ]]; then "$editor" -g "$target"; else "$editor" "$target"; fi ;;
  *) "$editor" "$target" ;;   # zed and most others accept path[:line]
esac

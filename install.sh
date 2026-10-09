#!/usr/bin/env bash
# Symlink every skill in ./skills into ~/.claude/skills so Claude Code picks them up.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
mkdir -p "$dest"

for dir in "$repo"/skills/*/; do
  name="$(basename "$dir")"
  target="$dest/$name"
  if [[ -e "$target" && ! -L "$target" ]]; then
    echo "skip   $name (exists and is not a symlink)"
    continue
  fi
  ln -sfn "${dir%/}" "$target"
  echo "linked $name -> $target"
done

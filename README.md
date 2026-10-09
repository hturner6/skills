# Claude Skills

My custom [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills).

## Layout

```
skills/<skill-name>/SKILL.md   # one folder per skill (plus any scripts/reference files)
template/SKILL.md              # starting point for a new skill
install.sh                     # symlinks skills/* into ~/.claude/skills
```

## Usage

```sh
./install.sh
```

Skills are symlinked, so edits in this repo take effect immediately.

## Adding a skill

1. `cp -r template skills/my-skill`
2. Edit `skills/my-skill/SKILL.md` (set `name` to match the folder, write a clear `description`).
3. Re-run `./install.sh`.

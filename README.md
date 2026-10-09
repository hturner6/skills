# Claude Skills & Plugins

My custom Claude Code skills and plugins. This repo is both a plugin marketplace and a home for loose personal skills.

## Layout

```
.claude-plugin/marketplace.json   marketplace manifest (lists plugins)
plugins/<name>/
  .claude-plugin/plugin.json      plugin manifest
  skills/<skill>/SKILL.md         plus commands/, agents/, hooks/, .mcp.json as needed
skills/<name>/SKILL.md            loose personal skills (symlinked by install.sh)
template/SKILL.md                 starting point for a new skill
```

## Plugins

```sh
# local checkout
claude plugin marketplace add /home/hturner/Documents/Projects/skills
claude plugin install example-plugin@hturner-skills

# once pushed to GitHub
/plugin install example-plugin --marketplace <owner>/<repo>
```

Validate before committing: `claude plugin validate .` and `claude plugin validate plugins/<name>`.

### Adding a plugin

1. Copy `plugins/example-plugin` to `plugins/my-plugin` and edit its `plugin.json`.
2. Add an entry to `.claude-plugin/marketplace.json` with `"source": "./plugins/my-plugin"`.
3. Validate, then `/reload-plugins`.

## Loose skills

```sh
./install.sh
```

Symlinks `skills/*` into `~/.claude/skills`, so edits take effect immediately. To add one: `cp -r template skills/my-skill`, edit `SKILL.md`, re-run `./install.sh`.

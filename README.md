# Claude Skills & Plugins

Claude Code tooling for working through GitHub pull requests.

- **pr-reply** (plugin): browse and reply to PR comment threads from a terminal pane.
- **review-buddy** (skill): helps a human review a PR.

## Layout

```
.claude-plugin/marketplace.json   marketplace manifest
plugins/pr-reply/                 the pr-reply plugin
skills/review-buddy/              the review-buddy skill
install.sh                        symlinks skills/* into ~/.claude/skills
```

## pr-reply

```sh
/plugin marketplace add hturner6/skills
/plugin install pr-reply@hturner-skills
```

Then run `/pr-comments`. Needs the `gh` CLI.

## review-buddy

```sh
git clone https://github.com/hturner6/skills && cd skills && ./install.sh
```

`install.sh` symlinks `skills/review-buddy` into `~/.claude/skills`, so edits to the checkout take effect immediately.

review-buddy triages what needs human eyes in a PR, walks through it by flow, explains with throwaway HTML visuals, and drafts comments into a pending review. Needs `gh`, `git`, `jq`. Set `REVIEW_BUDDY_EDITOR` (`code`, `cursor`, `zed`, `none`) to choose the editor. A repo can override the default criteria with `.review-buddy.md`.

## Development

Validate before committing: `claude plugin validate .` and `claude plugin validate plugins/pr-reply`.

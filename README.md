# Claude Skills & Plugins

Claude Code plugins for working through GitHub pull requests.

- **pr-reply**: browse and reply to PR comment threads from a terminal pane.
- **review-buddy**: helps a human review a PR.

## Install

```sh
/plugin marketplace add hturner6/skills
/plugin install pr-reply@hturner-skills
/plugin install review-buddy@hturner-skills
```

## Layout

```
.claude-plugin/marketplace.json   marketplace manifest
plugins/pr-reply/                 the pr-reply plugin
plugins/review-buddy/             the review-buddy plugin (skill in skills/review-buddy)
```

## pr-reply

Run `/pr-comments`. Needs the `gh` CLI.

## review-buddy

Run `/review-buddy <PR number, URL, or title>`. It triages what needs human eyes in a PR, walks through it by flow, explains with throwaway HTML visuals, and drafts comments into a pending review. Needs `gh`, `git`, `jq`. Set `REVIEW_BUDDY_EDITOR` (`code`, `cursor`, `zed`, `none`) to choose the editor. A repo can override the default criteria with `.review-buddy.md`.

## Development

Validate before committing: `claude plugin validate .` and `claude plugin validate plugins/<name>`.

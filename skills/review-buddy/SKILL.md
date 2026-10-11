---
name: review-buddy
description: Help a human review a GitHub pull request quickly, especially large AI-authored ones. Finds the parts that need human eyes, walks through the PR by flow, explains and diagrams it, and drafts comments into a pending review. Run it with /review-buddy <PR number, URL, or title>.
disable-model-invocation: true
argument-hint: <PR number, URL, or title>
---

# Review Buddy

You assist a human who is reviewing a PR. They make every judgment call. You triage, explain, and
organise, and you never approve, request changes, submit, or post anything. Concerns go into a
**pending** review that the human edits and submits themselves.

Be fast and lightweight. The point is a quicker review, so keep explanations short and let the
human steer. Scripts live in `scripts/` next to this file. They need only `gh`, `git`, and `jq`.

## 1. Resolve the PR

The PR is the argument the user gave. If they gave none, ask which PR.

Run `scripts/resolve-pr.sh <number | url | title>`. Exit 2 means several titles matched: show the
list and ask which one. Never guess. Note the description, linked issues, and any plan or spec the
PR points to. This is the stated intent.

Run `gh pr checks <pr>` and note what CI already proves.

## 2. Set up the worktree

Run `scripts/setup-worktree.sh <pr>`. It makes a throwaway worktree at the PR head with every PR
change staged, so an editor shows them as diffs and find-references works. Your own working tree is
untouched.

Run `scripts/open-editor.sh detect`. Tell the user which editor it found (or that none was found)
and confirm before opening. The user can set `REVIEW_BUDDY_EDITOR` (`code`, `cursor`, `zed`,
`none`). Open the worktree with `scripts/open-editor.sh <worktree>`. If no editor is used, give
`path:line` references instead.

## 3. Triage

Read the whole diff and enough surrounding code (callers, tests, neighbouring modules) to judge
impact. Classify every changed file or hunk into **must-read**, **skim**, or **skip** using the
criteria in `default-criteria.md`. If `.review-buddy.md` exists at the repo root, apply it on top.

Rules:
- Compare the diff to the stated intent. Changes nobody asked for and asked-for changes that are
  missing are must-read.
- When unsure, go up a tier. Never skip what you cannot confidently explain.
- Group by reason, not by file. A group has a one-line reason, such as "rename across 14 files".

Present the tiers. For every skip group, give the reason and say how you checked it. Say what CI
already proves. Local tests, lint, or typecheck may be offered, but never run them unasked.

The user approves the triage. They can move groups between tiers. **Nothing counts as skipped
until the user says yes.** When they correct you, offer to save the correction as a rule in
`.review-buddy.md`, and write it only if they agree.

## 4. PR map

Build a single self-contained HTML page (see "Visuals") showing the flows in the PR, any new
architecture, and a before/after sketch. Open it in the browser.

## 5. Walk through by flow

Order the must-read items by what makes the PR easiest to understand: a flow or feature at a time,
foundations before what builds on them. Never file order. At each stop:

1. Say what changed and why, in a few lines.
2. Say what to look for: the specific judgment call that is the human's.
3. Say what you could not verify.
4. Show **only the code to review, as a diff**, never the whole file. Print the changed lines with
   `scripts/show-diff.sh <worktree> <path> <start>-<end>` (lines on the PR side) and paste that
   snippet into your message. Then open the same snippet in the editor's diff view with
   `scripts/show-diff.sh <worktree> <path> <start>-<end> --open snippet`. If the reviewer needs to
   navigate, find references, or see surrounding code, offer `--open file` (the whole file,
   before vs after) or `scripts/open-editor.sh <worktree>/<path>:<line>` as a follow-up, not the default.
5. Offer **one concrete visual**, naming exactly what you would draw, for example "I can make a
   flow diagram of how a login request passes through the new auth middleware". Never just say
   "I can make an HTML". Offer it every stop, and build it only if asked.
6. Take their answer: **ok**, **concern**, or **question**. A question starts a back-and-forth.

Skim items get a one-line summary the user can confirm. Skipped groups are not visited.

## 6. Concerns become draft comments

When the user raises a concern, write the comment text with them, then add it to their pending
review: `scripts/pending-review.sh add <pr> <path> <line> <body-file> [start-line]`. It prints the
comment id. Keep the ids to edit (`edit <id> <body-file>`) or remove (`delete <id>`) a draft. `list
<pr>` shows what is pending. This only ever adds to a pending review, and the human submits it on
GitHub. If the user already had a pending review, drafts join it.

## 7. Finish

When the user is done, remind them their drafts are pending on GitHub and need submitting. Run
`scripts/cleanup.sh <pr>` only when they say they are finished. To resume later, run the skill
again on the same PR: triage runs again and must be re-approved. Their pending comments are still
on GitHub.

## Visuals

Write each visual as one self-contained HTML file in `<worktree>.visuals/` (a sibling of the
worktree, so the editor does not see it), then open it in the browser with `xdg-open`, `open`, or
`start`. No build step. If a library is truly needed, load one pinned version from a CDN. Keep it
plain and quick to read.

Show code in a visual as a diff snippet, not a link to a file. Embed
`scripts/show-diff.sh <worktree> <path> <start>-<end> --html` (it prints a `<pre class="diff">`
with `add`, `del`, `hunk`, `ctx` spans to colour). A `path:line` link may sit beside it, but it
must never be the only way to see the code.

Every claim in a visual or explanation points at a `path:line` in the worktree and is labelled as
your reading of the code. Mark anything you inferred rather than read as an inference. A visual
the reviewer cannot trace back to the code is a risk, not a help.

v1 visuals are the PR map and on-demand flow diagrams. Animations, slide decks, and interactive
components can follow if the user asks.

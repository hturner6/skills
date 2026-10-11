---
name: review-buddy
description: Review a GitHub pull request with a human, especially a large AI-authored one. Triages what needs human eyes, walks the PR flow by flow with a viewer, explains and diagrams, and drafts comments into a pending review. Run with /review-buddy <PR number, URL, or title>.
disable-model-invocation: true
argument-hint: <PR number, URL, or title>
---

# Review Buddy

You are the reviewer's assistant. The human makes every judgment call; you triage, explain, and
organise. Concerns land in a **pending** review that the human edits and submits themselves, so
approving, requesting changes, submitting, and posting stay with them.

Keep it tight: short explanations, and the human steers. Scripts live in `scripts/` next to this
file and need only `gh`, `git`, and `jq`.

## 1. Resolve the PR

The PR is the argument. With none, ask which.

Run `scripts/resolve-pr.sh <number | url | title>`. Exit 2 means several titles matched: list them
and ask which. Record the description, linked issues, and any plan or spec it points to. This is
the **stated intent**. Run `gh pr checks <pr>` and record what CI already proves.

## 2. Set up the worktree

Run `scripts/setup-worktree.sh <pr>`. It creates a throwaway worktree at the PR head with every PR
change staged, so an editor shows diffs and find-references works. Your own working tree is
untouched.

Run `scripts/open-editor.sh detect`, report the editor found (or none), and open
`scripts/open-editor.sh <worktree>` once the user confirms. `REVIEW_BUDDY_EDITOR` (`code`,
`cursor`, `zed`, `none`) overrides detection. With no editor, cite `path:line`.

## 3. Triage

Read the whole diff plus enough surrounding code (callers, tests, neighbouring modules) to judge
impact. Put every changed file or hunk in a tier (**must-read**, **skim**, **skip**) using
`default-criteria.md`, then apply `.review-buddy.md` from the repo root if it exists.

- Diff against the stated intent: unrequested changes and missing asked-for changes are must-read.
- Promote when unsure. Skip only what you can confidently explain.
- Group by reason, each group with a one-line reason ("rename across 14 files").

Present the tiers. Give every skip group its reason and how you verified it. State what CI proves.
Offer local tests, lint, or typecheck, and run them only when asked.

Triage is **proposed** until the user says yes. They may move groups between tiers. Treat nothing
as skipped before that yes. When they correct you, offer to save the correction as a rule in
`.review-buddy.md`, and write it once they agree.

## 4. Build the review viewer

The viewer is the main review surface: one self-contained HTML page with an overview, then the
must-read and skim stops in flow order. Each stop has its scoped diff, your line notes, and unified
or side-by-side views. The reviewer marks each stop ok, concern, or question.

Write `stops.json` (format at the top of `scripts/build-viewer.sh`). The page is for skimming:
every text field is one to three sentences or an array of short items, and lists are arrays.
- **summary**: what the PR does, in one or two sentences.
- **findings**: problems you found, most important first. Each has a short title, one or two
  sentences of evidence, a severity (`high`, `med`, `low`), its stop, and how you know (read it, or
  ran it). Findings are the most valuable content, so they sit on the overview.
- **lookAt**: the three to five stops to read first.
- **ci**: what CI proves and what was tested. **skipped**: the approved skip groups (omit when none).
- **stops**: ordered for understanding, one flow or feature at a time, foundations before what
  builds on them. Each has a one-sentence `why`, `lookFor` (the judgment calls that are the
  human's, as a short list), `unverified`, a concrete `visual` suggestion, and its files with the
  **line range** under review plus any line `notes`.

Run `scripts/build-viewer.sh <worktree> stops.json`, open the printed `review.html` in the browser
(`xdg-open`, `open`, or `start`), and tell the user it is ready and how many stops it has.

## 5. Walk through together

The user reads the viewer and talks to you in the terminal. At each stop they may:
- **Explain**: answer briefly, pasting the relevant code with
  `scripts/show-diff.sh <worktree> <path> <start>-<end>`.
- **Navigate**: open a file with `scripts/open-editor.sh <worktree>/<path>:<line>`, the whole-file
  diff with `scripts/show-diff.sh <worktree> <path> --open file`, or just a snippet with
  `scripts/show-diff.sh <worktree> <path> <start>-<end> --open snippet`.
- **Visualise**: build the stop's `visual` (see Visuals).
- **Raise a concern**: go to step 6.

When the user's input changes your triage or notes, update `stops.json` and rebuild. Skim stops get
a one-line confirmation. Skipped groups are not visited.

## 6. Concerns become draft comments

Write the comment text with the user, then add it:
`scripts/pending-review.sh add <pr> <path> <line> <body-file> [start-line]`. It prints the comment
id; keep it to `edit <id> <body-file>` or `delete <id>`. `list <pr>` shows what is pending. Drafts
join the user's existing pending review if they have one, and the human submits on GitHub.

## 7. Finish

When the user says they are finished, remind them their drafts are pending on GitHub awaiting
submission, then run `scripts/cleanup.sh <pr>`. To resume, run the skill again on the same PR:
triage reruns and needs fresh approval, and the pending comments are still on GitHub.

## Visuals

Each stop carries one `visual` suggestion that names exactly what you would draw ("a flow diagram
of how a login request passes through the new auth middleware"). Build it when asked.

Write it as one self-contained HTML file in `<worktree>.visuals/` (a sibling of the worktree, out of
the editor's view) and open it in the browser. No build step; if a library is truly needed, load one
pinned version from a CDN. Keep it plain and quick to read.

Show code as a diff snippet: embed `scripts/show-diff.sh <worktree> <path> <start>-<end> --html`
(a `<pre class="diff">` with `add`, `del`, `hunk`, `ctx` spans to colour). A `path:line` link may
sit beside it.

Make every claim **traceable**: cite a `path:line` in the worktree, label it your reading of the
code, and mark inferences as inferences.

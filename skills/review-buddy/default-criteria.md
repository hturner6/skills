# Default review criteria

Each entry says what to look for and which tier it puts a change in. A repo can add, remove, or re-tier
entries in `.review-buddy.md` at its root, using the same format. Repo entries win over these by name.

Tiers: **must-read** (a human reads the code closely), **skim** (a human glances, with a summary),
**skip** (safe to leave unread, always shown with a reason).

## Risk

- **auth-and-permissions** — login, sessions, tokens, roles, access checks. must-read
- **untrusted-input** — parsing, validation, queries built from input, file paths, shell calls, deserialization. must-read
- **data-changes** — migrations, schema changes, backfills, anything that rewrites stored data. must-read
- **destructive-operations** — deletes, truncation, overwrites, force flags, retention. must-read
- **money** — billing, pricing, balances, rounding, currency. must-read
- **concurrency** — locks, async ordering, shared state, retries, transactions. must-read
- **public-contract** — public API, CLI flags, config format, event or message shapes, exported types. must-read
- **infra-and-deps** — CI, deploy config, secrets handling, permissions, dependency additions or upgrades. must-read
- **error-paths** — new fallbacks, swallowed errors, defaults that hide failures. must-read
- **weakened-tests** — tests deleted, skipped, loosened, or mocked more heavily. must-read

## Complexity

- **dense-logic** — non-trivial branching, state machines, algorithms, tricky edge cases. must-read
- **hard-to-follow** — code whose behaviour you can't tell from reading the diff alone. must-read

## Worth understanding for future work

- **new-architecture** — new modules, layers, abstractions, or patterns others will build on. must-read
- **new-flow** — a new end-to-end path through the system (request, job, event, user journey). must-read
- **changed-conventions** — a different way of doing something the codebase already does. must-read

## Intent

- **unrequested-change** — a change the description, issue, or spec does not account for. must-read
- **missing-change** — something the intent calls for that the diff does not contain. must-read

## Lower attention

- **new-tests** — tests for new behaviour that match the code they cover. skim
- **glue-and-wiring** — registration, exports, routing, plumbing that follows an obvious pattern. skim
- **docs-and-comments** — prose changes. skim
- **mechanical-refactor** — renames, moves, formatting, import reordering with no behaviour change. skip
- **generated** — lockfiles, snapshots, generated code, vendored files. skip

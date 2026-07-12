---
description: "Use when running git operations: branching, committing, pushing, or opening PRs. Covers branch naming, Conventional Commits, PR rules, and what must never be done to main."
---

# Git & PR Workflow

## Tickets

- Every feature/fix is tracked as a **GitHub Issue** on `Siapp-Development/siapp`. No untracked work: if no issue exists, create one before starting (`gh issue create`).
- Status labels (mutually exclusive, keep exactly one): `status:planning` → `status:building` → `status:testing` → `status:validating` → `status:in-review` → closed by PR merge. `status:blocked` when human input is needed.
- Update the label on every stage transition and leave a one-line comment (`gh issue edit`, `gh issue comment`). The Feature Lead agent owns this in the pipeline; if working outside the pipeline, whoever does the work updates the ticket.
- Never close issues manually — PRs carry `Closes #N` and merge closes the ticket.

## Branches

- `main` is protected in spirit: **never commit or push to it directly.** All changes ship through PRs.
- Branch names: `feat/<issue>-<kebab-name>`, `fix/<issue>-<kebab-name>`, `chore/<kebab-name>`, `docs/<kebab-name>` (e.g. `feat/12-client-upload`). Branch from latest `main`.

## Commits

- **Conventional Commits:** `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`.
- Reference the ticket and decision IDs where relevant: `feat: outbound-only WA webhook (D-035, #12)`.
- Split commits by concern (implementation / tests / docs) when the diff is large.
- Stage files explicitly. Never `git add -A` without reviewing `git status` first. Leave unfamiliar untracked files alone and mention them.

## Forbidden

- `git push --force` (any branch), `git reset --hard` on shared branches, amending pushed commits, `--no-verify`, deleting branches that aren't yours, merging PRs (the human merges).

## PRs

- Create with `gh pr create`, filling the template at [.github/pull_request_template.md](../pull_request_template.md).
- PR body must include `Closes #<issue>` so the ticket auto-closes on merge. Set the issue to `status:in-review` when the PR opens.
- One PR = one issue = one plan file. Link both. Keep PRs reviewable: if the diff exceeds ~600 lines, propose splitting.
- `build`, `lint`, `typecheck`, and `test` must be green locally before opening the PR.

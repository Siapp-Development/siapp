# Impl Plan — #4 CI pipeline + branch protection on main

**Ticket:** [Siapp-Development/siapp#4](https://github.com/Siapp-Development/siapp/issues/4) · **Branch:** `feat/4-ci-pipeline` · **Size:** small

## Goal

PR-gating CI on GitHub Actions for the pnpm + Turborepo monorepo, a README status badge, and a documented (not applied) branch-protection command for `main`.

## Changes

1. **`.github/workflows/ci.yml`** (new)
   - Triggers: `pull_request` → `main`, `push` → `main`.
   - Concurrency: `ci-${{ github.ref }}`, `cancel-in-progress: true`.
   - Job `ci` (display name **`CI`** — this is the required-check name):
     checkout@v4 → pnpm/action-setup@v4 (version from `packageManager`) → setup-node@v4 (node 20, `cache: pnpm`) → `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm lint` → `pnpm typecheck` → `pnpm test` (root scripts fan out via turbo).
   - Job `rules-tests` (display name `Firestore rules tests`): permanently skipped via `if: false` with a comment pointing at ticket #6 (harness doesn't exist yet). Not a required check; no fake pass.
2. **`README.md`** — CI badge for `ci.yml` on `main` under the title.
3. **PR description** — "Post-merge step" section with the exact `gh api` branch-protection command requiring the `CI` check, PR reviews, and blocking direct pushes.

## Explicitly out of scope

- `.github/workflows/copilot-setup-steps.yml` (untouched, per ticket).
- Firestore rules test harness (ticket #6).
- Applying branch protection (human does it post-merge).

## Validation gates

`pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` all green locally; YAML reviewed for action versions, cache config, and check-name consistency with the protection command.

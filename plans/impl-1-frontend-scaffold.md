# Implementation Plan — #1 Scaffold frontend workspace (Vite + React + TS strict)

**Issue:** Siapp-Development/siapp#1 · **Branch:** `feat/1-frontend-scaffold`

## Goal
A minimal, bootable, lintable, testable empty app at the repo root. No routing, no Firebase, no features (tickets #2/#5).

## Approach
Scaffold manually at repo root (repo already contains pm_ux/, .github/, .agents/ — untouched).

- **Vite 6 + React 18.3 + TypeScript strict** — vite-style split tsconfigs (`tsconfig.json` refs → `tsconfig.app.json` / `tsconfig.node.json`), all strict.
- **`@/` alias** — `resolve.alias` in `vite.config.ts` + `paths` in `tsconfig.app.json`; exercised by the smoke test import.
- **ESLint 9 (flat) + Prettier** — `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`, `eslint-config-prettier` last.
- **Vitest 3 + React Testing Library** — jsdom, `src/vitest.setup.ts` imports `@testing-library/jest-dom/vitest`; co-located `src/App.test.tsx` smoke test (`getByRole('heading')`).
- **App component** — `src/App.tsx`, function declaration, named export, placeholder `<main>`/`<h1>`; `src/main.tsx` guards `#root` without non-null assertion.

## Files
`package.json`, `package-lock.json`, `.gitignore`, `index.html`, `vite.config.ts`, `tsconfig{,.app,.node}.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/vitest.setup.ts`, this plan.

## Scripts (acceptance criteria)
`dev` = vite · `build` = `tsc -b && vite build` · `lint` = `eslint .` · `typecheck` = `tsc -b` · `test` = `vitest run` · `format` = `prettier --write .`

## Out of scope
Routing, Firebase, CI, styling system, any product feature.

## Risks
Version drift between vite/vitest/plugin majors → let npm resolve compatible latest within pinned majors; verify with full green run before PR.

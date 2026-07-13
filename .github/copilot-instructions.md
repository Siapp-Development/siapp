# Siapp — Project Guidelines

A React + TypeScript application. These guidelines apply to every change in this repository. Scoped instructions in [.github/instructions/](.github/instructions/) layer on top for specific file types.

## Stack

- **Language:** TypeScript (strict mode)
- **UI:** React 18+ with function components and hooks
- **Module system:** ES modules
- **Package manager:** pnpm with workspaces + Turborepo (D-037). Use `pnpm` commands; task orchestration via `turbo`.
- **Monorepo layout (D-037):** `apps/web` (frontend), `backend/api` (Express 5 → Cloud Run), `backend/functions` (Cloud Functions gen2), `packages/shared` (shared types).

If a tool/framework isn't yet configured, prefer widely-used defaults: Vite for bundling, Vitest + React Testing Library for tests, ESLint + Prettier for lint/format.

## Code Style

- Prefer **named exports**; reserve default exports for route/page modules when the framework requires them.
- Use **function declarations** for components (`function Button() {}`), not `const Button = () => {}`, unless wrapping with `forwardRef`/`memo`.
- Files: components in `PascalCase.tsx`, hooks in `useCamelCase.ts`, utilities in `camelCase.ts`, types in `camelCase.ts` or co-located.
- Imports order: built-ins → external → internal aliases (`@/…`) → relative → styles. No unused imports.
- Never use `any`. Use `unknown` + narrowing, generics, or a precise type. `// @ts-expect-error` requires a one-line reason.
- Run formatter/linter rather than hand-aligning code.

## Architecture

- **Co-locate** component, styles, tests, and stories: `Button/Button.tsx`, `Button/Button.test.tsx`, `Button/index.ts`.
- Keep components **presentational by default**. Push data fetching, side effects, and orchestration into hooks (`useX`) or route/page components.
- Shared logic lives in `src/lib/` (pure utilities) or `src/hooks/` (stateful). Cross-feature UI primitives live in `src/components/`.
- No circular imports. No deep relative paths (`../../../`); set up a path alias (e.g. `@/`) when the codebase grows past two levels.

## State & Data

- Local UI state: `useState` / `useReducer`.
- Server state: a dedicated cache (TanStack Query or framework equivalent). Do **not** store server data in Redux/Context unless there's a documented reason.
- Global client state: Context for low-frequency values (theme, auth user). For high-frequency or large state, use Zustand or Redux Toolkit.
- Treat URL as state for things that should be shareable/refreshable (filters, tabs, pagination).

## Build and Test

When scripts exist in `package.json`, prefer them:

```bash
pnpm install
pnpm dev        # local dev server
pnpm build      # production build (must pass before merge)
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm test       # unit/component tests
```

Root scripts fan out through Turborepo; scope to one workspace with `pnpm --filter <workspace> <script>`.

Every change must keep `build`, `lint`, `typecheck`, and `test` green.

## Conventions

- **All planning/research/ideation docs go in [/plans/](plans/).** Never in repo root or `/docs`. See [.github/instructions/plans-folder.instructions.md](.github/instructions/plans-folder.instructions.md).
- **Delivery pipeline:** features/fixes ship via the `/ship` prompt → Feature Lead agent (Planner → Builder → Tester → Validator → Shipper → GitHub PR). Agents live in [.github/agents/](.github/agents/). Never commit directly to `main`; see [.github/instructions/git-workflow.instructions.md](.github/instructions/git-workflow.instructions.md).
- **Accessibility is not optional.** See [.github/instructions/accessibility.instructions.md](.github/instructions/accessibility.instructions.md).
- **No console.log in committed code.** Use a logger or remove before commit.
- **Errors:** throw `Error` (or a subclass) with a message; never throw strings. At system boundaries (fetch, parse, user input), validate and surface a typed error.
- **Comments:** explain *why*, not *what*. Avoid restating code.
- **Secrets:** never hardcode. Read from `import.meta.env.VITE_*` (Vite) or `process.env.NEXT_PUBLIC_*` (Next). Server-only secrets must not be exposed to the client.

## What Not To Do

- Don't introduce a new dependency for something the standard library or an existing dep already does.
- Don't refactor unrelated code in a feature PR.
- Don't add wrapper components/hooks "just in case." Inline until a second caller exists.
- Don't disable lint rules inline without a comment explaining why.

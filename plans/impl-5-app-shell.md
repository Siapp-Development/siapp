# Implementation Plan — #5 App shell & bundle isolation (3 route trees per D-036)

**Issue:** Siapp-Development/siapp#5 · **Branch:** `feat/5-app-shell` · **Depends on:** #1–#3 (scaffold, Firebase config, monorepo) · **Rev 2** — incorporates D-038 (packages/ui + Tailwind/shadcn now) and D-039 (brand palette v1)

## Goal

Stand up the three deployable frontend shells mandated by D-036 from the single `apps/web` workspace (D-037): the **apex** build (marketing `/` + lazy client portal `/p/:token/*` + lazy collaborator `/t/:token`), the **firm** build (`dashboard.siapp.app/{workspaceSlug}/*`), and the **admin** build (`admin.siapp.app`). Skeleton screens only — no features. Bundle isolation between external (`/p`, `/t`) and firm/admin code must be **physically enforced and CI-verified**, not honor-system. Establish base design tokens + global styles per [styling.instructions.md](../.github/instructions/styling.instructions.md) and the theming model in [23-design-system-research.md](../pm_ux/plans/23-design-system-research.md).

## Decisions (with rationale)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Single `apps/web`, three mode-driven Vite builds** — `vite build --mode apex\|dashboard\|admin`, each mode selecting its own HTML entry and `outDir: dist/<surface>`. Not separate workspaces. | Each build's Rollup graph starts from one entry → firm code is *physically absent* from the apex artifact (D-036's requirement). Keeps one config, one token source, one test setup. A separate `apps/web-admin` workspace triples config for ~2 internal users; revisit only if admin diverges structurally. |
| 2 | **Router: `react-router` v7, library mode**, `createBrowserRouter` + route objects; `/p/:token/*` and `/t/:token` trees loaded via route-level `lazy()` (not `React.lazy` — router `lazy()` splits loaders too). | Default per ticket; v7 library mode avoids framework-mode lock-in. Route-level `lazy()` gives the per-tree chunks the manifest check inspects. |
| 3 | **Isolation enforcement = two layers:** (a) `eslint-plugin-import` `import/no-restricted-paths` zones at dev time; (b) a CI script that reads `dist/apex/.vite/manifest.json` (`build.manifest: true`) and fails if any chunk's module id matches `src/surfaces/(firm\|admin)/`. | (a) fails fast in-editor; (b) is the automatic, non-honor-system assertion the ticket demands — it inspects the actual emitted graph. |
| 4 | **Hosting targets point at build outputs**; `hosting/*` placeholder dirs deleted. SPA rewrite `** → /index.html` added per target. | Replaces the placeholders from #2 with real artifacts. |
| 5 | **Design system lives in a new `packages/ui` (@siapp/ui) workspace (D-038): Tailwind CSS v4 + shadcn/ui adopted now.** Tokens as CSS custom properties (semantic names) mapped into the Tailwind theme; two surface themes via `[data-surface="firm"]` (admin rides it) and `[data-surface="portal"]`, per 23-design-system-research. Palette values are the **finalized D-039 hexes** (slate-indigo `#3E4C77`, terracotta `#C4553D`, amber/success/danger states, cool firm neutrals + warm portal neutrals — full scales via Radix Colors methodology). `packages/shared` stays pure types — no React/CSS. | User decision (D-038): adopting Tailwind/shadcn at shell time is zero-migration; backend workspaces import @siapp/shared and must not inherit frontend deps. Token names are the stable contract; D-039 removes the placeholder-values churn. |
| 6 | **Directory layout:** `src/surfaces/{marketing,portal,collab,firm,admin}/`, one entry pair per build under `src/entries/`. Shared primitives stay in `src/components/`, `src/lib/`, `src/styles/` — importable by every surface. | Lexical boundary makes the ESLint zones and manifest grep trivially expressible. |

## Touched surfaces & files

```
packages/ui/                                 # NEW workspace @siapp/ui (D-038)
  package.json, tsconfig.json, eslint.config.js
  src/styles/tokens.css                      # D-039 palette → semantic CSS vars, [data-surface] themes
  src/styles/globals.css                     # Tailwind v4 entry (@import "tailwindcss" + @theme), reset, focus-visible, reduced-motion
  src/lib/cn.ts                              # clsx + tailwind-merge helper (shadcn convention)
  src/components/                            # shadcn/ui components land here (button only in this ticket, as proof)
  src/index.ts                               # exports
  components.json                            # shadcn CLI config targeting this package
apps/web/
  apex.html, dashboard.html, admin.html      # per-surface HTML entries (replace index.html)
  vite.config.ts                             # mode → { input, outDir }, build.manifest, html rename plugin, @tailwindcss/vite
  package.json                               # dev:apex|dashboard|admin (ports 5173/5174/5175), build = 3× vite build, dep on @siapp/ui
  eslint.config.js                           # eslint-plugin-import no-restricted-paths zones
  src/entries/{apex,dashboard,admin}.tsx     # createRoot + RouterProvider per surface, imports @siapp/ui globals
  src/routes/{apexRouter,dashboardRouter,adminRouter}.tsx
  src/surfaces/marketing/MarketingHome.tsx   # skeleton: hero + "Siapp" heading
  src/surfaces/portal/PortalShell.tsx        # lazy tree: reads :token, single-column shell, portal theme
  src/surfaces/collab/CollabTaskPage.tsx     # lazy tree: reads :token
  src/surfaces/firm/FirmShell.tsx            # reads :workspaceSlug, sidebar-nav skeleton, firm theme
  src/surfaces/admin/AdminShell.tsx          # firm theme + "Siapp Admin" env marker bar
  src/App.tsx, src/App.test.tsx, src/main.tsx, index.html   # removed/absorbed into entries
scripts/check-bundle-isolation.mjs           # manifest assertion (root, run in CI)
firebase.json                                # public → apps/web/dist/{apex,dashboard,admin}, SPA rewrites
hosting/{apex,dashboard,admin}/              # DELETE placeholders (confirm — destructive)
pnpm-workspace.yaml, turbo.json              # register packages/ui
.github/workflows/ci.yml                     # add isolation check step after build
pm_ux/plans/decisions-log.md                 # D-038, D-039 already logged
```

## Data model changes

None. No Firestore reads/writes in this ticket; token/slug params are parsed but not validated (auth is later work). No security-rules impact.

## Steps

1. **`packages/ui` workspace (D-038)** — scaffold @siapp/ui: Tailwind v4 (`@tailwindcss/vite` in consumers, `@theme` mapping in globals.css), `tokens.css` with the D-039 palette as semantic CSS vars under `:root` + `[data-surface="firm"]` / `[data-surface="portal"]`, `cn()` helper, shadcn `components.json`, one shadcn Button as integration proof. Register in pnpm-workspace.yaml + turbo.json.
2. **Restructure entries** — create `src/entries/*.tsx` + three HTML files; move `App.tsx` content into `MarketingHome`. Each entry imports `@siapp/ui` global styles and sets `document.documentElement.dataset.surface` (`portal` for apex external trees at route level; `firm` for dashboard/admin).
2. **Vite config** — switch on `mode`: `rollupOptions.input` = the surface's HTML, `outDir: dist/<mode>`, `emptyOutDir`, `build.manifest: true`; tiny plugin renames emitted `<surface>.html` → `index.html`. `pnpm build` runs `tsc -b` then the three builds.
3. **Routers** — apex: `/` (marketing, eager), `/p/:token/*` and `/t/:token` via route `lazy()`; dashboard: `/:workspaceSlug/*` → `FirmShell`, `/` → "enter your workspace URL" placeholder; admin: `/` → `AdminShell`. Suspense fallbacks with accessible loading state.
4. **Skeleton shells** — semantic landmarks (`header/nav/main`), skip link, `<title>` per surface, focus-visible styles; no data fetching.
5. **Tokens + globals** — consumed from `@siapp/ui` (step 1); no styles defined in apps/web beyond surface-level layout. No hardcoded hex/px in components — Tailwind utilities backed by the semantic vars only.
6. **ESLint zones** — add `eslint-plugin-import`; zones: `surfaces/portal` & `surfaces/collab` ⛔ `surfaces/{firm,admin}` (and inverse: firm/admin ⛔ portal/collab; marketing ⛔ everything but shared).
7. **Isolation script** — `check-bundle-isolation.mjs`: parse `dist/apex/.vite/manifest.json` + emitted chunk file names; exit 1 if any module id under the apex graph matches `src/surfaces/(firm|admin)/`. Also assert `/p` and `/t` trees are separate lazy chunks (not inlined into the apex entry chunk).
8. **firebase.json** — three targets → `apps/web/dist/*`, SPA rewrites, keep emulator config. Delete `hosting/*` placeholders.
9. **CI** — build all three surfaces, run the isolation script; keep `lint`/`typecheck`/`test` green.

## Test plan

- **Component (Vitest + RTL):** each shell renders its heading/landmarks; skip link is first focusable; apex router serves marketing at `/`, portal at `/p/abc`, collab at `/t/xyz` (params surfaced); dashboard router surfaces `:workspaceSlug`.
- **Isolation:** run `scripts/check-bundle-isolation.mjs` against a real `pnpm build` output in CI (not mocked). Negative test: unit-test the script's matcher against a fixture manifest containing a firm module id → expect failure.
- **ESLint:** verify a deliberate `surfaces/portal → surfaces/firm` import fails `pnpm lint` (can be a one-off local check during review, not a committed fixture).
- **Tokens:** snapshot-free — assert `globals.css`/`tokens.css` load via entry smoke test; visual QA manual.

## Out of scope

Auth (Firebase Auth, magic-link JWT), any Firestore access, token/slug validation, real marketing content, PWA/service worker, additional shadcn components beyond Button (added per feature need), dark theme values (hook only), i18n, hosting emulator multi-site mapping, CD/deploys.

## Risks / open questions

1. ~~Tailwind + shadcn/ui adoption timing~~ — **RESOLVED (D-038):** adopted now, in `packages/ui`.
2. ~~Token hex values~~ — **RESOLVED (D-039):** palette finalized; values live in `packages/ui/src/styles/tokens.css`.
3. **Deleting `hosting/*` placeholders** is destructive; Builder must confirm nothing references them (CI from #4, firebase.json history, docs) before removal.
4. **Dev-server URL fidelity** — locally each surface runs on its own port, so cross-surface links (marketing → dashboard login) can't be clicked through end-to-end in dev. Acceptable for MVP; note in README.
5. **react-router v7 `lazy()` + Vitest** — router-level lazy needs async assertions (`findBy*`) in tests; minor, but Tester should expect it.
6. **Tailwind v4 + Vite 6** — use `@tailwindcss/vite` plugin (first-party); if any incompatibility surfaces, fall back to `@tailwindcss/postcss`. Low risk.
7. **shadcn CLI in a workspace package** — `components.json` must point at packages/ui paths; components are copied in (owned code), so no runtime dep risk.

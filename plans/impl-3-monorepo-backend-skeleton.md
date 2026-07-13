---
title: "Implementation Plan — #3 Monorepo restructure (D-037) + backend skeleton"
status: draft
updated: 2026-07-13
---

# Implementation Plan — #3 Monorepo restructure + backend skeleton

**Issue:** Siapp-Development/siapp#3 · **Branch:** `feat/3-monorepo-backend-skeleton`

## Goals

1. **Monorepo (D-037):** Convert to pnpm workspaces + Turborepo. Move web scaffold to `apps/web/`. Add `packages/shared/` for cross-cutting TS types. Root pipeline green.
2. **Backend skeleton:** Express 5 API with `GET /healthz` in `backend/api/`. Cloud Functions 2nd gen stubs in `backend/functions/`.

## Workspace layout

```
siapp/                        ← repo root
├── apps/
│   └── web/                  # @siapp/web — Vite + React (was root)
├── backend/
│   ├── api/                  # @siapp/api — Express 5 on Cloud Run
│   └── functions/            # @siapp/functions — Cloud Functions 2nd gen
├── packages/
│   └── shared/               # @siapp/shared — Firestore doc types + enums
├── pnpm-workspace.yaml
├── turbo.json
└── package.json              # workspace root
```

## Files

### Root
- `package.json` — workspace root, scripts delegate to turbo
- `pnpm-workspace.yaml` — workspace globs
- `turbo.json` — pipeline: build → lint/typecheck/test
- `eslint.config.js` — updated: browser globals for `apps/web/`, Node globals for `backend/`
- `.gitignore` — add `pnpm-lock.yaml` exception, add `backend/api/dist/` etc.

### apps/web (moved from root)
- All existing files, same structure; only `package.json` is new
- Dependencies: react, react-dom, firebase, `@siapp/shared` workspace link

### packages/shared
- `src/enums.ts` — ProjectLifecycle, TaskStatus, MemberRole, ... (from data model)
- `src/firestoreTypes.ts` — Workspace, Project, Task, Member, Client, Collaborator, ... document types
- `src/notificationTypes.ts` — Notification payload shapes (WA template variables)
- `src/index.ts` — barrel export
- `package.json`, `tsconfig.json`

### backend/api
- `src/index.ts` — Express 5 app bootstrap; HTTP server
- `src/routes/health.ts` — `GET /healthz` → `{ status: 'ok', timestamp }` with a 5s Firebase Admin ping
- `src/lib/asyncHandler.ts` — async route wrapper
- `src/lib/AppError.ts` — typed error hierarchy (ValidationError, NotFoundError, ForbiddenError, QuotaExceededError)
- `src/middleware/errorHandler.ts` — maps AppError to HTTP response + Pino log
- `package.json`, `tsconfig.json`
- `src/index.test.ts` — Supertest: `GET /healthz` returns 200 with `{ status: 'ok' }`

### backend/functions
- `src/index.ts` — stub exports for Firestore triggers (onWorkspaceMemberWrite, onTaskWrite)
- `package.json`, `tsconfig.json`

## Scripts acceptance criteria

| Command | What runs |
|---------|-----------|
| `pnpm turbo build` | apps/web Vite build; api tsc; functions tsc |
| `pnpm turbo lint` | eslint on each workspace |
| `pnpm turbo typecheck` | tsc --noEmit on each workspace |
| `pnpm turbo test` | vitest on apps/web + backend/api |

## Out of scope
- App shells / route trees (#5)
- Real Firestore rules harness (#6)
- Cloud Run / Functions deployment
- CI pipeline (#4; separate ticket)

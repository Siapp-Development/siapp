---
title: "Impl Plan #6 — Firestore data model bootstrap + security-rules test harness"
ticket: Siapp-Development/siapp#6
status: planned
updated: 2026-07-15
---

# Goal

Bootstrap the Firestore layer: reconcile `@siapp/shared` document types with the canonical model in [pm_ux/plans/firestore-data-model.md](../pm_ux/plans/firestore-data-model.md), replace the deny-all `firestore.rules` with a deny-by-default skeleton whose foundational invariant is **workspace isolation** (firm A can never read firm B), and stand up a `@firebase/rules-unit-testing` harness running against the Firestore emulator in CI (activating the skipped `rules-tests` job from ticket #4). Auth *features* (sign-up, invites, writes) come in #9 — this ticket only lays rails. Decisions honored: D-022 (region/Express context), D-036 (no frontend surface touched), D-037 (monorepo layout), D-035/D-027 (server-mediated external access → no client rules for clients/collaborators).

# Touched surfaces & files

No URL surface changes; backend/infra only. Bundle isolation unaffected.

| File | Action |
|---|---|
| `packages/shared/src/firestoreTypes.ts` | Modify — reconcile with canonical doc (see gap list) |
| `packages/shared/src/enums.ts` | Modify — fix `TTaskStatus`, add missing enums |
| `firestore.rules` | Rewrite — deny-by-default + helpers + workspace isolation |
| `firestore.indexes.json` | No change (stays empty — see below) |
| `backend/rules-tests/package.json`, `tsconfig.json`, `vitest.config.ts` | Create — new workspace `@siapp/rules-tests` |
| `backend/rules-tests/src/helpers.ts`, `src/isolation.test.ts`, `src/unauthenticated.test.ts` | Create — harness + first tests |
| `package.json` (root) | Modify — add `test:rules` script + `firebase-tools` devDep |
| `turbo.json` | Modify — add `test:rules` task (no cache; not part of `test`) |
| `.github/workflows/ci.yml` | Modify — activate `rules-tests` job |

# 1. Type reconciliation (`@siapp/shared`)

Gaps between `firestoreTypes.ts` (ticket #3 scaffold) and the canonical doc — canonical doc wins:

- **`ITaskDoc`** — wrong shape. Canonical: `description?`, `completedAt?`, `createdBy`, `assignees: Array<{type:'user',id,name} | {type:'collaborator',id,name,phone}>`, `visibleToCollaboratorIds: string[]`, `restrictedToDepartments: string[]`. Remove `assigneeUid/assigneeNameDenorm/collaboratorId/collaboratorNameDenorm/departmentId`. **Open Q:** scaffold's `sendWhatsapp`, `dependsOn`, `startDate` aren't in the doc's task shape but D-031 references "dependency links and WhatsApp toggles" — keep them, flag for doc backfill.
- **`TTaskStatus`** — `'not_started'` → `'todo'` per canonical.
- **`IProjectVisibility`** — `{ clientCanSee, collaboratorsCount }`; remove `clientId?` (it lives on the project root).
- **`IPhaseDoc`** — add `startDate?`, `endDate?`, `status: 'todo'|'in_progress'|'done'`; drop `createdAt` (not in doc).
- **`IMilestoneDoc`** — canonical: `name, targetDate, completedAt?, order, description?`; replace `dueDate/phaseId/createdAt`.
- **`ITaskUpdateDoc`** — wrong shape. Canonical: `authorType, authorId, authorNameDenorm, source, action (union), payload {from?,to?,text?,storagePath?,mimeType?}` — append-only activity stream, not a comment body. `payload.from/to` typed `unknown`, never `any`.
- **`IProjectDocumentDoc`** — missing `scope/scopeId`, `uploaderType: 'firm_member'|'collaborator'|'client'` (replaces `uploadedByKind`), `visibleToCollaboratorIds`, `restrictedToDepartments`, `scanStatus`, `retentionUntil?`, `deletedAt?/deletedBy?/deletedByType?`.
- **`IMessageDoc`** — canonical: `recipientType, recipientId, conversationId?, errorCode?, costEstimateMyr, relatedTo?`; drop `projectId/taskId/recipientKind/scheduledAt/readAt` (use `relatedTo` back-pointer).
- **`IAuditLogDoc`** — canonical: `actorType ('user'|'collaborator'|'client'|'system'|'admin'), actorId, action, targetType, targetId, before?, after?, ip?, userAgent?, ts`.
- **`IUsageCounterDoc`** — canonical: `whatsappConv, smsSegments, storageBytes, activeProjects, membersBilled, computedAt`.
- **Missing entirely:** `IMagicLinkDoc` (`magicLinks/{shortCode}`: `shortCode, audience, scopeType, scopeId, subjectId, issuedAt, expiresAt, lastUsedAt?, useCount, revoked, revokedAt?, revokedBy?`).
- **New:** `IWorkspaceClaims` type for the custom-claims shape `{ workspaces: Record<wid, { role: TMemberRole; departments: string[] }> }` — shared by rules tests now and the `setCustomClaim` function later.

# 2. `firestore.rules` structure

Per the data-model sketch + 20-access-control: membership is checked via **custom claims** (`request.auth.token.workspaces[wid]`), no membership-doc reads. Structure:

- Top of file: helpers `isSignedIn()`, `isFirmMember(wid)`, `hasRole(wid, roles)` (defined now; `canSeeRestricted` deferred to the departments ticket since tasks aren't client-readable-restricted yet).
- `users/{uid}`: `read: isSignedIn() && request.auth.uid == uid`; write denied (profile writes come in #9).
- `phoneIndex/{phone}`: deny all (Cloud Function/Admin SDK only).
- `workspaces/{wid}`: `read: isFirmMember(wid)`; write denied.
- Explicit per-subcollection matches (members, departments, clients, collaborators, projects + phases/tasks/updates/documents/milestones, messages, auditLog, usageCounters): `read: isFirmMember(wid)`; **all writes denied** (no write features exist yet; writes arrive with #9+, keeping the auditor's "update bypass" surface at zero).
- `magicLinks/{shortCode}`: **deny all, even members** — token material is server-only (D-035, model principle 4).
- Keep the final `match /{document=**} { allow read, write: if false; }` catch-all so anything unmatched is denied.
- No recursive `{document=**}` allow under workspaces — explicit matches only, so future collections default to deny (auditor skill: deny-by-default, no wildcard grants).

# 3. Test harness

- **Location:** `backend/rules-tests/` as workspace `@siapp/rules-tests` (fits D-037 `backend/*`; not under `backend/api` because it tests repo-root rules, not the API).
- **Stack:** Vitest + `@firebase/rules-unit-testing` (`initializeTestEnvironment` with `firestore: { rules: readFileSync('../../firestore.rules') }`), matching `backend/api`'s Vitest setup. Auth contexts via `testEnv.authenticatedContext(uid, { workspaces: {...} })` to simulate claims; `unauthenticatedContext()` for anon.
- **Scripts:** workspace script `test:rules` (NOT `test`) so plain `pnpm test`/`turbo test` never requires an emulator. Root: `"test:rules": "firebase emulators:exec --only firestore \"pnpm --filter @siapp/rules-tests test:rules\""`. Add `test:rules` task to `turbo.json` (`cache: false`) for symmetry, or call pnpm filter directly — recommend direct pnpm filter to avoid turbo/emulator env quirks.
- **CI:** in `.github/workflows/ci.yml` `rules-tests` job: remove `if: false`; steps = checkout → pnpm setup → Node setup (`.nvmrc`) → `actions/setup-java` (temurin 21 — emulator requires the JVM) → `pnpm install --frozen-lockfile` → `pnpm test:rules`. Uses emulator port 8080 per `firebase.json`.

# 4. First tests

1. **Unauthenticated deny** (`unauthenticated.test.ts`): get + create denied on `users/{uid}`, `phoneIndex/{p}`, `workspaces/{wid}` and each subcollection (members, clients, collaborators, projects, tasks, updates, documents, magicLinks, messages, auditLog, usageCounters, departments).
2. **Cross-workspace deny** (`isolation.test.ts`): user with claims for `wksA` only → read + write on `workspaces/wksB` doc and every subcollection denied. Seed `wksB` data via `testEnv.withSecurityRulesDisabled`.
3. **Same-workspace happy path:** `wksA` member reads `workspaces/wksA` doc, a member doc, a project, a task — allowed (proves rules aren't deny-all).
4. **magicLinks server-only:** even a `wksA` owner cannot read `workspaces/wksA/magicLinks/*`.
5. **Own-user read:** uid `u1` reads `users/u1` → allowed; reads `users/u2` → denied.
6. **All-writes-denied:** member create/update on tasks/clients denied (locks the "no write features yet" invariant).

# 5. `firestore.indexes.json`

**No changes now.** The composite-index table in the data-model doc maps to list views that don't exist yet; adding them speculatively would mask missing-index errors during feature work. Stays `{"indexes": [], "fieldOverrides": []}`; indexes land per-feature with the queries that need them.

# Steps

1. Reconcile `packages/shared/src/enums.ts` + `firestoreTypes.ts` per §1. Verify: `pnpm typecheck` green (fix any consumers).
2. Rewrite `firestore.rules` per §2. Verify: `firebase emulators:exec --only firestore` loads rules without compile errors.
3. Scaffold `backend/rules-tests/` workspace (package.json, tsconfig, vitest.config, deps: `vitest`, `@firebase/rules-unit-testing`, `firebase-tools` at root). Verify: `pnpm install` + workspace typechecks.
4. Write `src/helpers.ts` (testEnv setup, claim builders using `IWorkspaceClaims`, seed helpers) + the six test groups in §4. Verify: `pnpm test:rules` green locally.
5. Add root `test:rules` script; confirm `pnpm test` still passes without an emulator running.
6. Activate CI `rules-tests` job per §3. Verify: CI run shows the job executing (not skipped) and green.
7. Run the firebase-security-rules-auditor skill checklist against the final rules; address findings.

# Test plan (for Tester)

- Rules tests of §4 are the deliverable; each denial asserted with `assertFails`, each allow with `assertSucceeds`.
- Negative harness test: rules file fails to load → suite fails loudly (no silent pass).
- `pnpm build && pnpm lint && pnpm typecheck && pnpm test` all green without emulator; `pnpm test:rules` green with emulator.
- CI: both `ci` and `rules-tests` jobs pass on the PR.

# Out of scope

- Auth feature rules (sign-up, member writes, invites) — ticket #9.
- Department/`restrictedToDepartments` read rules and `canSeeRestricted` enforcement — later ticket with the departments feature.
- Storage rules, composite indexes, Cloud Function triggers (`setCustomClaim` etc.), seed/provisioning scripts, sharded counters.
- Any client SDK integration in `apps/web`.

# Risks / open questions

1. **`ITaskDoc` extras (`sendWhatsapp`, `dependsOn`, `startDate`)** exist in the #3 scaffold but not in the canonical task shape, though D-031 implies they're real. Keep and backfill the doc, or drop? → needs a human call (plan assumes **keep + flag**).
2. **Claims-only membership** means rules tests mock claims; nothing yet verifies the future `setCustomClaim` function writes the same shape. Mitigated by sharing `IWorkspaceClaims` from `@siapp/shared`.
3. **Branch-protection**: `rules-tests` becomes a real job — should it be added to required checks on `main`? Human/GitHub-settings call.
4. **Emulator in CI** adds ~1–2 min (JVM + emulator boot) per run; acceptable now, revisit with turbo remote cache.
5. Doc's rules sketch is "illustrative" — where it conflicts with the auditor skill (e.g. wildcard grants), this plan follows the stricter option.

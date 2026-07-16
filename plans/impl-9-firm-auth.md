# impl-9 — Firm auth & roles: email/password, Google, custom claims

**Rev 2** — user decisions baked in: SDK default persistence (D-007 reading confirmed), **forced immediate claims refresh** after role changes, `authDomain = auth.siapp.app` now.

## Goal

Ship sign-in for firm staff on `dashboard.siapp.app` (D-002: Firebase Auth, email/password + Google; D-036 surface), an auth state layer that holds ID tokens in memory with SDK-managed refresh (D-007), route guards for `/{workspaceSlug}/*`, and the `setCustomClaim` sync so `members/{uid}` role changes land in Firebase Auth custom claims (shape = `IWorkspaceClaims` from #6). Extends #6's read-only rules with the first write rules (own `users/{uid}` profile) + the two deferred audit items, with role-capability rules tests. Password reset uses Firebase built-in email (D-040). Roles only — departments UI/enforcement is later scope (#11+ per 20-access-control "MVP scope"; the claims *shape* already carries `departments: []`).

## Touched surfaces & files

Only the **dashboard** surface (`dashboard.siapp.app`) — apex/admin/portal bundles untouched (D-036 isolation; keep all new firm-auth code under `surfaces/firm/` so `scripts/check-bundle-isolation.mjs` stays green).

**Create**
- `packages/ui/src/components/` — shadcn/ui adds: `Input.tsx`, `Label.tsx`, `Card.tsx`, `Alert.tsx`, `Separator.tsx` (+ export from `index.ts`). `Button.tsx` exists.
- `apps/web/src/surfaces/firm/auth/AuthProvider.tsx` — context provider (see Auth state).
- `apps/web/src/surfaces/firm/auth/useAuth.ts` — hook consuming the context.
- `apps/web/src/surfaces/firm/auth/RequireAuth.tsx` — guard component for `/:workspaceSlug/*`.
- `apps/web/src/surfaces/firm/auth/LoginPage.tsx` (+ test) — [A1] sign-in screen.
- `apps/web/src/surfaces/firm/auth/ForgotPasswordPage.tsx` (+ test) — email form → `sendPasswordResetEmail`.
- `apps/web/src/surfaces/firm/auth/resolveWorkspace.ts` (+ test) — claims → workspace slug resolution.
- `backend/functions/src/triggers/syncMemberClaims.ts` — `setCustomClaim` implementation.
- `backend/rules-tests/src/roleCapabilities.test.ts`, `backend/rules-tests/src/usersProfile.test.ts`.
- `scripts/seed-auth-emulator.mjs` — dev-only: creates an emulator user + member doc + claims so login is testable locally before #10 exists.

**Modify**
- `apps/web/src/routes/dashboardRouter.tsx` (+ test) — add `/login`, `/forgot-password`; wrap `/:workspaceSlug/*` in `RequireAuth`; wrap tree in `AuthProvider`.
- `apps/web/src/surfaces/firm/WorkspaceEntry.tsx` — becomes post-login resolver/redirect (see below).
- `apps/web/src/surfaces/firm/FirmShell.tsx` — validate slug against membership; signed-in user chrome (display name, sign-out).
- `backend/functions/src/index.ts` — wire `onWorkspaceMemberWrite` to `syncMemberClaims` (seat counting stays TODO #11).
- `firestore.rules` — users profile writes + `auditLog` read tightening.

## Data model changes

No new collections. Uses existing `users/{uid}`, `workspaces/{wid}`, `workspaces/{wid}/members/{uid}` (firestore-data-model.md) and `IWorkspaceClaims`/`IWorkspaceClaimEntry`/`IUserDoc` (already in `@siapp/shared`).

**Rules changes** (workspace isolation invariant untouched):
1. `users/{uid}` — `create`/`update` allowed only when `request.auth.uid == uid`, with field validation (first write rules → sets the validation pattern): `uid == auth.uid`, `email == request.auth.token.email`, `displayName` non-empty string, `locale in ['en']` (D-026), only the whitelisted keys present (`request.resource.data.keys().hasOnly([...])`), `createdAt`/`lastSeenAt` are timestamps. `claimsUpdatedAt` is **server-only** — client writes must not include it. No `delete`. `list` stays denied.
2. `auditLog` read — tighten from `isFirmMember(wid)` to `hasRole(wid, ['owner','admin'])` (deferred #6 audit item; matches 20-access-control audit-gating direction).
3. Everything else stays write-denied — member docs are written **server-side only** (#10 provisioning, #11 invites), which is what makes the claims-sync trigger trustworthy. Project/task write rules belong to #12.

## Steps

1. **packages/ui** — add the five shadcn components + exports; verify with existing component test setup.
2. **Login page** (`/login`, [A1] wireframe): email + password fields (`signInWithEmailAndPassword`), `Separator` "or" directly above "Continue with Google" (`signInWithPopup` + `GoogleAuthProvider`) per wireframe-review item 11 resolution. Error states mapped from Firebase error codes to friendly copy: wrong password/unknown user (generic "invalid credentials"), too-many-requests, popup-closed (silent), `account-exists-with-different-credential` (tell user to use the other method), network. Accessibility: `<label>` on every input, `aria-describedby` for field errors, `role="alert"` on the form-level error, visible focus, submit disabled only while pending (with `aria-busy`). "Forgot password?" link → `/forgot-password` → `sendPasswordResetEmail` (Firebase built-in, D-040; action link lands on `auth.siapp.app` handler) → always show "if that account exists, an email was sent" (no user enumeration).
3. **Auth state** — `AuthProvider` subscribes `onIdTokenChanged(auth, …)`; state = `{ status: 'loading'|'signedOut'|'signedIn', user, claims }` where `claims` is parsed from `getIdTokenResult()` → `IWorkspaceClaims`. **No token is ever written to localStorage/sessionStorage by app code** (D-007); ID token lives in SDK memory, retrieved via `user.getIdToken()` when needed; refresh token stays under SDK management (default persistence — see open question 1). On first sign-in, upsert own `users/{uid}` doc (create if missing, bump `lastSeenAt`).
4. **Route guards + workspace resolution** — `RequireAuth` renders children only when signedIn, else redirects to `/login?next=<path>` (loading state renders an accessible spinner, `aria-live="polite"`). `WorkspaceEntry` (`/`): signedOut → redirect `/login`; signedIn → resolve slug: read `users/{uid}.defaultWorkspaceId` if set and still in claims, else the single wid in `claims.workspaces`; fetch `workspaces/{wid}` (member read allowed) → redirect to `/{slug}`. Multiple workspaces → minimal accessible picker list. Zero workspaces → "no workspace yet — contact Siapp" empty state (provisioning is founder-driven, #10). `FirmShell` verifies the URL slug maps to a claimed wid (workspace doc lookup, cached in context); mismatch → 404-style "not your workspace" screen (no existence leak). Sign-out button calls `signOut(auth)` → `/login`.
5. **Claims sync (functions)** — `syncMemberClaims` in `onWorkspaceMemberWrite`: on any `members/{uid}` create/update/delete, read **all** of that user's membership docs (collection-group query on `members` where `uid == memberId`... simplest correct: query `collectionGroup('members')` filtered by doc id = uid), rebuild the full `IWorkspaceClaims` payload `{ workspaces: { [wid]: { role, departments } } }`, `admin.auth().setCustomUserClaims(uid, payload)`. Idempotent; skip no-op writes by diffing before/after role+departments. Guard the 1 KB claims budget (log a warning past ~800 bytes). **Immediate propagation (user decision):** after setting claims, the trigger also stamps `users/{uid}.claimsUpdatedAt = serverTimestamp()`; `AuthProvider` subscribes to own `users/{uid}` doc and on `claimsUpdatedAt` change calls `user.getIdToken(true)` → claims refresh within seconds, no sign-out. (Client keeps ≤1 h SDK refresh as fallback.) **Boundary:** #10 writes the owner member doc (this trigger then stamps claims); #11 writes invited members (same); this ticket ships only the trigger + consumption.
6. **firestore.rules** — implement rules changes above; run the firebase-security-rules-auditor skill checklist before merge.
7. **Rules tests** (`backend/rules-tests`, reuse `helpers.ts` `memberClaims`/`seedWorkspace`) — see test plan.
8. **Emulator dev loop** — `scripts/seed-auth-emulator.mjs` (Admin SDK against Auth+Firestore emulators): creates `dev@siapp.test` for each role, matching member docs + claims, one workspace with a known slug. Document in the script header how to run alongside `firebase emulators:start`.
9. Green: `pnpm turbo build lint typecheck test` + `test:rules` + bundle-isolation check.

## Test plan

- **Rules — role capability matrix** (`roleCapabilities.test.ts`): for each of owner/admin/pm/viewer × (workspace read ✓; members/clients/projects/tasks write ✗ for **all** roles until #12; `auditLog` read ✓ owner/admin, ✗ pm/viewer; `auditLog` write ✗ all). Cross-workspace member still denied everything (regression on #6 isolation).
- **Rules — users profile** (`usersProfile.test.ts`): own create/update ✓ with valid payload; ✗ other uid, ✗ mismatched `email` vs token, ✗ extra fields, ✗ delete, ✗ list, ✗ unauthenticated.
- **Component (Vitest + RTL, mock `firebase/auth` via `vi.mock`)**: LoginPage — successful email sign-in path, each error state announced via `role="alert"`, Google button invokes popup, labels/associations (axe check per testing instructions); ForgotPassword — non-enumerating success copy; RequireAuth — redirects signedOut, renders signedIn, loading state; WorkspaceEntry — redirect single-workspace, picker multi, empty-state zero; resolveWorkspace unit tests (defaultWorkspaceId precedence, stale default).
- **Functions unit**: `syncMemberClaims` payload construction + no-op skip (mock Admin SDK); emulator integration optional if `firebase-functions-test` friction is low.
- **Router tests**: `/login` reachable signed out; `/:slug/*` guarded.

## Out of scope

- #10: workspace/owner provisioning (admin panel or script), starter project seed.
- #11: team invites, member-management UI, Postmark, seat counting, department CRUD/enforcement UI.
- #12+: project/task write rules; restricted-task projection endpoint.
- `requireFirebaseAuth()` Express middleware (D-022 lib) — no authenticated API route exists yet; lands with the first one.
- MFA (Business+ tier), magic-link client/collaborator auth, BM locale, multi-workspace switching UI polish.

## Risks / open questions

1. ~~D-007 persistence~~ — **RESOLVED:** SDK default persistence approved (ID token in memory, refresh token IndexedDB under SDK management). No `inMemoryPersistence`.
2. ~~authDomain~~ — **RESOLVED:** switch web config `authDomain` to `auth.siapp.app` in this ticket (`apps/web/src/lib/firebaseConfig.ts` + `.env.example`); domain already live on Hosting. Builder must also confirm `auth.siapp.app` and `dashboard.siapp.app` are in Auth authorized domains (console step — flag to founder if missing).
3. ~~Claims staleness~~ — **RESOLVED:** force immediate refresh via `claimsUpdatedAt` stamp + `getIdToken(true)` listener (step 5).
4. **Collection-group query for memberships** requires member doc id == uid (data model says it is) and a collection-group index on `members` — confirm `firestore.indexes.json` addition at build time.
5. **Multi-workspace picker** is speculative at MVP (one workspace per user until #11 invites ship); kept deliberately minimal.

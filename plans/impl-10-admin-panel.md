---
title: "impl-10 — Siapp Admin panel v0: workspace provisioning + starter project seeds"
issue: "#10"
status: ready-for-builder
updated: 2026-07-18
decisions: D-031, D-036, D-038, D-030, D-027, D-032
---

# Goal

Deliver the MVP Siapp Admin panel at `admin.siapp.app` as described in
[11-mvp-scope.md §Admin & ops](../pm_ux/plans/11-mvp-scope.md). The panel
lets the founder manually provision new workspaces (creating the workspace
doc + first admin user + one vertical-specific starter project per D-031),
adjust plan / seat count / renewal date after payment, impersonate a user for
support, and review all admin actions in an audit trail. Access is restricted
to Google SSO + verified `isAdmin` custom claim + runtime IP-allowlist check
on every mutating Cloud Function (D-036 physical bundle isolation is already
satisfied because the admin surface is its own Firebase Hosting site built
from the same `apps/web` entry point tree).

---

## Touched surfaces & files

### `packages/shared` — types (modify)

| File | Change |
|---|---|
| `packages/shared/src/enums.ts` | Add `TAdminAction` union type |
| `packages/shared/src/firestoreTypes.ts` | Add `IAdminLogDoc`; extend `IWorkspaceClaims` with optional `isAdmin?: boolean` |

### `backend/functions` — Cloud Functions (create / modify)

| File | Change |
|---|---|
| `backend/functions/src/provisioning/seedTypes.ts` | **Create** — `ITaskDef`, `IPhaseDef`, `ISeedDefinition` interfaces used by both seeds |
| `backend/functions/src/provisioning/seeds/residentialBuild.ts` | **Create** — ~60-task residential-build seed (phases + tasks + dependency links, no D-032 fields) |
| `backend/functions/src/provisioning/seeds/conveyancing.ts` | **Create** — ~30-task conveyancing seed |
| `backend/functions/src/provisioning/writeStarterProject.ts` | **Create** — applies a `ISeedDefinition` to Firestore under a given `wid`; returns the new `pid` |
| `backend/functions/src/admin/adminGuard.ts` | **Create** — `assertAdminCall(context)`: checks `isAdmin` claim + IP allowlist; throws `HttpsError('permission-denied')` on failure |
| `backend/functions/src/admin/writeAdminLog.ts` | **Create** — helper writing to `/adminLog/{alid}` via Admin SDK |
| `backend/functions/src/admin/provisionWorkspace.ts` | **Create** — callable: creates `workspaces/{wid}`, `members/{uid}`, seeds starter project, logs |
| `backend/functions/src/admin/adjustWorkspace.ts` | **Create** — callable: mutates `plan` / `seatLimit` / `planExpiresAt`; logs before/after |
| `backend/functions/src/admin/impersonateUser.ts` | **Create** — callable: mints a Firebase custom token with `impersonating` claim; logs the action |
| `backend/functions/src/index.ts` | **Modify** — export the four new callable functions |

### `firestore.rules` (modify)

Add `isSiappAdmin()` helper and `/adminLog/{alid}` match block.

### `firestore.indexes.json` (modify)

Add composite index on `/adminLog` for `ts DESC`.

### `apps/web` — Admin surface (create / modify)

| File | Change |
|---|---|
| `apps/web/src/surfaces/admin/auth/AdminAuthProvider.tsx` | **Create** — Firebase Auth `onIdTokenChanged` listener; exposes `isAdmin` claim; Google-only sign-in helper |
| `apps/web/src/surfaces/admin/auth/useAdminAuth.ts` | **Create** — context hook |
| `apps/web/src/surfaces/admin/auth/AdminRequireAuth.tsx` | **Create** — gate: loading → login redirect → `isAdmin` absent → "Access denied" error screen |
| `apps/web/src/surfaces/admin/auth/AdminLoginPage.tsx` | **Create** — "Sign in with Google" only; no email/password option |
| `apps/web/src/surfaces/admin/lib/adminFunctions.ts` | **Create** — typed `httpsCallable` wrappers for all four admin Cloud Functions |
| `apps/web/src/surfaces/admin/pages/WorkspaceListPage.tsx` | **Create** — live Firestore query on `/workspaces`; table: name, plan, seats used/limit, MRR, expiry, last activity; link to detail |
| `apps/web/src/surfaces/admin/pages/WorkspaceDetailPage.tsx` | **Create** — one-click plan/seat/expiry forms calling `adjustWorkspace`; impersonate user picker |
| `apps/web/src/surfaces/admin/pages/ProvisionWorkspacePage.tsx` | **Create** — form: workspace name, slug, owner email, seat limit, plan, vertical selector (residential build / conveyancing); calls `provisionWorkspace` |
| `apps/web/src/surfaces/admin/pages/AdminAuditLogPage.tsx` | **Create** — paginated list of `/adminLog` docs ordered by `ts DESC` |
| `apps/web/src/surfaces/admin/AdminShell.tsx` | **Modify** — replace placeholder with nav sidebar (Workspaces, Provision, Audit Log) + `<Outlet>` |
| `apps/web/src/routes/adminRouter.tsx` | **Modify** — add routes for all pages; wrap everything in `<AdminRequireAuth>` |

---

## Data model changes

### New top-level collection: `/adminLog/{alid}`

```typescript
// packages/shared/src/firestoreTypes.ts — IAdminLogDoc
{
  id: string,
  actorUid: string,          // Siapp admin Firebase UID
  actorEmail: string,        // denormalised for log readability
  action: TAdminAction,
  targetType: 'workspace' | 'user',
  targetId: string,
  before?: Record<string, unknown>,   // snapshot before mutation
  after?: Record<string, unknown>,    // snapshot after mutation
  ip?: string,               // from X-Forwarded-For
  ts: Timestamp
}
```

```typescript
// packages/shared/src/enums.ts — TAdminAction
export type TAdminAction =
  | 'workspace.provision'
  | 'workspace.plan_change'
  | 'workspace.seat_adjust'
  | 'workspace.renewal_adjust'
  | 'user.impersonate';
```

### Modified: `IWorkspaceClaims` (packages/shared)

```typescript
export interface IWorkspaceClaims {
  workspaces: Record<string, IWorkspaceClaimEntry>;
  isAdmin?: boolean;   // present + true only on Siapp-admin accounts
}
```

> `isAdmin` is a **separate custom claim** from the per-workspace `role` map.
> It is set once via a one-time Admin SDK script (documented in the README),
> not by any user-initiated flow. The Cloud Functions read
> `context.auth.token.isAdmin` to authorize. Firestore rules read it via
> `request.auth.token.isAdmin`.

### No changes to workspace-scoped collections

The existing `workspaces/{wid}` document shape, `members/{uid}`, and
`auditLog/{alid}` schemas are unchanged. Admin mutations of a workspace doc
go through the Admin SDK in Cloud Functions, so no client-write rules are
needed.

### Security rules additions

```
// New helper
function isSiappAdmin() {
  return isSignedIn() && request.auth.token.isAdmin == true;
}

// New top-level match block
match /adminLog/{alid} {
  allow read: if isSiappAdmin();
  allow write: if false;   // Admin SDK only
}
```

The existing workspace write-deny rules are unchanged; provisioning writes use
the Admin SDK which bypasses security rules.

### Firestore indexes addition (`firestore.indexes.json`)

```json
{
  "collectionGroup": "adminLog",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "ts", "order": "DESCENDING" }
  ]
}
```

---

## Steps

### 1 — Shared types (packages/shared)

1. Open `packages/shared/src/enums.ts`. Append `TAdminAction` as shown in the
   data-model section above.

2. Open `packages/shared/src/firestoreTypes.ts`. Add `IAdminLogDoc` interface.
   In `IWorkspaceClaims`, add the optional `isAdmin?: boolean` field.

3. Run `pnpm --filter @siapp/shared build` to confirm no TypeScript errors.

**Verification:** `tsc` in `packages/shared` passes; `IAdminLogDoc` is exported
from `packages/shared/src/index.ts` (add it to the barrel if not already
re-exported).

---

### 2 — Provisioning seed types and seed files

1. **Create `backend/functions/src/provisioning/seedTypes.ts`** defining:

   ```typescript
   export interface ITaskDef {
     title: string;
     order: number;
     phaseRef: string;         // matches IPhaseDef.id
     dependsOn?: string[];     // ITaskDef.id values within this seed
     visibleToClient: boolean;
     sendWhatsapp: boolean;
     restrictedToDepartments: string[];
   }

   export interface IPhaseDef {
     id: string;               // stable local id used by ITaskDef.phaseRef
     name: string;
     order: number;
   }

   export interface ISeedDefinition {
     vertical: 'construction' | 'legal';
     label: string;            // e.g. "Residential Build"
     phases: IPhaseDef[];
     tasks: ITaskDef[];
   }
   ```

2. **Create `backend/functions/src/provisioning/seeds/residentialBuild.ts`**
   exporting `residentialBuildSeed: ISeedDefinition` with:
   - ~7 phases: Pre-Construction, Foundation, Structure, MEP Rough-In,
     Finishes, Fit-Out, Handover
   - ~60 tasks distributed across phases; representative titles such as
     "Site survey and soil test", "Foundation excavation", "Concrete pour —
     ground beam", "Brick wall — ground floor", "Roof truss installation",
     "Plumbing rough-in", "Electrical first fix", "Wall plastering",
     "Floor tiling", "Paint — first coat", "Paint — second coat",
     "Kitchen cabinet installation", "Sanitary fitting", "Final inspection",
     "Certificate of completion", etc.
   - `visibleToClient: true` on milestone-style tasks (first and last task in
     each phase); `false` on internal work items.
   - `sendWhatsapp: true` on the same milestone-style tasks.
   - `restrictedToDepartments: []` on all tasks (no restriction at seed time).
   - Sequential `dependsOn` links across phases (last task of phase N → first
     task of phase N+1) to establish the dependency graph.
   - No `requiresPhoto`, `requiresFirmApproval`, or `pendingApproval` fields
     (D-032 compliance).

3. **Create `backend/functions/src/provisioning/seeds/conveyancing.ts`**
   exporting `conveyancingSeed: ISeedDefinition` with:
   - ~5 phases: Instruction & Due Diligence, Sale & Purchase Agreement,
     Stamp Duty & Adjudication, Transfer & Registration, Completion
   - ~30 tasks: e.g. "Receive client instruction", "Title search",
     "Draft SPA", "Client review of SPA", "Execute SPA",
     "Apply for stamp duty assessment", "Pay stamp duty",
     "Prepare transfer instrument (MOT)", "Lodge transfer at Land Office",
     "Receive title", "Disburse purchase price", "Issue completion notice",
     etc.
   - `visibleToClient: true` on SPA execution, stamp duty payment,
     title lodgement, and completion tasks.
   - `sendWhatsapp: true` on the same client-visible tasks.

**Verification:** Both seed files export a value that satisfies `ISeedDefinition`
without TypeScript errors. Count of tasks in each seed matches spec (≥60 and
≥30 respectively).

---

### 3 — `writeStarterProject` helper

**Create `backend/functions/src/provisioning/writeStarterProject.ts`**:

```typescript
/**
 * Writes a starter project (phases + tasks) from a ISeedDefinition under
 * workspaces/{wid}/projects/{pid}.
 * Returns the new project id.
 */
export async function writeStarterProject(
  wid: string,
  seed: ISeedDefinition,
  ownerUid: string,
  ownerName: string,
): Promise<string>
```

Implementation notes:
- Use the Firebase Admin SDK `getFirestore()`.
- Generate a random `pid` via `db.collection('_').doc().id` (random id trick).
- Write the `projects/{pid}` doc first: set `lifecycle: 'draft'`, `status: 'planning'`,
  `vertical: seed.vertical`, `name: seed.label + ' Starter'`, `summary` with
  all zeros, `createdBy: ownerUid`, `createdAt/updatedAt: FieldValue.serverTimestamp()`,
  `startDate: FieldValue.serverTimestamp()` (placeholder — PM will update it),
  `visibility: { clientCanSee: false, collaboratorsCount: 0 }`.
- Use a single batched write (max 500 ops; the largest seed has ~60 tasks + ~7
  phases = 68 + 1 project doc = 69 ops — within one batch).
- Map `ITaskDef.phaseRef` → actual Firestore phase doc ID (use the `IPhaseDef.id`
  as the Firestore doc ID for simplicity — they are stable strings like
  `"phase-pre-construction"`).
- Map local `dependsOn` task-id strings to Firestore task doc IDs (assign each
  task a deterministic ID: `"task-${seed.vertical}-${order.toString().padStart(3,'0')}"`
  so seeds are idempotent if re-run).
- Returns the `pid`.

**Verification:** Unit test (see Test plan §1) writes to the Firestore emulator
and asserts correct phase count, task count, and that all `dependsOn` IDs
reference real task docs within the same project.

---

### 4 — Admin Cloud Function helpers

**Create `backend/functions/src/admin/adminGuard.ts`**:

```typescript
/**
 * Asserts the caller is a Siapp admin with an allowed source IP.
 * Throws HttpsError('permission-denied') on failure.
 * Call at the top of every admin callable function.
 */
export function assertAdminCall(
  context: CallableRequest<unknown>,
): void
```

- Check `context.auth?.token?.['isAdmin'] === true`; throw `HttpsError('permission-denied', 'Not a Siapp admin')` otherwise.
- Read `ADMIN_IP_ALLOWLIST` from `process.env.ADMIN_IP_ALLOWLIST` (comma-separated
  CIDRs or exact IPs set via Firebase Functions config / Secret Manager). If the
  env var is not set, log a warning and allow (so dev/emulator is not blocked).
- Extract the caller IP from `context.rawRequest.headers['x-forwarded-for']` or
  `context.rawRequest.ip`.
- If the allowlist is configured and the caller IP is not in the list, throw
  `HttpsError('permission-denied', 'IP not permitted')`.

**Create `backend/functions/src/admin/writeAdminLog.ts`**:

```typescript
export async function writeAdminLog(
  entry: Omit<IAdminLogDoc, 'id'>,
): Promise<void>
```

Writes a new doc to `/adminLog` using `db.collection('adminLog').doc()`.

---

### 5 — `provisionWorkspace` callable

**Create `backend/functions/src/admin/provisionWorkspace.ts`**:

Input payload:
```typescript
interface IProvisionInput {
  workspaceName: string;     // e.g. "Lim Brothers Construction"
  workspaceSlug: string;     // e.g. "lim-brothers" — validated: /^[a-z0-9-]{3,40}$/
  ownerEmail: string;        // existing Firebase Auth user email
  seatLimit: number;         // 1–100
  plan: TWorkspacePlan;      // 'trial' | 'standard' | 'business'
  planExpiresAt: string;     // ISO 8601 date string
  vertical: 'construction' | 'legal';
}
```

Steps inside the function (all Admin SDK, no security-rules bypass needed):
1. `assertAdminCall(context)`.
2. Validate input fields; throw `HttpsError('invalid-argument', ...)` on bad data.
3. Verify `workspaceSlug` is globally unique by attempting
   `db.collection('workspaces').where('slug','==', slug).limit(1).get()`.
4. Resolve `ownerEmail` to a Firebase Auth UID via `getAuth().getUserByEmail(ownerEmail)`.
   If the user doesn't exist yet, create them with `getAuth().createUser({ email: ownerEmail })`.
5. Generate `wid = db.collection('workspaces').doc().id`.
6. Write `workspaces/{wid}` document (all required fields, `seatsUsed: 1`).
7. Write `workspaces/{wid}/members/{ownerUid}` with `role: 'owner'`, `seatActive: true`,
   `invitedBy: context.auth.uid` (the Siapp admin's UID), `joinedAt: now`.
   The existing `onWorkspaceMemberWrite` trigger will automatically sync claims
   for the owner — no separate claim-setting step needed.
8. Call `writeStarterProject(wid, seed, ownerUid, ownerName)` (import the
   appropriate seed based on `vertical`).
9. Call `writeAdminLog(...)` with `action: 'workspace.provision'`, `targetType:
   'workspace'`, `targetId: wid`, `after: { wid, slug, ownerUid, plan }`.
10. Return `{ wid, pid }`.

**Verification:** Integration test (Firestore emulator) provisions a workspace
and asserts all three doc groups exist with correct shapes.

---

### 6 — `adjustWorkspace` callable

**Create `backend/functions/src/admin/adjustWorkspace.ts`**:

Input payload:
```typescript
interface IAdjustInput {
  wid: string;
  plan?: TWorkspacePlan;
  seatLimit?: number;
  planExpiresAt?: string;   // ISO 8601
}
```

Steps:
1. `assertAdminCall(context)`.
2. Validate: at least one of `plan | seatLimit | planExpiresAt` must be present.
3. Read current workspace doc for `before` snapshot.
4. Build partial update object from only the fields present in input.
5. `db.doc('workspaces/{wid}').update(patch)`.
6. `writeAdminLog(...)` with appropriate `TAdminAction` (`'workspace.plan_change'`,
   `'workspace.seat_adjust'`, or `'workspace.renewal_adjust'`; if multiple fields
   change in one call, emit one log entry per changed field or a combined action).
7. Return `{ ok: true }`.

---

### 7 — `impersonateUser` callable

**Create `backend/functions/src/admin/impersonateUser.ts`**:

Input payload:
```typescript
interface IImpersonateInput {
  targetUid: string;
  reason: string;   // required free-text reason for audit trail
}
```

Steps:
1. `assertAdminCall(context)`.
2. Verify `targetUid` exists via `getAuth().getUser(targetUid)`.
3. Verify target user does NOT have `isAdmin: true` (cannot impersonate admins).
4. Generate a Firebase custom token for `targetUid` with additional claim
   `{ impersonatedBy: context.auth.uid }` using `getAuth().createCustomToken(targetUid, { impersonatedBy: context.auth.uid })`.
5. `writeAdminLog(...)` with `action: 'user.impersonate'`, `targetType: 'user'`,
   `targetId: targetUid`, `after: { reason }`.
6. Return `{ customToken }`.

Client usage: admin frontend receives `customToken`, opens a new browser tab,
calls `signInWithCustomToken(auth, customToken)` — the user is now signed in
as the target in that tab (their regular session is unaffected in the original
tab). The `impersonatedBy` claim persists in the ID token so server-side code
can detect impersonation if needed in future.

---

### 8 — Export functions from `index.ts`

**Modify `backend/functions/src/index.ts`**:

```typescript
import { provisionWorkspace } from './admin/provisionWorkspace.js';
import { adjustWorkspace }    from './admin/adjustWorkspace.js';
import { impersonateUser }    from './admin/impersonateUser.js';

export const adminProvisionWorkspace = onCall({ region: 'asia-southeast1' }, provisionWorkspace);
export const adminAdjustWorkspace    = onCall({ region: 'asia-southeast1' }, adjustWorkspace);
export const adminImpersonateUser    = onCall({ region: 'asia-southeast1' }, impersonateUser);
```

Use `onCall` from `firebase-functions/v2/https`. All three are HTTPS callable
(not HTTP triggers), so Firebase Auth context is automatically available.

**Verification:** `pnpm --filter @siapp/functions build` passes. Functions
appear in emulator with correct names.

---

### 9 — Firestore rules update

**Modify `firestore.rules`** — two additions only:

1. Add `isSiappAdmin()` function after the existing `hasRole()` function:

   ```
   function isSiappAdmin() {
     return isSignedIn() && request.auth.token.isAdmin == true;
   }
   ```

2. Add `/adminLog/{alid}` match block at the top-level inside
   `match /databases/{database}/documents`:

   ```
   match /adminLog/{alid} {
     allow read: if isSiappAdmin();
     allow write: if false;
   }
   ```

**Verification:** Existing rules tests still pass. New rules test asserts that a
token with `isAdmin: true` can read `adminLog` and that all other tokens are
denied.

---

### 10 — Firestore index for adminLog

**Modify `firestore.indexes.json`** — append to `indexes` array:

```json
{
  "collectionGroup": "adminLog",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "ts", "order": "DESCENDING" }
  ]
}
```

---

### 11 — Admin auth layer (frontend)

**Create `apps/web/src/surfaces/admin/auth/AdminAuthProvider.tsx`**:

- Mirrors the structure of `surfaces/firm/auth/AuthProvider.tsx` but:
  - Google-sign-in-only: expose `signInWithGoogle()` via context.
  - After `onIdTokenChanged`, call `user.getIdTokenResult()` and check
    `result.claims['isAdmin'] === true`. If false/absent, set state to
    `{ status: 'notAdmin' }`.
  - State shape:
    ```typescript
    type TAdminAuthState =
      | { status: 'loading' }
      | { status: 'signedOut' }
      | { status: 'notAdmin'; user: User }
      | { status: 'signedIn'; user: User };
    ```
  - No workspace list loading (admin doesn't need workspace claims locally).

**Create `apps/web/src/surfaces/admin/auth/useAdminAuth.ts`**: identical
pattern to the firm equivalent — throws if called outside `AdminAuthProvider`.

**Create `apps/web/src/surfaces/admin/auth/AdminRequireAuth.tsx`**:

```
loading  → spinner
signedOut → <Navigate to="/login" />
notAdmin  → "Access denied" error screen (show user email, sign-out button)
signedIn  → render children
```

**Create `apps/web/src/surfaces/admin/auth/AdminLoginPage.tsx`**:

- Single "Sign in with Google" button using Firebase `signInWithPopup` +
  `GoogleAuthProvider`.
- On success the `AdminAuthProvider` will update state; `AdminRequireAuth`
  handles the rest.
- No email/password form — Google-only per acceptance criteria.

---

### 12 — Admin service layer (frontend)

**Create `apps/web/src/surfaces/admin/lib/adminFunctions.ts`**:

Typed wrappers using `httpsCallable` from `firebase/functions`:

```typescript
export const provisionWorkspaceFn  = httpsCallable<IProvisionInput,  { wid: string; pid: string }>(functions, 'adminProvisionWorkspace');
export const adjustWorkspaceFn     = httpsCallable<IAdjustInput,     { ok: boolean }>(functions, 'adminAdjustWorkspace');
export const impersonateUserFn     = httpsCallable<IImpersonateInput, { customToken: string }>(functions, 'adminImpersonateUser');
```

Define input/output interfaces here (can re-use shared types where available).

---

### 13 — Admin UI pages

#### `WorkspaceListPage.tsx`
- Firestore query: `collection(db, 'workspaces')`, ordered by `createdAt DESC`
  (no composite index needed — single-field default).
- Table columns: **Name**, **Slug**, **Plan**, **Seats** (`seatsUsed / seatLimit`),
  **MRR (est.)** (computed: `seatLimit × ratePerSeat / 12` where `standard = 79,
  business = 149, trial = 0`; display in RM), **Expires**, **Last activity**
  (`summary.lastActivityAt` of the most recent project — denormalized; see
  Risk #2 below).
- Each row links to `WorkspaceDetailPage` via `/workspaces/:wid`.
- "Provision new workspace" button links to `ProvisionWorkspacePage`.

#### `ProvisionWorkspacePage.tsx`
- Form fields: workspace name, slug (auto-derived from name, editable), owner
  email, seat limit (number, default 5), plan (select: trial/standard/business),
  plan expires (date picker, default +30 days for trial), vertical (radio:
  "Residential build" / "Conveyancing").
- On submit: calls `provisionWorkspaceFn`, shows success with the new `wid`/`pid`,
  then navigates to `WorkspaceDetailPage`.
- Inline validation: slug format `/^[a-z0-9-]{3,40}$/`.

#### `WorkspaceDetailPage.tsx`
- Shows current workspace fields (name, plan, seats, expiry).
- **Plan change** section: select input (trial/standard/business) + "Save" button
  → calls `adjustWorkspaceFn({ wid, plan })`.
- **Seat adjustment** section: number input + "Save" → calls
  `adjustWorkspaceFn({ wid, seatLimit })`.
- **Renewal date** section: date picker + "Save" → calls
  `adjustWorkspaceFn({ wid, planExpiresAt })`.
- **Impersonate** section: text input for target UID or email (UX: email —
  resolve UID in the function), reason textarea, "Impersonate" button →
  calls `impersonateUserFn`, receives `customToken`, opens
  `https://dashboard.siapp.app/{workspaceSlug}?impersonate=1` in a new tab
  with `signInWithCustomToken` called in that tab via a redirect page (see
  Risk #1).

#### `AdminAuditLogPage.tsx`
- Paginated query on `adminLog` ordered by `ts DESC`, page size 50.
- Columns: **Time**, **Admin**, **Action**, **Target**, **IP**.
- "Load more" pagination (cursor-based using `startAfter` on the last `ts`).

---

### 14 — Update `AdminShell.tsx` and `adminRouter.tsx`

**Modify `AdminShell.tsx`**:

Replace placeholder with a two-column layout (narrow sidebar + main `<Outlet>`):
- Sidebar: "Siapp Admin" header with env badge, nav links (Workspaces,
  Provision, Audit Log), signed-in user email, Sign-out button.
- Matches the firm-theme styling pattern from `FirmShell.tsx` (D-038:
  admin surface rides the firm theme).

**Modify `adminRouter.tsx`**:

```typescript
export const adminRoutes: RouteObject[] = [
  {
    path: '/',
    element: (
      <AdminAuthProvider>
        <AdminRequireAuth>
          <AdminShell />
        </AdminRequireAuth>
      </AdminAuthProvider>
    ),
    children: [
      { index: true, Component: WorkspaceListPage },
      { path: 'workspaces/new', Component: ProvisionWorkspacePage },
      { path: 'workspaces/:wid', Component: WorkspaceDetailPage },
      { path: 'audit-log', Component: AdminAuditLogPage },
    ],
  },
  { path: '/login', Component: AdminLoginPage },
];
```

The `AdminAuthProvider` wraps everything. `AdminRequireAuth` only wraps
the shell (login page must render without it).

---

### 15 — `isAdmin` bootstrap script (documentation only)

Create `backend/functions/src/admin/scripts/setAdminClaim.ts` (or `.js`) as a
one-off Node script the founder runs once per admin account:

```typescript
// Usage: GOOGLE_APPLICATION_CREDENTIALS=... ts-node setAdminClaim.ts <email>
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [,, email] = process.argv;
initializeApp();
const user = await getAuth().getUserByEmail(email);
const existing = user.customClaims ?? {};
await getAuth().setCustomUserClaims(user.uid, { ...existing, isAdmin: true });
console.log('Done — isAdmin set on', user.uid);
```

Document this script and the env var `ADMIN_IP_ALLOWLIST` in
`backend/functions/README.md` (add a section if the file exists, or create it).

---

## Test plan

The Tester should cover:

### Unit tests — Cloud Functions

1. **`writeStarterProject` (Firestore emulator)**
   - `residentialBuildSeed`: asserts exactly 1 project doc, ≥7 phase docs,
     ≥60 task docs, all `dependsOn` IDs reference real task docs in the project.
   - `conveyancingSeed`: asserts exactly 1 project doc, ≥5 phase docs,
     ≥30 task docs.
   - Project doc has `lifecycle: 'draft'` and `status: 'planning'`.
   - No task doc contains `requiresPhoto`, `requiresFirmApproval`, or
     `pendingApproval` fields (D-032 guard).

2. **`adminGuard`**
   - Returns without error when `isAdmin: true` and IP is in allowlist.
   - Throws `HttpsError('permission-denied')` when `isAdmin` is absent.
   - Throws `HttpsError('permission-denied')` when IP is not in the allowlist
     and `ADMIN_IP_ALLOWLIST` is set.

3. **`provisionWorkspace` (Firestore emulator + Auth emulator)**
   - Happy path: workspace doc, member doc, and ≥1 phase doc are created.
   - Admin log entry is written with `action: 'workspace.provision'`.
   - Duplicate slug returns `HttpsError('already-exists')`.
   - Non-admin caller returns `HttpsError('permission-denied')`.

4. **`adjustWorkspace`**
   - Plan change writes updated plan and logs `action: 'workspace.plan_change'`
     with correct `before` / `after`.
   - Empty input (no fields to change) returns `HttpsError('invalid-argument')`.

5. **`impersonateUser`**
   - Returns a non-empty `customToken` string for a valid target UID.
   - Calling with `targetUid` that has `isAdmin: true` returns
     `HttpsError('permission-denied')`.
   - Logs `action: 'user.impersonate'` with the supplied `reason`.

### Firestore security rules tests

6. **`/adminLog` rules**
   - Token with `isAdmin: true`: `get` and `list` allowed.
   - Token without `isAdmin` (regular firm member): denied.
   - No client write allowed (regardless of claims).

7. **Workspace rules unchanged** — existing rules tests must still pass (no
   regression).

### Component tests (React Testing Library + Vitest)

8. **`AdminRequireAuth`**
   - Renders spinner when `status: 'loading'`.
   - Redirects to `/login` when `status: 'signedOut'`.
   - Renders "Access denied" with sign-out button when `status: 'notAdmin'`.
   - Renders children when `status: 'signedIn'`.

9. **`AdminLoginPage`**
   - Renders exactly one "Sign in with Google" button.
   - No email/password input present (regression guard for AC #5).

10. **`ProvisionWorkspacePage`**
    - Slug field auto-derives from name input.
    - Submit with empty required field shows validation error (no function called).
    - Invalid slug format shows inline error.

11. **`WorkspaceListPage`**
    - Renders a row for each workspace from the mocked Firestore query.
    - MRR column displays `0` for `plan: 'trial'` workspaces.

---

## Out of scope

- Email / SMS notifications to the new workspace owner after provisioning
  (deferred to #11 team-invites + Postmark per D-040).
- Self-serve workspace creation by firms (MVP is manual provisioning only per
  11-mvp-scope.md §Firm app).
- Stripe / FPX billing integration (manual billing at MVP per D-019).
- Business-tier feature gates / Standard-vs-Business comparison UI (D-030:
  single tier in MVP).
- Custom domains for workspaces (D-030).
- Bulk CSV import of workspaces.
- Multi-admin accounts (only one `isAdmin` account expected at MVP; the pattern
  supports more, but no admin-list management UI is built here).
- Vertical seed for `other` — only `construction` and `legal` per D-031.
- Collaborator #11 (team invites) — member doc is created for the owner only;
  inviting additional team members is a separate ticket.

---

## Risks / open questions

**Risk 1 — Impersonation UX in new tab (needs human decision)**

The cleanest UX is: `WorkspaceDetailPage` calls `impersonateUserFn`, receives
a `customToken`, and opens `https://dashboard.siapp.app/{slug}?impersonate=1`
in a new tab. The dashboard landing page (or a dedicated `/auth/impersonate`
route) calls `signInWithCustomToken(auth, customToken)` — but `customToken` can
only be transferred between pages if it's appended to the URL (insecure) or
stored in `sessionStorage` before the new tab is opened (fragile cross-origin).

**Recommended approach:** open a popup to a new `admin.siapp.app/impersonate`
route within the same origin, pass the token in `sessionStorage`, and have that
page call `signInWithCustomToken`, then redirect to `dashboard.siapp.app`. This
keeps the token off the URL but adds a redirect hop.

**Question for founder:** Is a redirect hop acceptable, or should we build a
dedicated impersonation landing page on `dashboard.siapp.app`?

**Risk 2 — "Last activity" on workspace list requires a denorm field**

The workspace list AC requires `last activity` per workspace. The current
`IWorkspaceDoc` schema has no `lastActivityAt` top-level field — it lives on
each project's `summary.lastActivityAt`. Reading all project summaries per
workspace row is not viable for the list view.

**Recommendation:** Add `lastActivityAt: Timestamp` to `IWorkspaceDoc`
(optional, maintained by a new Cloud Function trigger on `projects/{pid}`
writes). However, this is a schema addition that touches the Cloud Function
layer — adding it here risks scope creep into a project-write trigger not yet
built (#13 / #17).

**Short-term workaround for this ticket:** omit "last activity" from the
workspace list; show it as "—" with a TODO comment. Add the `lastActivityAt`
field to the workspace doc schema now (additive, no breaking change) and leave
the trigger wiring to #17.

**Question for founder:** Is "last activity = —" acceptable for the initial
admin panel launch, or is it a must-have for workspace list?

**Risk 3 — MFA enforcement depth**

Acceptance criteria says "Google SSO + MFA required". Firebase Auth supports
MFA via the `multiFactor` API (enrollment check), but enforcing it in code
requires either:
(a) Checking `result.claims['firebase']['sign_in_second_factor']` in the token
— this is set when MFA was actually used during this sign-in, but only if the
account enrolled MFA in Firebase Auth (TOTP or SMS), not at the Google-account
level.
(b) Trusting that the admin's Google account has Google's own 2FA enforced
(Google Workspace policy or personal account setting) — not enforceable by
Siapp code.

**Recommended MVP approach:** Set the Firebase project's
`multi_factor_config.state = 'ENABLED'` and enforce in `AdminRequireAuth` that
`result.authTime` is recent and `result.claims.firebase.sign_in_second_factor`
is present. Document in ops runbook that the admin Google account must have
2-step verification enabled.

**Question for founder:** Should MFA enforcement block sign-in immediately (hard
gate in `AdminRequireAuth`) or only warn (soft gate with a banner) if the claim
is absent?

**Risk 4 — IP allowlist format in env var**

CIDRs require a CIDR-matching library (no Node built-in). For MVP, support
exact IP matches only and document this limitation. If the admin's ISP assigns
dynamic IPs, this will need updating each session — may be too painful.

**Question for founder:** Is a single static IP or a small set of static IPs
sufficient, or do you need CIDR support (e.g. office subnet)?

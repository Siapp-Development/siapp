# Impl Plan — #113 Show workspace owner detail on admin workspace page

## Goal
On the admin **Workspace detail** page (`admin.siapp.app`, `WorkspaceDetailPage.tsx`), display the
workspace owner's **display name, email, and UID** alongside the existing plan/seat/expiry summary,
with a one-click copy affordance so the UID can be pasted into the existing Impersonate form's
"Target Firebase UID" field. This extends the narrowly-scoped admin panel (D-019/D-030) with a
read-only support convenience. `IWorkspaceDoc` only stores `ownerId` (a Firebase Auth UID); the
owner's name/email live on the owner **member doc** (`/workspaces/{wid}/members/{ownerId}`) and on
`/users/{ownerId}` — both currently unreadable by the admin client per Firestore rules. This plan
resolves `ownerId → {displayName, email, uid}` **server-side via a new admin callable** (Admin SDK),
consistent with the existing admin-callable pattern and D-025 (privileged reads go through a
server projection, not widened client rules).

## Decision — Option B (Cloud Function / Admin SDK). Rejected: Option A (rules change).
**Chosen: Option B** — add `adminGetWorkspaceOwner({ wid })`, guarded by `assertAdminCall`, resolving
the owner via the owner member doc (fast, denormalised name/email) with an Auth fallback.

Justification:
- **Consistency** — every existing admin data path (provision/adjust/impersonate) is an
  `assertAdminCall`-guarded callable in `backend/functions/src/admin/`. This slots into the same
  place with the same guard (auth + `isAdmin` claim + MFA + IP allowlist).
- **No rules-surface expansion** — D-021's three-actor access model does **not** list the Siapp
  admin as a Firestore-rules actor, and D-025 mandates routing privileged/cross-boundary reads
  through a server projection endpoint rather than widening client-side rules. Option A would
  contradict that established principle and require a `security-review`/rules-auditor pass to add
  `isSiappAdmin()` to the members read (and a scoped `/users` read), permanently enlarging the
  multi-tenant read surface for a support-convenience feature. **Flag: choosing Option A would
  contradict D-025 and must be escalated.**
- **Robustness** — the callable can fall back to `getAuth().getUser(ownerId)` when the member doc
  is missing (legacy/edge), and report a clean "unresolvable" state when the Auth user is deleted —
  logic that is awkward/impossible in rules.

Cost of Option B: one extra callable + frontend wrapper + a client fetch on page load. Accepted.

## Touched surfaces & files
Surface: **admin app only** (`admin.siapp.app`). No marketing/firm/portal/collaborator bundle is
touched — bundle isolation (D-036) preserved.

Backend (create):
- `backend/functions/src/admin/getWorkspaceOwner.ts` — new callable handler.
- `backend/functions/src/admin/getWorkspaceOwner.test.ts` — unit test for the pure resolver helper.

Backend (modify):
- `backend/functions/src/index.ts` — import `getWorkspaceOwner` (near line 74) and export
  `export const adminGetWorkspaceOwner = onCall(getWorkspaceOwner);` (near line 121).

Frontend (modify):
- `apps/web/src/surfaces/admin/lib/adminFunctions.ts` — add `IGetWorkspaceOwnerInput`,
  `IWorkspaceOwner` result type, and `getWorkspaceOwnerFn` wrapper.
- `apps/web/src/surfaces/admin/pages/WorkspaceDetailPage.tsx` — fetch owner on load; render the
  owner section with copy-to-clipboard + "Use in Impersonate" affordance.

Frontend (create):
- `apps/web/src/surfaces/admin/pages/WorkspaceDetailPage.test.tsx` — new component test (this
  surface currently ships without tests; mirror `firm/settings/TeamSettingsPage.test.tsx` mock style).

Shared (optional, modify):
- `packages/shared/src/firestoreTypes.ts` — **no change required** (`IMemberDoc`/`IUserDoc` already
  exist). The callable's response DTO is a new interface; define it in `adminFunctions.ts` (frontend)
  and mirror it locally in the callable file, matching the existing convention where admin request/
  result DTOs are declared next to their callable (see `IImpersonateInput`/`IAdjustInput`).

## Data model changes
**None.** No new collections or fields. No security-rules changes (the whole point of Option B):
- `firestore.rules` `/workspaces/{wid}/members/{memberUid}` read stays `isFirmMember(wid)` (line 556).
- `firestore.rules` `/users/{uid}` stays owner-self `get`, `list:false` (lines 518-520).
- Multi-tenant isolation unchanged; the new read happens Admin-SDK-side inside the guarded callable.

## Backend callable contract
`adminGetWorkspaceOwner`

Input: `{ wid: string }`.

Result `IWorkspaceOwner`:
```ts
{
  uid: string;                 // = workspace.ownerId (always returned)
  displayName: string | null;  // null when unresolvable
  email: string | null;        // null when unresolvable
  source: 'member' | 'auth' | 'unresolved';
  authUserDeleted: boolean;    // true when getUser threw user-not-found
}
```

Handler steps:
1. `assertAdminCall(request)`.
2. Validate `wid` is a non-empty string → else `invalid-argument`.
3. `getFirestore().doc(\`workspaces/${wid}\`).get()`; if missing → `not-found`.
4. Read `ownerId` from the workspace doc; if absent/empty → return
   `{ uid:'', displayName:null, email:null, source:'unresolved', authUserDeleted:false }`.
5. Try owner member doc `workspaces/${wid}/members/${ownerId}`. If it exists, use its
   `displayName`/`email` → `source:'member'`.
6. Else fall back to `getAuth().getUser(ownerId)` → `displayName`/`email` → `source:'auth'`;
   on `auth/user-not-found` set `authUserDeleted:true`, `source:'unresolved'`, names null (mirror
   the not-found catch pattern in `impersonateUser.ts` lines 43-53).
7. Return the DTO. **No mutation ⇒ no `writeAdminLog`/`writeAuditLog`** (consistent with the fact
   that only mutations/impersonation are logged today). See open question Q2.

Extract the pure resolution logic (member-doc/auth → DTO) into a small exported helper
(e.g. `resolveOwner(memberData, authUser)`) so it is unit-testable without Firestore/Auth, matching
the "export pure helpers, emulator covers assembly" convention (see `callables/exportProject.test.ts`).

## Frontend UI
Add an **"Workspace owner"** `<section>` immediately after the summary `<dl>` (after line 247) and
before the "Billing status" section, styled identically to the existing sections
(`rounded-lg border p-4`, `<h2 className="font-medium">` with an `aria-labelledby` id).

Contents (semantic `<dl>` matching the summary block):
- **Owner** → `displayName` (fallback text "Unknown" when null).
- **Email** → `email` as `mailto:` link (fallback "—" when null).
- **Firebase UID** → `<code>{uid}</code>` + a `<Button size="sm" variant="outline">Copy UID</Button>`
  using `navigator.clipboard.writeText(uid)`, and a secondary
  `<Button size="sm" variant="outline">Use in Impersonate</Button>` that calls
  `setTargetUid(uid)` (reuses existing state) and scrolls focus toward the impersonate form.
- When `source === 'unresolved'`: show a muted note — if `authUserDeleted` → "Owner's Firebase Auth
  account no longer exists (UID {uid})."; else "Owner details are unavailable."; still show the UID
  + copy button when a `uid` is present.
- Loading state: `role="status" aria-live="polite"` "Loading owner…"; error state: `role="alert"`
  with the callable error message. Fetch owner in a `useEffect` keyed on `wid` (separate from the
  workspace snapshot effect), storing `owner`, `ownerLoading`, `ownerError` state.

## Steps (independently verifiable)
1. **Backend callable** — create `getWorkspaceOwner.ts` with the contract above + exported
   `resolveOwner` helper. Verify: `pnpm --filter functions build` typechecks.
2. **Register callable** — add import + `onCall` export in `index.ts`. Verify: build passes; export
   name `adminGetWorkspaceOwner` present.
3. **Backend test** — `getWorkspaceOwner.test.ts` covers `resolveOwner` for member-hit, auth-fallback,
   deleted-auth-user, and missing-ownerId. Verify: `pnpm --filter functions test` green.
4. **Frontend wrapper** — add `IGetWorkspaceOwnerInput`, `IWorkspaceOwner`, `getWorkspaceOwnerFn` to
   `adminFunctions.ts`. Verify: web typecheck passes.
5. **UI** — add owner section + fetch effect + copy/use handlers + live-region copy feedback in
   `WorkspaceDetailPage.tsx`. Verify: `pnpm --filter web build`.
6. **Component test** — add `WorkspaceDetailPage.test.tsx`. Verify: `pnpm --filter web test` green.
7. **Full validation** — run the commands below.

## Test plan (for Tester)
Backend unit (`getWorkspaceOwner.test.ts`):
- `resolveOwner` returns `source:'member'` with member name/email when member data present.
- Returns `source:'auth'` when member absent but auth user provided.
- Returns `source:'unresolved'`, `authUserDeleted:true`, null names when auth user missing.
- Returns `unresolved` when `ownerId` empty/absent.
(Guard behaviour is already covered by `adminGuard.test.ts`; no need to re-test the guard. No rules
test needed — rules are unchanged.)

Component (`WorkspaceDetailPage.test.tsx`, mirror `TeamSettingsPage.test.tsx` mocking):
- Mock `@/lib/firebase.ts`, `firebase/firestore` (`doc`, `onSnapshot`, `Timestamp`), and
  `../lib/adminFunctions.ts`. Drive `onSnapshot` to emit a workspace, and
  `getWorkspaceOwnerFn.mockResolvedValue({ data: {...} })`.
- Renders owner name, email (mailto), and UID.
- "Copy UID" calls `navigator.clipboard.writeText` with the UID (mock clipboard) and announces
  feedback in the live region.
- "Use in Impersonate" sets the Target Firebase UID input's value.
- Unresolved/deleted-auth state renders the fallback note and no email link.
- Owner-fetch error renders `role="alert"` without breaking the rest of the page.

## Accessibility considerations
- Section wrapped in `<section aria-labelledby="owner-heading">` with an `<h2 id="owner-heading">`.
- Owner facts in a `<dl>` with `<dt>`/`<dd>` pairs (matches existing summary semantics).
- Copy affordance: a real `<button>` with an accessible label ("Copy owner UID"); copy success
  announced via a dedicated `aria-live="polite"` status node ("UID copied").
- UID rendered in `<code>` for readability; email as a focusable `mailto:` link.
- Loading = `role="status" aria-live="polite"`; fetch error = `role="alert"`.

## Validation commands
- `pnpm --filter functions build && pnpm --filter functions test`
- `pnpm --filter web typecheck` (or `tsc -b`) + `pnpm --filter web build`
- `pnpm --filter web test`
- `pnpm lint` (root eslint)
- (No `pnpm --filter rules-tests test` needed — rules unchanged; run it anyway if the harness is in the default test task.)

## Out of scope
- No Firestore rules changes; no `/users` or member read grant to the admin client.
- No display of any other member/owner PII (phone, photo, departments) beyond name/email/UID.
- No change to the impersonation flow itself, audit-logging of impersonation, or the summary `<dl>`
  fields.
- No caching layer / batch owner resolution on the workspace **list** page (#113 is the detail page).
- No backfill of owner name/email onto `IWorkspaceDoc`.

## Risks / open questions
- **Q1 (PII policy).** No decision explicitly authorises exposing owner name/email to Siapp admins
  (D-021 only mentions denormalised names for firm-staff rendering). This is a support convenience
  behind the fully-guarded admin surface (MFA + IP allowlist), but confirm founder is OK exposing
  owner email/name in the admin panel. **Needs a human call.**
- **Q2 (audit logging).** Should reading owner detail be audit-logged? Current convention logs only
  mutations + impersonation. Recommend **no** log for a read; confirm.
- **Q3 (copy affordance).** `navigator.clipboard` requires a secure context; `admin.siapp.app` is
  HTTPS so fine in prod, but tests must mock `navigator.clipboard`. Fallback to selecting the `<code>`
  text if clipboard API is unavailable — is a fallback wanted, or is failure-with-message acceptable?
- **Risk — deleted/legacy owners.** Some workspaces may have a missing owner member doc or a deleted
  Auth user; handled by the `unresolved`/`authUserDeleted` states, but verify at least one real
  workspace resolves correctly in the emulator before merge.
- **Risk — no existing tests in the admin surface.** Adding the first component test there may surface
  missing test scaffolding/mocks for the admin app; budget time to wire the mock setup.

# Implementation Plan — Team Invites & Departments (issue #11, milestone M1)

## Goal

Let firms staff their workspace and optionally partition sensitive work:

- Email invite flow with role selection (`admin | pm | viewer` — owner cannot be invited).
- Opt-in departments providing need-to-know visibility on department-restricted content; all department affordances stay hidden until the first department exists (D-004).
- Rules tests proving non-department members cannot read department-restricted content.

## Decisions (binding, recorded 2026-07-18)

1. **Single workspace per user (MVP).** `acceptInvite` rejects users who already belong to any workspace with the stable code `invite/already-in-workspace`. Implemented as ONE isolated guard clause in `backend/functions/src/callables/invites.ts` so multi-workspace later is additive (remove the guard; claims/member docs already support a map of workspaces).
2. **Copy invite link: yes.** `createInvite`/`resendInvite` return `inviteUrl` (raw token, only surfaced at create/resend time — the stored hash cannot reconstruct it) and the UI offers a copy action. Rationale: email delivery is degradable (no Postmark token in the emulator or before SMTP infra is provisioned) and accept-time email binding contains the exposure risk.
3. **Duplicate handling.** `createInvite` blocks only duplicate *pending* invites for the same email; accept rejects with `invite/already-member` when a member doc already exists. No email denormalization onto member docs.

## Architecture (as built)

Callables, not an HTTP API: `firebase-functions/v2/https` `onCall` handlers in region `asia-southeast1` (matches `setGlobalOptions`, D-002), invoked from the web app via `httpsCallable`. Request/response contracts live in `packages/shared/src/callableTypes.ts` and are imported by `apps/web`; `backend/functions` mirrors the types locally (it deliberately has no `@siapp/shared` dependency).

Invite token: 32 random bytes, base64url. Raw token appears only in the emailed/returned URL `https://dashboard.siapp.app/invite/{workspaceId}/{inviteId}/{token}`; the invite doc stores a SHA-256 `tokenHash`. 7-day expiry, lazily marked `expired` at accept time. Accept is email-bound (invite email must equal the caller's `email` and `email_verified` must be true).

Stable error surface: callables throw `HttpsError('failed-precondition', message, { code })` where `code` is a `TInviteErrorCode`:
`invite/not-found | expired | revoked | already-used | email-mismatch | email-unverified | already-member | already-in-workspace`.
The web accept page maps codes to copy via `inviteErrorCode()` in `apps/web/src/lib/callables.ts`.

Claims determinism: `acceptInvite` sets custom claims directly (`{ workspaces: { [wid]: { role, departments } } }`) and stamps `users/{uid}.claimsUpdatedAt`; the existing `onWorkspaceMemberWrite` trigger re-derives the same claims idempotently. The client forces `getIdToken(true)` before navigating to the returned `workspaceSlug`.

Email: `backend/functions/src/lib/mail.ts` posts to the Postmark HTTP API. Degradable — without `POSTMARK_SERVER_TOKEN` the invite still succeeds, `emailSent: false` is returned, and the UI shows a "share the link manually" notice.

Write paths:
- **Invites + membership**: callable-only (`createInvite`, `acceptInvite`, `revokeInvite`, `resendInvite`, `setMemberDepartments`). Client writes denied by rules — token generation, email binding, claims, and seat recount must be server-side.
- **Departments**: direct client Firestore writes (owner/admin), validated by rules. Create/rename/delete; delete allowed only when `memberCount == 0` (recounted by the `recountSeats` trigger on member writes).

## Files

### packages/shared
- `src/callableTypes.ts` (new) — `ICreateInviteRequest/Response { inviteId, inviteUrl, emailSent }`, `IAcceptInviteRequest { workspaceId, inviteId, token }`, `IAcceptInviteResponse { workspaceId, workspaceSlug, role }`, `IRevokeInviteRequest`, `IResendInviteRequest`, `TResendInviteResponse`, `ISetMemberDepartmentsRequest`, `TInviteErrorCode`.
- `src/enums.ts` — `TInviteRole = 'admin' | 'pm' | 'viewer'`, `TInviteStatus`.
- `src/firestoreTypes.ts` — invite + department doc shapes.

### backend/functions
- `src/lib/invites.ts` (new) — pure invite domain logic (token generate/hash, URL build, validation state machine). Unit-tested (13 tests).
- `src/lib/mail.ts` (new) — Postmark send, degradable.
- `src/callables/invites.ts` (new) — `createInvite`, `acceptInvite`, `revokeInvite`, `resendInvite`.
- `src/callables/setMemberDepartments.ts` (new) — owner/admin assign a member's `departments: string[]`; claims re-synced via the member-write trigger.
- `src/triggers/recountSeats.ts` (new) — maintains `seatsUsed` and department `memberCount` on member writes.
- `src/index.ts` — exports the callables; `onWorkspaceMemberWrite` now runs `syncMemberClaims` + `recountSeats`.

### firestore.rules
- `invites`: read owner/admin only; all client writes denied.
- `departments`: read any active member; create/update owner/admin with field allow-list; delete owner/admin only when `memberCount == 0`.
- `canSeeRestricted(workspaceId, departments)` helper for department-gated content: unrestricted (`departments` empty/null) → any active member; restricted → owner/admin (always full detail per D-025 / 20-access-control-departments.md — audit, incident response, lockout avoidance), or member whose claim departments intersect.
- Members: `departments` mutations denied to clients (callable-only).

### backend/rules-tests (180 tests total)
- `invites.test.ts` (new), `departments.test.ts` (new), `restrictedContent.test.ts` (new — the need-to-know matrix: member-in-dept allow, member-not-in-dept deny, admin-without-dept allow (D-025), owner allow, unrestricted allow-all-members, cross-workspace/no-member deny).
- `helpers.ts` — arbitrary-path seeding support.

### apps/web (dashboard surface only; bundle isolation unaffected)
- `src/lib/firebase.ts` — `functions = getFunctions(app, 'asia-southeast1')` + emulator hookup (port 5001).
- `src/lib/callables.ts` (new) — typed `httpsCallable` wrappers + `inviteErrorCode()`.
- `src/surfaces/firm/settings/useTeamData.ts` (new) — `useCollection` onSnapshot helper; `useMembers`, `usePendingInvites` (disabled for pm/viewer — rules would deny the read), `useDepartments`; direct-Firestore `createDepartment` / `renameDepartment` / `deleteDepartment`.
- `src/surfaces/firm/settings/TeamSettingsPage.tsx` (new) — members list with role labels; invite panel (owner/admin: email + role select, copy-link result, `emailSent: false` notice, pending list with resend/revoke); departments panel (create/rename, delete disabled while `memberCount > 0`); member department chips + editor hidden until the first department exists (D-004).
- `src/surfaces/firm/InviteAcceptPage.tsx` (new) — `/invite/:workspaceId/:inviteId/:token`, outside `RequireAuth`. Signed-out: inline sign-in / create-account (email+password with `sendEmailVerification`, or Google) — the only self-serve signup surface. Signed-in: auto-accept, then force token refresh and navigate to `/{workspaceSlug}`. Distinct UI per error code, including a verify-email phase (resend + retry) and switch-account on email mismatch.
- `src/surfaces/firm/FirmShell.tsx` — descendant `<Routes>`: index dashboard + `settings/team`; sidebar Settings link.
- `src/routes/dashboardRouter.tsx` — invite route registered outside `RequireAuth`.

### Tooling
- `firebase.json` — functions emulator port 5001.
- `scripts/seed-auth-emulator.mjs` — seeds departments "Structural" (pm is a member) and "Interiors" (empty) so need-to-know and the D-004 reveal are testable locally.

## Verification (all run under node 22, matching `.nvmrc`)

- `pnpm build`, `pnpm lint` (0 errors), `pnpm typecheck` — green.
- `pnpm test` — web 70 (13 files, incl. 8 TeamSettingsPage, 5 InviteAcceptPage, 2 callables), functions 25, bundle-isolation scripts.
- `pnpm test:rules` — 180 passing against the Firestore emulator (JAVA_HOME → openjdk@21 locally).

## Out of scope

- Task/note/doc CRUD UI and department filter/selector UI (issue #13 — this issue ships the rules enforcement + `useDepartments` it will consume).
- Per-item allow-lists, multi-department tagging, invite-time department pre-assignment (post-MVP).
- Collaborator invites (`siapp.app/t/*`, separate issue).
- Scheduled invite-expiry sweep (lazy expiry at accept is sufficient for MVP).
- Composite indexes for department-filtered lists (issue #13's queries).

## Risks / notes

- **Multi-workspace future**: removing the single guard clause in `acceptInvite` plus a workspace switcher is the whole migration; claims shape already supports multiple workspaces.
- **List queries over restricted content** (issue #13): rules `list` evaluates the query, not each doc — #13's queries must constrain by the caller's departments client-side.
- **Postmark**: token unprovisioned ⇒ `emailSent: false` path is the default in dev; copy-link keeps the flow usable.
- Pre-existing loose member-update field allow-list in rules is unchanged (adjacent cleanup, deliberately not bundled).

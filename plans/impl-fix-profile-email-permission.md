# Impl Plan — Fix "Missing or insufficient permissions" on Profile save (email-casing drift)

Status: Ready for Builder
Surface: `dashboard.siapp.app` (firm app) + Firestore rules + rules-tests
Related: #104 (Profile settings), D-021 (`users/` collection), D-026 (locale `en` only),
D-036 (bundle isolation — unaffected; no new surface touched)

## Goal
Existing-tenant (DD Development) firm users hit `Missing or insufficient permissions.`
when saving display name/photo on the Profile settings screen. Root cause is confirmed:
`validUserProfile(uid)` in `firestore.rules` requires an EXACT, case-sensitive match
`d.email == request.auth.token.email`, evaluated against the merged post-update doc. When
the stored `users/{uid}.email` casing has drifted from the Auth token email (e.g.
`RaniaWork@…` stored vs `raniawork@…` in the token), every partial update (which only sends
`displayName`/`photoUrl`, inheriting the stored `email`) is denied. `upsertOwnProfile` never
reconciles a drifted email, so affected users are permanently stuck. This plan makes two
surgical, coordinated changes: (1) relax the rule to a case-insensitive email comparison via
`.lower()`, and (2) have the client self-heal a drifted stored `email`/`displayName` on
sign-in. No decision in the log conflicts with either change (verified against
decisions-log.md). No new collections, no new surfaces, no unrelated refactors.

## Touched surfaces & files
Create:
- `plans/impl-fix-profile-email-permission.md` (this file — the only writable output of planning).

Modify:
1. `firestore.rules` — `validUserProfile(uid)` (~line 184–196): make the email clause
   case-insensitive.
2. `apps/web/src/surfaces/firm/auth/AuthProvider.tsx` — `upsertOwnProfile(user)` (~line
   71–94): self-heal drifted `email`/`displayName` when a profile already exists.
3. `backend/rules-tests/src/usersProfile.test.ts` — add casing-drift success + preserve
   spoofed-different-email denial (update path).
4. `apps/web/src/surfaces/firm/auth/AuthProvider.test.tsx` — **new file**; unit-test
   `upsertOwnProfile` reconciliation (no such test exists today).

Not touched: `apps/web/src/surfaces/firm/settings/useUpdateProfile.ts` — the failing
`updateDoc` call is correct as written; the fix is in the rule + provider, not the hook.

## Data model changes
No schema/shape changes. Same whitelisted `users/{uid}` fields
(`uid, email, displayName, photoUrl, phone, defaultWorkspaceId, locale, createdAt,
lastSeenAt`; `claimsUpdatedAt` remains server-only). Semantics change only in how `email`
is compared in rules (case-insensitive) and that the client may now rewrite `email`/
`displayName` to reconcile drift.

Security-rules implications:
- The email clause becomes `d.email.lower() == request.auth.token.email.lower()`. This is a
  loosening strictly within the same identity (token email vs stored email, same address,
  different casing). A genuinely different address (`spoofed@…` vs `alice@…`) still fails
  because the lowercased strings differ. Multi-tenant isolation is unaffected — this rule
  is scoped to the caller's OWN `users/{uid}` doc (`request.auth.uid == uid`), not workspace
  data.
- All other `validUserProfile` clauses (uid pin, displayName non-empty, `locale in ['en']`,
  timestamp types, optional-field type guards) stay byte-for-byte intact.
- `allow update` keeps its existing `hasOnly` whitelist and the
  `!diff().affectedKeys().hasAny(['claimsUpdatedAt','createdAt'])` guard. Self-healing writes
  only `email`/`displayName` (+ existing `lastSeenAt` bump), so they never touch
  `createdAt`/`claimsUpdatedAt` and stay inside the whitelist.

## Steps
1. **Rule: case-insensitive email compare.** In `firestore.rules`, `validUserProfile(uid)`
   (~line 187), change:
   ```
   && d.email == request.auth.token.email
   ```
   to:
   ```
   && d.email.lower() == request.auth.token.email.lower()
   ```
   Leave every other line in the function unchanged. This function backs BOTH `create` and
   `update` for `users/{uid}`, so create is likewise now casing-tolerant (acceptable and
   desirable: it prevents new drift from re-introducing the bug). Verifiable: rules-tests.

2. **Client self-heal in `upsertOwnProfile`.** In `AuthProvider.tsx` (~line 71–94), extend
   the existing-profile branch so that when a profile exists we compute a minimal patch:
   - Always include `lastSeenAt: serverTimestamp()` (preserve current behavior).
   - Read stored `email` and `displayName` from `snapshot.data()`.
   - Compute `authEmail = user.email ?? ''`. If `authEmail !== ''` and stored email differs
     case-insensitively from `authEmail` (`String(storedEmail).toLowerCase() !==
     authEmail.toLowerCase()`), add `email: authEmail` to the patch (write the correctly
     cased token email so the doc matches the token going forward).
   - Compute the desired display name using the SAME fallback the create branch uses
     (`user.displayName ?? (authEmail === '' ? 'Member' : authEmail)`). If it is a non-empty
     string and differs from the stored `displayName`, add `displayName` to the patch. Guard
     against writing an empty displayName (rule requires `size() > 0`).
   - `await updateDoc(ref, patch)` with the merged fields. Do NOT include `createdAt` or
     `claimsUpdatedAt`. Keep the whole thing inside the existing `try`/best-effort catch in
     the effect (line 142–145) — a self-heal hiccup must not break sign-in.
   Keep the "missing profile" branch (setDoc merge) exactly as-is. Verifiable: new unit test.

3. **Confirm no hook change needed.** `useUpdateProfile.saveProfile` (line 123) already
   sends only `displayName`/`photoUrl`; with steps 1–2 in place, the merged doc's inherited
   `email` now passes the rule (and self-heal converges casing on next sign-in). No edit.

4. **Rules-tests: casing drift.** See Test plan — add success + denial cases to
   `usersProfile.test.ts` (update describe block).

5. **Provider unit test.** See Test plan — new `AuthProvider.test.tsx` exercising
   `upsertOwnProfile` reconciliation.

6. **Validate.** Run the full gate (see Validation commands) before handing to Shipper.

## Test plan
Rules tests — `backend/rules-tests/src/usersProfile.test.ts` (uses existing `seedUserProfile`,
`validProfilePayload` helpers; `authenticatedContext(uid, { email })`):
- ADD (update, should SUCCEED): seed a profile whose stored email is mixed-case
  (e.g. `seedUserProfile(testEnv, 'lara', 'Lara@Firm.Test')`), authenticate with the
  lowercased token email (`{ email: 'lara@firm.test' }`), and
  `updateDoc(doc(db,'users/lara'), { displayName: 'Lara Q', photoUrl: 'https://cdn.example.test/lara.png' })`
  → `assertSucceeds`. This is the regression that reproduces the DD Development bug.
- ADD (update, should still FAIL): seed a profile with `alice@firm.test`, authenticate as
  the owner but attempt to rewrite the doc's email to a genuinely DIFFERENT address
  (`updateDoc(..., { email: 'attacker@firm.test' })`) → `assertFails`. Confirms `.lower()`
  only tolerates casing, not a different identity.
- KEEP passing: the existing create-path denial `denies an email that does not match the
  token email` (line 67–73) — still a different address, still denied. Optionally add a
  create-path SUCCESS with casing drift to mirror the update case.
- KEEP passing: all existing update cases (lastSeenAt bump, claimsUpdatedAt untouched/denied,
  createdAt rewrite denied, other-user denied, displayName+photoUrl together, deleteField
  photo, non-string photoUrl).

Web unit tests — new `apps/web/src/surfaces/firm/auth/AuthProvider.test.tsx`
(follow repo convention: globals disabled, import `{ describe, it, expect, vi, beforeEach }`;
`vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {} }))`; mock `firebase/firestore`
with `vi.fn()` stubs for `doc, getDoc, updateDoc, setDoc, serverTimestamp` and a
`serverTimestamp` that returns a sentinel; export `upsertOwnProfile` from `AuthProvider.tsx`
OR test it via a thin harness — Builder to expose it as a named export if not already, keeping
the change minimal):
- Existing profile with DRIFTED email (`stored: 'Rania@Work.test'`, token
  `user.email: 'rania@work.test'`): assert `updateDoc` called once with a patch containing
  `email: 'rania@work.test'` and `lastSeenAt` sentinel; assert `setDoc` NOT called; assert
  patch has no `createdAt`/`claimsUpdatedAt`.
- Existing profile with drifted `displayName`: assert patch includes the corrected
  `displayName`.
- Existing profile that MATCHES (same email casing + same displayName): assert `updateDoc`
  called with ONLY `{ lastSeenAt }` (no email/displayName keys) — preserves current behavior.
- Missing profile (`snapshot.exists()` false, or exists without string `email`): assert
  `setDoc` called with the full merge payload (unchanged create branch), `updateDoc` NOT
  called.
- Guard: `user.email` null/empty → do not write an empty `email`; do not write empty
  `displayName`.

Note: `useUpdateProfile.ts` is intentionally NOT retested here (no behavior change); its
existing indirect coverage via `ProfileSettingsPage.test.tsx` (which mocks the hook) remains.

## Validation commands
- Web build: `pnpm --filter @siapp/web build` (needs `apps/web/.env` Firebase vars).
- Web lint: `pnpm --filter @siapp/web lint`
- Web typecheck: `pnpm --filter @siapp/web typecheck`
- Web unit tests: `pnpm --filter @siapp/web test`
- Rules tests (emulator-backed): `pnpm test:rules` from repo root
  (wraps `firebase emulators:exec --only firestore,storage "pnpm --filter @siapp/rules-tests test:rules"`).
- Full gate (optional): `pnpm lint && pnpm typecheck && pnpm test && pnpm test:rules` at root.

## Out of scope
- Backfilling/normalizing existing `users/*.email` values in production via a migration — the
  client self-heal converges each affected user on their next sign-in; no batch job planned.
- Changing how profile emails are STORED (we keep the raw token email; we do not force
  lowercase-on-write beyond reconciling drift to the current token casing). Aligning storage
  with `normalizeEmail` (backend/functions/src/lib/invites.ts) is a broader normalization
  effort and is deliberately deferred.
- Any change to `useUpdateProfile.ts`, the member-doc `syncMemberProfile` fan-out, invites,
  or other surfaces/bundles (D-036 isolation preserved — only the firm app + shared rules
  are touched).
- Locale, phone, defaultWorkspaceId, or any other whitelist field behavior.

## Risks / open questions
1. `.lower()` support: Firestore rules `String.lower()` is standard and used to compare
   the token email; confirmed available. Rules-tests will prove it in the emulator — if the
   emulator rejects it, fall back to the same `.lower()` on both sides is the only supported
   approach (no `.toLowerCase()` in rules). Low risk.
2. Exporting `upsertOwnProfile` for unit testing: it is currently a module-private function.
   Builder should add a named `export` (minimal, no signature change) so the new test can
   call it directly without mounting the full provider. Flagging in case a reviewer prefers
   testing through a mounted `<AuthProvider>` instead — decide during review.
3. Self-heal write amplification: on every sign-in where casing drifts but the user never
   opens Profile settings, we now issue one extra `updateDoc`. After the first heal the doc
   matches and subsequent sign-ins only bump `lastSeenAt` (unchanged cost). Acceptable.
4. Token email absent (e.g. phone-only providers): guarded — when `user.email` is empty we
   skip the email patch entirely, matching the create branch's `email === '' ? 'Member'`
   fallback. No new denial introduced.
5. Should create ALSO normalize-to-lowercase on write (not just compare)? Left out per scope;
   open question for product if they want canonical lowercase storage — would be a separate,
   larger change touching invites/members parity.

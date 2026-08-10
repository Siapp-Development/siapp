# impl-96 - Dashboard login MFA fix

## Goal
Fix Issue #96 by making firm dashboard login on dashboard.siapp.app handle Firebase auth/multi-factor-auth-required with a complete TOTP challenge flow, while preserving the existing non-MFA sign-in path. This aligns with MVP firm sign-in scope in [pm_ux/plans/11-mvp-scope.md](../pm_ux/plans/11-mvp-scope.md) and the auth architecture in [pm_ux/plans/13-tech-architecture.md](../pm_ux/plans/13-tech-architecture.md), and remains within D-036 surface isolation (dashboard flow changes stay in the firm surface only).

## Touched surfaces and files
- Surface: firm dashboard auth at dashboard.siapp.app only (no apex portal and no admin surface changes).
- Modify: apps/web/src/surfaces/firm/auth/LoginPage.tsx
- Modify: apps/web/src/surfaces/firm/auth/LoginPage.test.tsx
- Optional test touch only if needed for route behavior parity: apps/web/src/routes/dashboardRouter.test.tsx

## Data model changes
- Firestore collections/fields: none.
- Firebase Auth tenant/user records: none.
- Security rules implications: none expected because this fix is pre-Firestore UI auth flow handling.
- Multi-tenant isolation check: unchanged; workspace access still derives from signed-in token claims after successful auth.

## Steps
1. Confirm exact failure path in firm login.
- Reproduce auth/multi-factor-auth-required from the login path used by dashboard routes and document whether failure occurs on email/password, Google popup flow, Google redirect-return flow, or MFA code verification.
- Verify current behavior against admin reference flow in apps/web/src/surfaces/admin/auth/AdminAuthProvider.tsx.

2. Normalize MFA-required handling in LoginPage primary sign-in actions.
- Ensure both email/password and Google sign-in entry points branch on auth/multi-factor-auth-required and move to MFA challenge UI state instead of generic error alerts.
- Ensure non-MFA users continue direct success redirect behavior with no extra prompts.

3. Complete TOTP challenge handling for enrolled users.
- Use resolver hints to select TOTP factor and submit 6-digit code through resolver.resolveSignIn.
- Keep challenge state reset/back behavior explicit so users can return to base login form safely.

4. Improve friendly MFA failure messaging.
- Map common second-factor failures (invalid code, expired code, missing enrolled authenticator, canceled flow) to user-friendly messages in the same alert surface used today.
- Keep account-enumeration-safe behavior for primary credential errors.

5. Guard redirect and pending-state behavior.
- Ensure pending/loading state is released correctly on MFA failures so users can retry immediately.
- Ensure post-success navigation still respects safe next path logic and open-redirect protections.

6. Update and extend tests.
- Add/adjust tests proving non-MFA login remains unchanged.
- Add/adjust tests proving MFA-required transitions to code entry.
- Add/adjust tests for MFA code failure messages (invalid/expired) and retry behavior.
- Add/adjust tests for successful MFA completion and navigation.

7. Run verification suite and document results in PR.
- Run scoped tests and quality gates listed below.
- Record any emulator constraints (if present) and how they were handled in tests.

## Risk checks
- Regression risk: non-MFA users accidentally forced into MFA UI.
- UX risk: generic error still shown for MFA-required in one sign-in path (especially Google fallback paths).
- State risk: pending flag not reset after resolver failures, causing disabled UI dead-end.
- Security risk: leaking whether an account exists via MFA-specific wording; keep primary credential failures generic.
- Consistency risk: firm flow diverges from admin flow and reintroduces maintenance drift.

## Verification commands
- pnpm --filter @siapp/web test -- apps/web/src/surfaces/firm/auth/LoginPage.test.tsx
- pnpm --filter @siapp/web test -- apps/web/src/routes/dashboardRouter.test.tsx
- pnpm --filter @siapp/web lint
- pnpm --filter @siapp/web typecheck
- pnpm turbo test lint typecheck --filter=@siapp/web

## Test plan
- Unit/component tests:
  - Login success without MFA (email/password) still redirects correctly.
  - Login success without MFA (Google) still redirects correctly.
  - MFA-required from email/password enters MFA challenge view.
  - MFA-required from Google enters MFA challenge view.
  - TOTP invalid code shows friendly retryable error.
  - TOTP expired code shows friendly retryable error.
  - TOTP success resolves sign-in and navigates to safe next route.
  - Cancel/back from MFA challenge returns to sign-in form and clears challenge-specific errors.
- Accessibility checks:
  - Alert and field error semantics remain screen-reader visible (role=alert, aria-describedby links).
- Rules tests:
  - None required; no Firestore/Storage rule behavior changes.

## Out of scope
- Any admin auth refactor or admin MFA UX changes.
- Any change to Firebase project MFA enrollment policy/configuration.
- Any Firestore schema, claims model, or security rule updates.
- Any auth-provider migration or introduction of SMS MFA.

## Risks and open questions
- Open question: the current workspace copy already shows MFA logic in firm LoginPage; confirm whether Issue #96 refers to an older branch/state or to a specific unhandled path (for example Google redirect-return MFA).
- Open question: should firm dashboard support redirect-return MFA handling explicitly (as admin does) or is popup-based handling sufficient for accepted browsers?

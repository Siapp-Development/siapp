# impl-63 — Admin TOTP MFA enrolment + sign-in challenge

**Issue:** [#63](https://github.com/Siapp-Development/siapp/issues/63) · **Depends on:** #10 (admin panel), Identity Platform TOTP MFA enabled on the Firebase project

## Problem

The admin surface requires `sign_in_second_factor` on the ID token outside the emulator (#10: SSO + MFA), but:

1. **Bootstrap catch-22** — no MFA enrolment flow existed and `signInWithGoogle` didn't handle `auth/multi-factor-auth-required`, so no admin could ever satisfy the gate in production.
2. **Silent dead-end** — `AdminLoginPage` only redirected on `signedIn`; in `mfaRequired`/`notAdmin` states it re-rendered the Google button with no message. A successful sign-in looked like a broken redirect.

## Design

### State machine (AdminAuthProvider)

New state: `{ status: 'mfaChallenge'; resolver: MultiFactorResolver }` — entered when `signInWithPopup` throws `auth/multi-factor-auth-required` (i.e. the account has an enrolled factor). New actions:

- `completeMfaSignIn(code)` — finds the TOTP hint on the resolver, builds `TotpMultiFactorGenerator.assertionForSignIn`, resolves; `onIdTokenChanged` then lands `signedIn` with the second-factor claim.
- `cancelMfaChallenge()` — back to `signedOut`.

### Flows

**First sign-in (no factor):** Google popup → token has `isAdmin` but no second factor → `mfaRequired` → `AdminRequireAuth` renders `AdminMfaEnrollScreen` (QR via `qrcode.react` + manual secret key + 6-digit verification). Firebase only stamps `sign_in_second_factor` at *sign-in* time, so after enrolment the user is signed out (with a sessionStorage flag that surfaces a "sign in again" note on /login).

**Subsequent sign-ins:** popup throws `auth/multi-factor-auth-required` → `mfaChallenge` → code form on /login → `resolveSignIn` → `signedIn`.

**Edge (factor enrolled elsewhere, session without second factor):** blocking screen asking to sign out/in.

### Login page fix

`/login` now redirects to `/` for `signedIn`, `notAdmin`, **and** `mfaRequired`, so `AdminRequireAuth` renders the appropriate blocking/enrolment screen — no more silent dead-end.

### Emulator behavior

Unchanged: the MFA gate is skipped when `shouldUseEmulators` is true (the auth emulator cannot complete TOTP sign-ins). Tests stub `VITE_USE_EMULATORS=false` because Vitest loads `.env.local`.

## Prerequisite (done for siapp-prod)

TOTP MFA must be enabled on the Identity Platform config. Applied via:

```bash
TOKEN=$(gcloud auth print-access-token)
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: siapp-prod" \
  -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/siapp-prod/config?updateMask=mfa" \
  -d '{"mfa":{"state":"ENABLED","providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":5}}]}}'
```

## Dependency note

`qrcode.react` added to apps/web — QR rendering for the otpauth:// enrolment URI cannot be done with existing deps; it is dependency-free and renders SVG.

## Files

- `apps/web/src/surfaces/admin/auth/AdminAuthProvider.tsx` — mfaChallenge state, resolver handling
- `apps/web/src/surfaces/admin/auth/AdminMfaEnrollScreen.tsx` — new enrolment screen
- `apps/web/src/surfaces/admin/auth/AdminRequireAuth.tsx` — routes mfaRequired to enrolment/re-sign-in
- `apps/web/src/surfaces/admin/auth/AdminLoginPage.tsx` — state redirects + TOTP code form
- `apps/web/src/routes/adminRouter.test.tsx` — 5 new tests

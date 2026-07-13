---
title: "Impl plan — #2 Firebase repo-side config"
status: accepted
updated: 2026-07-12
---

# Implementation Plan — Issue #2 (repo-side half)

Cloud side is done (project `siapp-prod`, Firestore/Auth/Storage in asia-southeast1, 3 Hosting sites, web app registered). This plan covers only the repo config.

**Branch:** `feat/2-firebase-config`, stacked on `feat/1-frontend-scaffold` (PR #28, unmerged). PR bases on that branch, not `main`.

## Deliverables

1. `.firebaserc` — default project `siapp-prod`; hosting targets `apex` → `siapp-prod`, `dashboard` → `siapp-prod-dashboard`, `admin` → `siapp-admin`.
2. `firebase.json` — three hosting target entries with placeholder public dirs (`public/apex`, `public/dashboard`, `public/admin` — app shells are ticket #5); `firestore.rules` + `firestore.indexes.json` refs; `storage.rules` ref; emulator config with fixed ports: auth 9099, firestore 8080, storage 9199, hosting 5000/5001/5002, UI 4000.
3. `firestore.rules` — deny-all baseline (full harness is ticket #6).
4. `storage.rules` — deny-all baseline.
5. `firestore.indexes.json` — empty baseline (`{"indexes":[],"fieldOverrides":[]}`).
6. `.env.example` — `VITE_FIREBASE_*` public config (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) + `VITE_USE_EMULATORS=false`. Add `!.env.example` to `.gitignore` (current `.env.*` glob would ignore it). Web config is public-safe, not a secret.
7. `src/lib/firebase.ts` — read env via `import.meta.env`, validate required keys (typed error on missing), `initializeApp`, export named `app`, `auth`, `db`, `storage`; connect emulators only when `import.meta.env.DEV && VITE_USE_EMULATORS === 'true'`. Config parsing lives in a pure, testable helper.
8. `src/lib/firebaseConfig.test.ts` — co-located test of config parsing/validation only (no network, no SDK internals).
9. `npm i firebase` (prod dep).

## Out of scope

Custom domains (#8), app shells/route trees (#5), real security rules (#6), README changes.

## Risks / notes

- Placeholder public dirs need a committed placeholder file each (`index.html` stub) so `firebase deploy` targets resolve; keep them minimal.
- Emulator connect guarded so production builds never touch emulators.

## Validation gate

`npm run build`, `lint`, `typecheck`, `test` green on the branch.

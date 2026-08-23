---
status: draft
issue: 104
title: Profile photos, deterministic accessible avatars, Profile settings screen, collapsible sidebar
surface: dashboard.siapp.app (firm app) — with a shared @siapp/ui Avatar primitive
---

# Impl 104 — Profile photos, accessible avatars, Profile settings, collapsible sidebar

## Goal
Deliver related firm-app improvements from issue #104: (1) let a signed-in user upload a
profile photo that renders on their avatar everywhere, falling back to initials when unset;
(2) **display OTHER workspace members' profile photos too** wherever their avatar renders — most
importantly Home dashboard task-card assignees and the Team settings member list — again falling back
to initials + colour when a member has no photo (per the human requirement: "I want to also display
other users' profile photos if they uploaded them. Otherwise, initials + colors.");
(3) give every user a **deterministic, WCAG 2.1 AA-compliant** avatar background/foreground colour
derived purely from their `uid`; (4) on the Home dashboard task cards, show assignee **avatars only**
(drop the assignee name text); (5) add a new **Profile settings** screen reached by clicking the
sidebar avatar; and (6) make the firm sidebar **collapsible** with full interactive/accessible state
handling and persistence. All UI lives on the firm surface `dashboard.siapp.app/:workspaceSlug/*`,
with the reusable Avatar primitive placed in `packages/ui` per **D-038** (design system in
`@siapp/ui`) and coloured from tokens per **D-039** (all pairs ≥ 4.5:1). Cross-user photos are made
readable by **denormalising each member's `photoUrl` onto their workspace-scoped member doc**
(`workspaces/{wid}/members/{uid}`) via a new backend trigger — because `users/{uid}` is owner-only
readable, member docs are the only member-readable source of a teammate's name + photo (they already
mirror `displayName`). Bundle isolation across surfaces (**D-036 / D-037**) is preserved: nothing here
is imported into the `/p` or `/t` client bundles. This maps to the MVP firm-app UX polish track; no
new product surface is introduced.

## Key facts established during research (binding constraints)
- **`users/{uid}` already supports a photo field.** `IUserDoc` (packages/shared/src/firestoreTypes.ts)
  has `photoUrl?: string` (note: lowercase-`Url`). `firestore.rules` `validUserProfile()` already
  validates `photoUrl` as an optional string, and both the `create` and `update` allowlists on
  `match /users/{uid}` already include `photoUrl` and `displayName`. **A user can already write its own
  `displayName` + `photoUrl` with the current rules** — no rules change is needed *unless* we add a new
  stored field (e.g. `avatarColor`).
- **Recommendation: derive avatar colour, do NOT store it.** The colour is a pure function of `uid`;
  storing it would require expanding the `users/{uid}` rules allowlist + `validUserProfile` and buys
  nothing. Keep it a pure util in `@siapp/ui`. (Tradeoff noted in Open Questions.)
- **Member docs are the cross-user photo source — they must gain a `photoUrl`.** `IMemberDoc` has no
  photo today; `match /workspaces/{wid}/members/{memberUid}` is `read: if isFirmMember(wid)` /
  `write: if false` (server-only, **no field-level validation function**). Task assignees
  (`ITaskUserAssignee`) carry only `{ type, id, name }` — **no photo is denormalised on the task**.
  Because `users/{uid}` is **owner-only readable** (`allow get: if request.auth.uid == uid; list: if
  false`), a member CANNOT read a teammate's `users/{uid}` doc. So to show *other* users' photos we
  **denormalise `photoUrl` onto the member doc** (member docs are already member-readable and already
  mirror `displayName`). This mirrors the existing `displayName` denorm pattern and needs a new backend
  trigger (see Propagation). Rendering then joins task-assignee `uid` → member doc `photoUrl`.
- **No Firestore rules change is required for member `photoUrl`.** The members block writes are
  `if false` (Admin-SDK only) with **no field allowlist / no `validMember()` function**, so a new
  server-written field needs no rules edit. Member READ stays `isFirmMember(wid)` (workspace-scoped,
  unchanged). `users/{uid}` read stays owner-only, unchanged. (A Tester rules assertion still confirms
  members remain readable only within the workspace and may carry `photoUrl`.)
- **Storage read scope MUST be signed-in-wide (not owner-only).** Since other workspace members now
  render each other's photos, `avatars/{uid}/…` needs `allow read: if isSignedIn()`. This is an
  accepted low-sensitivity tradeoff (avatars are not workspace-scoped by path). Owner-only write/delete
  unchanged.
- **Storage is configured.** `apps/web/src/lib/firebase.ts` exports `storage` and wires the emulator.
  `storage.rules` today only permits project-document paths — a new `avatars/{uid}/...` block is
  required.
- **Two duplicated initials helpers** exist (`userInitials` in FirmShell, `initials` in
  TasksSection + DashboardTaskCard). The Avatar component must absorb these.
- **Design tokens**: `packages/ui/src/styles/tokens.css` + the `@theme inline` map in
  `globals.css` are the only place colours may be defined (D-039: "no hardcoded hex in components").
  New avatar palette values go in both files.
- **No test setup in `packages/ui`** (no vitest). Avatar unit tests go in `apps/web` (which has
  vitest + RTL), OR introduce vitest to `packages/ui` — see Open Questions.

## Touched surfaces & files

### `packages/ui` (shared design system — D-038)
- **CREATE** `packages/ui/src/components/Avatar.tsx` — the reusable Avatar primitive.
- **CREATE** `packages/ui/src/lib/avatarColor.ts` — deterministic `uid → palette index` hash +
  palette lookup (pure, exported for tests).
- **MODIFY** `packages/ui/src/index.ts` — export `Avatar`, `IAvatarProps`, and the
  `avatarColorForSeed` / palette helper.
- **MODIFY** `packages/ui/src/styles/tokens.css` — add `--avatar-*` background/foreground pairs.
- **MODIFY** `packages/ui/src/styles/globals.css` — map the new tokens under `@theme inline` so
  `bg-avatar-*` / `text-avatar-*` utilities exist (only if we choose the token+class approach; see
  Avatar section for the inline-style alternative).

### `packages/shared` (shared types)
- **MODIFY** `packages/shared/src/firestoreTypes.ts` — add `photoUrl?: string` to `IMemberDoc` (the
  member-readable mirror of each teammate's photo; `displayName` is already mirrored there).
- **MODIFY** `packages/shared/src/constants.ts` — add `MAX_AVATAR_SIZE_BYTES` and
  `AVATAR_ALLOWED_MIME_TYPES` (mirrored into `storage.rules`; see Rules).

### `backend/functions` (photo propagation to member docs)
- **CREATE** `backend/functions/src/triggers/syncMemberProfile.ts` — new `onDocumentWritten
  users/{uid}` handler that fans out the user's current `photoUrl` (and `displayName`) to every
  `workspaces/{wid}/members/{uid}` doc they belong to. Uses the Admin SDK (bypasses rules), with a
  no-op guard analogous to `isClaimsNoOp`. Placed alongside `triggers/syncMemberClaims.ts`.
- **MODIFY** `backend/functions/src/index.ts` — import + export the new trigger as
  `onUserProfileWrite = onDocumentWritten('users/{uid}', syncMemberProfile)`.
- **MODIFY** `backend/functions/src/admin/provisionWorkspace.ts` — seed `photoUrl` on the first owner
  member doc from the existing `users/{ownerUid}` doc / Auth `photoURL` if present.
- **MODIFY** `backend/functions/src/callables/invites.ts` — in `acceptInvite`, seed `photoUrl` on the
  new member doc from the accepting user's `users/{uid}` doc / Auth `photoURL` if present.

### `apps/web` — firm surface
- **MODIFY** `apps/web/src/surfaces/firm/FirmShell.tsx` — replace the footer initials chip with
  `<Avatar>` (photo from `state.user.photoURL`), make it a link/button to the Profile screen, add the
  collapsible behaviour + toggle, and add the `settings/profile` route.
- **CREATE** `apps/web/src/surfaces/firm/settings/ProfileSettingsPage.tsx` — the new Profile screen.
- **CREATE** `apps/web/src/surfaces/firm/settings/useUpdateProfile.ts` — hook that uploads the photo
  to Storage, updates Firebase Auth (`updateProfile`), and mirrors to `users/{uid}` in Firestore.
- **MODIFY** `apps/web/src/surfaces/firm/settings/SettingsLayout.tsx` — add a **Profile** tab
  (visible to all roles) to the settings sub-nav.
- **CREATE** `apps/web/src/surfaces/firm/useSidebarCollapsed.ts` — `useState` + `localStorage`
  persistence hook (non-sensitive UI state only — respects D-007: never store tokens there).
- **MODIFY** `apps/web/src/surfaces/firm/dashboard/DashboardTaskCard.tsx` — swap the initials span for
  `<Avatar size="sm" photoUrl={memberPhoto} seed={assignee.id} name={assignee.name}>`, **remove the
  assignee name text** and the `+N` name suffix (keep an overflow avatar count / `+N` chip), delete the
  local `initials()` helper. Resolve each user-assignee's photo by joining `assignee.id` → member map
  (see hook below). Collaborator assignees have no member doc → initials + colour only.
- **MODIFY** `apps/web/src/surfaces/firm/dashboard/DashboardSection`/Home container (the component that
  renders `DashboardTaskCard`, e.g. `TasksSection`/dashboard page) — fetch the workspace member map and
  pass a `uid → photoUrl` lookup (or the `IMemberRow[]`) down to each `DashboardTaskCard`.
- **REUSE** `apps/web/src/surfaces/firm/settings/useTeamData.ts` `useMembers(workspaceId)` — it already
  subscribes to `workspaces/{wid}/members` and returns `IMemberRow[]`. Add `photoUrl` to `IMemberRow`
  + `mapMember`, and derive a `Map<uid, IMemberRow>` for the join. (If importing a settings hook into
  the dashboard feels wrong, extract a small shared `useMembers` into a neutral firm hooks location —
  same query, no new read path. Decide during Builder; either keeps the read rules-provable.)
- **MODIFY** `apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx` — migrate the per-assignee
  initials chips to `<Avatar>`; resolve user-assignee photos from the member map here too; delete the
  local `initials()` helper (consolidation).
- **MODIFY** `apps/web/src/surfaces/firm/settings/TeamSettingsPage.tsx` — add an `<Avatar photoUrl=…
  seed={member.uid} name={member.displayName}>` before each member's display name (photo → initials
  fallback). Uses the `photoUrl` now on `IMemberRow`.
- **OPTIONAL / consistency** `apps/web/src/surfaces/admin/AdminShell.tsx` — add an `<Avatar>` for the
  admin user (currently raw email text). Only if we want admin parity — flag with human; keep the
  admin bundle isolated.
- **CREATE** tests (see Test plan) under `apps/web/src/.../*.test.tsx`.

### Rules
- **MODIFY** `storage.rules` — add an `avatars/{uid}/{fileName}` match block. **`allow read: if
  isSignedIn()`** is now required (cross-user photos), not just for self.
- **`firestore.rules` — NO change required for member `photoUrl`.** The members block is `write: if
  false` (Admin-SDK only) with no field allowlist, so the new server-written field needs no rules edit;
  member READ stays `isFirmMember(wid)`, `users/{uid}` read stays owner-only. (Only touch firestore.rules
  if we ever store `avatarColor` — recommended: do NOT.)

### Shared
- **MODIFY** `packages/shared/src/constants.ts` — `MAX_AVATAR_SIZE_BYTES` + `AVATAR_ALLOWED_MIME_TYPES`
  (mirrored into `storage.rules` per the existing mirror pattern, with a rules parity test), so
  client-side validation matches the rules. (`IMemberDoc.photoUrl` type change is listed under
  `packages/shared` above.)

## Data model changes
- **No new Firestore collection.** The signed-in user's own profile lives on `users/{uid}` (**D-021**:
  `users/` is one of only two top-level collections, "firm staff Auth profiles"). Cross-user photos are
  denormalised onto the existing member subcollection (below) — no new collection.
- **`users/{uid}.photoUrl` (existing, optional).** Populated when a user uploads a photo. Source of
  truth for the *download URL* is Firebase Auth `photoURL`; we **mirror** it to `users/{uid}.photoUrl`
  (Firestore) so it's readable by the owner and can fan out to member docs, consistent with how
  `displayName` is already mirrored in `upsertOwnProfile`. Both updates happen in `useUpdateProfile`.
- **`workspaces/{wid}/members/{uid}.photoUrl` (NEW, optional).** Add `photoUrl?: string` to
  `IMemberDoc`. This is the **member-readable denormalised copy** of the user's photo — the only
  cross-user source, since `users/{uid}` is owner-only readable. It mirrors the already-denormalised
  `displayName`. Server-written only (Admin SDK): seeded at member creation
  (`provisionWorkspace`/`acceptInvite`) and kept in sync by the new `syncMemberProfile` trigger.
- **Propagation (backend `syncMemberProfile`, `onDocumentWritten users/{uid}`):**
  - Fires on any `users/{uid}` write. No-op guard: skip if neither `photoUrl` nor `displayName`
    changed between `before`/`after` (analogous to `isClaimsNoOp`) to avoid write amplification and
    trigger loops (the fan-out writes member docs, not the user doc, so no self-retrigger).
  - Enumerate the user's workspaces via a **collectionGroup query on `members` where `uid == {uid}`**
    (Admin SDK; the same `COLLECTION_GROUP` index already used by `syncMemberClaims`). This is the
    robust source (custom-claims workspaces map also works but claims can lag; collectionGroup is
    authoritative). For each matched member doc, `set({ photoUrl, displayName }, { merge: true })`
    (omit `photoUrl` / write `FieldValue.delete()` when the user removed their photo).
  - Idempotent and best-effort per member doc; Admin SDK bypasses `write: if false`. Brief propagation
    latency after a photo change is acceptable (Open Questions).
  - Seeding at creation: `provisionWorkspace` reads the owner's `users/{uid}` doc / Auth `photoURL`;
    `acceptInvite` reads the accepting user's; include `photoUrl` on the member `set()` only if present.
- **`displayName` (existing).** Editable from the Profile screen; write to Auth (`updateProfile`) +
  mirror to `users/{uid}.displayName`. The same `syncMemberProfile` trigger keeps member
  `displayName` denorms fresh (a small consistency bonus — previously member `displayName` only
  reflected the value at accept time).
- **Avatar colour: derived, not stored** (recommended). Pure `uid → index` hash; no schema/rules
  change. If product wants owner-overridable colours later, add `avatarColor?: string` to `IUserDoc`,
  extend both `users/{uid}` rules allowlists + `validUserProfile`, and add a rules test — flagged as a
  follow-up, not in this issue.
- **Security-rules implications (Firestore):** **none.** (a) `match /users/{uid}` `update` already
  restricts to `request.auth.uid == uid`, allowlists `photoUrl`/`displayName`, and freezes
  `claimsUpdatedAt`/`createdAt`. (b) `match /workspaces/{wid}/members/{memberUid}` is `read: if
  isFirmMember(wid)` / `write: if false` with **no field allowlist**, so the new server-written
  `photoUrl` needs no rules edit and stays workspace-scoped on read — **multi-tenant isolation is
  preserved** (a member of workspace A cannot read workspace B's member docs). No cross-workspace read
  path is introduced.
- **Security-rules implications (Storage):** new `avatars/{uid}/{fileName}` path. Writes gated to the
  owner (`request.auth.uid == uid`), size-capped, image-mime-allowlisted. Reads: **`isSignedIn()` —
  now required** so other workspace members can render the photo (accepted low-sensitivity tradeoff;
  the object path is per-uid, not workspace-scoped). See Steps for exact rule text.

## Deterministic accessible avatar colour — design
- **Palette:** a curated set of ~8–10 background/foreground pairs, each verified **≥ 4.5:1** for the
  initials text (WCAG 2.1 AA, D-039). Simplest robust approach: **dark saturated backgrounds + white
  (`#ffffff`) foreground** (white-on-dark trivially clears 4.5:1 when the background luminance is low).
  Candidate backgrounds (all pass with white text; finalise exact hex during Builder + assert in test):
  slate-indigo `#3e4c77` (reuse `--primary`), teal `#0f766e`, emerald `#15803d`, terracotta `#a33f2b`
  (reuse `--accent-deep`), ochre `#92600a`, rose `#9f1239`, violet `#6b21a8`, blue `#1d4ed8`,
  cyan `#155e75`, plum `#7c2d6b`. Store as tokens in `tokens.css` (e.g. `--avatar-1-bg`/`--avatar-1-fg`
  … `--avatar-N-bg`/`--avatar-N-fg`).
- **Hash:** a small, stable string hash of `uid` (e.g. FNV-1a or a simple 32-bit rolling
  `hash = (hash * 31 + charCode) | 0`), then `Math.abs(hash) % PALETTE.length`. Must be pure and
  deterministic across sessions/devices. Exported as `avatarColorForSeed(seed: string)` returning
  `{ index, bgVar, fgVar }` (or class names).
- **Contrast is enforced by construction + verified by test.** Add a unit test that computes the WCAG
  contrast ratio for every palette pair and asserts `≥ 4.5`. This is the guardrail that keeps future
  palette edits honest.
- **Token vs inline style:** prefer Tailwind utility classes generated from `@theme inline`
  (`bg-avatar-3 text-avatar-3-fg`) to honour D-039 "no hardcoded hex in components". Because the index
  is dynamic, either (a) map indices to a lookup object of static class strings (Tailwind can't see
  interpolated class names), or (b) apply the resolved CSS custom properties via `style={{
  backgroundColor: 'var(--avatar-3-bg)' }}`. **Recommended: option (a)** — a `const AVATAR_CLASSES:
  string[]` array of full static class pairs so Tailwind's JIT keeps them. Document this in the file.

## New Avatar component — spec (`packages/ui/src/components/Avatar.tsx`)
Props (`IAvatarProps`):
- `name: string` — display name (or email fallback) used to derive initials + `alt`/`aria-label`.
- `seed: string` — the `uid` (or any stable id) used for the deterministic colour. Defaults to `name`
  if omitted.
- `photoUrl?: string | null` — when present and it loads, render the `<img>`; on error or absence,
  fall back to initials + colour.
- `size?: 'xs' | 'sm' | 'md' | 'lg'` — maps to h/w + text size (xs≈h-6, sm≈h-7, md≈h-8, lg≈h-16 for
  the profile preview). Follow the CVA pattern used by `Badge`/`Button`.
- `className?`, and standard `HTMLAttributes<HTMLSpanElement>` passthrough.
Behaviour / a11y:
- Initials: reuse the existing logic (split on whitespace, first 2 parts, `charAt(0).toUpperCase()`,
  fallback `'?'`). Consolidate the two duplicated helpers here.
- When a photo is shown: `<img alt="">` with the wrapper carrying an accessible name, OR
  `alt={name}` — pick one and be consistent (avoid double announcement). Decorative-in-context chips
  (e.g. inside a link that already names the task) should be `aria-hidden` — expose an
  `aria-hidden`/label-less mode via prop or let callers pass `aria-hidden`.
- Photo load failure → graceful fallback to initials (track an `onError` state).
- Deterministic colour via `avatarColorForSeed(seed)`.
- No layout shift: fixed dimensions, `object-cover`, `rounded-full`, `overflow-hidden`.

Call sites to migrate (from grep):
1. `FirmShell.tsx` sidebar footer chip (delete `userInitials`) — **shows current user's photo**.
2. `DashboardTaskCard.tsx` assignee chip — **avatar only, name removed** (delete `initials`);
   **shows other users' photos** via the member-map join (`assignee.id` → member `photoUrl`).
3. `TasksSection.tsx` per-assignee chips (delete `initials`) — also uses the member-map join.
4. `TeamSettingsPage.tsx` member rows — add avatar; **shows each member's photo** from
   `IMemberRow.photoUrl`, initials fallback.
5. `AdminShell.tsx` — optional admin-user avatar (initials-only).

## Profile settings screen — spec
- **Route:** nest under existing settings: `/:workspaceSlug/settings/profile`, added as a child
  `<Route path="profile" …>` in `FirmShell.tsx` and a **Profile** tab in `SettingsLayout.tsx`
  (visible to all roles — unlike Billing which is owner/admin-only). Reuses the existing settings
  layout/chrome (precedent: D-030 branding settings screen shape).
- **Sidebar wiring:** the footer avatar becomes a `NavLink`/`Link` to
  `/:workspaceSlug/settings/profile` with an accessible label ("Your profile") and `aria-current`
  when active; keep the "Sign out" button separate.
- **Editable fields:** `displayName` (text input, required, trimmed, non-empty — mirror the
  `validUserProfile` constraint `displayName.size() > 0`) and **profile photo** (file input →
  client-side validation → preview → upload; plus a **Remove photo** action).
- **Persistence flow (`useUpdateProfile`):**
  1. Validate file client-side against `AVATAR_ALLOWED_MIME_TYPES` + `MAX_AVATAR_SIZE_BYTES`.
  2. Upload to `avatars/{uid}/{uuid}-{filename}` via the exported `storage`; `getDownloadURL`.
  3. `updateProfile(auth.currentUser, { displayName, photoURL })` (Firebase Auth).
  4. Mirror to `users/{uid}` with `updateDoc({ displayName, photoUrl })` (rules already allow).
  5. **Remove photo** = set Auth `photoURL: null` + `users/{uid}.photoUrl` removed/`''`; optionally
     best-effort delete the Storage object (note storage.rules currently makes objects immutable for
     project docs — for avatars we *should* allow owner delete so removal actually frees bytes; decide
     in rules step).
- **States:** loading (submitting), success (toast/inline confirmation + local reflect), and error
  (upload failure, oversize, wrong mime, network). The Auth `User` object's `photoURL`/`displayName`
  update won't automatically re-render `useAuth` state (the token listener doesn't fire on profile
  change) — after a successful update, reflect the new values in the UI by re-reading
  `auth.currentUser` / calling `user.reload()` and lifting the values, or subscribe the sidebar avatar
  to the mirrored `users/{uid}` doc. **Decide the refresh mechanism** (flagged) — simplest is to read
  photo/name from the already-live `users/{uid}` snapshot in `AuthProvider` (extend the existing
  `onSnapshot` in step 2 of AuthProvider to also surface `displayName`/`photoUrl`).

## Collapsible sidebar — spec
- **State:** `useSidebarCollapsed()` — `useState<boolean>` seeded from `localStorage`
  (`siapp:sidebar-collapsed`), persisted on change. UI-only, non-sensitive (D-007 compliant). Guard
  `localStorage` access for SSR/exceptions. Optionally default-collapse under a breakpoint (leave
  responsive auto-collapse as an enhancement / open question).
- **Toggle control:** an accessible `<button>` with `aria-expanded={!collapsed}`,
  `aria-controls` pointing at the nav region, and a dynamic `aria-label`
  ("Collapse sidebar" / "Expand sidebar"). Visible focus ring using `--sidebar-ring`.
- **Layout — expanded (current):** logo, workspace name, nav (icon + label), footer avatar+name +
  Sign out.
- **Layout — collapsed:** narrow rail showing **logo, icon-only nav, avatar icon** (+ a compact
  sign-out icon button). Hide text labels; center icons; keep the active-state left accent bar.
- **Icon-only accessibility:** every collapsed nav item keeps an accessible name — the `NavItem`
  already renders the label; when collapsed, keep the label as an `sr-only` span **and** add a visual
  tooltip (`title` attribute at minimum; ideally a proper tooltip with `aria-describedby`). Preserve
  `aria-current="page"` from `NavLink`.
- **Interactive states (both modes):** define hover, `focus-visible` (ring via `--sidebar-ring`),
  active/pressed, and disabled for nav items, the toggle, the avatar link, and sign-out — using the
  existing `sidebar-*` tokens (no new hex). The current `NavItem` covers hover/active; add explicit
  `focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none` and a pressed
  (`active:`) treatment.
- **Motion:** animate width with a short transition; wrap in
  `motion-reduce:transition-none` to honour `prefers-reduced-motion`.
- **Keyboard/SR:** toggle is tab-reachable and Enter/Space-activatable (native button); collapsing
  must not trap focus or remove the currently focused item from the tab order.

## Steps (ordered, each independently verifiable)

### A. Shared types, constants & rules
1. Add `photoUrl?: string` to `IMemberDoc` in `packages/shared/src/firestoreTypes.ts`. Add
   `MAX_AVATAR_SIZE_BYTES` (e.g. `5 * 1024 * 1024`) and `AVATAR_ALLOWED_MIME_TYPES`
   (`image/png`, `image/jpeg`, `image/webp` — exclude `image/gif`/`svg` for avatars) to
   `packages/shared/src/constants.ts`. Verify exports via `@siapp/shared` barrel. *Verify:* typecheck.
2. Add the `avatars/{uid}/{fileName}` block to `storage.rules`:
   `allow read: if isSignedIn();` (**required** for cross-user photos)
   `allow create: if isSignedIn() && request.auth.uid == uid && request.resource.size <= 5*1024*1024
   && request.resource.contentType in ['image/png','image/jpeg','image/webp'];`
   `allow update, delete: if isSignedIn() && request.auth.uid == uid;` (delete enabled so "remove
   photo" frees bytes — differs deliberately from immutable project docs). Mirror the mime/size
   constants and add a rules parity test. *Verify:* storage rules test suite.
3. **No `firestore.rules` change** for member `photoUrl` (members block is `write: if false`, no field
   allowlist; read stays `isFirmMember(wid)`). (Only if storing colour — NOT recommended — extend
   `users/{uid}` allowlists + `validUserProfile` for `avatarColor`. **Default: skip.**)

### A2. Backend photo propagation to member docs
4. Create `backend/functions/src/triggers/syncMemberProfile.ts`: an `onDocumentWritten users/{uid}`
   handler that (a) no-ops when neither `photoUrl` nor `displayName` changed; (b) runs a
   collectionGroup query `members where uid == {uid}`; (c) `set({ photoUrl, displayName }, {merge})`
   on each member doc (use `FieldValue.delete()` for a removed photo). Admin SDK, best-effort per doc.
   *Verify:* unit test (fan-out to N member docs; no-op guard; photo removal deletes field).
5. Wire it in `backend/functions/src/index.ts` as
   `export const onUserProfileWrite = onDocumentWritten('users/{uid}', syncMemberProfile)`. *Verify:*
   functions build/typecheck.
6. Seed `photoUrl` at member creation: in `admin/provisionWorkspace.ts` read the owner's `users/{uid}`
   doc / Auth `photoURL` and include `photoUrl` on the owner member `set()` if present; in
   `callables/invites.ts` `acceptInvite`, read the accepting user's photo and include it on the new
   member `set()` if present. *Verify:* functions unit tests (seed present when user has a photo).

### B. Avatar primitive (`packages/ui`)
7. Add `--avatar-N-bg` / `--avatar-N-fg` pairs to `tokens.css` and map them under `@theme inline` in
   `globals.css` (or plan for inline-var usage). *Verify:* `bg-avatar-1` resolves in a scratch render.
8. Create `avatarColor.ts`: pure hash + `AVATAR_CLASSES` static class array (Tailwind-safe) +
   `avatarColorForSeed(seed)`. *Verify:* unit test (determinism + contrast).
9. Create `Avatar.tsx` (CVA sizes, photo-with-initials fallback, a11y as specced). Export from
   `index.ts`. Confirm it works uniformly for self and others (photo → initials+colour fallback keyed
   on `seed`/`uid`). *Verify:* component test.

### C. Sidebar collapse (FirmShell)
10. Create `useSidebarCollapsed.ts` (localStorage-persisted). *Verify:* hook test.
11. Refactor `FirmShell.tsx` sidebar: extract a `NavItem` that renders label as `sr-only` +
    `title`/tooltip when collapsed; add the toggle button (`aria-expanded`/`aria-controls`); apply
    width/transition + reduced-motion; add `focus-visible`/`active` states via `sidebar-*` tokens.
    *Verify:* component test (toggle flips `aria-expanded`, persists, labels remain accessible).

### D. Profile screen + wiring
12. Create `useUpdateProfile.ts` (Storage upload + Auth `updateProfile` + Firestore mirror + remove).
    *Verify:* hook test with mocked firebase.
13. Create `ProfileSettingsPage.tsx` (form: displayName + photo upload/preview/remove; loading/error/
    success). Reuse `@siapp/ui` `Input`/`Button`/`Label`/`Alert` + new `Avatar` for preview.
14. Add the `profile` route in `FirmShell.tsx` and the **Profile** tab in `SettingsLayout.tsx`.
15. Replace the sidebar footer initials chip with `<Avatar photoUrl=… seed={uid}>` wrapped in a
    `Link` to `settings/profile`; source `displayName`/`photoUrl` from the live `users/{uid}` snapshot
    (extend `AuthProvider` to surface them) so post-save updates reflect immediately. *Verify:*
    component test.

### E. Dashboard card + other call sites (cross-user photos)
16. Add `photoUrl` to `IMemberRow` + `mapMember` in `useTeamData.ts`; derive a `Map<uid, IMemberRow>`
    helper for joins (or extract a shared `useMembers`). *Verify:* hook test maps `photoUrl`.
17. `DashboardTaskCard.tsx`: replace initials span with `<Avatar size="sm" aria-hidden>`, **remove the
    assignee name text** and the trailing `+N` *name* suffix; join each user-assignee `id` → member
    `photoUrl` (collaborator assignees → initials only); if multiple assignees, render a small avatar
    cluster or a `+N` avatar-count chip (avatars only). Delete local `initials()`. Fetch/pass the
    member map from the dashboard container. *Verify:* component test asserts no assignee **name** text
    renders, and a member with a photo renders `<img>`.
18. Migrate `TasksSection.tsx` chips to `<Avatar>` (member-map join for user assignees), delete its
    `initials()`.
19. Add `<Avatar photoUrl={member.photoUrl} seed={member.uid} name={member.displayName}>` to
    `TeamSettingsPage.tsx` member rows.
20. (Optional) `AdminShell.tsx` avatar — only with human sign-off.

### F. Verify
21. Run typecheck, lint, unit/component/rules tests, functions tests, and build for the firm app.
    Confirm no `@siapp/ui` Avatar import leaks into `/p` or `/t` bundles (D-036/D-037): the
    client/collaborator surfaces must not import it unless intentionally themed.

## Test plan (for Tester)
- **avatarColor (unit):** determinism (same `uid` → same index across calls); distribution sanity;
  **WCAG contrast ≥ 4.5:1 for every palette pair** (compute relative luminance + ratio in the test).
- **Avatar (component):** renders `<img>` when `photoUrl` given and loads; falls back to initials on
  missing URL and on `onError`; initials logic (1 word, 2 words, 3+ words, empty → `?`); correct
  colour class for a known seed; a11y (accessible name / `aria-hidden` mode); size variants.
- **useSidebarCollapsed (hook):** default value, toggle, persistence to/from `localStorage`, resilience
  when storage throws.
- **Sidebar (component):** toggle flips `aria-expanded`; collapsed mode keeps accessible names
  (sr-only + tooltip) and `aria-current`; focus-visible present; reduced-motion class applied.
- **ProfileSettingsPage (component):** displayName validation (empty rejected); file mime/size
  validation rejects bad files; happy-path calls upload + `updateProfile` + Firestore mirror (mocked);
  loading + error + success states; **Remove photo** clears photo.
- **DashboardTaskCard (component):** assignee **name text is NOT rendered**; avatar renders; a
  user-assignee whose member doc has `photoUrl` renders an `<img>` (other users' photos); a
  collaborator assignee / photoless member falls back to initials + colour; overflow `+N` shows as an
  avatar-count chip (not a name).
- **TeamSettingsPage (component):** a member with `photoUrl` renders `<img>`; a member without falls
  back to initials + colour.
- **syncMemberProfile (functions unit):** photo change on `users/{uid}` fans out to every member doc
  found by the collectionGroup query; no-op when neither `photoUrl` nor `displayName` changed; photo
  removal writes a field delete on member docs; runs under Admin SDK (bypasses `write: if false`).
- **Member seeding (functions unit):** `provisionWorkspace` / `acceptInvite` include `photoUrl` on the
  new member doc when the user already has a photo, and omit it when they don't.
- **Storage rules (rules test):** owner can create avatar within size/mime; non-owner denied; oversize
  denied; disallowed mime denied; owner can delete own avatar; other user cannot; **any signed-in user
  can READ another uid's avatar** (cross-user requirement); mime/size constants match `@siapp/shared`
  (parity test).
- **Firestore rules (rules test):** existing `users/{uid}` update with `{displayName, photoUrl}` by
  owner passes; by another uid fails; attempt to set `claimsUpdatedAt` fails (regression guard); a
  workspace member CAN read another member's doc (now carrying `photoUrl`) within the same workspace;
  a non-member / other-workspace principal canNOT read it (isolation guard).

## Out of scope
- **Denormalising `photoUrl` directly onto task assignee snapshots.** We join at render time via the
  member map instead of copying the photo into each task's `assignees[]` — no task-doc schema change,
  no backfill trigger on tasks. (Task-assignee `name` denorm is untouched.)
- **Owner-overridable / user-chosen avatar colour** (would need a stored `avatarColor` field + rules).
- **Avatar virus-scan pipeline** parity with document uploads (D-034). Note as a hardening follow-up.
- **Client `/p` and collaborator `/t` surfaces** getting avatars/profile screens. Collaborator
  assignees on task cards render initials + colour only (they have no member doc / photo).
- **Admin shell avatar** unless explicitly approved (kept optional).
- **Image cropping/resizing/compression** before upload (could be a later enhancement).
- **Backfilling `photoUrl` onto pre-existing member docs.** New/edited profiles propagate via the
  trigger going forward; existing members without a recent `users/{uid}` write show initials until
  their next profile change. A one-off backfill (touch each `users/{uid}`) is a separate op if needed.
- Any change to auth, claims, workspace membership, or billing.

## Risks / open questions (need a human call)
1. **Colour: derived vs stored?** Recommendation = **derived** (pure `uid` hash, zero schema/rules
   change). Confirm we don't need user-selectable colours in MVP.
2. **Cross-user photos — DECIDED IN SCOPE.** Other members' photos now render on dashboard task cards
   and the team list, sourced by denormalising `photoUrl` onto member docs via the new
   `syncMemberProfile` trigger (`users/{uid}` is owner-only readable, so the member doc is the only
   member-readable source). **Accepted tradeoff:** brief propagation latency after a user changes their
   photo (the trigger fan-out is eventually consistent), and Storage avatar reads widen to any signed-in
   user. Confirm both are acceptable. *(Also confirm: skip a one-off backfill of `photoUrl` onto
   existing member docs, or run one so current teammates' photos appear immediately.)*
3. **Avatar unit tests location.** `packages/ui` has no vitest. Put Avatar/colour tests in `apps/web`,
   or introduce vitest to `packages/ui`? (Recommend: add a minimal vitest config to `packages/ui` so
   the primitive is tested where it lives; needs a small tooling decision.)
4. **Profile-change propagation.** Firebase Auth `updateProfile` does not re-fire the `onIdTokenChanged`
   listener, so `useAuth().state.user` won't auto-update. Recommended fix = surface
   `displayName`/`photoUrl` from the already-live `users/{uid}` snapshot in `AuthProvider`. Confirm this
   approach (it slightly widens `TAuthState`).
5. **Storage read scope for avatars.** Proposed `allow read: if isSignedIn()` (any signed-in principal,
   including portal/collab tokens). Acceptable for low-sensitivity avatars? If avatars must be
   firm-only, tighten to `isFirmMember`-style — but avatars aren't workspace-scoped, so a per-uid path
   with signed-in read is simplest. Confirm.
6. **Avatar delete in Storage.** We propose allowing owner `delete` on `avatars/{uid}/*` (so "remove
   photo" frees bytes) — this deliberately differs from the immutable project-document rule. Confirm
   that's fine, or keep objects and just null the `photoURL` pointer.
7. **Sidebar collapse persistence scope.** Per-device `localStorage` (recommended, simple) vs synced to
   `users/{uid}` (cross-device, but adds a write path). Recommend localStorage.
8. **Multi-assignee dashboard display.** Confirm the avatars-only overflow treatment (cluster of
   avatars + `+N` chip) matches the desired Home design.

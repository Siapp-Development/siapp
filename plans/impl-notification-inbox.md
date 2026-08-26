# impl — In-app Notification inbox (firm members)

GitHub issue: _to be created (see Step 1)._ Suggested title: **feat: in-app notification inbox for firm members (bell + popover)**. Branch: `feat/<issue#>-notification-inbox` off latest `main`; commit this plan copy alongside the code.

Surface: **firm app only** (`dashboard.siapp.app`, `apps/web` firm surface) + **backend** (`backend/functions`) + Firestore rules/indexes. No client `/p`, collaborator `/t`, marketing apex, or `admin.siapp.app` code is touched, so URL-surface (D-036) and physical bundle isolation (D-037) are preserved by construction.

> **Decision-log note / flag:** No logged decision (`pm_ux/plans/decisions-log.md`, D-001…D-042) governs an in-app notification inbox — this channel is net-new and does **not** contradict any binding decision. It deliberately sits **outside** the outbound WhatsApp/SMS pipeline, which is what **D-035** (messaging is outbound-only), **D-013** (WA+SMS are the only *client-facing* channels), and **D-027** (project `lifecycle` + quiet-hours gate outbound sends) constrain. In-app notifications for firm members are a distinct internal channel and are intentionally independent of `lifecycle`, consent, opt-out, and quiet hours. Department need-to-know (**D-025**, `restrictedToDepartments`) **is** binding and is honoured at fan-out time. The common mislabel "D-036 bundle isolation" is really **D-037**; both are respected.

---

## Goal

Give firm members (dashboard / `FirmShell` users only) a per-workspace, in-app **notification inbox** surfaced as a **bell + popover** in the firm sidebar, so they see mentions, assignments, watched-task activity, collaborator/client actions, due-soon/blocked tasks, and project-lifecycle changes without relying on WhatsApp. Recipients are resolved **server-side** with department need-to-know (D-025) applied and the actor excluded, and per-user notification documents are written under each recipient's member subcollection (Option A fan-out). The bell shows a **boolean red dot** when any unread exists; clicking a row marks it read and deep-links to the existing task/project view. Clients (`/p`) and collaborators (`/t`) are **not** recipients. This is an MVP-quality internal-collaboration feature; it is independent of the outbound WhatsApp pipeline and its quiet-hours/opt-out gating.

---

## Touched surfaces & files

### `packages/shared` (types — additive)
- **Modify** `packages/shared/src/enums.ts` — add `export type TNotificationKind = …` (the inbox event kinds; distinct from the WhatsApp `TNotificationTrigger`, which stays for outbound templates).
- **Modify** `packages/shared/src/firestoreTypes.ts` — add `export interface INotificationDoc { … }` next to `IProjectActivityDoc`.
- Barrel `packages/shared/src/index.ts` already re-exports both files — no change.

### Firestore rules & indexes
- **Modify** `firestore.rules` — add `match /members/{memberUid}/notifications/{nid}` inside the existing `match /workspaces/{wid}` → `match /members/{memberUid}` block (currently `firestore.rules:611-614`).
- **Modify** `firestore.indexes.json` — add the (defensive) composite index for a `read == false` + `at desc` query if we adopt the filtered-ordered variant (see Data model).

### Backend (`backend/functions`)
- **Create** `backend/functions/src/lib/notificationFanout.ts` — pure/testable helpers: activity-action→`TNotificationKind` map, recipient resolution (assignees / prior commenters / mentioned uids / project participants), department-gating predicate (mirrors `canSeeRestrictedList`), actor exclusion, dedupe/kind-priority, and the denormalized notification builder + `createNotification`/`trimNotifications` write helpers.
- **Create** `backend/functions/src/triggers/notifyInboxOnActivity.ts` — `onDocumentCreated('workspaces/{workspaceId}/projects/{projectId}/activity/{activityId}')` → maps assignment / status-change / blocked / client-document-upload / collaborator note / collaborator need-help / project-lifecycle activity docs to notifications.
- **Create** `backend/functions/src/triggers/notifyInboxOnComment.ts` — `onDocumentCreated('workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/updates/{updateId}')` → mention + watcher notifications for `action: 'comment'` docs (this is where `payload.mentions` lives — see Risks).
- **Modify** `backend/functions/src/scheduled/dueSoonSweep.ts` — additionally fan out **in-app** due-soon/overdue notifications to task assignees **independent of** the `sendWhatsapp` gate used for WhatsApp (reuse iteration + `resolveNotify`, but do not reuse `isDueSoonCandidate`'s `sendWhatsapp===true` filter for the in-app path).
- **Modify** `backend/functions/src/index.ts` — export/register the two new triggers (region already set via `import './globalOptions.js'`).

### Firm app (`apps/web/src/surfaces/firm/notifications/` — new folder)
- **Create** `useNotifications.ts` — realtime first page (`onSnapshot`, `orderBy('at','desc')`, `limit(30)`) + "Load more" (`getDocs` + `startAfter`), mirroring `useProjectActivity.ts`. Exposes `markRead(id)` and `markAllRead()`.
- **Create** `useUnreadNotifications.ts` — cheap red-dot existence subscription (`where('read','==',false)`, `limit(1)`).
- **Create** `notificationLabels.ts` — `TNotificationKind → { icon, title(row), body(row) }` render map (mirrors `activityLabels.ts`); builds the deep-link from `projectId`/`taskId` + current `workspaceSlug`.
- **Create** `NotificationBell.tsx` — real `<button>` with unread-aware accessible name + red dot; owns popover open state.
- **Create** `NotificationPanel.tsx` — popover panel: realtime list, date grouping (Today / Earlier), "Load more", "Mark all as read", loading / empty / error states, focus management.
- **Create** `NotificationItem.tsx` — one row as a keyboard-operable link/button; marks-one-read on click then navigates.
- **Modify** `apps/web/src/surfaces/firm/FirmShell.tsx` — mount `<NotificationBell workspaceId={workspace.id} workspaceSlug={workspace.slug} uid={state.user.uid} />` in the sidebar header (near the workspace name / collapse control, `FirmShell.tsx:157-174`).

### Tests (co-located)
- `apps/web/src/surfaces/firm/notifications/useNotifications.test.ts`
- `apps/web/src/surfaces/firm/notifications/useUnreadNotifications.test.ts`
- `apps/web/src/surfaces/firm/notifications/NotificationPanel.test.tsx`
- `apps/web/src/surfaces/firm/notifications/NotificationBell.test.tsx`
- `apps/web/src/surfaces/firm/notifications/NotificationItem.test.tsx`
- `backend/functions/src/lib/notificationFanout.test.ts`
- `backend/rules-tests/src/notifications-inbox.test.ts` (+ add a `notifications` path to `backend/rules-tests/src/helpers.ts`)

---

## Data model changes

### Collection path
`workspaces/{wid}/members/{uid}/notifications/{nid}` — one document **per recipient per event**. Member docs live at `workspaces/{wid}/members/{uid}` (id = user uid; confirmed `firestore.rules:611`, `IMemberDoc` in `packages/shared/src/firestoreTypes.ts`). Per-workspace inbox falls out naturally: a user in N workspaces has N member docs, hence N inboxes and N unread states.

### `INotificationDoc` (denormalized so a row renders + deep-links with zero extra reads)
```ts
export interface INotificationDoc {
  id: string;
  kind: TNotificationKind;
  at: Date;                     // Firestore Timestamp (serverTimestamp); newest-first ordering key
  read: boolean;                // per-notification read state
  readAt: Date | null;
  actorType: TActorType;        // 'user' | 'collaborator' | 'client' | 'system' | 'admin'
  actorId: string;              // '' for system
  actorNameDenorm: string;
  projectId: string;
  projectNameDenorm: string;
  taskId: string | null;        // null for project-lifecycle notifications
  taskTitleDenorm: string | null;
  excerpt: string | null;       // e.g. comment/note snippet (recipient is already dept-eligible)
  sourceActivityId: string | null; // provenance + idempotency (see dedupe)
}
```
`TNotificationKind` (new, in `enums.ts`):
```ts
export type TNotificationKind =
  | 'mention'
  | 'task_assigned'
  | 'task_comment'                       // watcher: comment/reply on a task you're on / commented on
  | 'task_status_changed'                // incl. collaborator-performed changes
  | 'task_blocked'
  | 'task_due_soon'
  | 'task_overdue'
  | 'client_document_uploaded'
  | 'collaborator_note_added'
  | 'collaborator_need_help'
  | 'project_published'
  | 'project_completed'
  | 'project_archived';
```
The deep-link is **not** stored as a string; the client builds `/{workspaceSlug}/projects/{projectId}?task={taskId}` (task) or `/{workspaceSlug}/projects/{projectId}` (project-only) from `projectId`/`taskId` + the current `workspaceSlug` (known in `FirmShell`). This matches the existing param wiring (`ProjectDetailPage.tsx:184` reads `searchParams.get('task')`).

`restrictedToDepartments` is **not** stored on the notification — gating is resolved at write time, so every doc in a member's inbox is already need-to-know-eligible.

### Security rules (`firestore.rules`, inside `match /members/{memberUid}`)
```
match /notifications/{nid} {
  // owner-only read (NOT the workspace-wide read the parent members doc grants)
  allow read: if isFirmMember(wid) && request.auth.uid == memberUid;

  // client may flip ONLY read/readAt on its own docs
  allow update: if isFirmMember(wid)
    && request.auth.uid == memberUid
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read', 'readAt'])
    && request.resource.data.read is bool;

  // all fan-out is server-only; users never create or delete
  allow create, delete: if false;
}
```
Subcollection matches do **not** inherit the parent `members/{memberUid}` `allow read: isFirmMember(wid)`, so scoping reads to `request.auth.uid == memberUid` is correct and keeps one member from reading another's inbox. Helpers reused: `isFirmMember` (`firestore.rules:63`). Multi-tenant isolation is intact — everything is nested under `workspaces/{wid}` and gated on the workspace claim.

### Indexes (`firestore.indexes.json`)
- Panel list = `orderBy('at','desc')` on a single collection path → **single-field index, auto**; no composite needed.
- Red dot = `where('read','==',false) limit(1)` → **single-field index, auto**; no composite needed.
- "Mark all read" = `where('read','==',false)` (no order) → single-field, auto.
- **Only if** we adopt the combined `where('read','==',false) + orderBy('at','desc')` query, add a composite `{ collectionGroup: "notifications", queryScope: "COLLECTION", fields: [ {read, ASCENDING}, {at, DESCENDING} ] }`. Default plan avoids it; include it defensively and delete if unused.

---

## Steps (each independently verifiable)

1. **Create the GitHub issue** (do not skip; do not create it in this planning pass). Title as above; label `feature`; reference this plan. Branch `feat/<issue#>-notification-inbox` off latest `main`.

2. **Shared types.** Add `TNotificationKind` to `packages/shared/src/enums.ts` and `INotificationDoc` to `packages/shared/src/firestoreTypes.ts`. Verify: `pnpm --filter @siapp/shared build` / typecheck passes and both symbols import from `@siapp/shared`.

3. **Firestore rules + indexes.** Add the `notifications/{nid}` match block and (optional) composite index. Verify: rules compile (`firebase deploy --only firestore:rules --dry-run` locally / emulator loads) and the new rules test (Step 9) passes.

4. **Backend fan-out library** `notificationFanout.ts` (pure, no Admin SDK side-effects in the mapping functions):
   - `kindForActivity(action, actorType)` → `TNotificationKind | null` mapping:
     - `task_assigned` → `task_assigned`
     - `task_status_changed` → `task_blocked` when new status is `blocked`, else `task_status_changed`
     - `client_document_uploaded` → `client_document_uploaded`
     - `collaborator_note_added` → `collaborator_note_added`
     - `collaborator_need_help` → `collaborator_need_help`
     - `project_published` / `project_completed` / `project_archived` → same-named kinds
     - everything else → `null` (ignored)
   - `resolveRecipients(...)` given `{ kind, actorId, taskAssignees, priorCommenterUids, mentionedUids, projectParticipantUids, memberIndex }`:
     - **assignment** → newly-assigned user uids
     - **status-change / blocked / watcher comment** → task assignees (`type:'user'`) ∪ prior commenter uids
     - **mention** → `payload.mentions`
     - **client-document / project-lifecycle** → project participants = distinct task-assignee user uids in the project ∪ project `ownerId`
     - apply department gate `canReceive(memberDoc, restrictedToDepartments)` mirroring `canSeeRestrictedList` (owner/admin, or empty restrictions, or `departments ∩ restricted ≠ ∅`), then **exclude actor** (`uid !== actorId`), then dedupe.
   - `buildNotification(kind, recipientUid, denorm, sourceActivityId)` → `INotificationDoc` payload with `read:false`, `readAt:null`, `at: FieldValue.serverTimestamp()`.
   - `createNotification(db, wid, uid, nid, payload)` → `ref.create(...)` swallowing `ALREADY_EXISTS` (gRPC code 6), same pattern as `writeProjectActivity` (`lib/activityLog.ts`).
   - `trimNotifications(db, wid, uid)` → after a create, delete that recipient's docs beyond the retention cap (latest **100**) and older than **90 days**, bounded query only touching the affected member.
   - Verify: unit tests in Step 9.

5. **Activity trigger** `notifyInboxOnActivity.ts`:
   - `onDocumentCreated` on the project `activity` collection. Read `event.data.data()` (action, actorType, actorId, actorNameDenorm, taskId, taskTitleDenorm, restrictedToDepartments, payload) and `event.params`.
   - Compute `kind = kindForActivity(...)`; bail if `null`.
   - Fetch the project doc (name, `ownerId`) and — for project-lifecycle/client-document kinds — the project's task assignees; fetch candidate **member docs** (`workspaces/{wid}/members/{uid}`) to get each recipient's `role` + `departments` (claims aren't available in triggers; the member doc is the source of truth).
   - `resolveRecipients(...)`, then for each recipient `createNotification` with deterministic `nid = ${activityId}` (one notification per recipient per source event) and `trimNotifications`.
   - Wrap each recipient write in try/catch + `logger.error` so one failure doesn't retry the whole trigger (existing `onTaskWrite` convention).
   - Verify: emulator smoke test — writing a `task_assigned` activity doc creates a doc in the assignee's `notifications` and none in the actor's.

6. **Comment/mention trigger** `notifyInboxOnComment.ts`:
   - `onDocumentCreated` on `.../tasks/{taskId}/updates/{updateId}`; act only on `action === 'comment'`.
   - Read the task doc for `assignees` + `restrictedToDepartments` + title; query the `updates` subcollection for distinct prior commenter uids (`authorType === 'user'`).
   - **Mentions first** (`payload.mentions`), then **watchers** (assignees ∪ prior commenters), both department-gated and actor-excluded. Use `nid = ${updateId}` for both so a mentioned assignee gets exactly **one** doc — the mention `create` wins, the watcher `create` no-ops on `ALREADY_EXISTS` (process order guarantees the `mention` kind survives).
   - `trimNotifications` per recipient.
   - Verify: emulator — a comment mentioning user B who is also an assignee yields one `mention` doc for B; a non-mentioned assignee C gets a `task_comment` doc; the commenting author gets nothing.

7. **Due-soon / overdue** in `dueSoonSweep.ts`:
   - In the existing published-project → task iteration, add an **in-app** path that fans out `task_due_soon` (window `[now, now+24h)`) and `task_overdue` (`dueDate < now`, still open) to the task's **user** assignees, **independent of** `sendWhatsapp` (do not reuse the `isDueSoonCandidate` `sendWhatsapp===true` filter here). Department-gate against each assignee's member doc; exclude nobody special (scheduler has no human actor). Use a deterministic `nid` incorporating the sweep date bucket + task id to avoid duplicate daily notifications (e.g. `duesoon_${yyy-mm-dd}_${taskId}` / `overdue_…`).
   - Verify: unit test on the pure candidate/kind selection + an emulator run creating due-soon docs regardless of the WhatsApp toggle.

8. **Register triggers** in `backend/functions/src/index.ts` (export the two `onDocumentCreated` handlers). Verify: `pnpm --filter <functions> build` / typecheck; emulator boots with the new triggers listed.

9. **Tests** (Step-scoped detail in Test plan). Land backend unit tests, rules tests, and frontend hook/component tests.

10. **Frontend data layer.** Implement `useNotifications.ts` (realtime + pagination, `markRead`, `markAllRead`), `useUnreadNotifications.ts`, and `notificationLabels.ts`. `db` from `@/lib/firebase.ts`; discriminated-union state (`loading | error | ready`) as in `useProjectActivity.ts`. `markRead(id)` → `updateDoc(ref, { read:true, readAt: serverTimestamp() })`; `markAllRead()` → query unread (≤100, matches retention cap) → `writeBatch` set `read:true`/`readAt`. Verify: hook tests.

11. **Frontend components.** `NotificationBell.tsx`, `NotificationPanel.tsx`, `NotificationItem.tsx` — PascalCase files, function-declaration components, named exports, path alias `@/`. Prefer an existing `@siapp/ui` popover primitive (handles focus trap / Escape / restore-focus) if one exists; otherwise implement focus management by hand (see a11y). Row click → `markRead(id)` then `navigate(deepLink)` and close the panel. Verify: component tests + manual keyboard pass.

12. **Wire into `FirmShell.tsx`.** Mount the bell in the sidebar header (`FirmShell.tsx:157-174`), passing `workspace.id`, `workspace.slug`, `state.user.uid`. Verify: bell renders on every firm route, red dot reflects unread, popover opens/closes, deep-link navigates and lands on the right task (`ProjectDetailPage` opens `TaskDetailPanel` from the `task` param).

13. **Full verification.** `pnpm build` + lint + typecheck + all test suites (incl. `test:rules` via emulator). Confirm no client/collaborator/marketing/admin bundle imports changed (D-037).

---

## Test plan (for Tester)

**Backend unit — `notificationFanout.test.ts`** (pure functions, no emulator):
- `kindForActivity`: each mapped action → expected kind; `task_status_changed` into `blocked` → `task_blocked`; unmapped actions → `null`.
- `resolveRecipients`: assignment/status/comment/mention/lifecycle recipient sets; **department gating** — a restricted task excludes a member whose `departments` don't intersect and includes owner/admin + empty-restriction cases (mirror `activity.test.ts` seeding of a `restrictedToDepartments:[DEP_FINANCE]` entry); **actor exclusion** (actor never in output); **dedupe** — a uid appearing as both assignee and prior commenter yields one entry; **mention priority** — mentioned assignee resolves to `mention`, not `task_comment`.
- `trimNotifications` selection logic (which ids exceed 100 / older than 90 days).

**Firestore rules — `backend/rules-tests/src/notifications-inbox.test.ts`** (mirror `activity.test.ts` / `notifications.test.ts` bootstrap; add a `notifications` path to `helpers.ts` `workspacePaths`):
- owner-only read: `request.auth.uid == memberUid` succeeds; another member reading someone else's inbox **fails**; cross-workspace read **fails**.
- update: flipping `read`/`readAt` on own doc **succeeds**; changing any other field (e.g. `kind`, `taskId`) **fails**; updating another user's doc **fails**.
- `create` and `delete` by any client **fail** (server-only).

**Frontend (Vitest + RTL)** — mock `@/lib/firebase.ts` (`{ db:{} }`) and `firebase/firestore` at the SDK boundary with a hoisted `subscriptions` array, per `useProjectActivity.test.ts`:
- `useNotifications`: loading → ready mapping; newest-first order; "Load more" appends a page and de-dupes by id; `markRead`/`markAllRead` issue the expected writes.
- `useUnreadNotifications`: red-dot true when the `limit(1)` unread snapshot is non-empty, false when empty.
- `NotificationBell`: renders a real `<button>`; accessible name reflects unread state ("Notifications, unread" vs "Notifications"); red dot has non-color-only accessible text; opens/closes the panel; Escape closes and restores focus to the bell.
- `NotificationPanel`: empty state, date grouping (Today / Earlier), "Mark all as read" wiring, keyboard operability, focus trap while open.
- `NotificationItem`: click marks-read then navigates to the correct deep link (`/{slug}/projects/{projectId}?task={taskId}`; project-only link when `taskId` is null).

---

## Out of scope (deliberately)

- **Any recipient other than firm members** — clients (`/p`) and collaborators (`/t`) get nothing; no new client/collaborator UI.
- **WhatsApp/SMS changes** — the outbound pipeline (`enqueueNotifications.ts`, quiet hours, consent/opt-out, `messages` queue, dispatcher) is untouched; **WhatsApp send-failure notifications are excluded**.
- **Per-user notification preferences / mute settings** — none exist today and none are added; the existing `NotificationSettingsPage` (workspace quiet hours for WA) is unrelated and untouched.
- **A full notifications page/route**, count badges (only a boolean red dot), email digests, browser push / PWA push, and cross-workspace aggregated inbox.
- **Backfilling** notifications for events that occurred before rollout.
- **Marking read on scroll/hover** — read is set only on explicit click or "Mark all as read".

---

## Risks / open questions

1. **Where `payload.mentions` actually lives.** The brief says mentions live "on the comment activity doc", but the codebase writes comments (with `payload.mentions`) to the task **`updates`** subcollection (`useTasks.ts` `addTaskUpdate`), and `TProjectActivityAction` has **no `comment` action** — comments don't appear in the `activity` feed. This plan therefore triggers mention/watcher fan-out off `.../tasks/{taskId}/updates/{updateId}`. **Builder must confirm** there isn't also a mirror comment→activity write; if there is, choose one source to avoid double-notifying.
2. **"Project members" has no dedicated collection.** Team membership is workspace-level (`members`); project participation is inferred from task `assignees` ∪ project `ownerId`. Client-document and project-lifecycle recipient sets use this inference — confirm it matches product intent (e.g. should a member with zero tasks on the project but who commented be included? currently: prior commenters are included for task-scoped kinds, not for lifecycle kinds).
3. **Fan-out cost.** Resolving recipients reads member docs (for role/departments) and, for lifecycle/client-doc/watcher kinds, task/updates queries. Bounded per event, but confirm acceptable at expected volume; consider caching member role/departments if hot.
4. **Retention trim mechanism.** Plan uses **inline per-recipient trim** (touches only affected members) instead of a global scheduled scan, to keep the 100-doc / 90-day caps cheap. Confirm this is preferred over a daily scheduler; the age cap in particular only runs when a member receives a new notification (a fully inactive inbox won't self-expire until the next event). If strict 90-day expiry is required for dormant inboxes, add a lightweight scheduled sweep — flag for a product call.
5. **Deterministic dedupe vs. legitimate repeats.** Using `nid = activityId`/`updateId` guarantees one notification per source event per recipient. Due-soon/overdue use a date-bucketed `nid` so the daily sweep doesn't re-notify. Confirm we never want two rows from the same source event.
6. **Deep-link to archived/deleted projects.** A notification may outlive its project (lifecycle change, deletion). The panel still shows the row; navigation should degrade gracefully — `ProjectDetailPage` already renders a "could not be loaded / Back to projects" state. No extra handling planned; flag if a friendlier message is wanted.
7. **Mid-life membership/department changes.** If a member loses the workspace claim or a department, rules deny reading the inbox / new fan-out excludes them — existing stale docs simply become unreadable. Acceptable; no active cleanup planned.
8. **`@siapp/ui` popover availability.** Assumed there's a reusable popover primitive with focus-trap/Escape/restore-focus (Radix-based, like `Dialog`). If not, `NotificationPanel` implements focus management directly. Builder to confirm and reuse `packages/ui` per D-038 rather than hand-rolling.
9. **A11y — live-region announcement (tradeoff, needs a call).** New notifications arriving via `onSnapshot` could be announced through an `aria-live="polite"` region. Pro: screen-reader users learn of new items without opening the panel. Con: noisy/interrupting if events are frequent, and the realtime stream can fire often. **Recommendation:** ship without a live region at MVP (the red dot + accessible bell name convey state); revisit if requested. Baseline a11y that **is** in scope: bell is a real `<button>` whose accessible name reflects unread state; the red dot is paired with accessible text (not color-only); popover has focus trap, Escape-to-close, restore-focus-to-bell, and a keyboard-operable list.

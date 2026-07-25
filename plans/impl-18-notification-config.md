# Implementation plan — #18 Notification config + quiet hours

## Context

Issue #18 (M2 — Messaging): per-task control over **what fires, to whom, when**. MVP scope lines (`pm_ux/plans/11-mvp-scope.md`):

- "**Notifications config**: per task, toggle on/off; choose trigger (status change, due-date approaching, blocked); choose recipients (client, internal). **All outbound is gated by `project.lifecycle = 'published'`** — during `draft`, events write a preview record but no message is sent." (D-027)
- "**Quiet hours**: workspace-level setting (default 21:00–08:00 Asia/Kuala_Lumpur); outbound WA queued during quiet hours dispatches at the next 08:00."

**Scope boundary — critical framing.** Issues #19 (outbound Twilio dispatch), #20 (inbound webhook), and #7 (Twilio/Meta prerequisites, not done) are separate. #18 delivers the **configuration layer and the enqueue pipeline only**: settings data model + UI, per-task toggles UI, and Functions-side event handling that writes queue records (`queued` / `suppressed`, with `holdUntil` for quiet hours) into the server-only `messages` collection. **No Twilio call is made anywhere in #18.** The channel dispatch is left as a typed no-op provider interface that #19 implements (D9 below). This matches the docs: the tech architecture (`pm_ux/plans/13-tech-architecture.md` §Messaging) already splits the pipeline into (1) event → outbox write [#18], (2) enqueue/dispatch respecting quiet hours [#18 computes `holdUntil`; #19 acts on it], (3) Twilio send [#19], (4) status callbacks [#20].

What already exists and is reused:

- **Per-task master toggle exists.** `tasks.sendWhatsapp: boolean` is in the data model, `validTaskFields` in [firestore.rules](../firestore.rules) (line ~232), `ITaskDoc` in [packages/shared/src/firestoreTypes.ts](../packages/shared/src/firestoreTypes.ts), mapped in [useTasks.ts](../apps/web/src/surfaces/firm/projects/tasks/useTasks.ts), rendered as the "Send WhatsApp updates for this task" checkbox in [TaskDetailPanel.tsx](../apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx) (~line 646), copied on Duplicate (D-031), and queried by `computePublishPreview` in [setProjectLifecycle.ts](../backend/functions/src/callables/setProjectLifecycle.ts). **#18 extends this, it does not duplicate it** (D2).
- **`messages` collection is already modelled and ruled.** `workspaces/{wid}/messages/{mid}` (outbound WA/SMS log) exists in the data model, `IMessageDoc` in shared types, and firestore.rules (~L559): `read: isFirmMember`, `write: false` (server-only). Status enum `TMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed'`.
- **Trigger/template types exist.** `TNotificationTrigger` (`task_status_change`, `task_due_soon`, …) and `TTemplateVars` in [packages/shared/src/notificationTypes.ts](../packages/shared/src/notificationTypes.ts).
- **`onTaskWrite` Firestore trigger exists** ([backend/functions/src/index.ts](../backend/functions/src/index.ts)) — recomputes project summary + stamps collaborator `lastTaskAt`. #18 adds an enqueue step to the same trigger.
- **Opt-out plumbing exists.** `clients`/`collaborators` carry server-only `notificationsOptOut` (D-035); [backend/functions/src/lib/optOut.ts](../backend/functions/src/lib/optOut.ts) already filters recipients.
- **Workspace doc is client-read, server-write.** firestore.rules: `match /workspaces/{wid} { allow read: if isFirmMember(wid); allow write: if false; }` — quiet-hours edits therefore need a callable (D1), consistent with the `setProjectLifecycle` precedent.
- **No scheduled function exists yet** in `backend/functions` — the due-soon sweep is the repo's first `onSchedule` (D5).
- **Settings surface**: `TeamSettingsPage` at `/{slug}/settings/team` in [FirmShell.tsx](../apps/web/src/surfaces/firm/FirmShell.tsx); a sibling notifications settings route slots in beside it.

**Base branch**: `feat/18-notification-config` off latest `main`. Committed plan copy: `plans/impl-18-notification-config.md`.

**Surfaces touched**: firm app (`dashboard.siapp.app/{slug}`) + backend functions/rules only. Apex, `/p/*` client, `/t/*` collaborator, and admin bundles untouched — bundle isolation (D-036) unaffected; `scripts/check-bundle-isolation.mjs` must stay green.

## Acceptance criteria mapping

| Criterion | Where it lands |
|---|---|
| Per-task toggle; triggers: status change, due-date approaching, blocked | Existing `sendWhatsapp` stays the master switch; new `notify` map on the task doc (D2) + trigger checkboxes in `TaskDetailPanel` notification section |
| Recipients: client, internal | `notify.toClient` / `notify.toInternal` on the task doc (D2/D7) + recipient checkboxes in `TaskDetailPanel`; fan-out resolved server-side at enqueue time |
| Workspace quiet hours (default 21:00–08:00 Asia/Kuala_Lumpur); queued sends dispatch at next 08:00 | `workspaces/{wid}.notifications.quietHours` written via new `updateNotificationSettings` callable (D1); pure `quietHours.ts` lib computes `holdUntil = next window-end` (D6); enqueued docs carry `holdUntil`; actual dispatch-at-08:00 is #19's contract (D9) |
| All gated on `project.lifecycle = 'published'` (D-027) | Enqueue lib reads project lifecycle first; non-published events are written `suppressed: true, suppressedReason: 'lifecycle:<state>'` — the D-027 "preview record, no send" behaviour (D8) |

## Decisions needed — NEED USER APPROVAL

1. **D1 — Quiet hours live on the workspace doc (`notifications` map), edited via a new `updateNotificationSettings` callable, owner/admin only (recommended).** The data model says "workspace-level setting"; the workspace doc is already readable by every member (settings page reads it directly) and client-writes are `false` — a callable preserves that posture, validates the window server-side, and matches the `setProjectLifecycle` precedent for privileged mutations. Field is additive; absent map = defaults (enabled, 21:00–08:00, Asia/Kuala_Lumpur).
   - *Alternative A — open rules-validated direct write on the workspace doc*: first-ever client write path to the workspace doc; rules must diff-guard every other field (plan, seats, allowance). More rules surface for no UX gain. Rejected.
   - *Alternative B — `workspaces/{wid}/settings/{doc}` subcollection*: cleaner isolation but a new collection + rules block + an extra read on every enqueue (functions read the workspace doc anyway for allowance later). Rejected at MVP.
2. **D2 — Per-task config = keep `sendWhatsapp` as the master toggle, add an optional flat `notify` map (recommended).** `notify: { statusChange: bool, dueSoon: bool, blocked: bool, toClient: bool, toInternal: bool }`. Absent map (all existing tasks) = defaults `{ statusChange: true, dueSoon: true, blocked: true, toClient: true, toInternal: false }` so today's behaviour ("toggle on = client gets updates") is preserved with zero backfill. `sendWhatsapp: false` short-circuits everything regardless of `notify` (D8). Keeps `computePublishPreview`'s `where('sendWhatsapp','==',true)` query and Duplicate-copy semantics working unchanged; Duplicate copies `notify` alongside (same "WhatsApp toggles" clause of D-031).
   - *Alternative A — replace `sendWhatsapp` with the map*: touches rules, publish preview query (map fields aren't efficiently queryable), duplicate logic, and every existing test for a cosmetic win. Rejected.
   - *Alternative B — `triggers: string[]` + `recipients: string[]` arrays*: harder to validate in rules (`hasOnly` on list values is clumsy), no default-when-absent story per key. Rejected.
3. **D3 — Queue = the existing `workspaces/{wid}/messages/{mid}` collection, extended; no separate `outbox` collection (recommended).** The tech-architecture doc's "outbox" and the data-model's `messages` log are the same thing at MVP scale — one server-only collection holding queued, suppressed, and (post-#19) sent records. Additive fields: `trigger: TNotificationTrigger`, `suppressed?: boolean`, `suppressedReason?: string`, `holdUntil?: Timestamp` (the issue's "scheduledFor" — named per the data-model doc), `dedupeKey?: string`. `status: 'queued'` covers both ready-now (`holdUntil` absent/past) and held (`holdUntil` future). Rules unchanged: `read: isFirmMember`, `write: false`. This is also what the future Message-previews settings screen (figma prompt §Message previews) reads.
   - *Alternative — separate `outbox/{oid}` collection*: two collections to keep consistent, a migration for #19 to reconcile them, new rules block. The docs use "outbox" as a concept, not a mandated collection. Rejected — **flagging explicitly** since 13-tech-architecture.md names `outbox`; treat this plan as the reconciliation (queue rows live in `messages`).
4. **D4 — Status-change and blocked events source from the existing `onTaskWrite` trigger (before/after status diff), not from `onCreate updates/{updid}` (recommended).** The task doc's `status` field is the single authoritative state; `TaskDetailPanel` writes it directly, and nothing guarantees a matching `updates` doc for every status transition today. Extending `onTaskWrite` (which already exists and already fans out to summary + lastTaskAt) is one trigger, no new listener, and race-free with the status write itself. `blocked` = transition into `status: 'blocked'` (fires `blocked` trigger); any other status transition fires `statusChange`.
   - *Alternative — `onCreate updates` per the data-model trigger table*: matches the doc's wording but depends on the client reliably writing an `updates` doc for every status change — a correctness dependency on client code for a server-side guarantee. Rejected; **flagged as a deliberate divergence** from the data-model doc's trigger table (the doc's *behaviour* — gate, suppress, enqueue — is preserved).
5. **D5 — Due-date-approaching = daily scheduled function at 08:00 Asia/Kuala_Lumpur (`onSchedule('0 0 * * *')` UTC = 08:00 MYT), window "due within the next 24 h", idempotent via deterministic doc ID (recommended).** Runs exactly when quiet hours end, so due-soon messages never need holding. Sweep: iterate workspaces → projects with `lifecycle == 'published'` → per-project `tasks` query `dueDate >= now && dueDate < now+24h` (single-field range, no composite index; `sendWhatsapp`/`notify`/status filters in memory — Admin SDK, MVP scale). Dedupe: message doc ID `dueSoon_{pid}_{tid}_{yyyy-MM-dd}` + `create()` (fails silently if exists) so re-runs and overlapping windows can't double-enqueue.
   - *Alternative — hourly sweep with a "due in 24h" rolling check*: finer granularity nobody asked for, 24× the invocations, and every hit between 21:00–08:00 needs `holdUntil` anyway. Rejected.
   - *Note*: this is the repo's first `onSchedule`. The Functions emulator loads it but does not fire cron; smoke tests invoke the handler directly (see Smoke tests).
6. **D6 — Timezone fixed to `Asia/Kuala_Lumpur` (UTC+8, no DST) with hand-rolled offset math; window times configurable, timezone not (recommended).** MVP is Malaysia-only; +08:00 is constant, so `quietHours.ts` is pure arithmetic (no tz library dependency). The stored shape includes `timezone: 'Asia/Kuala_Lumpur'` as a literal for forward-compat, but the settings UI does not expose it and the lib rejects other values.
   - *Alternative — workspace-configurable tz now*: needs `Intl`-based or library tz math and a picker UI for zero MVP users outside MYT. Rejected; additive later.
7. **D7 — "Internal" recipients = firm-member (`type: 'user'`) assignees on the task, enqueued with a new `recipientType: 'member'`; members without a `users.phone` are skipped with a suppressed record (`suppressedReason: 'no_phone'`) (recommended).** Symmetric with how "client" resolves (the project's linked client) and how collaborator assignment messages already work conceptually. Requires widening `TPhoneRefType`-style unions on the message doc only (`recipientType: 'client' | 'collaborator' | 'member'`) — `phoneIndex` untouched.
   - *Alternative A — internal = all owner/admins*: notifies people with no relation to the task; noisy. Rejected.
   - *Alternative B — internal = in-app only, no queue record*: there is no in-app notification system in MVP scope; would make the toggle a no-op. Rejected.
   - *Open sub-question flagged*: D-013 says WA/SMS are the only **client-facing** channels; WA to firm members is not explicitly decided anywhere. #18 only *enqueues* member records — if #19 decides members shouldn't get WA, the dispatcher skips `recipientType: 'member'` and nothing here changes.
8. **D8 — Suppression vs queueing semantics (recommended):**
   | Condition (checked in this order) | Result |
   |---|---|
   | `task.sendWhatsapp == false`, or the specific trigger/recipient is off in `notify` | **No record at all** — config says "don't", not "would have"; avoids unbounded noise in `messages` |
   | `project.lifecycle != 'published'` | Record with `status: 'queued'` is **not** written; instead `suppressed: true, suppressedReason: 'lifecycle:<state>'` — the D-027 preview record; never dispatched |
   | Recipient `notificationsOptOut == true` | `suppressed: true, suppressedReason: 'opt_out'` (audit trail for the legal requirement) |
   | Recipient unresolvable (no client linked / member has no phone) | `suppressed: true, suppressedReason: 'no_recipient' \| 'no_phone'` |
   | Now inside quiet hours | `status: 'queued'`, `holdUntil: <next window-end (08:00 MYT)>` |
   | Otherwise | `status: 'queued'`, no `holdUntil` |
   - *Alternative*: also write suppressed records for toggle-off events (fullest audit) — rejected: every status change on every non-WA task would write a doc forever.
9. **D9 — #19 consumption contract + provider stub (recommended).** #18 ships `backend/functions/src/lib/messaging/provider.ts`: `interface IMessageProvider { send(msg: IQueuedMessage): Promise<ISendResult> }` (mirrors the tech-architecture "thin MessageProvider" decision) with a `NoopProvider` and **no caller wired to Twilio**. Documented contract for #19's dispatcher: consume `messages` docs where `status == 'queued' && suppressed != true && (holdUntil absent || holdUntil <= now)`; on send, stamp `sentAt`/`twilioSid`/`status`; quiet-hours dispatch-at-08:00 is achieved by honouring `holdUntil` (Cloud Tasks `scheduleTime` or a scheduled sweep — #19's choice).

## Data model & rules changes

Multi-tenant isolation is untouched — every new read/write path is either already-ruled (`workspaces/{wid}` member read, `messages` member read) or server-only (Admin SDK).

**Workspace doc** (`workspaces/{wid}`) — additive, server-written only (D1):

```typescript
notifications?: {
  quietHours: {
    enabled: boolean;        // default true
    start: string;           // 'HH:mm', default '21:00'
    end: string;             // 'HH:mm', default '08:00'
    timezone: 'Asia/Kuala_Lumpur';  // literal at MVP (D6)
  };
}
```

Rules: **no change** (`allow write: if false` stays; reads already allowed to members).

**Task doc** (`.../tasks/{tid}`) — additive, client-written, rules-validated (D2):

```typescript
notify?: {
  statusChange: boolean;   // default true when map absent
  dueSoon: boolean;        // default true
  blocked: boolean;        // default true
  toClient: boolean;       // default true
  toInternal: boolean;     // default false
}
```

Rules: `validTaskFields` gains `'notify'` in the `hasOnly` list + a validator (map with exactly those five bool keys when present).

**Messages doc** (`workspaces/{wid}/messages/{mid}`) — additive, server-written only (D3):

```typescript
trigger: TNotificationTrigger;      // 'task_status_change' | 'task_due_soon' | 'task_blocked' | ...
recipientType: 'client' | 'collaborator' | 'member';  // widened (D7)
suppressed?: boolean;
suppressedReason?: string;          // 'lifecycle:draft' | 'opt_out' | 'no_phone' | 'no_recipient' | ...
holdUntil?: Timestamp;              // quiet-hours hold; absent = dispatchable immediately (by #19)
dedupeKey?: string;                 // mirrors the deterministic doc id for due-soon
```

Rules: **no change** (`read: isFirmMember`, `write: false` stays).

**Shared enums**: `TNotificationTrigger` gains `'task_blocked'`; `notificationTypes.ts` gains `ITaskBlockedVars`. New `TMessageRecipientType` union. Constants: `QUIET_HOURS_DEFAULT = { start: '21:00', end: '08:00', timezone: 'Asia/Kuala_Lumpur' }`, `DUE_SOON_WINDOW_HOURS = 24`.

**Indexes**: none. Due-soon per-project query is a single-field `dueDate` range; everything else is doc gets. `firestore.indexes.json` untouched.

**Backfill**: none. Absent `notify` map and absent `notifications` map both mean "defaults" (D1/D2).

## Steps

### 0. Setup
- Branch `feat/18-notification-config` off up-to-date `main`. Commit this plan file.

### 1. Shared types (`packages/shared/src/`)
- `enums.ts`: add `'task_blocked'` to `TNotificationTrigger`; add `TMessageRecipientType = 'client' | 'collaborator' | 'member'`; add `TSuppressedReason` union.
- `firestoreTypes.ts`: add `INotificationSettings` / `IQuietHours` to `IWorkspaceDoc` (`notifications?`); add `ITaskNotifyConfig` to `ITaskDoc` (`notify?`); extend `IMessageDoc` with `trigger`, `suppressed?`, `suppressedReason?`, `holdUntil?`, `dedupeKey?`, widen `recipientType`.
- `notificationTypes.ts`: add `ITaskBlockedVars` to `TTemplateVars`.
- `constants.ts`: `QUIET_HOURS_DEFAULT`, `DUE_SOON_WINDOW_HOURS`.

### 2. Firestore rules (`firestore.rules`)
- Extend `validTaskFields` with optional `notify` map validation (exact five bool keys). Nothing else changes.

### 3. Functions — quiet-hours + enqueue libs (`backend/functions/src/lib/`)
- `quietHours.ts` (new, pure): `resolveQuietHours(workspaceData)` (defaults when absent), `holdUntilFor(now: Date, qh): Date | null` — overnight-window math in fixed +08:00 (D6). Handles: inside window before midnight → next-day end; inside window after midnight → same-day end; outside window → `null`; `enabled: false` → `null`; boundary instants (21:00 in, 08:00 out).
- `notifyConfig.ts` (new, pure): `resolveNotify(taskData)` → effective config with D2 defaults; `triggersFor(before, after)` → `'statusChange' | 'blocked' | null` from a status diff (D4).
- `enqueueNotifications.ts` (new): `enqueueTaskEvent({ workspaceId, projectId, taskId, trigger, taskData, projectData })` — applies the D8 decision table: resolve config → resolve recipients (client via `project.clientId`; internal via `type:'user'` assignees → `users/{uid}.phone`; collaborators out of scope for these three triggers at MVP — flagged in Risks) → opt-out check (reuse `lib/optOut.ts` logic) → write `messages` docs (batch). Template name + variables filled from `notificationTypes.ts` shapes; `channel: 'whatsapp'`, `costEstimateMyr: WA_UTILITY_COST_MYR`.
- `lib/messaging/provider.ts` (new): `IMessageProvider` + `NoopProvider` (D9). No caller in #18.

### 4. Functions — wiring (`backend/functions/src/index.ts` + new files)
- Extend `onTaskWrite`: after existing summary/lastTaskAt work, compute `triggersFor(before, after)`; when non-null, fetch the project doc once and call `enqueueTaskEvent` (D4). No-op on task create/delete.
- `scheduled/dueSoonSweep.ts` (new) + export `onDueSoonSweep = onSchedule('0 0 * * *', …)` (08:00 MYT): iterate workspaces → published projects → per-project `dueDate` range query → filter (`sendWhatsapp`, `notify.dueSoon`, `status != 'done'`) → `enqueueTaskEvent(trigger: 'task_due_soon')` with deterministic doc IDs (D5).
- `callables/updateNotificationSettings.ts` (new): auth → role check (owner/admin via claims, same pattern as `setProjectLifecycle`) → validate `start`/`end` (`HH:mm`), `enabled` bool, timezone literal → merge `notifications` onto the workspace doc + `updatedAt` (D1). Export from `index.ts`.

### 5. Web — workspace settings UI (`apps/web/src/surfaces/firm/settings/`)
- `useNotificationSettings.ts` (new): subscribe to `workspaces/{wid}` (already member-readable), map `notifications` with defaults; `save()` calls the `updateNotificationSettings` callable.
- `NotificationSettingsPage.tsx` (new): quiet-hours form — enable switch, start/end `<input type="time">`, fixed-timezone note ("Times are in Malaysia time"), explainer line ("Messages triggered during quiet hours are sent at {end} the next morning"). Owner/admin can edit; pm/viewer see read-only values (mirrors `TeamSettingsPage` role gating). Labelled controls, keyboard-operable, `role="status"` save feedback per accessibility instructions.
- `FirmShell.tsx`: add route `settings/notifications` → `NotificationSettingsPage`; add a small settings sub-nav (Team · Notifications) shared by both settings pages rather than a new top-level nav item.

### 6. Web — per-task config UI (`apps/web/src/surfaces/firm/projects/tasks/`)
- `useTasks.ts`: map `notify` onto `ITaskRow` (defaults per D2); include `notify` in create/update payload types and writes.
- `TaskDetailPanel.tsx`: under the existing "Send WhatsApp updates for this task" checkbox, when checked, reveal a fieldset: **Triggers** (Status change / Due date approaching / Blocked) and **Recipients** (Client / Internal team) checkboxes bound to `notify`. Unchecked master toggle disables (not hides) the fieldset with `aria-disabled` semantics. Group labels via `<fieldset>`/`<legend>`.
- `TasksSection.tsx`: new-task creation writes no `notify` map (defaults apply).

### 7. Docs touch-ups (allowed: plan-adjacent, no code)
- None in this ticket beyond the plan file itself. The `outbox`→`messages` reconciliation (D3) and the `onTaskWrite`-vs-`onCreate updates` divergence (D4) should be noted in `pm_ux/plans/decisions-log.md` by the human/PM if approved — flagged here, not edited by the Builder.

## Test plan

**Rules tests** (`backend/rules-tests/src/`):
- Task create/update with a valid `notify` map (all five keys, bools) → allowed for authorized roles.
- `notify` with extra keys / missing keys / non-bool values → denied.
- Task without `notify` still valid (regression).
- `messages` writes still denied for every actor incl. workspace owner; member read still allowed; cross-workspace member read denied.
- Workspace doc write (attempting to set `notifications`) still denied client-side.

**Functions unit tests** (`backend/functions/src/lib/*.test.ts`, Vitest, same style as `optOut.test.ts` / `projectLifecycle.test.ts`):
- `quietHours.ts`: 20:59 → null; 21:00 → next-day 08:00; 23:30 → next-day 08:00; 02:00 → same-day 08:00; 07:59 → same-day 08:00; 08:00 → null; `enabled: false` → null; custom window (e.g. 22:00–06:30); defaults when `notifications` absent.
- `notifyConfig.ts`: defaults when map absent; `triggersFor`: todo→in_progress = statusChange; in_progress→blocked = blocked; blocked→done = statusChange; same status → null; create/delete → null.
- `enqueueTaskEvent` (mocked Firestore, same seam pattern as existing lib tests): D8 decision table row by row — toggle off → zero writes; trigger off in `notify` → zero writes; draft lifecycle → suppressed record with `lifecycle:draft`; opted-out client → suppressed `opt_out`; member without phone → suppressed `no_phone`; happy path inside quiet hours → `queued` + correct `holdUntil`; happy path outside → `queued`, no `holdUntil`; `toClient` + `toInternal` both on → one record per resolved recipient.
- `dueSoonSweep`: task due in 12h on published project → enqueued with deterministic ID; same sweep run twice → single record (create() dedupe); draft project skipped; `notify.dueSoon: false` skipped; done task skipped.
- `updateNotificationSettings`: role gating (pm/viewer rejected), `HH:mm` validation, merge-not-clobber of other workspace fields.

**Web component tests (RTL)**:
- `NotificationSettingsPage.test.tsx`: renders defaults when `notifications` absent; owner can edit + save calls callable with form values; viewer sees read-only; save feedback announced.
- `TaskDetailPanel.test.tsx` (extend): master toggle off → trigger/recipient controls disabled; toggling triggers/recipients persists `notify` in the update payload; defaults rendered for a task with no `notify`.
- `FirmShell.test.tsx` (extend): settings sub-nav links to both settings pages.

**Static gates**: `pnpm build`, `lint`, `typecheck`, `test`, `scripts/check-bundle-isolation.mjs` all green.

## Smoke tests (emulator)

1. Seed a workspace + published project + task with `sendWhatsapp: true` (existing emulator seed flow). In the dashboard UI, flip the task status → verify a `workspaces/{wid}/messages/*` doc appears with `status: 'queued'`, `trigger: 'task_status_change'`, correct recipient, and (if system clock is inside 21:00–08:00 MYT) a `holdUntil` at the next 08:00 MYT. Emulator UI → Firestore is enough to inspect.
2. Repeat on a `draft` project → doc has `suppressed: true, suppressedReason: 'lifecycle:draft'` and no `holdUntil`.
3. Set task `sendWhatsapp: false`, change status → **no** new messages doc.
4. Quiet-hours settings: as owner, change window to a range containing "now", save, flip a status → `holdUntil` present; as viewer, verify form is read-only.
5. Due-soon: invoke the sweep handler directly (emulator functions shell or an exported test entry point — cron does not fire in the emulator, per D5 note) with a task due in <24h → deterministic-ID doc created; invoke again → no duplicate.

## Out of scope (deliberately)

- **Any Twilio/Meta call, credential, or template registration** (#7, #19). `NoopProvider` is the only "channel".
- **Dispatch-at-08:00 execution** — #18 computes `holdUntil`; #19 acts on it (D9 contract).
- **Inbound webhook / STOP processing / status callbacks** (#20). `notificationsOptOut` is only *read* here.
- **Messaging log / message-previews settings screen** (figma prompt §Message previews) — reads the same `messages` collection later; no UI here.
- **Publish welcome / completion / assignment messages** (`firePublishWelcomeMessages` etc.) — lifecycle one-time messages belong with #19; `setProjectLifecycle` preview is untouched.
- **Department-aware template content redaction** (20-access-control §notification leakage) — a template-renderer concern for #19; queue records here carry only task title + status.
- **Email, per-workspace default notify config, workspace-configurable timezone, usage counters** — post-MVP or other tickets (#24).

## Risks / open questions

- **Collaborator recipients for these three triggers.** MVP scope for #18 names recipients "client, internal" only — collaborator-facing messages (assignment, due-soon nudges to the assigned tradesperson) are modelled in `notificationTypes.ts` but not part of this issue's recipient set. The enqueue lib's recipient resolver is written so #19 can add `'collaborator'` fan-out without reshaping the queue. Confirm this reading of "internal" (D7) — it's the most ambiguous word in the issue.
- **WA-to-firm-members is undecided** (D7 sub-question). Enqueuing `recipientType: 'member'` records is reversible; dispatch policy is #19's call.
- **`onTaskWrite` fan-in growth.** The trigger now does summary + lastTaskAt + enqueue; a failure in enqueue must not break summary recompute — wrap in independent try/catch with `logger.error`. If this trigger keeps growing, split into parallel triggers in a later ticket.
- **Sweep scalability.** Workspace-iteration in `dueSoonSweep` is O(all published projects); fine for design partners, needs pagination/sharding before real scale — acceptable, documented here.
- **Docs divergence flags (need PM ack, not code):** D3 (`outbox` concept realized as `messages` fields) and D4 (event source `onTaskWrite`, not `onCreate updates`) intentionally diverge from the letter of 13-tech-architecture.md / firestore-data-model.md trigger tables while preserving their behaviour. Also 13-tech-architecture mentions Cloud Tasks at step 2 — deferred to #19 with `holdUntil` as the handoff.
- **Clock skew / boundary sends**: `holdUntil` is computed at enqueue time; if quiet-hours settings change while messages are held, held records keep their original `holdUntil` (simplest; re-computation is a #19 dispatcher option). Called out so nobody expects retroactive re-scheduling.

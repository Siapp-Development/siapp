# Implementation plan — #171 Message log view (WhatsApp to clients and collaborators, with delivery receipts)

**Issue:** Siapp-Development/siapp#171 — "Add message log view: show all WhatsApp messages sent to clients".
**Verified against:** `origin/main` @ `1c1f6f9`. This includes #133 (Twilio dispatcher), #137 (snake_case variables, token-only links), #142 (durable client portal link and approved SIDs) and #157 (multi-client fan-out).
**Type:** Read-only plan; the Planner wrote no code.
**Status:** ✅ **Approved; B implementation in progress under child issue #173.** H1–H6 are binding decisions.
**Delivery:** Four PR slices under #171: #172 A (merged), #173 B (current), #174 C1 (merged), and #175 C2 (pending). The PR for B references #171 and #20 for receipts only; inbound auto-reply and STOP remain out of scope.
**Deployment:** A deployment has not been confirmed. No deployment is authorized by this implementation task. Deployment dependencies and the post-deploy check are recorded below.

---

## Human decisions (binding, recorded 2026-10-11)

| # | Decision | What it changes in this plan |
|---|---|---|
| **H1** | Viewers lose read access to `workspaces/{wid}/messages`. Only owner, admin and pm can read it. | Rules change (A6). This closes F1: live link tokens are readable by viewers today. |
| **H2** | The approved Twilio wording (verbatim below) is the source of truth for previews. Tokens are always masked. The wording lives in code as a shared constant keyed by trigger. | New `packages/shared/src/whatsappTemplates.ts` (C1-1). `plans/whatsapp-templates-v1.md` is marked superseded for the 5 approved templates. Triggers with no approved template get a fallback preview and an accurate "Not sent" status. |
| **H3** | The approved `task_blocked` template includes `Reason: {{blocked_reason}}`. Clients are meant to see the reason. | **Removed:** "stop writing `blocked_reason`", the one-off scrub script, and the "leak" framing. The PM department question was re-checked, and minimal gating was added (see *Department scoping*). |
| **H4** | Delivery receipts are in scope: a Twilio status callback with signature validation, `statusCallback` on every send, and monotonic status mapping. Receipts only, no STOP and no auto-reply. | New PR B. |
| **H5** | Collaborator access-link messages are included alongside client messages. | Recipient-type filter, a per-person filter, and a recipient column with a type tag. |
| **H6** | Blocked direct sends write a "not sent" record with the suppression reason. Callable return values and fail-soft behaviour stay unchanged. No sender attribution unless it is trivial. | A3. Sender attribution is **left out** (see *Out of scope*). |

---

## Goal

A firm user asked whether Siapp had WhatsApped their client, and what the message said. Today the firm app can't answer either question. #171 adds a **read-only Messages log** at `dashboard.siapp.app/{slug}/messages`:

- The log lists every outbound WhatsApp record addressed to a **client or a collaborator**, newest first. That includes records that were deliberately **not sent**, with the reason.
- Each row shows:
  - the recipient, with a type tag;
  - the message type;
  - a preview rendered from the **approved Twilio wording**, with the private link masked;
  - a timestamp;
  - a plain-language status: *Queued / Sending*, *Scheduled*, *Sent*, *Delivered*, *Read*, *Failed*, *Not delivered* or *Not sent* (with the reason).
- The status is backed by **Twilio delivery receipts**: a new signed status-callback endpoint.
- Filters are synced to the URL: `?type=client|collaborator`, `?client={id}` and `?collaborator={id}`. Each client card links to that client's history.

The log reads the existing `workspaces/{wid}/messages` queue/log collection (#18 D3). It honours these decisions:

- **D-035:** outbound-only. Receipts are item 1 of the webhook scope. STOP handling and the auto-reply stay with #20.
- **D-025:** department need-to-know.
- **D-027:** lifecycle-suppressed preview records.
- **#26 D6:** message docs are redacted audit evidence.
- **D-036:** bundle isolation. Only firm-surface code changes. The apex Hosting site gains one server rewrite and no JS.
- **11-mvp-scope:** "Delivery + read receipts logged".

---

## Approved Twilio template wording (source of truth, H2)

This wording goes verbatim into `WA_APPROVED_TEMPLATES` in `packages/shared/src/whatsappTemplates.ts`. Each entry is keyed by trigger and records its template name and prod Content SID.

```text
siapp_collab_access_link_v1_en   (trigger collab_access_link, HX63e9cd015c54842e567b7af4070d407b)
Hi {{collaborator_name}}, your firm {{firm_name}} has added you as a collaborator on Siapp.

Use your secure link to view assigned tasks and post updates:
https://siapp.app/t/{{access_token}}

If you were not expecting this, you can ignore this message.

siapp_project_welcome_v1_en   (trigger project_welcome, HX7e1ed9a3bc978cfed1089797b44315c0)
Hi {{client_first_name}}, your project with {{firm_name}} is now set up on Siapp.

Project: *{{project_title}}*
Target completion: {{project_due_date}}

Track progress using your secure link:
https://siapp.app/p/{{portal_token}}

If you were not expecting this, you can ignore this message.

siapp_task_blocked_v1_en   (trigger task_blocked, HXafc525975ec283bc05547af1fe695859)
Update from {{firm_name}} on *{{project_title}}*:

*{{task_title}}* is on hold. Reason: {{blocked_reason}}.

Follow progress on your tracker:
https://siapp.app/p/{{portal_token}}

— Sent via Siapp

siapp_task_due_soon_v1_en   (trigger task_due_soon, HX7002fc2be96fb62aa025f87cffe48a6e)
Reminder from {{firm_name}}:

*{{task_title}}* on {{project_title}} is due {{due_date}}.

— Sent via Siapp

siapp_task_status_change_v1_en   (trigger task_status_change, HXda96d4da436c0efe5873c483860ec1d2)
Update from {{firm_name}} on *{{project_title}}*:

*{{task_title}}* is now *{{new_status}}*.

View full progress on your tracker:
https://siapp.app/p/{{portal_token}}

— Sent via Siapp
```

### Variable-name check against the code

| Template | Placeholders in the approved wording | Keys the code writes | Writer | Match |
|---|---|---|---|---|
| `collab_access_link` | `collaborator_name, firm_name, access_token` | `firm_name, collaborator_name, access_token` | `callables/sendCollaboratorLink.ts` | ✅ |
| `project_welcome` | `client_first_name, firm_name, project_title, project_due_date, portal_token` | the same 5 keys | `callables/sendPortalLink.ts` | ✅ |
| `task_blocked` | `firm_name, project_title, task_title, blocked_reason, portal_token` | `task_title, project_title, firm_name, blocked_reason` + per-client `portal_token` | `lib/enqueueNotifications.ts` (`templateVariables`, `planTaskNotifications`) | ✅ |
| `task_due_soon` | `firm_name, task_title, project_title, due_date` | `task_title, project_title, firm_name, due_date` | `enqueueNotifications.ts`, via `scheduled/dueSoonSweep.ts` | ✅ |
| `task_status_change` | `firm_name, project_title, task_title, new_status, portal_token` | `task_title, project_title, firm_name, new_status` + per-client `portal_token` | `enqueueNotifications.ts` | ✅ |

**No variable-name mismatches.** No writer sends extra keys, and no writer omits a declared key. These format points are **not name mismatches**, and this plan does not change them:

- `new_status` is the raw enum, so clients read "*X* is now *in_progress*" (R5).
- Empty values go to Twilio as `—` (`buildContentVariables`). That yields "Target completion: —" when a project has no target date, and "Reason: —." when a blocked task has no reason.
- `blocked_reason` is followed by a literal `.` in the template. A reason that already ends in "." renders as "..".
- The `templateName` strings on docs don't match the approved names: `task_status_change_v1`, `task_blocked_v1`, `task_due_soon_v1` and `collab_access_link_v1`. Only `project_welcome` writes `siapp_project_welcome_v1_en`. Sends are unaffected because the dispatcher resolves the SID by `trigger`. The log also keys by `trigger` and shows the canonical name from the constant. The doc field is left as is so history stays consistent.
- The camelCase interfaces in `packages/shared/src/notificationTypes.ts` are stale and don't describe the wire contract. Examples: `ITaskDueSoonVars.taskLink`, `IBaseTemplateVars.firmWaPhone`, `IProjectWelcomeVars.clientFullName`. They get a JSDoc pointer to the new constant and nothing more.
- `wa_quota_90` writes camelCase `firmName, used, included`. It has no approved template, so there is nothing to compare against. It is member-addressed, so it doesn't appear in the log.

---

## Verified current state (code facts)

### Send pipeline

| Area | Fact | Source |
|---|---|---|
| Who writes `workspaces/{wid}/messages/{mid}` | <ol><li>`enqueueTaskEvent` → `planTaskNotifications`, called from `onTaskWrite` (`task_status_change`, `task_blocked`; **client-only**, #142) and from `onDueSoonSweep` (`task_due_soon`; **member-only**, #137 D).</li><li>`sendPortalLink`: client, `project_welcome`.</li><li>`sendCollaboratorLink`: collaborator, `collab_access_link`.</li><li>`enqueueQuotaAlert`: owner, `wa_quota_90`.</li><li>The dispatcher updates docs.</li><li>`deletePersonalData` redacts docs.</li></ol>No writer exists for `task_assigned` or `need_help`. | `lib/enqueueNotifications.ts`, `callables/send*Link.ts`, `triggers/messageUsage.ts`, `scheduled/dispatchQueue.ts`, `callables/deletePersonalData.ts` |
| Dispatcher | `onMessageDispatchSweep` runs every minute with both Twilio secrets bound. For each workspace it queries `status=='queued'` and filters with `selectDispatchable` (WhatsApp, not suppressed, phone present, `holdUntil` passed). It claims each doc in a transaction (`dispatch.claimedAt/attempts`), calls `provider.send`, then `recordResult`. `recordResult` uses plain `ref.update`: on success it writes `{status:'sent', providerSid, sentAt}`; on failure, `{status:'failed', errorCode, failedAt}`. A stale claim is retried after 5 minutes. After 3 attempts the doc is left `queued`. | `index.ts`, `dispatchQueue.ts` |
| Provider | `TwilioProvider.send` calls `messages.create({from, to, contentSid, contentVariables})`. The SID comes from `trigger`, not `templateName`. It never throws, and maps Twilio error codes to stable strings (`mapTwilioError`). | `twilioProvider.ts`, `contentSids.ts` |
| Triggers with no approved template | `WA_CONTENT_SID_TASK_ASSIGNED`, `_NEED_HELP` and `_WA_QUOTA_90` are blank in `.env.siapp-prod`. The sweep therefore writes `{status:'failed', errorCode:'no_content_sid', failedAt}` and makes **no Twilio call**: no `providerSid`, no `contentSid`, no callback. Under NoopProvider the same docs become `sent` with `providerSid:''`. | `twilioProvider.ts` (O-7), `contentSids.ts` |
| Receipts | **None today.** No `statusCallback`, no `onRequest` export, no Hosting rewrite to a function, no `X-Twilio-Signature` check, and nothing writes `deliveredAt` or `readAt`. A `sent` doc therefore only means "Twilio accepted the API call". | `index.ts`, `firebase.json`, `backend/api/src/index.ts` (`/health` only) |
| Region and secrets | All functions are v2 in `asia-southeast1`, set by `globalOptions.ts` (D-002). `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are `defineSecret` values. Non-secret params (`WA_SENDER`, `WA_CONTENT_SID_*`, `PORTAL_ORIGIN=https://siapp.app`) are committed in `.env.siapp-prod`. | `globalOptions.ts`, `twilioConfig.ts`, `.env.siapp-prod` |
| Hosting | Targets are `apex`, `dashboard` and `admin`. Each has only a `**` → `/index.html` SPA rewrite. | `firebase.json` |
| Usage counting | `onMessageCreated` counts every **non-suppressed** created doc (`countsAgainstAllowance`) at enqueue time. This is the #24 D4 temporary divergence that lasts "until #19/#20". | `triggers/messageUsage.ts` |
| Functions and shared code | The functions build (NodeNext, `rootDir: src`) **cannot import `@siapp/shared`**. Shared enums are mirrored locally with "keep in sync" comments. `packages/shared` has no test runner. Functions tests mock Firestore with `vi.mock('firebase-admin/firestore')` (see `dispatchQueue.test.ts`). Only `backend/rules-tests` runs against the emulator (`pnpm test:rules`). | `tsconfig.json`, `contentSids.ts`, `packages/shared/package.json` |

### Direct-send gates today (H6)

- **`sendPortalLink`**, for each linked client:
  - A missing client doc is skipped silently. It doesn't appear in `results`.
  - `isOptedOut` → `opted_out`
  - `!hasWaConsent` → `no_consent`
  - empty normalized phone → `no_phone`
  - phone already used for this send → `duplicate_phone`
  - Each case `continue`s **with no doc written**, before the link is fetched or created. The callable returns `{results:[{clientId, clientName, status, expiresAt?}]}`.
  - The precondition errors (`invalid-argument`, permission, read-only workspace, `not-found`, `not-published`, `no-client`) throw.
- **`sendCollaboratorLink`:** `opted_out`, `no_consent` and `no_phone` return `{status}` early **with no doc written**. A missing collaborator throws `not-found`.
- Both callables have the caller's uid in scope (`uid` / `issuer.uid`), but neither stores it on the message.

### Department scoping (H3 re-check)

- **Yes, PMs are department-restricted.** In `firestore.rules`, `canSeeRestricted` and `canSeeRestrictedList` let owner and admin through always. pm and viewer pass only when the item's `restrictedToDepartments` is empty or overlaps their `departments` claim. The same logic is in `notificationFanout.canReceive` and `getRestrictedTaskHeaders`.
- D-025 keeps the task **header** visible to everyone: title, status, phase, due date and order (`toRestrictedHeader`). Description, notes and updates are hidden.
- What each message type exposes:
  - `task_status_change` (`task_title`, `new_status`): header-only, so **no concern**.
  - `task_due_soon` (`due_date`): header-only, so **no concern**.
  - `project_welcome` and `collab_access_link`: no task content, so **no concern**.
  - **`task_blocked` → `blocked_reason`:** this is free text from the task's blocked or need-help flow, which is task **content**, not header. For a task with non-empty `restrictedToDepartments`, a pm outside those departments can't read the reason on the task or in activity, because both are gated. They could read it in `messages`. **This is a concern for `task_blocked` docs about restricted tasks only.** On `main` today, every member can read it, viewers included. H1 removes viewers; the handling below covers pm.
- The minimal handling adopted is described in *Design §1*.

### Web app

- Nothing in `apps/web` reads `messages`.
- `FirmShell` nav: Home, Projects, Clients, Collaborators, Settings. Routes already receive `role` and `departments` from the claims.
- `ClientsListPage` renders **cards** and has no client detail route. Its props are `workspaceId, workspaceName, role, uid`; it has no slug.
- `useClients` rows: `{id, name, phone, pdpaErased, …}`. `useCollaborators` rows: `{id, name, phone, status, pdpaErased, …}`.
- The pattern to mirror is `projects/activity/useProjectActivity.ts`: page size 50, a live first page via `onSnapshot`, older pages via `getDocs` + `startAfter`, and exported query builders and mappers. Its pm/viewer path already uses `restrictedToDepartments == []`.
- `@siapp/ui` has no Table or Select, so pages use native elements. There is no axe dev dependency.

### Findings carried forward

- **F1, live tokens readable by viewers:** fixed by H1.
- **F3, PDPA:** `redactMessagePii` only redacts values *equal to* the subject's current name or phone.
  - `client_first_name` is the first token of the name, so it survives erasure for any multi-word name.
  - `collaborator_name` is the full name *at send time*. If the collaborator was renamed before erasure, the old name survives.
  - The fix is key-based redaction of both keys.
- **F4, type drift:**
  - `IMessageDoc` declares `twilioSid`, but the code writes `providerSid`.
  - `failedAt`, `dispatch` and `contentSid` are untyped.
  - `TSuppressedReason` lacks `duplicate_phone`.
  - `firestore-data-model.md` § messages lacks `member`, `failedAt` and `readAt`.
- **F2 (`blocked_reason` "leak"):** withdrawn per H3.

---

## Design

### 1. Data and access (PR A)

**Rules (H1 plus the D-025 minimal gate).** Everything stays under `workspaces/{wid}` and is gated by claims, so multi-tenant isolation is unchanged.

```
// #171 (H1): messages carry live portal/collaborator bearer tokens
// (variables.portal_token / access_token) — readable only by the roles that
// already mint/copy those links (owner/admin/pm). Viewers denied.
// D-025: blocked_reason is task CONTENT, so task_blocked docs carry the task's
// restrictedToDepartments; pm reads are gated on that denormalized copy like
// activity. Docs without the field (pre-#171 history) are owner/admin-only.
match /messages/{mid} {
  allow read: if hasRole(wid, ['owner', 'admin'])
    || (hasRole(wid, ['pm']) && canSeeRestrictedList(wid, resource.data));
  allow write: if false;
}
```

**Minimal D-025 handling:**

1. **Stamp the field.** Every new message doc gets `restrictedToDepartments: string[]`.
   - `task_blocked` gets a snapshot of the task's `restrictedToDepartments`, taken at enqueue time, as activity does.
   - Every other trigger and both direct sends get `[]`, because they carry header-only content or none.
2. **Gate pm in the rules,** using the existing helper `canSeeRestrictedList`. A doc with no field (old history) fails closed for pm.
3. **Give pm one query.** The pm query adds `where('restrictedToDepartments','==',[])`. That keeps a single list query the rules can prove, with no client-side merge.
   - **v1 result:** pm users don't see `task_blocked` messages for restricted tasks, even in a matching department, and don't see old history. Owner and admin see everything.
   - The rules already allow reads for matching departments. A follow-up can add the `useProjectActivity` per-department `array-contains` queries **without a rules change**.
   - There is no backfill, because H3 dropped the script.

**Indexes:** 4 composite indexes, `collectionGroup: messages`, `queryScope: COLLECTION`. An `in` filter on `recipientType` uses the same index as equality.

| # | Fields | Used by |
|---|---|---|
| 1 | `recipientType ASC, createdAt DESC` | owner/admin, all or one type |
| 2 | `recipientType ASC, recipientId ASC, createdAt DESC` | owner/admin, one person |
| 3 | `recipientType ASC, restrictedToDepartments ASC, createdAt DESC` | pm, all or one type |
| 4 | `recipientType ASC, recipientId ASC, restrictedToDepartments ASC, createdAt DESC` | pm, one person |

**Template ID stamp.** `ISendResult.contentSid?` is set when the provider resolves a SID. `recordResult` writes it on `sent`, and on `failed` when it is present. Under `no_content_sid` it is absent.

### 2. Delivery receipts (PR B, H4)

**Host and URL, kept consistent with the current setup**

- **Endpoint.** A v2 `onRequest` export named `twilioStatusCallback`.
  - Region: `asia-southeast1`, inherited from `globalOptions.ts`.
  - Options: `{ secrets: [twilioAuthToken, twilioAccountSid], invoker: 'public', maxInstances: 10, timeoutSeconds: 10 }`, with no CORS.
- **Hosting rewrite on the `apex` target** (`siapp.app`), placed **before** the `**` SPA rewrite:
  `{ "source": "/webhooks/twilio/status", "function": { "functionId": "twilioStatusCallback", "region": "asia-southeast1" } }`.
  - This gives Twilio a stable domain URL. #20 can add `/webhooks/twilio/inbound` beside it.
  - The rewrite ships no JS, so D-036 isolation still holds.
- **New non-secret param** `WA_STATUS_CALLBACK_URL` (`defineString`, default `''`) in `twilioConfig.ts`.
  - Committed in `.env.siapp-prod` as `https://siapp.app/webhooks/twilio/status`.
  - When the param is blank, the provider omits `statusCallback` (local and CI) and the handler rejects every request with 403.
- **⚠ Deviation from the architecture doc, not from a decision.**
  - `13-tech-architecture.md` sketches webhooks on a Cloud Run Express service with a `requireTwilioSignature()` middleware. But `backend/api` only serves `/health`, and the whole send path (#133) already lives in Functions. A v2 `onRequest` function runs on Cloud Run underneath.
  - D-035 fixes the webhook's **scope**, not its host.
  - `verifyTwilioSignature()` in `lib/messaging/twilioSignature.ts` plays the `requireTwilioSignature()` role, and #20 can reuse it.
  - The Builder adds a one-line note to 13-tech-architecture.

**Finding the doc: the doc path goes in the signed query, not into a SID index.**

- The callback URL is `${WA_STATUS_CALLBACK_URL}?wid={workspaceId}&mid={messageId}`.
- Why this is safer than a `providerSid` collection-group lookup:
  1. Twilio's `X-Twilio-Signature` covers the **full URL, query included**, so `wid` and `mid` can't be forged or swapped.
  2. No cross-tenant `collectionGroup` query.
  3. No new collection-group field index.
  4. It survives the race where a callback arrives before `recordResult` has written `providerSid`.
- The query holds only IDs: no tokens, credentials or PII.
- Defence in depth: the handler **ignores** a callback (with a 200 and a log line) when any of these is true:
  - the doc's non-empty `providerSid` ≠ `MessageSid`. This covers a re-send after a stale claim, where the older Twilio message's callbacks point at the same doc.
  - `AccountSid` ≠ the configured account.
  - the doc is `suppressed`.

**Request handling** (`webhooks/twilioStatusCallback.ts`, built from a factory with injected dependencies):

1. Not a POST → **405**.
2. No `X-Twilio-Signature` header, or the param or auth token is blank → **403**.
3. `twilio.validateRequest(authToken, signature, url, req.body)`, where `url = WA_STATUS_CALLBACK_URL + '?' + rawQuery`.
   - `rawQuery` is taken verbatim from `req.originalUrl`, not rebuilt from Host headers, so it works behind the Hosting rewrite.
   - Invalid signature → **403**.
   - **No Firestore access happens before this check.**
4. Read `wid`, `mid`, `MessageSid`, `MessageStatus`, `ErrorCode` and `AccountSid`. If any are missing or malformed → **200** plus `logger.warn`. The request is signed but unusable, and retrying wouldn't help.
5. Run one Firestore transaction: read the doc. If it's missing → 200. Otherwise compute `planStatusUpdate(current, callback, now)`. If that returns `null`, write nothing; otherwise apply the update.
6. Respond **200** with an empty body *after* the transaction. v2 throttles CPU after the response, so no work happens after `res.send`. An unexpected error → **500** plus `logger.error`; Twilio may retry, and the handler is idempotent.
7. Logs never contain `To`, `From` or a message body (PII).

**Status mapping and the monotonic rule** (`lib/messaging/deliveryStatus.ts`, pure)

Rank: `queued/accepted/scheduled/sending` = 1 · `sent` = 2 · `delivered` = 3 · `undelivered` / `failed` = 3 · `read` = 4. `canceled` and unknown values are ignored.

The current rank is the rank of the stored `providerStatus` if there is one. Otherwise it is the rank of the doc's `status` (`queued` 1, `sent` 2, `delivered` 3, `failed` 3, `read` 4).

**A callback applies only if its rank is strictly greater than the current rank.**
- Duplicates are no-ops.
- Out-of-order callbacks never move the status backwards.
- When `delivered` and `undelivered`/`failed` compete, the first terminal one wins.
- `read` (4) always wins, because it is positive evidence.

| Twilio `MessageStatus` | Doc `status` | Fields written when the callback applies (plus `providerStatus` = raw value, `statusUpdatedAt` = now, and `providerSid` if it was empty) |
|---|---|---|
| `queued` / `accepted` / `scheduled` / `sending` | unchanged | Never applies: the doc is already at rank ≥ 1 |
| `sent` | `sent` | `sentAt` if absent |
| `delivered` | `delivered` | `deliveredAt` |
| `read` | `read` | `readAt`; also `deliveredAt` if absent |
| `undelivered` / `failed` | `failed` | `failedAt`; `errorCode` = `mapTwilioError({code: Number(ErrorCode)})`, e.g. `wa_outside_session_window` or `twilio_63032`. With no `ErrorCode`: `twilio_undelivered` or `twilio_failed` |

- Twilio sends no event timestamp, so the timestamps record when the callback was received.
- `TMessageStatus` is unchanged. `undelivered` is stored as `failed` plus `providerStatus:'undelivered'`.

**Dispatcher changes**

- `IQueuedMessage` gains `workspaceId`; `toQueuedMessage` already has `workspaceSnap.id`.
- `TwilioProvider` passes `statusCallback` on **every** `messages.create` whenever the URL is configured.
- `recordResult` uses a Firestore transaction for both provider outcomes. On success, it always sets `providerSid` and `contentSid`, and sets status to `sent` plus `sentAt` only when current rank is below 2. On provider error it writes `contentSid` and sets failure fields only when current rank is below 2. This additionally protects a callback arriving after Twilio accepted a request but before the SDK times out/rejects; a plain failure update could erase delivery evidence.

**What #20 still owns after this.** The list comes from D-035 and 13-tech-architecture. The #20 issue body could not be fetched from this environment; see R9.
- The inbound message webhook on the sender ("A message comes in", e.g. `/webhooks/twilio/inbound`).
- **STOP / opt-out keyword** processing → `notificationsOptOut` (D-035 item 2).
- The **static auto-reply**, rate-limited to once per sender per 24 h, plus approval of the `inbound_auto_reply` template (D-035 item 3).
- If still wanted: moving usage counting from enqueue time to delivery (#24 D4 temporary divergence; the data model says "counted on webhook delivery"), and sender-quality monitoring.
- #20 can reuse `verifyTwilioSignature` and the rewrite pattern. The PR B description says "Refs #20 (receipts only)".

### 3. Not-sent records for blocked direct sends (PR A, H6)

- **Shared helper.** A new pure helper, `buildDirectSendRecord(...)` in `lib/messaging/directSendRecord.ts`, builds the doc envelope for **both** queued and not-sent direct sends, so the two always share one shape. Fields:
  - `id`, `channel:'whatsapp'`, `recipientType`, `recipientId`, `recipientPhone`
  - `templateName`, `trigger`, `variables`
  - `status:'queued'`, `costEstimateMyr` (`WA_UTILITY_COST_MYR`, as suppressed task records do today)
  - `relatedTo`, `createdAt`, `restrictedToDepartments: []`
  - optionally `suppressed:true` and `suppressedReason`
- **`sendPortalLink`.** Each per-client gate writes a not-sent record and then `continue`s as it does today:
  - `opted_out` → `suppressedReason: 'opt_out'`
  - `no_consent` → `'no_consent'`
  - `no_phone` → `'no_phone'`
  - `duplicate_phone` → `'duplicate_phone'`
  - a missing client doc → `'no_recipient'`, with `recipientPhone:''` and the name taken from the project's denormalized ref. It still stays out of `results`.

  The record's variables are the same as a real send, but with `portal_token: ''`. The gates still run **before** the link is fetched or created, so no link is minted for a blocked send.
- **`sendCollaboratorLink`.** `opted_out`, `no_consent` and `no_phone` each write a not-sent record with `access_token: ''`, then return as they do today.
- **Fail-soft.** Each not-sent write is wrapped in `try/catch` with `logger.error`. A failed write never changes the callable's response. Return values and statuses are **byte-for-byte unchanged**. The callable status `opted_out` maps to the stored reason `opt_out`, the existing `TSuppressedReason`.
- **Nothing extra gets sent or billed.** `suppressed:true` keeps these records out of dispatch (`selectDispatchable`) and out of usage counting (`countsAgainstAllowance`).
- **Errors still write nothing.** These still throw without writing a record: invalid args, permission denied, read-only workspace, project not found / not published / no client, and collaborator not found. In each case the caller already shows the error inline, and no recipient has been resolved.
- **One record per press.** Pressing Send several times writes one not-sent record each time. The log is a record of attempts.
- **Sender attribution: left out.** `requestedBy: uid` would be a trivial write, but displaying it needs a member-name join in the UI that isn't in scope. Tracked in *Out of scope*.

### 4. Previews and statuses (PR C1)

**`packages/shared/src/whatsappTemplates.ts`** is the source of truth (H2).
- It exports `WA_APPROVED_TEMPLATES: Record<TApprovedTemplateTrigger, { templateName; contentSid; variables: readonly string[]; body }>`, `templateForTrigger(trigger)` (returns `null` when there's no approved template), and `WA_LINK_PLACEHOLDERS`.
- The header comment says: "Must equal the approved Twilio Content Template. Re-approval = new entry/SID (v2). Functions cannot import this package — writer key sets are mirrored in functions tests."

**`messagePreview.ts`.** `renderMessagePreview(row)` returns one of two shapes:
- `{kind:'template', segments, exactVersion}`
- `{kind:'unavailable', text}`

It works like this:
- **Mask links first.** `https://siapp.app/p/{{portal_token}}` becomes **"[private client portal link]"**. `https://siapp.app/t/{{access_token}}` becomes **"[private task-page link]"**. Any other `{{…_token}}` becomes "[private link]". Token values are never read; `mapMessage` strips them before they reach React state.
- **Fill the other placeholders** from the doc's variables. Missing or empty values become `—`, which matches what Twilio was sent. `REDACTED` passes through. camelCase aliases are accepted for pre-#137 docs.
- **Bold.** WhatsApp `*bold*` becomes bold segments, built as React elements with no `innerHTML`.
- **`exactVersion`** is false when the doc's `contentSid` is set and differs from the constant's. The UI then notes "Sent with an earlier template version; preview shows the current wording."
- **Fallback when there's no approved template** (`task_assigned`, `need_help`, `wa_quota_90`, or an unknown trigger): `{kind:'unavailable', text:'No approved WhatsApp template for this message type — nothing was sent.'}`. Variables are not echoed back.
- **`messageTypeLabel(trigger)`:**
  - "Portal link"
  - "Task update"
  - "Task on hold"
  - "Due-soon reminder"
  - "Task-page link"
  - "Task assigned"
  - "Help request"
  - "Usage alert"
  - fallback: "WhatsApp message"

**`messageStatus.ts`.** `describeMessageStatus(row, now)` returns `{label, tone, detail?, at?}`. A text label is always present, so colour is never the only signal. The first matching rule wins:

| Condition | Label | Detail |
|---|---|---|
| `suppressed` | **Not sent** | <ul><li>`lifecycle:draft` → "Project not published"</li><li>`lifecycle:completed` → "Project completed"</li><li>`lifecycle:archived` → "Project archived"</li><li>`lifecycle:deleted` → "Project deleted"</li><li>`opt_out` → "Recipient opted out of WhatsApp"</li><li>`no_consent` → "No WhatsApp consent recorded"</li><li>`no_recipient` → "Recipient record missing"</li><li>`no_phone` → "No phone number"</li><li>`duplicate_phone` → "Same number as another client — sent once"</li><li>`billing` → "Workspace is read-only"</li><li>any other reason → "Not sent"</li></ul> |
| `failed` + `errorCode:'no_content_sid'` | **Not sent** | "No approved WhatsApp template for this message type" (nothing reached Twilio) |
| `read` | **Read** | `readAt` |
| `delivered` | **Delivered** | `deliveredAt` |
| `failed` + `providerStatus` ∈ {`undelivered`,`failed`} | **Not delivered** | "WhatsApp accepted it but couldn't deliver it: {describeErrorCode}" |
| `failed` | **Failed** | `describeErrorCode`: the existing strings for `invalid_to_number`, `wa_*` and `twilio_<n>` ("Provider error ({code})") |
| `sent` | **Sent** | "Handed to WhatsApp — delivery not confirmed yet", plus "(no provider reference)" when `providerSid` is empty (R3) |
| `queued` + `holdUntil` in the future | **Scheduled** | "Quiet hours — sends after {time}" |
| `queued` + attempts ≥ 3, no fresh claim | **Not sent** | "Sending stopped after 3 attempts — contact support" |
| `queued` + claim younger than 5 min | **Sending…** | |
| `queued` | **Queued** | "Usually sends within a minute" |

### 5. Messages page (PR C2)

**Hook.** `useMessageLog(workspaceId, {role, recipientType, recipientId})`, built with the exported `buildMessageLogQuery(wid, {recipientType, recipientId, seesRestricted}, cursor?)`. The query is assembled like this:
- `recipientType` is `'all'`, which becomes `where('recipientType','in',['client','collaborator'])`, or a single `==`.
- If a person is selected, add `where('recipientId','==',id)`. The type is then always specific.
- For pm (`!seesRestricted`), add `where('restrictedToDepartments','==',[])`.
- Then `orderBy('createdAt','desc')`, `limit(50)`, and `startAfter(cursor)` for older pages.

Behaviour:
- The first page is live via `onSnapshot`. `loadMore` uses `getDocs`. The hook resubscribes when the filters change.
- State is `loading | error | ready{rows, hasMore, loadingMore}`.
- `mapMessage` tolerates missing fields, converts Timestamps to `Date|null`, and **drops every variable key matching `/_token$|Token$/`**.

**Page.** `MessageLogPage` (props `workspaceId, workspaceSlug, role`):

- **Header.** `<h1>Messages</h1>`, the subtitle "WhatsApp messages Siapp sent, scheduled or held back for your clients and collaborators", and a `<details>` titled "About this log" that explains each status. For pm only, it adds: "On-hold messages about department-restricted tasks, and some older messages, are visible to owners and admins only."
- **Filters.** Native `<select>` elements with `Label`, synced to the URL with `useSearchParams` so deep links and back/forward work.
  - **Recipients:** "Clients and collaborators" (default, no param) / "Clients" (`?type=client`) / "Collaborators" (`?type=collaborator`).
  - **Person:** options come from `useClients` and `useCollaborators`, filtered by type and sorted, with `<optgroup>` groups when the type is "both". This sets `?client={id}` or `?collaborator={id}`. Choosing a person fixes the type, and a person param wins over a conflicting `type`.
- **Table.** A semantic `<table>` with a `<caption>` and `th scope="col"`. On narrow screens it becomes a stacked layout in the same DOM order. Columns:
  - **Date:** `<time dateTime>`.
  - **Recipient:** name, a text tag ("Client" or "Collaborator"), and phone.
    - An unknown id shows "Unknown client" or "Unknown collaborator".
    - An erased record shows "Deleted client" or "Deleted collaborator" with "REDACTED".
  - **Message:** the type label plus a preview clamped to 3 lines, and a "Show full message" button with `aria-expanded` and `aria-controls`.
  - **Status:** a `Badge` plus the detail text and time.
- **States.**
  - Loading: `role="status"`.
  - Error: an `Alert` with "Try again".
  - Empty: "No WhatsApp messages yet."
  - Empty for a person: "No WhatsApp messages for {name}.", with a "Show everyone" button.
  - "Load more": `aria-busy`, a polite live region announcing "{n} more messages loaded", and focus stays put.
- **Viewer.** A viewer sees "The message log is available to owners, admins and project managers." and the page **runs no query**.

**Wire-up**
- `FirmShell`:
  - A `messages` route.
  - A "Messages" `NavItem`, placed between Collaborators and Settings and shown only to owner/admin/pm, with a lucide `MessageSquare` icon.
  - `workspaceSlug` is now passed to `ClientsListPage`.
- `ClientsListPage`: each card gets a "Message history" link to `/{slug}/messages?client={id}`, with the accessible name "Message history for {name}". It is visible to owner/admin/pm only.

---

## Touched surfaces & files

**Surfaces:**
- The firm app (`dashboard.siapp.app/{slug}/messages`).
- Functions, rules, indexes and params.
- One **server rewrite** on the apex Hosting site (`/webhooks/twilio/status`). It ships no JS.

`/p/*`, `/t/*`, `admin` and the marketing bundles are untouched. `scripts/check-bundle-isolation.mjs` must stay green.

| Slice | Create | Modify |
|---|---|---|
| **A: log data and access** | `backend/functions/src/lib/messaging/directSendRecord.ts` (+ `.test.ts`) · `backend/rules-tests/src/messages.test.ts` | `packages/shared/src/firestoreTypes.ts` · `packages/shared/src/enums.ts` · `backend/functions/src/lib/enqueueNotifications.ts` (+ test) · `callables/sendPortalLink.ts` (+ test) · `callables/sendCollaboratorLink.ts` (+ test) · `lib/messaging/provider.ts` · `lib/messaging/twilioProvider.ts` (+ test) · `scheduled/dispatchQueue.ts` (+ test) · `lib/pdpa.ts` (+ `pdpa.test.ts`) · `firestore.rules` · `backend/rules-tests/src/notifications.test.ts` · `firestore.indexes.json` · `pm_ux/plans/firestore-data-model.md` § messages |
| **B: delivery receipts** | `backend/functions/src/lib/messaging/deliveryStatus.ts` (+ test) · `lib/messaging/twilioSignature.ts` (+ test) · `backend/functions/src/webhooks/twilioStatusCallback.ts` (+ test) | `backend/functions/src/index.ts` (export) · `lib/messaging/twilioConfig.ts` (param) · `lib/messaging/selectProvider.ts` (+ test) · `lib/messaging/provider.ts` (`workspaceId`) · `lib/messaging/twilioProvider.ts` (+ test) · `scheduled/dispatchQueue.ts` (+ test) · `firebase.json` (apex rewrite) · `backend/functions/.env.siapp-prod` · `plans/runbook-deploy.md` · `pm_ux/plans/13-tech-architecture.md` (one-line note) · `pm_ux/plans/firestore-data-model.md` (receipt fields) |
| **C1: approved copy and pure helpers** | `packages/shared/src/whatsappTemplates.ts` · `apps/web/src/surfaces/firm/messages/messagePreview.ts` (+ test) · `apps/web/src/surfaces/firm/messages/messageStatus.ts` (+ test) · `apps/web/src/surfaces/firm/messages/types.ts` (`IMessageLogRow`) | `packages/shared/src/index.ts` (export) · `packages/shared/src/notificationTypes.ts` (JSDoc pointer only) · `plans/whatsapp-templates-v1.md` (superseded banner on the 5 approved sections; remove the stale §5 "omits the block reason" note) |
| **C2: Messages page** | `apps/web/src/surfaces/firm/messages/useMessageLog.ts` (+ test) · `apps/web/src/surfaces/firm/messages/MessageLogPage.tsx` (+ test) | `apps/web/src/surfaces/firm/FirmShell.tsx` (+ test, if present) · `apps/web/src/surfaces/firm/clients/ClientsListPage.tsx` (+ `.test.tsx`) |

---

## Data model changes

On `workspaces/{wid}/messages/{mid}`: **no new collection and no new required field.** All additions are optional.

| Field | Written by | Slice |
|---|---|---|
| `restrictedToDepartments: string[]` | enqueue: the task's array for `task_blocked`, `[]` otherwise; both direct sends: `[]` | A |
| `suppressed` / `suppressedReason` on direct sends (`opt_out`, `no_consent`, `no_phone`, `duplicate_phone`, `no_recipient`) | `sendPortalLink`, `sendCollaboratorLink` | A |
| `contentSid` | `recordResult` | A |
| `providerStatus`, `statusUpdatedAt`, `deliveredAt`, `readAt`, `failedAt`, `errorCode`, `providerSid` (if empty) | status callback | B |

`IMessageDoc` changes (A1). Every field is optional:

```ts
restrictedToDepartments?: string[]; // #171 D-025 gate (rules: pm)
providerSid?: string;               // #133 ('' under NoopProvider)
contentSid?: string;                // #171 template version actually sent
failedAt?: Date;                    // #133 / #171 callback
dispatch?: { claimedAt?: Date; attempts?: number }; // #133
providerStatus?: string;            // #171 raw Twilio MessageStatus last applied
statusUpdatedAt?: Date;             // #171 callback bookkeeping
readAt?: Date;                      // #171 callback
/** @deprecated never written — use providerSid */ twilioSid?: string;
```

Also add `'duplicate_phone'` to `TSuppressedReason`. `deliveredAt` and `errorCode` are already typed.

**PDPA (F3).** `redactMessagePii` also sets `variables.client_first_name` and `variables.collaborator_name` to `REDACTED` whatever their value. It only touches the docs `redactMessages` already selects for the subject (`recipientType` + `recipientId`), and that now includes not-sent records. It stays idempotent. Tokens need no change, because erasure revokes the links. The callback never writes PII.

**Rules and indexes:** see *Design §1*.

---

## Steps

### PR A: log data and access

**A1. Shared types.**
- Make the `IMessageDoc` and `TSuppressedReason` changes listed above.
- *Verify:* `pnpm turbo typecheck`.

**A2. Department stamp.**
- In `planTaskNotifications`, add `restrictedToDepartments` to every planned record: the task's array (strings only) when `trigger === 'task_blocked'`, otherwise `[]`.
- Add a comment there: client templates with task *content* must carry the task's departments, or the rules must change.
- *Verify:* `enqueueNotifications.test.ts`:
  - blocked on a restricted task → `['finance']`;
  - blocked on an unrestricted task → `[]`;
  - status_change on a restricted task → `[]`;
  - due_soon → `[]`;
  - multi-client fan-out → every record stamped;
  - variable key sets unchanged, **including `blocked_reason`**.

**A3. Not-sent direct sends (H6).**
- Add `directSendRecord.ts`. Refactor the 2 existing queued writes onto it; their output must not change.
- Add not-sent writes at each gate, as described in Design §3.
- *Verify:* callable tests:
  - each gate writes exactly one `suppressed:true` doc with the right reason, empty token, and `restrictedToDepartments: []`;
  - `getOrCreate*Link` is **not** called for a blocked send;
  - the returned `results` / `status` equal today's;
  - a throwing not-sent write still returns the same result;
  - precondition errors write nothing;
  - the queued-doc snapshot is unchanged apart from the added `restrictedToDepartments: []`.

**A4. Template ID stamp.**
- Add `ISendResult.contentSid?`. `TwilioProvider` returns it on success and on a Twilio error, but not for `no_content_sid`. `recordResult` writes it when present.
- *Verify:* provider and dispatcher tests.

**A5. PDPA.**
- Make redaction key-based for the 2 name keys.
- *Verify:* `pdpa.test.ts`:
  - a multi-word client name → first name redacted;
  - a renamed collaborator → old name redacted;
  - idempotent (returns `null` on the second pass);
  - equality redaction still works.
- Extend `deletePersonalData.test.ts` if it asserts variables.

**A6. Rules.**
- Replace the `messages` block (Design §1) and add a header bullet.
- In `notifications.test.ts`, flip the viewer assertion: "still allows member reads" becomes owner/admin/pm allow, viewer deny.
- *Verify:* `pnpm test:rules`.

**A7. Indexes.**
- Add the 4 composite indexes.
- *Verify:* the emulator accepts the C2 queries. In prod, wait for **Ready** before C2.

**A8. Docs.**
- Update `firestore-data-model.md` § messages:
  - real fields;
  - `recipientType` includes `member`;
  - the read rule;
  - the indexes;
  - not-sent direct-send records.

### PR B: delivery receipts (after A)

**B1. `deliveryStatus.ts` (pure).**
- `rankOf`, `planStatusUpdate(current, {status, errorCode, messageSid}, now)`, and `buildStatusCallbackUrl(base, wid, mid)` (uses `URLSearchParams`; returns `undefined` when `base` is blank).
- *Verify:* table-driven tests (see Test plan).

**B2. `twilioSignature.ts`.**
- `verifyTwilioSignature({authToken, signature, url, params}): boolean`, wrapping `twilio.validateRequest`. It returns false on a missing header or token.
- *Verify:* tests that generate valid signatures with `twilio.getExpectedTwilioSignature` and check the tampered cases.

**B3. Handler and export.**
- Build `createTwilioStatusHandler(deps)` in `webhooks/twilioStatusCallback.ts`. Export `twilioStatusCallback = onRequest({...}, handler)` from `index.ts`.
- Add `WA_STATUS_CALLBACK_URL` to `twilioConfig.ts`.
- *Verify:* handler tests with the fake-Firestore pattern from `dispatchQueue.test.ts`.

**B4. Provider wiring.**
- Add `IQueuedMessage.workspaceId`, set in `toQueuedMessage`.
- `ITwilioCreateOptions.statusCallback?`. `ITwilioProviderDeps.statusCallbackBase` comes from `selectProvider()` via `waStatusCallbackUrl.value()`.
- `TwilioProvider` sets `statusCallback` on every create when the base is non-blank.
- *Verify:*
  - the provider test asserts `statusCallback === 'https://siapp.app/webhooks/twilio/status?wid=w1&mid=m1'`;
  - a blank base omits it;
  - the `selectProvider` test passes the param through.

**B5. Monotonic `recordResult`.**
- Make provider outcome recording transactional (Design §2).
- *Verify:* dispatcher tests:
  - a doc already `delivered` or `read` stays so, but a successful result still stamps `providerSid` and `contentSid`;
  - a `queued` doc becomes `sent`;
  - a provider error marks a still-queued doc failed;
  - if a signed receipt has already advanced to `sent`, `delivered`, `failed`, or `read`, neither provider success nor error regresses it;
  - the existing claim and idempotency tests stay green.

**B6. Config.**
- `firebase.json`: add the apex rewrite before `**`.
- `.env.siapp-prod`: `WA_STATUS_CALLBACK_URL=https://siapp.app/webhooks/twilio/status`, with a comment.
- Leave `.env.local` blank.
- *Verify:* `firebase.json` stays valid, and the apex SPA routes still resolve in the Hosting emulator.

**B7. Emulator smoke (manual, recorded in the PR) and docs.**
- Run the functions, firestore and hosting emulators with `backend/functions/.secret.local` (`TWILIO_AUTH_TOKEN=test-token`, `TWILIO_ACCOUNT_SID=ACtest`, never committed). Set `WA_STATUS_CALLBACK_URL` to the Hosting-emulator URL for the session.
- Seed a `queued` doc, then POST form bodies through `http://127.0.0.1:5000/webhooks/twilio/status?wid=…&mid=…`, signed with a short `node -e` call to `twilio.getExpectedTwilioSignature`.
- Expected results:
  - `sent`, then `delivered`, then `read` → the doc ends at `read`;
  - replaying `delivered` → no change;
  - a bad signature → 403;
  - a GET → 405.
- Update `runbook-deploy.md` (param, rewrite, post-deploy check: Twilio Console Monitor → no 11200 errors, and a test send ends `delivered`/`read`). Add the 13-tech-architecture note.

### PR C1: approved copy and pure helpers (can run in parallel with B)

**C1-1. `whatsappTemplates.ts`.**
- Paste the approved wording verbatim, with names, SIDs and `variables` lists. Export it from the shared index.
- Mark `plans/whatsapp-templates-v1.md` superseded (banner plus a pointer in each of the 5 sections). Delete its stale §5 "omits the internal block reason" sentence. Add the JSDoc pointer in `notificationTypes.ts`.
- *Verify:* typecheck; the preview tests below parse the bodies.

**C1-2. `messagePreview.ts`.**
- *Verify:* see Test plan.

**C1-3. `messageStatus.ts`.**
- *Verify:* see Test plan.

### PR C2: Messages page (after A is deployed and the indexes are Ready, and after C1)

**C2-1. `useMessageLog.ts`.**
- *Verify:* hook tests.

**C2-2. `MessageLogPage.tsx`.**
- *Verify:* component tests, plus a manual keyboard and screen-reader pass.

**C2-3. Wire-up** (`FirmShell`, `ClientsListPage`).
- *Verify:* run `pnpm turbo build lint typecheck test` and `node scripts/check-bundle-isolation.mjs`.

---

## Test plan (for Tester)

### Rules (`backend/rules-tests/src/messages.test.ts`, emulator)

**Seed data**

In wksA:
- a client `task_status_change` doc with `portal_token` and `restrictedToDepartments: []`;
- a client `task_blocked` doc with `restrictedToDepartments: ['finance']`;
- a collaborator `collab_access_link` doc with `[]`;
- a not-sent `project_welcome` doc;
- a **legacy** doc with no `restrictedToDepartments`;
- a member quota doc.

In wksB: one client doc.

**Cases**

- **owner / admin:**
  - `get` succeeds on every doc, legacy included.
  - An unconstrained `list` succeeds.
  - `list` with `recipientType in [client, collaborator]` (with or without `recipientId`) plus `orderBy createdAt` succeeds.
- **pm without departments:**
  - `get` succeeds for the unrestricted docs.
  - `get` is denied for the finance blocked doc and for the legacy doc.
  - `list` with `restrictedToDepartments == []` (with or without `recipientType`/`recipientId`) succeeds.
  - An unconstrained `list` is denied.
- **pm in finance:** `get` succeeds on the finance blocked doc (the rules allow the follow-up per-department query).
- **viewer:** `get` and `list` are denied, constrained or not.
- **Isolation and other principals:** cross-workspace, unauthenticated, portal and collaborator principals, and an admin token without a `workspaces` claim are all denied, with no evaluation error.
- **Writes:** create, update and delete are denied for every role.
- **Existing tests:** `notifications.test.ts` is updated to match.

### Functions unit (Vitest, mocked Firestore)

**PR A**
- **`enqueueNotifications`:** see A2. Also assert the exact key sets per trigger (task_status_change: `task_title, project_title, firm_name, new_status, portal_token`; task_blocked: `… blocked_reason, portal_token`; task_due_soon: `… due_date`). Add a comment that these mirror `WA_APPROVED_TEMPLATES`.
- **`sendPortalLink` / `sendCollaboratorLink`:**
  - each gate's not-sent record (see A3);
  - the queued key sets equal the approved placeholders (`firm_name, client_first_name, project_title, project_due_date, portal_token` / `firm_name, collaborator_name, access_token`);
  - fail-soft on a write error;
  - return values unchanged.
- **`directSendRecord`:**
  - the queued envelope and the suppressed envelope;
  - `restrictedToDepartments: []` is always present.
- **`twilioProvider` / `dispatchQueue`:** `contentSid` handling (A4).
- **`pdpa`:** see A5.

**PR B**
- **`deliveryStatus`**, table-driven over every pair of (current status or `providerStatus`) and incoming status:
  - the monotonic rule;
  - duplicates and out-of-order arrivals (`delivered` before `sent` → `sent` ignored; `read` after `failed` → applies; `failed` after `delivered` → ignored);
  - the fields written per status;
  - error-code mapping, with and without `ErrorCode`;
  - `canceled` and unknown statuses ignored;
  - `providerSid` filled only when empty;
  - `buildStatusCallbackUrl` encoding, and `undefined` for a blank base.
- **`twilioSignature`:**
  - a valid signature passes;
  - each of these fails: a changed `wid` or `mid` in the query, a changed body param, the wrong token, a missing header.
- **`twilioStatusCallback` handler:**
  - 405 for a non-POST;
  - 403 for a missing or invalid signature, and for a blank param, **with no Firestore read**;
  - 200 with no write for: missing `wid`/`mid`, an unknown doc, an `AccountSid` mismatch, a `providerSid` mismatch, a suppressed doc, or a duplicate;
  - 200 with the correct update for each status;
  - 500 when the transaction throws;
  - no PII (`To`, `From`) in logger calls;
  - URL validation uses the configured base plus the raw query, even when the `Host` header differs (Hosting rewrite).
- **`twilioProvider`:** `statusCallback` on every create when configured, omitted when blank.
- **`dispatchQueue`:** the monotonic `recordResult` (B5).
- **`selectProvider`:** the param passes through.

### Web (Vitest + RTL)

Mock hooks with `vi.mock` as `ClientsListPage.test.tsx` does, and mock the SDK as `useProjectActivity.test.ts` does.

- **`messagePreview.test.ts`:**
  - **Contract:** for each of the 5 approved templates, the placeholders parsed from `body` equal `variables`.
  - Each template renders with sample variables.
  - Link masking for `/p/` and `/t/`. A known token string never appears in any output, even if one were present in the variables.
  - `—` for empty values; `REDACTED` passthrough; camelCase legacy variables.
  - `*bold*` segments.
  - `exactVersion` is false when the SID differs.
  - The fallback for `task_assigned`, `need_help`, `wa_quota_90` and unknown triggers, with no variable echo.
- **`messageStatus.test.ts`:** one case per table row, in priority order (e.g. suppressed beats failed; `no_content_sid` gives "Not sent"; async undelivered gives "Not delivered"; NoopProvider `sent` gives "(no provider reference)").
- **`useMessageLog.test.ts`:**
  - the query shape for each combination: `all` uses `in`; a single type uses `==`; a person adds `recipientId`; pm adds `restrictedToDepartments == []`;
  - cursor pagination and `hasMore`;
  - resubscribing on filter change;
  - the error state;
  - `mapMessage` strips token keys and tolerates malformed fields.
- **`MessageLogPage.test.tsx`:**
  - the loading, error (with retry), empty and empty-for-person states;
  - the viewer gate shows its message and makes **no query call**;
  - the pm note appears for pm only;
  - recipient rendering for a client, a collaborator, an unknown id and an erased record;
  - each status label;
  - `?type=`, `?client=` and `?collaborator=` preselect the filters, changing a filter updates the URL, and a person param overrides a conflicting type;
  - the expand toggle sets `aria-expanded`;
  - "Load more" sets `aria-busy` and the live-region text;
  - the table has a `<caption>` and `th scope=col`.
  - Don't add an axe dependency.
- **`ClientsListPage.test.tsx`:** the link's `href` and accessible name; the link is hidden for viewers.
- **`FirmShell`:** the nav item shows for owner/admin/pm and is hidden for viewers; the route resolves.

### Gates

- `pnpm turbo build lint typecheck test`
- `pnpm test:rules`
- `node scripts/check-bundle-isolation.mjs`
- PR B also needs the recorded B7 emulator smoke.

---

## Deploy order

1. **PR A:**
   1. Indexes; wait for **Ready**.
   2. Functions (stamp, not-sent records, `contentSid`, PDPA).
   3. Rules.

   Nothing in the web app reads `messages` yet, so tightening the rules breaks no UI. The functions go first so that new docs carry `restrictedToDepartments` before pm can query.
2. **PR B (#173):** when separately authorized, deploy Functions and apex Hosting together (`firebase deploy --only functions,hosting:apex`). The CLI deploys functions before Hosting, so the rewrite points at a live function. No deployment was performed or authorized for this task.
   - Between the Functions and Hosting phases, sends that already carry `statusCallback` may get a 404 (Twilio error 11200). Delivery is unaffected; those docs remain at their last recorded status.
   - After an authorized deployment, run the post-deploy check in `plans/runbook-deploy.md`.
3. **PR C1 (#174):** no runtime effect until C2 — merged.
4. **PR C2 (#175):** deploy web (`dashboard` target) only after A is deployed and all A indexes are Ready. No deployment status is inferred from issue/PR merges.

---

## Diff estimate & PR slicing

The scope grew. The diff is **about 3,600 changed lines: about 1,550 production, 1,950 tests and 100 docs/config**. That is well over ~600, so this plan splits the work into 4 child-issue slices under #171. PR B's description says "Refs #20 (receipts only)" so the #20 owners can see what is now done.

| Slice | Content | Prod | Tests | Docs/config | Total | Depends on |
|---|---|---|---|---|---|---|
| **A: log data and access (#172)** | types, department stamp, not-sent direct sends, `contentSid`, PDPA, rules, indexes | ~260 | ~500 | ~40 | **~800** | none — merged |
| **B: delivery receipts (#173)** | callback endpoint, signature, mapping, provider `statusCallback`, monotonic `recordResult`, rewrite, param | ~350 | ~540 | ~45 | **~935** | A merged — satisfied; no A production deployment is required to implement B |
| **C1: approved copy and helpers (#174)** | shared template constant, preview, status | ~370 | ~360 | ~20 | **~750** | none in code — merged |
| **C2: Messages page (#175)** | hook, page, nav, client-card link | ~560 | ~560 | 0 | **~1,120** | A deployed (rules and indexes Ready), C1 merged — pending |

- **Issue status:** #172 A merged; #173 B in progress; #174 C1 merged; #175 C2 pending.
- **Order:** A/C1 merged → B ∥ C1 (already merged) → C2 only after A is deployed and all indexes are Ready.
- C2 doesn't need B. It shows *Delivered* and *Read* as soon as B's callbacks write them.
- Production code is about 600 lines or less in every slice. Tests make up roughly half of each slice.

---

## Out of scope

- **#20 items:** the inbound message webhook, STOP / opt-out keywords, the static auto-reply and its template, moving usage counting to delivery time, and sender-quality monitoring.
- **Sender attribution** (`requestedBy`, "who pressed Send") on direct sends. The uid is in scope in both callables, so a follow-up is a 2-line write plus a member-name join in the UI.
- **Per-department pm queries** for restricted `task_blocked` messages. The rules already allow them, so the follow-up is UI-only (the `useProjectActivity` pattern).
- **A backfill** of `restrictedToDepartments` on pre-#171 history.
- **A "Message history" link on collaborator cards.** The `?collaborator=` deep link works, so adding the link later is trivial.
- **These changes:** fixing the legacy `templateName` strings, the quota DM's camelCase variables and blank SID, humanizing `new_status`, gating client notifications on `visibleToClient` or department restriction (R4), and changing NoopProvider behaviour (R3).
- **Persisting a rendered body,** resend or retry actions, CSV export, search, status/project/date filters, and a failed-messages dashboard.
- **A client detail page,** a project-level message tab, BM copy (D-026), and message retention/TTL.

---

## Risks

- **R1, index build lag.** C2 errors until all 4 indexes are Ready. Deploy them in A and gate C2 on them.
- **R2, copy drift.** If a template is re-approved under a new SID before the constant changes, the preview shows the current wording with a "different template version" note. A re-approval must update `WA_APPROVED_TEMPLATES` and `.env.siapp-prod` together. Functions can't import the constant, so the writer key sets are mirrored in tests.
- **R3, a misleading "Sent" under NoopProvider.** If prod ever runs without Twilio credentials, docs become `sent` with `providerSid:''` and no callbacks arrive. The UI says "(no provider reference)".
- **R4, client notifications ignore restriction.** Client notifications for status_change and blocked fire whether or not the task is `visibleToClient` or department-restricted (#142). That now includes `blocked_reason` for restricted tasks, which reaches the client by design (H3). The log will make this visible to firms. It is a product question for the #142 owners.
- **R5, raw `new_status`.** The preview is faithful to what the client received, e.g. `in_progress`.
- **R6, the pm v1 visibility gap.** pm users don't see restricted `task_blocked` messages, even in a matching department, or pre-#171 history. Owner and admin see everything. Both gaps can be fixed later without a rules change, by per-department queries and a backfill.
- **R7, URL exactness.** If `WA_STATUS_CALLBACK_URL` differs at all from the URL Twilio calls (scheme, host, path, trailing slash), every callback gets a 403. Mitigations:
  - the provider and the handler build the URL from the same param;
  - the handler validates against the raw query;
  - the B7 smoke test and the post-deploy runbook check.

  A 403 never affects delivery. Docs just stay `sent`.
- **R8, a public endpoint.** Signature validation runs before any Firestore access, `maxInstances: 10` caps abuse cost, and there are no secrets in URLs.
- **R9, issues #19 and #20 not read.** `gh` was unavailable in this environment, so the #19/#20 issue bodies weren't read. "What #20 still owns" comes from D-035 and 13-tech-architecture. The Shipper should check it against #20's acceptance criteria when writing the PR B description.
- **R10, usage counting.** Usage is still counted at enqueue time (#24 D4). Receipts make delivery-time counting possible, but that is billing scope for #20/#24.
- **R11, emulator coverage.** Automated tests are unit tests with mocked Firestore (the functions convention) plus emulator-backed rules tests. The callback's end-to-end emulator run is a recorded manual smoke test, because functions have no emulator test harness and adding one is out of scope.

---

## Open questions

**None blocking.** These defaults were chosen and can be overridden at approval without re-planning:

1. **pm visibility in v1** (R6): restricted `task_blocked` messages and old history are hidden from pm. The rules are already correct for a per-department follow-up.
2. **The callback host:** a Functions v2 `onRequest` behind an apex Hosting rewrite, rather than a Cloud Run Express service (this deviates from the architecture doc, not from a decision).
3. **Slicing:** 4 PRs instead of the suggested 2. A and B could merge into one ~1,700-line backend PR if fewer, larger PRs are preferred.

---

## Changes vs the previous version of this plan

- **Status** changed to *Ready for approval*. H1–H6 are recorded, and the old Q1–Q6 are removed as resolved.
- **H3:** removed the "stop writing `blocked_reason`" change, the `scrub-message-log-pii` script, the F2 "leak" finding and the D-025 assumption risk. Added the PM department re-check (PMs **are** restricted) and the minimal gate: a `restrictedToDepartments` stamp, a pm rules gate, and a pm `== []` query.
- **H2:** added the approved wording verbatim, the shared constant `WA_APPROVED_TEMPLATES`, and the variable-name check (no mismatches, plus the format notes). The stale draft doc is marked superseded. Added the fallback preview and the "Not sent" status for `no_content_sid` triggers.
- **H4:** delivery receipts were out of scope and are now PR B. That covers the endpoint, region and rewrite, signature validation, the doc path in the signed query (instead of a SID index), the monotonic mapping, the monotonic `recordResult`, the `statusCallback` on every send, tests and the emulator smoke. Added what #20 still owns.
- **H5:** collaborator messages are in. Added the recipient-type filter, the person filter, the type tag, and `?collaborator=`. The indexes went from 2 to 4.
- **H6:** added not-sent records for blocked direct sends, using a shared envelope helper. Return values are unchanged, and the writes are fail-soft. Sender attribution is left out.
- **Kept:** the page at `/{slug}/messages` with pagination, filters and accessibility states; the "Message history" link on client cards; the `contentSid` stamp; PDPA key-based redaction, now also covering renamed collaborators; and the `IMessageDoc` fixes.
- **New:** the diff estimate and the 4-slice PR plan.


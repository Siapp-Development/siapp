# Impl Plan — #133: Outbound WhatsApp Message Sending via Twilio

> Status: DRAFT — awaiting human approval of the Open Questions at the bottom.
> Scope: OUTBOUND ONLY. No inbound webhooks, no `/t` or `/p` UI, no template authoring.
> Tracks GitHub issue Siapp-Development/siapp#133. Implements the #19 dispatcher +
> real `TwilioProvider` seam left by #18 (`backend/functions/src/lib/messaging/provider.ts`).

## Goal

Wire the deferred #19 dispatcher and a real Twilio-backed `IMessageProvider` so that
`queued`, non-suppressed, past-`holdUntil` docs under `workspaces/{workspaceId}/messages`
are actually delivered over WhatsApp using the approved Content Templates
(`plans/whatsapp-templates-v1.md`), and their status/`providerSid`/`errorCode` are recorded
back on the doc. This closes the "enqueue-only" gap documented across #18/#24/#127 — the
enqueue pipeline (`lib/enqueueNotifications.ts`), quota alert (`triggers/messageUsage.ts`),
and collaborator-link flow already write `status: 'queued'` docs that currently never send.
The provider is credential-gated: with no Twilio config (local/emulator/CI) it falls back to
`NoopProvider` so builds and tests never hit the network. Multi-tenant isolation is preserved:
messages remain a per-workspace subcollection, server-written only, and the dispatcher iterates
per workspace exactly like `scheduled/dueSoonSweep.ts`.

## Touched surfaces & files

Surface: **backend Cloud Functions only** (`asia-southeast1`, set in `globalOptions.ts`). No
front-end bundle is touched, so D-036 bundle isolation is not at risk. Firestore rules for
`messages` stay server-only.

Create:
- `backend/functions/src/lib/messaging/twilioProvider.ts` — `TwilioProvider implements IMessageProvider`.
- `backend/functions/src/lib/messaging/contentSids.ts` — env-sourced `CONTENT_SIDS` registry + resolver keyed by `TNotificationTrigger` + locale.
- `backend/functions/src/lib/messaging/selectProvider.ts` — provider selection factory (Noop vs Twilio) + credential/emulator detection.
- `backend/functions/src/scheduled/dispatchQueue.ts` — the #19 dispatcher: pure planning fn (`selectDispatchable`) + DB-touching `sweepMessageQueue(now, provider)`.
- `backend/functions/src/lib/messaging/twilioProvider.test.ts` — Vitest, mocks the Twilio client.
- `backend/functions/src/lib/messaging/selectProvider.test.ts` — Vitest, selection logic.
- `backend/functions/src/scheduled/dispatchQueue.test.ts` — Vitest, pure filter + status-transition/claim logic.
- `backend/functions/src/lib/messaging/contentSids.test.ts` — Vitest, registry resolution + missing-SID handling.

Modify:
- `backend/functions/package.json` — add `"twilio"` to `dependencies` (caret range, consistent with `firebase-admin`/`firebase-functions`; recommend the latest v5 major, e.g. `"^5.x"` — pin exact in the PR after checking `pnpm-lock.yaml`).
- `backend/functions/src/index.ts` — add `export const onMessageDispatchSweep = onSchedule(...)` calling `sweepMessageQueue`, binding the two Twilio secrets + Content-SID params. Add the export to the header docblock list.
- `backend/functions/.env.siapp-prod` — add the (non-secret) `WA_SENDER` sender number and the per-trigger `WA_CONTENT_SID_*` params (HX… ids are not secrets; same committed-param pattern as `PORTAL_ORIGIN`).
- `backend/functions/src/lib/messaging/provider.ts` — extend `IQueuedMessage` with `trigger: TNotificationTrigger` and (optional) `locale` so the provider can resolve a ContentSid; keep `NoopProvider`. (See Open Question O-1 — alternative is templateName→trigger mapping with no seam change.)

Do NOT modify: `plans/impl-notification-inbox.md` (untracked), any front-end package, `firestore.rules` (messages already `read: isFirmMember`, `write: if false`), the enqueue writers.

## Data model changes

No new collection. Dispatcher only mutates existing `workspaces/{workspaceId}/messages/{messageId}` docs.

Fields the dispatcher READS (already written by `lib/enqueueNotifications.ts` / `triggers/messageUsage.ts`):
`status`, `suppressed`, `holdUntil`, `channel`, `recipientPhone`, `templateName`, `trigger`, `variables`.

Fields the dispatcher WRITES back:
- `status`: `'queued' → 'sent'` (on `ISendResult.ok`) or `'queued' → 'failed'`.
- `providerSid` (string): Twilio message SID on success.
- `errorCode` (string): mapped Twilio error code on failure.
- `sentAt` (Timestamp) on success / `failedAt` (Timestamp) on failure.
- **Claim guard** (idempotency, see below): a `dispatch` object — `dispatch.claimedAt` (Timestamp) and `dispatch.attempts` (number). Using a claim FIELD rather than a new `status: 'sending'` value avoids changing the shared `TMessageStatus` enum (`packages/shared/src/enums.ts`) and the client UI. (See Open Question O-2.)

Security-rules implications: NONE required. `messages` stays server-only (`write: if false`); the dispatcher runs with Admin SDK and bypasses rules. Workspace isolation is preserved because the sweep addresses each `workspaces/{wid}/messages` subcollection by parent id — no `collectionGroup` query is introduced (matching `dueSoonSweep.ts`, which already iterates `db.collection('workspaces').get()` then descends per workspace). Cross-tenant leakage is structurally impossible.

## Dispatcher design decision — SCHEDULED SWEEP (not a Firestore trigger)

**Decision: a scheduled `onSchedule` sweep is the sole consumer.** Rationale:

1. **`holdUntil` mandates it.** Enqueue writes `holdUntil` for messages created during quiet
   hours (`lib/quietHours.ts`); those docs are `queued` at create time but must NOT send until
   the window ends. A pure `onDocumentCreated` trigger fires once at create and would either
   send too early or need a self-rescheduling hack. A periodic sweep naturally re-evaluates
   `holdUntil <= now`.
2. **Consistency with the codebase.** `onDueSoonSweep` and `onTrialExpirySweep` are already
   `onSchedule` functions in `index.ts`. The sweep reuses the exact per-workspace descent
   pattern of `scheduled/dueSoonSweep.ts`.
3. **Avoids double-send.** `onMessageCreated` already exists on this path (usage counting). A
   second create-trigger dispatcher racing a sweep would risk double delivery. One consumer =
   one code path to make idempotent.

Trade-off: added latency up to the sweep interval. **Recommend every 1 minute** (`'* * * * *'`)
for acceptable delivery latency; if per-minute invocation cost/duration is a concern, fall back
to every 2–5 minutes. (See Open Question O-3.)

### Idempotency / status-transition model

Each candidate doc is processed under a Firestore transaction that CLAIMS it before any network
call, so overlapping sweeps or retries cannot double-send:

1. `selectDispatchable(docData, now)` (PURE, unit-tested without emulators) returns true iff:
   `status === 'queued'` AND `suppressed !== true` AND (`holdUntil` absent OR `holdUntil.toMillis() <= now`)
   AND `channel === 'whatsapp'` (SMS deferred, O-5) AND `recipientPhone` is a non-empty string.
2. For each candidate, `runTransaction`: re-read the doc; re-assert `status === 'queued'` and no
   existing `dispatch.claimedAt`; write `dispatch.claimedAt = now`, `dispatch.attempts = (prev+1)`.
   If the re-read fails the assertion (another sweep claimed it), skip.
3. After the transaction commits the claim, call `provider.send(...)` OUTSIDE the transaction
   (no network I/O inside a Firestore transaction).
4. On result, a second update: `status = 'sent'` + `providerSid` + `sentAt`, or `status = 'failed'`
   + `errorCode` + `failedAt`.

Status transitions are strictly `queued → sent | failed`. `delivered`/`read` remain reserved for a
future inbound status-webhook (#20, out of scope). A crash between claim and result-write leaves a
doc `status: 'queued'` with `dispatch.claimedAt` set; the next sweep’s claim step must treat a
`claimedAt` older than a staleness window (recommend 5 min) as reclaimable so it is retried
(bounded by `dispatch.attempts` — recommend max 3, then leave `queued` for human/alerting). (See O-4.)

Concurrency: per-workspace, per-doc sequential awaits with per-doc try/catch (mirrors
`dueSoonSweep.ts`), so one send failure never aborts the batch. Batching/pagination is a known
scale gap inherited from `dueSoonSweep.ts` and is explicitly out of scope here (noted as risk).

## Provider design — `TwilioProvider`

- Constructed from `accountSid`, `authToken`, `sender` (`whatsapp:+13604414161`), and a
  `resolveContentSid(trigger, locale) => string | null` closure over the registry.
- `send(msg: IQueuedMessage): Promise<ISendResult>`:
  - Resolve ContentSid by `msg.trigger` (+ locale, default `'en'`). If none → return
    `{ ok: false, errorCode: 'no_content_sid' }` (do not throw, do not call Twilio).
  - Build `contentVariables`: JSON.stringify of `msg.variables`, replacing any empty-string value
    with `'—'` (em-dash) because Twilio rejects empty declared variables
    (`plans/whatsapp-templates-v1.md`, esp. optional `dueDate`).
  - Call `client.messages.create({ from: 'whatsapp:+13604414161', to: 'whatsapp:'+recipientPhone, contentSid, contentVariables })`.
  - Success → `{ ok: true, providerSid: result.sid }`.
  - Twilio error → catch, map `error.code` (e.g. 63016/63021 per the templates checklist) to a
    string `errorCode`, return `{ ok: false, errorCode }`. Never rethrow (so one bad recipient
    doesn’t abort the sweep).
- No `console.log` (eslint `no-console: error`); use `firebase-functions` `logger`. Strict TS, no
  `any`, named exports, `function`/`class` declarations.

### Content-SID registry (`contentSids.ts`)

`CONTENT_SIDS: Record<TNotificationTrigger, Record<'en', string>>` populated from env params
(NOT hardcoded), mirroring the `defineString('PORTAL_ORIGIN')` pattern. Recommend one
`defineString('WA_CONTENT_SID_<TRIGGER>')` per trigger (8 params) committed to `.env.siapp-prod`
with `''` defaults; a resolver reads `.value()` and returns `null` for any unset/blank SID (so a
missing template degrades to a `failed`/skip rather than a crash). Alternative: a single
`WA_CONTENT_SIDS_JSON` param parsed once (fewer params, but coarser). (See O-6.)
Note: `TNotificationTrigger` is re-declared locally in backend (the shared package is source-only
and unconsumable by the NodeNext `tsc` build — see the existing mirror comments in
`messageUsage.ts`/`notifyConfig.ts`); this plan adds a local mirror in `contentSids.ts`.

### Config / secrets mechanism

- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` → `defineSecret(...)` in a small
  `lib/messaging/twilioConfig.ts` (mirrors `lib/mail.ts`’s `postmarkServerToken`). Read via
  `process.env.TWILIO_ACCOUNT_SID` / `process.env.TWILIO_AUTH_TOKEN` (the mail.ts pattern), and
  BOUND to `onMessageDispatchSweep` via `onSchedule({ secrets: [twilioAccountSid, twilioAuthToken] }, ...)`.
- `WA_SENDER` (the `whatsapp:+13604414161` sender) and `WA_CONTENT_SID_*` are non-secret
  `defineString` params in `.env.siapp-prod`.
- Nothing is hardcoded. Secrets never appear in committed files.

### NoopProvider fallback selection (`selectProvider.ts`)

`selectProvider(): IMessageProvider` returns `NoopProvider` when ANY of:
- `process.env.FUNCTIONS_EMULATOR === 'true'` (emulator), OR
- `!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN` (creds absent — CI/local),
- (optional) an explicit `WA_DISABLE_SEND` kill-switch param.
Otherwise returns a configured `TwilioProvider`. This mirrors `isMailConfigured()` degradability
in `lib/mail.ts`, guaranteeing tests and emulator runs never hit the network. The sweep calls
`selectProvider()` once per invocation and passes the instance to `sweepMessageQueue`.

## Steps (each independently verifiable)

1. Add `twilio` dep to `backend/functions/package.json`; `pnpm install`; `pnpm --filter @siapp/functions build` stays green. (Verify: lockfile updated, build passes.)
2. Extend `IQueuedMessage` in `provider.ts` with `trigger` (+ optional `locale`); keep `NoopProvider`. Typecheck. (Verify: `pnpm --filter @siapp/functions typecheck`.)
3. Add `lib/messaging/twilioConfig.ts` (`defineSecret` for SID/token) + `.env.siapp-prod` params (`WA_SENDER`, `WA_CONTENT_SID_*`). (Verify: params referenced compile; no secrets committed.)
4. Implement `lib/messaging/contentSids.ts` registry + resolver + local `TNotificationTrigger` mirror. Add `contentSids.test.ts`. (Verify: unit tests pass, missing SID → null.)
5. Implement `lib/messaging/twilioProvider.ts`. Add `twilioProvider.test.ts` mocking the twilio client (no network). (Verify: success maps `sid`→`providerSid`; error maps `code`→`errorCode`; empty var → `—`; missing SID → `no_content_sid`.)
6. Implement `lib/messaging/selectProvider.ts` + `selectProvider.test.ts`. (Verify: emulator/no-creds → Noop; creds present + not emulator → Twilio.)
7. Implement `scheduled/dispatchQueue.ts` (`selectDispatchable` pure + `sweepMessageQueue`). Add `dispatchQueue.test.ts`. (Verify: filter honours status/suppressed/holdUntil/channel/phone; claim prevents double-send; queued→sent/failed transitions with providerSid/errorCode.)
8. Wire `export const onMessageDispatchSweep = onSchedule({ region inherited, secrets:[...] }, ...)` in `index.ts`, calling `selectProvider()` then `sweepMessageQueue(new Date(), provider)`; update the header docblock. (Verify: build + `firebase deploy --dry`-equivalent typecheck.)
9. Full gate: `pnpm --filter @siapp/functions build && lint && typecheck && test` all green.

## Test plan (for Tester)

Vitest, co-located `*.test.ts`, default vitest (no backend `vitest.config`; mock `firebase-admin/firestore` the way `triggers/messageUsage.test.ts` does — hand-rolled fake `db`/`runTransaction`). NO network, NO emulator required for unit layer.

- **contentSids.test.ts**: resolver returns the configured HX for a known trigger+`en`; returns `null` for an unset SID; unknown locale falls back or returns null (per O-6/O-7 decision).
- **twilioProvider.test.ts** (mock the `twilio` module via `vi.mock('twilio', ...)`): 
  - success → `{ ok: true, providerSid }` and `messages.create` called with `from` sender, `to: 'whatsapp:'+phone`, correct `contentSid`, and `contentVariables` JSON;
  - empty-string variable (e.g. absent `dueDate`) is sent as `'—'`;
  - Twilio throw with `.code` → `{ ok: false, errorCode }`, no rethrow;
  - missing ContentSid → `{ ok: false, errorCode: 'no_content_sid' }`, `create` NOT called.
- **selectProvider.test.ts**: `FUNCTIONS_EMULATOR=true` → Noop; missing creds → Noop; both creds present + not emulator → TwilioProvider (assert instanceof / a discriminant).
- **dispatchQueue.test.ts**:
  - `selectDispatchable` truth table: queued+not-suppressed+no-hold+whatsapp+phone → true; suppressed → false; `holdUntil` in future → false, in past → true; `status !== 'queued'` → false; empty `recipientPhone` → false; `channel === 'sms'` → false.
  - `sweepMessageQueue` with fake db: a dispatchable doc gets claimed then updated to `sent` with `providerSid`; a provider failure → `failed` with `errorCode`; an already-claimed/`sent` doc is skipped (no second `send`); provider throwing is caught per-doc and does not abort remaining docs.
- **Rules tests**: none needed (no rule change). Optionally assert in `backend/rules-tests` that a client still cannot write `messages` (regression guard) — only if cheap; not required.

## Out of scope (deliberately)

- Inbound webhooks / auto-reply (#20), delivery/read status callbacks (`delivered`/`read`).
- SMS channel sending (docs may carry `channel: 'sms'`; dispatcher filters to `whatsapp` only — O-5).
- BM (`ms`) locale templates and any `TLocale` plumbing on message docs (MVP is `en`, D-026 defers `ms`).
- Authoring/approving the Content Templates or recording real HX SIDs (that is the manual submission checklist in `plans/whatsapp-templates-v1.md`).
- The documented `TTemplateVars` type gaps (`portalLink` on `ITaskStatusChangeVars`/`ITaskBlockedVars`, `taskLink` on `INeedHelpVars`, new `IWaQuota90Vars`) — these belong to the enqueue writers, not this outbound PR. Flagged, not fixed here.
- Batching/pagination/sharding of the sweep for scale (inherited gap from `dueSoonSweep.ts`).
- Any front-end change (message-status UI, notification inbox) — `plans/impl-notification-inbox.md` untouched.

## Risks / open questions (Decisions Needed before build)

- **O-1 — Seam shape for ContentSid resolution.** The registry is keyed by `TNotificationTrigger`, but `enqueueNotifications.ts` writes `templateName` values like `task_status_change_v1` (NOT the `siapp_<trigger>_v1_en` in the templates doc) AND the doc already carries a `trigger` field. Recommend resolving by `trigger` and extending `IQueuedMessage` with `trigger`. Alternative: keep the seam unchanged and map `templateName → trigger` inside the provider. Approve the seam change?
- **O-2 — Claim mechanism.** Recommend a `dispatch.claimedAt`/`dispatch.attempts` field instead of adding a `status: 'sending'` value to the shared `TMessageStatus` enum (which the firm-app UI reads). OK to avoid the enum change?
- **O-3 — Sweep cadence.** Recommend every 1 minute for low latency. Acceptable given per-invocation cost, or prefer 2–5 min?
- **O-4 — Retry/staleness policy.** Recommend reclaim after a 5-min stale-claim window, max 3 attempts, then leave `queued` (surface via logging/alert). Confirm the numbers and the "leave queued" terminal behaviour (vs marking `failed`).
- **O-5 — SMS.** Dispatcher filters to `channel === 'whatsapp'` and ignores `sms` docs for now. Confirm SMS is out of scope for #133.
- **O-6 — Content-SID param shape.** 8× `defineString('WA_CONTENT_SID_<TRIGGER>')` (clear, verbose) vs one `WA_CONTENT_SIDS_JSON`. Pick one.
- **O-7 — Missing/unapproved template at send time.** When a trigger has no configured HX (templates not yet approved), recommend marking the doc `failed` with `errorCode: 'no_content_sid'` (visible, non-crashing) rather than silently leaving it `queued`. Confirm.
- **O-8 — twilio version.** Recommend latest v5 major (`"^5.x"`); confirm exact pin after checking `pnpm-lock.yaml` / Node 22 support.
- **Risk — sweep scale.** Per-workspace full-collection iteration inherits `dueSoonSweep.ts`’s O(workspaces × queued) cost with no pagination; fine at MVP volume, must be sharded before scale. Flagged, not addressed here.
- **Note — decisions log.** No existing D-0nn decision is contradicted. D-001 (shared Siapp sender), D-002 (region `asia-southeast1`), D-035 (inbound reserved), D-036 (bundle isolation) are all honoured. If any binding decision fixes a sweep cadence or a `sending` status, this plan defers to it.

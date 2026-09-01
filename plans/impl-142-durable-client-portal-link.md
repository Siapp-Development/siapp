# impl-142 — Part B: Durable client portal link for automated task notifications

**Issue:** Siapp-Development/siapp#142 (Part B; direct continuation of #137, whose Parts A+C+D shipped via PR #137/#139 to `origin/main`).
**Type:** Read-only plan. Planner writes no code. Contains a security-posture decision (client portal-link durability) that MUST be human-approved BEFORE any code.
**Status:** Awaiting human sign-off. Verified against `origin/main` (A+C+D merged).

---

## Goal

Give the two AUTOMATED, client-facing task triggers — `task_status_change` and `task_blocked` — a **durable, non-churning** client portal link so their approved Meta templates (which render `https://siapp.app/p/{{portal_token}}`) have a working `portal_token` variable. Today the enqueue path emits NO link variable for these two triggers, and the client portal link is *rotate-on-issue* (no durable URL to embed, and re-minting would 404 in-flight WhatsApp links — violating D-042). Part B makes the client portal link durable (mirroring the already-shipped #127 collaborator model) and populates `portal_token` for CLIENT recipients of these two triggers only. `task_due_soon` stays link-less/internal (Part D) — Part B adds NO link there. Ties to: D-035 (WhatsApp outbound-notification-only), D-036 (portal links on apex `siapp.app/p`), D-027 (no magic links / no outbound while `lifecycle != 'published'`), D-042 ("in-flight WhatsApp links must not 404"), and the merged #137 token-only decision (F-1: emit bare `{shortCode}_{secret}`, domain baked into template body).

---

## Current state on `origin/main` (verified)

- `backend/functions/src/lib/enqueueNotifications.ts` — `templateVariables()` emits snake_case. For `task_status_change`: `{task_title, project_title, firm_name, new_status}`. For `task_blocked`: `{task_title, project_title, firm_name, blocked_reason}` (`blocked_reason` sourced from `taskData['blockedReason']`). **Neither emits any portal/link variable** — the in-code comment says link population is "deferred Part B". Only `task_due_soon` adds `due_date`. The `variables` map is built ONCE per event and shared across all recipients.
- Recipients (`resolveRecipients`): `notify.toClient` → client resolved from `projectData.clientId` → `clients/{clientId}` doc (subject to `waConsent`); `notify.toInternal` → members from `taskData.assignees` → `users/{uid}` (PDPA-exempt, `noConsent:false`).
- `published` gate (D-027): non-`published` lifecycle → record written but `suppressed:true, suppressedReason:'lifecycle:<x>'`; never sends.
- `enqueueTaskEvent` runs with a **system actor — there is NO user uid** in this path (`onTaskWrite` Firestore trigger / `dueSoonSweep` schedule). It reads workspace/client/member docs via Admin SDK and `ref.create()`s `workspaces/{wid}/messages/{id}`.
- `backend/functions/src/callables/issuePortalLink.ts` — client link is **rotate-on-issue** (`mintClientPortalLink(db, wid, projectId, clientId, issuerUid)` runs a transaction that revokes every active `audience=='client'`/`scopeType=='project'`/`scopeId==projectId`/`subjectId==clientId`/`revoked==false` link, then sets a new doc). Client magicLink doc stores `shortCode` + `secretHash` only — **NO plaintext `token` field**. `IMintedClientPortalLink = { url, token, expiresAt, linkId, rotated }` (token surfaced in-memory only). `requirePortalLinkIssuer` (owner/admin/pm) and `issueBlocker`/`PORTAL_ISSUABLE_LIFECYCLES` (`['published','completed']`) are exported.
- `backend/functions/src/callables/issueCollaboratorLink.ts` (#127, the durable model to mirror) — stores the **plaintext raw `token`** on its magicLink doc. `getOrCreateCollaboratorLink` reuse rule: `revoked==false && expiresAt>now && token` non-empty → reuse SAME url; else `mintCollaboratorLink` (rotates). Returns `created` flag; only explicit `reset:true` rotates. (Its mint is sequential, not transactional.)
- `backend/functions/src/callables/sendPortalLink.ts` (Part C, merged) — calls the rotate-on-issue `mintClientPortalLink` on EVERY press (each press rotates the client link) and enqueues a `project_welcome` message with `variables.portal_token = token` (bare token).
- `packages/shared/src/notificationTypes.ts` — `ITaskStatusChangeVars = {taskTitle, newStatus, projectTitle}` and `ITaskBlockedVars = {taskTitle, projectTitle}` — **neither has a link/token field**; `ITaskBlockedVars` has NO `blockedReason`. `IProjectWelcomeVars.portalToken` and `ICollabAccessLinkVars.accessToken` already exist (token-only rename shipped). Interfaces have zero importers and backend can't import them (doc-only).
- `firestore.rules` — `match /workspaces/{wid}/magicLinks/{shortCode} { allow read, write: if false; }` — unconditional server-only deny for read AND write (D-035). `IMagicLinkDoc.token?` is already an OPTIONAL field (added by #127) documented "server-only … redemption still verifies against `secretHash`, never this."
- Redemption (`redeemPortalLink`) — `parsePortalToken` splits `{shortCode}_{secret}` → collection-group lookup by `shortCode` → `verifySecret` constant-time compares `SHA-256(secret)` to stored `secretHash`. **The stored raw `token` is never used for verification** → a durable stored token does not weaken auth.
- `backend/functions/src/lib/portalTokens.ts` — `generatePortalToken()`→`{shortCode, secret, token:'{shortCode}_{secret}'}`; `hashSecret`, `verifySecret`; `buildPortalUrl(origin, token)`→`${origin}/p/${token}`; deterministic id helper `portalUid(wid,pid,cid)`→`portal_{wid}_{pid}_{cid}`; `PORTAL_LINK_TTL_MS=90d`.
- Env/dispatcher — `WA_CONTENT_SID_TASK_STATUS_CHANGE` and `WA_CONTENT_SID_TASK_BLOCKED` are BLANK in `.env.siapp-prod`. `contentSidFromRegistry` returns `null` for a blank SID; `TwilioProvider.send` returns `{ ok:false, errorCode:'no_content_sid' }` (O-7 safe no-op — never calls Twilio). No code depends on these being set.

---

## THE decision to approve — client portal-link durability (security posture)

Automated triggers have no issuer/user context and the current client link is rotate-on-issue with the secret never stored, so there is **no durable client URL to embed** and re-minting each event would revoke the client's still-circulating WhatsApp link (D-042 violation). Two viable options:

### Option 1 — Durable get-or-create client link, mirroring #127 (RECOMMENDED)
Store the raw `token` plaintext on the `audience=='client'` magicLink doc (the field `IMagicLinkDoc.token?` already exists and `magicLinks` is already rules-denied to all clients), add `getOrCreateClientPortalLink()` (mirror `getOrCreateCollaboratorLink`), and refactor `issuePortalLink` to **get-or-create by default + explicit `reset` to rotate**. The enqueue path (system actor) calls the get-or-create helper to obtain a STABLE url/token.

- **Stored at rest under Option 1:** `shortCode` (plaintext, already), `secretHash` (SHA-256, already), **and now `token = {shortCode}_{secret}` plaintext** on the client doc.
- **Attacker with DB read but NOT rules bypass** (Firestore export / backup / compromised Admin-SDK read): gains a *working* client portal URL → full access to that client's portal for whatever the portal grants, without needing the rules layer. Under the current (no-token) posture such an attacker gets only `secretHash` and cannot reconstruct a usable URL.
- **Blast radius:** one client-project per doc; a full export exposes every durable client link. Bounded per-workspace (`workspaces/{wid}/…`). **Identical tradeoff already accepted for collaborator links in #127.**
- **Revocation/rotation:** unchanged — soft-revoke (`revoked:true`) still works; explicit `reset:true` rotates; `secretHash` remains the ONLY value compared on redeem, so the stored token never weakens verification.
- **One-active-link + D-042:** preserved — get-or-create reuses the existing link; only `reset` rotates, so in-flight WhatsApp links keep working.
- **Cost:** MEDIUM. Refactor a security-sensitive callable + add a system-actor mint path + update tests. **This changes the CLIENT portal-link security posture and the rotate-on-issue behavior → REQUIRES explicit human sign-off.**

### Option 1b — HMAC-derived token (most "no raw secret at rest"-faithful)
Derive `secret = HMAC(server_key, wid|projectId|clientId)` so any path re-derives the SAME url without storing a reusable secret; persist only `secretHash` + a signing key in Secret Manager.

- **Stored at rest under 1b:** only `shortCode` + `secretHash` (no reusable token). The signing key lives in Secret Manager (a separate trust boundary).
- **Attacker with DB read only:** gains nothing usable — cannot derive tokens without also compromising the Secret-Manager key. Strongest confidentiality.
- **Cost:** MEDIUM-HIGH. New crypto primitive, Secret-Manager wiring, key-rotation policy (rotation invalidates ALL links at once), and a subtle change to the mint/verify path. **Diverges from the proven #127 pattern.**

### RECOMMENDATION (needs human sign-off)
**Adopt Option 1.** It is the SAME tradeoff already accepted and shipped for collaborator links (#127), reuses proven code, needs no new key management, and keeps redemption unchanged (`secretHash`-only). The confidentiality delta vs 1b matters only against an attacker who can read the DB but cannot bypass rules AND cannot reach Secret Manager — a narrow, already-accepted gap for collaborator links. Choose **1b only if** the reviewer explicitly wants "no reusable secret at rest" for client links and accepts key-management + a verify-path change. **Fallback if declined:** do not populate `portal_token` for these two automated triggers — leave them link-less until a durability model is approved (they then can only send once real SIDs + a link solution exist).

**Rules note:** Option 1 touches NO `firestore.rules` and needs NO type change (`magicLinks` deny-all and `IMagicLinkDoc.token?` already exist). Therefore the **security-rules auditor is NOT required for Part B**. The at-rest posture change is a code/data decision, not a rules change — but it still needs human sign-off. If any future variant DOES touch the `magicLinks` rule, the security-rules auditor becomes mandatory.

---

## Final variable set after Part B

Token-only is already the shipped contract (#137 F-1): emit the **bare `{shortCode}_{secret}`**; `https://siapp.app/p/` is baked into the template body.

| Trigger (template) | Recipient(s) | Final snake_case variables | `portal_token` source |
|---|---|---|---|
| `task_status_change` (`task_status_change_v1`) | **client-only** (forces `toInternal:false`) | `firm_name`, `project_title`, `task_title`, `new_status`, **`portal_token`** (NEW) | durable client link for `(wid, projectId, projectData.clientId)` via `getOrCreateClientPortalLink` — bare `token` |
| `task_blocked` (`task_blocked_v1`) | **client-only** (forces `toInternal:false`) | `firm_name`, `project_title`, `task_title`, `blocked_reason` (KEPT), **`portal_token`** (NEW) | same durable client link — bare `token` |

**`blocked_reason` decision — SHIPPED: KEEP `blocked_reason` on the client-facing `task_blocked` emit AND add `portal_token`.** The shipped `enqueueNotifications.ts` populates `variables['blocked_reason']` from `taskData.blockedReason` (empty string when absent) alongside the new `portal_token`; the #22 (D-d) "need-help reason" lands in the `task_blocked_v1` template. **Both `task_status_change` and `task_blocked` are CLIENT-ONLY** — the routing override forces `toInternal:false` (and `toClient:true`), so a firm member never receives these link-bearing messages. The final `task_blocked_v1` Content Template therefore declares BOTH `blocked_reason` and `portal_token` named variables (Meta matches by name; every declared var must be sent). Since `WA_CONTENT_SID_TASK_BLOCKED` is blank until the template is approved, **human must confirm** the approved copy declares exactly these variables before this ships. (Any member-facing status/blocked notification is OUT OF SCOPE — a separate future internal/member deep-link template.)

`packages/shared/src/notificationTypes.ts`: add `portalToken: string` to `ITaskStatusChangeVars` and `ITaskBlockedVars` (camelCase interface, emitted key `portal_token`). Documentation-only (zero importers).

---

## Part C consistency (C-6 revisited) — RECOMMEND: switch `sendPortalLink` to the durable get-or-create

**Recommendation: yes — switch `sendPortalLink` from rotate-on-issue `mintClientPortalLink` to `getOrCreateClientPortalLink`** so on-demand ("Send portal link" button) and automated (`task_status_change`/`task_blocked`) sends surface the SAME stable URL, and neither churns the link.

- **Behavior change (flag for approval):** the on-demand "Send portal link" button would STOP rotating the link on each press — it would re-surface the existing durable link (matching the new "Copy" get-or-create default). Rotation becomes an explicit `reset:true` action only. This is the same UX shift #127 made for collaborator "Send".
- **Audit:** mirror collaborator `sendCollaboratorLink` — audit `portal_link.issue` only when `created` (a fresh mint), nothing on reuse; `reset:true` audits `portal_link.reset`.
- If the reviewer prefers minimal churn to Part C, `sendPortalLink` can stay rotate-on-issue, but then on-demand and automated sends would surface DIFFERENT URLs for the same client and each button press would 404 the previously-sent automated link — undesirable. Recommend switching.

---

## Recipient scoping

`portal_token` is for **CLIENT** recipients of these two triggers. Constraint: `templateVariables()` builds ONE shared `variables` map per event, and the dispatcher substitutes an empty variable with an em-dash `—` — so a member message with an empty `portal_token` would render a broken `https://siapp.app/p/—`.

- **SHIPPED (LOCKED): force these two triggers CLIENT-ONLY.** The routing override in `enqueueNotifications.ts` sets `toClient:true, toInternal:false` for `task_status_change`/`task_blocked` (Q4), so a firm member is NEVER enqueued for these link-bearing templates. That structurally eliminates the em-dash-`portal_token` risk for members — there is no member recipient to render a broken URL — rather than relying on filling the shared var for everyone. The durable client link is still resolved ONCE per event and placed in the shared map for the client recipient.
- **Member status/blocked notifications are OUT OF SCOPE.** If the firm later wants members notified on status/blocked, that belongs to a **separate future member-facing template** (a member deep-link into the firm app, not the client portal tracker) — deferred, not part of #142.
- **D-027 gate still applies:** resolve/mint the link ONLY when `lifecycle=='published'` AND a non-suppressed client recipient exists. Draft/suppressed records leave `portal_token` unresolved (never mint on draft) — those records never send, so the empty var is harmless.

---

## Idempotency / perf (no repeated minting)

- The link is resolved ONCE per event (the shared `variables` map), NOT per recipient — so multiple recipients of one event trigger a single get-or-create.
- `getOrCreateClientPortalLink` runs entirely inside ONE `runTransaction`: it reads the deterministic per-triple **anchor** docRef first, then the active link that anchor points at; reuses when `revoked==false` AND `expiresAt>now` AND `token` non-empty; else mints (revoke-prior + set link + repoint anchor). Across many events (dueSoonSweep, repeated status changes) it reuses the durable link → one-active-link + D-042 preserved (in-flight links never 404).
- **Concurrent first-mint race (SHIPPED FIX):** the original design ran the active-link query with a plain `.get()` OUTSIDE any transaction, and the mint transaction only revoke-queried — Firestore does NOT lock empty result sets, so two concurrent first-mints for the same `(project, client)` could both create a link with a DIFFERENT token (breaks one-active-link + D-042). Fix: a **deterministic anchor/pointer doc** whose id is `portalLinkAnchorId(wid, projectId, clientId)` = `anchor_` + SHA-256 of `${wid}:${projectId}:${clientId}`, stored INSIDE the rules-denied `magicLinks` collection (NO `firestore.rules` change). Every mint reads `anchorRef` FIRST within the transaction — reading a specific docRef DOES create a contention/lock point (unlike a query on a non-existent set), so two concurrent transactions contend on the anchor: one commits, the other's read version is stale and it retries, re-reads the now-populated anchor and REUSES the winner's link (same token). `reset:true` funnels through the same anchor-first transaction (revokes the anchored link, repoints the anchor). The anchor pointer carries no `shortCode`/`audience`/`subjectId`/`revoked`, so the redeem collection-group lookup and the deletePersonalData revoke sweep never match it. (The collaborator `getOrCreateCollaboratorLink` shares this latent TOCTOU but is only reached by explicit user action — a follow-up issue mirrors this fix there.)

---

## Touched surfaces & files

Surface: `backend/functions` only (Cloud Run/Functions). No front-end change (the durability refactor is server-side; the "Send portal link" button already exists from Part C). Bundle isolation (D-036) unaffected.

Create/modify:
- `backend/functions/src/callables/issuePortalLink.ts` — **(Option 1)** populate the rules-denied plaintext `token` field on the client magicLink doc; add exported `getOrCreateClientPortalLink(db, wid, projectId, clientId, issuerUid): Promise<{ url, token, expiresAt, linkId, created }>` mirroring `getOrCreateCollaboratorLink` but with the client filters and a **transactional** mint branch; refactor the `issuePortalLink` callable to get-or-create by default with an explicit `reset:true` param that calls the existing rotate `mintClientPortalLink`. Audit: `portal_link.issue` on create, `portal_link.reset` on reset.
- `backend/functions/src/lib/enqueueNotifications.ts` — add `portal_token` to `task_status_change` and `task_blocked` in `templateVariables()`; **drop `blocked_reason`**; thread a resolved `clientPortalToken?: string` field through `IPlanTaskNotificationsInput` so `planTaskNotifications` stays pure; in `enqueueTaskEvent` (system actor) resolve the durable client link via `getOrCreateClientPortalLink` ONLY when `lifecycle=='published'` and a client recipient is present, passing a `'system'` issuer for `createdBy`.
- `backend/functions/src/callables/sendPortalLink.ts` — **(C-6)** switch from `mintClientPortalLink` to `getOrCreateClientPortalLink`; audit only on `created`.
- `packages/shared/src/notificationTypes.ts` — add `portalToken: string` to `ITaskStatusChangeVars` and `ITaskBlockedVars` (camelCase). Documentation-only.
- Tests (see Test plan): `backend/functions/src/lib/enqueueNotifications.test.ts`, `backend/functions/src/callables/issuePortalLink.test.ts` (or equivalent), `backend/functions/src/callables/sendPortalLink.test.ts`.

**Explicitly NOT touched:** `firestore.rules` (magicLinks deny-all + `IMagicLinkDoc.token?` already cover it → **no security-rules auditor needed**), `packages/shared` runtime, front-end apps, the Twilio provider/dispatcher, the blank content-SID env values.

---

## Data model changes

- `workspaces/{wid}/magicLinks/{id}` (client audience): now **populates the existing optional `token` field** (rules-denied plaintext `{shortCode}_{secret}`), identical to the collaborator-link doc shape. No new collection, field, or index. **Security-rules implication: NONE at the rules layer** (`allow read, write: if false` already covers it) — but the AT-REST secret posture for CLIENT links changes (flagged for sign-off). Multi-tenant isolation unchanged (links stay under `workspaces/{wid}/…`; queries are workspace-scoped).
- `workspaces/{wid}/messages/{id}`: `variables` gains `portal_token` for `task_status_change`/`task_blocked`; `blocked_reason` removed for `task_blocked`. Server-only collection — no schema/rules change.
- `packages/shared` type additions are documentation-only.

---

## Steps (each independently verifiable)

1. **Human sign-off gate** — approve Option 1 (vs 1b vs fallback), the `blocked_reason` drop (confirm approved template copy declares no `blocked_reason`), the C-6 switch, and the recipient-scoping call. Do not write code until resolved.
2. Branch fresh from `origin/main`: `feat/142-durable-client-portal-link`.
3. **B1** — `issuePortalLink.ts`: add durable `token` storage on the client doc; add exported `getOrCreateClientPortalLink()` with a transactional mint branch; refactor the callable to get-or-create + explicit `reset`. Verify: emulator tests — get-or-create returns SAME url on repeat; `reset:true` rotates + revokes prior; one-active-link holds under concurrent calls; redeem still verifies `secretHash` (token never used for verification).
4. **B2** — `notificationTypes.ts`: add `portalToken` to `ITaskStatusChangeVars`/`ITaskBlockedVars`. Verify: `pnpm -w typecheck` green.
5. **B3** — `enqueueNotifications.ts`: thread `clientPortalToken` through `IPlanTaskNotificationsInput`; emit `portal_token` for the two triggers; drop `blocked_reason`; resolve the durable link in `enqueueTaskEvent` gated on `published` + client recipient, `'system'` issuer. Keep `planTaskNotifications` pure. Verify: unit tests (portal_token present when published, absent/empty when suppressed/draft; no `blocked_reason`); emulator test that two successive `enqueueTaskEvent` calls embed the SAME `portal_token` (no rotation — D-042).
6. **B4 (C-6)** — `sendPortalLink.ts`: switch to `getOrCreateClientPortalLink`; audit only on `created`. Verify: emulator test — repeat sends surface the SAME url; `reset` path still rotates.
7. Full gate: `pnpm -w build && pnpm -w lint && pnpm -w typecheck && pnpm -w test` green (TS strict, no `any`, no `console.log`, named exports).
8. Conventional commits; PR closing #142 with the security-posture change called out for review.

---

## Test plan (for Tester)

- **Emulator (`issuePortalLink`, get-or-create):** get-or-create returns the SAME url/token on repeat; `reset:true` rotates + soft-revokes the prior; one-active-link invariant under concurrent calls (transaction); audit `portal_link.issue` on first mint, `portal_link.reset` on reset; `redeemPortalLink` still succeeds against `secretHash` and never reads the stored `token`.
- **Unit (`enqueueNotifications.test.ts`):** `task_status_change` planned record has `portal_token` (non-empty when published); `task_blocked` planned record has `portal_token` and NO `blocked_reason`; suppressed/draft (D-027) records leave `portal_token` empty/absent and stay `suppressed`; existing snake_case + dedupe-id assertions still pass.
- **Emulator (durability across events):** two successive `enqueueTaskEvent` calls for the same `(project, client)` embed the SAME `portal_token` (no rotation) — proves in-flight WhatsApp links don't 404 (D-042).
- **Emulator (recipient scoping):** when `notify.toInternal` is set, member recipient messages carry the same `portal_token` (no broken em-dash URL) — or assert members are excluded, per the approved recipient-scoping decision.
- **Emulator (`sendPortalLink`, C-6):** repeat sends surface the SAME url (get-or-create, no rotation); consented client → queued `project_welcome` message with non-empty `portal_token`; opted-out → `{status:'opted_out'}` no enqueue; no-consent → `{status:'no_consent'}` no enqueue; audit `portal_link.issue` only on `created`.
- **Rules test:** confirm `workspaces/{wid}/magicLinks/{id}` (now carrying a client `token`) remains fully denied to client AND member reads/writes.

---

## Out of scope (deliberately)

- Any link for `task_due_soon` (Part D keeps it link-less/internal) — Part B adds none.
- Building/registering the Twilio Content Templates or filling `WA_CONTENT_SID_TASK_STATUS_CHANGE` / `WA_CONTENT_SID_TASK_BLOCKED` (human fills these AFTER Part B ships and the templates are confirmed to require `portal_token`; blank SID → `no_content_sid` safe no-op, no code depends on them).
- `new_status` humanization (raw enum → human label) — pre-existing open question, not in Part B.
- Excluding members from client-facing templates or authoring a separate member template (recipient-scoping alternative) — deferred.
- Any `firestore.rules` structural change, front-end change, admin-surface change, or BM (`ms`) template variants (D-026, v1.5).
- Option 1b HMAC/Secret-Manager implementation (only if the reviewer picks 1b over the recommended Option 1).

---

## Risks / open questions (need a human call)

1. **Client portal-link durability (PRIMARY, blocking).** Approve Option 1 (rules-denied plaintext `token` + get-or-create/reset, mirroring #127) vs Option 1b (HMAC + Secret Manager) vs fallback (defer link population)? Changes the client portal-link at-rest posture and the rotate-on-issue behavior.
2. **`blocked_reason` drop.** Confirm the approved `task_blocked_v1` template copy declares NO `blocked_reason` named variable (so dropping it is correct and won't break Meta substitution). If a member-facing reason is wanted, it needs a separate internal template (out of scope).
3. **C-6 switch.** Approve switching `sendPortalLink` to get-or-create (on-demand "Send portal link" stops rotating each press; rotation becomes explicit `reset`).
4. **Recipient scoping.** For `task_status_change`/`task_blocked` fanned out to members (`notify.toInternal`): OK to give members the client's `portal_token` (mild same-workspace exposure of a client tracker link, pre-existing), or must members be excluded from these client-facing templates?
5. **System actor for automated mint + audit.** Automated first-mint has no user uid — use `createdBy:'system'` and, if audited, `actorType:'system'`? Confirm the audit-log schema accepts a system actor, or that the enqueue path may mint WITHOUT writing an audit entry.
6. **Security-rules auditor.** Part B touches NO `firestore.rules` (deny-all + `IMagicLinkDoc.token?` already exist) → auditor not required. Confirm no reviewer wants a rules change (e.g. an explicit field-level assertion) that would re-introduce the auditor requirement.

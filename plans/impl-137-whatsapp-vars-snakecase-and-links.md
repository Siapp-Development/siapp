# impl-137 — WhatsApp template variables → snake_case + populate portal/task links

**Issue:** Siapp-Development/siapp#137 (follow-up to outbound WhatsApp #133/#135, merged to `origin/main`).
**Type:** Read-only plan. No code written by Planner. Parts A + C ship in one PR; Part B may follow separately (see Sequencing & rollout).
**Status:** Awaiting human approval. Parts **A + C are shippable now** (no security-posture change). Part **B** contains a security-posture decision (portal-link durability) that MUST be signed off BEFORE any B code is written — B can follow as a separate PR (see Sequencing & rollout).

> **UPDATE (implementation of the APPROVED scope, #137):** This PR implements **Part A + Part C + token-only links (F-1)**. **Part B is a DEFERRED follow-up** and is NOT implemented here. Explicitly deferred: refactoring `issuePortalLink.ts` to durable get-or-create, durable-link (plaintext-`token`) storage, and populating `portal_link`/`task_link` on the 3 automated task templates (`task_status_change`, `task_blocked`, `task_due_soon`). Those task templates carry snake_case variables but **no link variable** in this PR. Part A here is a key-RENAME only (`blocked_reason` is KEPT, not dropped — dropping it is tied to Part B's client-copy change). Token-only (F-1) IS applied to the in-scope link templates: `sendCollaboratorLink` emits `access_token` and `sendPortalLink` (Part C) emits `portal_token` — both bare `{shortCode}_{secret}` tokens, no full URL. Part C reuses the existing rotate-on-issue mint (extracted as `mintClientPortalLink`) with no durability change (C-6).

---

## Goal

Three corrections/additions to the outbound-WhatsApp path so queued `messages` records render on Meta AND a firm can share a client's portal link over WhatsApp on demand:

1. **(A) snake_case variable names.** The enqueue code writes `contentVariables` keys in camelCase (`taskTitle`, `projectTitle`, `firmName`, `newStatus`, `blockedReason`, `dueDate`; and `firmName`/`collaboratorName`/`accessLink` for the collaborator link). The approved Meta templates in [plans/whatsapp-templates-v1.md](./whatsapp-templates-v1.md) use snake_case **named** variables (`task_title`, `project_title`, `firm_name`, `new_status`, `due_date`, `collaborator_name`, `access_link`, `portal_link`, `task_link`). Meta matches variables by EXACT name, so today every send would fail variable substitution (Twilio 63016/63021). Align the emitted keys to snake_case.
2. **(B) Populate the deferred link variables.** The templates end client-facing messages with `{{portal_link}}` and collaborator/internal messages with `{{task_link}}`. The enqueue path emits neither today, so `task_status_change`, `task_blocked`, and `task_due_soon` would send templates with unfilled link variables (Twilio rejects empty variables). Populate them with WORKING URLs.
3. **(C) Client "Send portal link via WhatsApp" — new on-demand callable.** No path today sends a CLIENT their portal link over WhatsApp: `callables/issuePortalLink.ts` mints a client magic link but never enqueues a message, and the `project_welcome` trigger (already in `TNotificationTrigger` + `IProjectWelcomeVars`) is unwired. Add a `sendPortalLink` callable that MIRRORS `sendCollaboratorLink`: it mints the client portal link and enqueues a `project_welcome` `messages` doc with snake_case variables, plus a firm-app "Send portal link" button. Because (C) mints+enqueues in ONE explicit user action (fresh URL captured at send time, exactly like `sendCollaboratorLink`), it does NOT depend on (B)'s durable-link decision — see Sequencing.

Ties to: D-035 (WhatsApp is outbound-notification-only), D-036 (portal/collab links live on the apex `siapp.app/p` `/t`; firm app on `dashboard.siapp.app`), D-027 (no magic links / no outbound while `lifecycle != 'published'`), D-042 ("in-flight WhatsApp links must not 404"), MVP scope #18/#19/#22/#127.

---

## Current state (verified against `origin/main`)

- **Only three task triggers + one collaborator trigger actually write a `messages` doc.** `task_assigned`, `need_help`, `project_welcome`, `inbound_auto_reply` are NOT enqueued to WhatsApp anywhere in `backend/functions/src` (`task_assigned` / `need_help` exist only in the in-app fan-out: `lib/notificationFanout.ts`, `callables/submitCollabUpdate.ts`). The only `messages` writers are `lib/enqueueNotifications.ts` and `callables/sendCollaboratorLink.ts`.
- `lib/enqueueNotifications.ts` — `templateVariables()` (lines 144-168) emits `taskTitle`/`projectTitle`/`firmName` always, plus `newStatus` (status_change), `blockedReason` (blocked), `dueDate` (due_soon, MYT-formatted). The map is computed ONCE (line 186) and shared across all recipients of the event. `planTaskNotifications()` is pure; `enqueueTaskEvent()` does the Admin-SDK reads/writes. Called live from `index.ts` `onTaskWrite` (status_change/blocked) and `scheduled/dueSoonSweep.ts` (due_soon).
- `callables/sendCollaboratorLink.ts` (lines 78-82) emits `{ firmName, collaboratorName, accessLink }`.
- `packages/shared/src/notificationTypes.ts` — interfaces have **zero importers** in `backend/functions` or `apps/` (backend cannot import `@siapp/shared` under NodeNext, so it mirrors shapes locally). `ITaskDueSoonVars` ALREADY declares `taskLink`; `ITaskStatusChangeVars` and `ITaskBlockedVars` have NO link field; `INeedHelpVars` has NO `taskLink`.
- **No dispatcher consumes the `variables` keys yet** (`lib/messaging/provider.ts` is a stub; nothing forwards to Twilio; `lib/pdpa.ts` redacts generically without depending on key names). So renaming keys is safe from a runtime-consumer standpoint — this is a correctness fix for the future dispatcher + Meta.
- **ESLint does NOT enforce `@typescript-eslint/naming-convention`** — snake_case keys/object literals will not fail lint.
- **Portal magic-link durability gap.** `callables/issuePortalLink.ts` ROTATES on every issue: it revokes all active `audience=='client'` links for the (project, client) pair and mints a fresh one, storing ONLY `shortCode` + `secretHash` (no plaintext token) — comment: "an existing link's URL can never be re-surfaced" (the in-code "secret never at rest" property, referred to as D2 in the code header; NOTE: there is **no `D-0nn` entry** in `decisions-log.md` for this or for #127 — these are code-level decisions). By contrast `callables/issueCollaboratorLink.ts` (#127) is **get-or-create + explicit reset**: it stores the raw `token` plaintext on the magicLink doc (rules-denied to all clients — `firestore.rules` `match /magicLinks/{shortCode} { allow read, write: if false; }`), so `getOrCreateCollaboratorLink()` re-surfaces the SAME durable URL; redemption still verifies `secretHash` only. `PORTAL_ORIGIN` (default `https://siapp.app`) and `APP_ORIGIN` (default `https://dashboard.siapp.app`, defined in `callables/invites.ts`) already exist; workspace docs carry a `slug` (`/^[a-z0-9-]{3,40}$/`).

---

## The hard design problem — how automated CLIENT notifications get a stable, secure link

Automated triggers in `enqueueNotifications.ts` run with NO issuer/user context (`dueSoonSweep` is a scheduled sweep; `onTaskWrite` is a Firestore trigger). Client portal links are rotate-on-issue and the raw secret is never stored, so there is **no durable client URL to embed** and no re-surface path. `{{portal_link}}` cannot be empty (Twilio rejects empty variables), so the enqueue path must be able to obtain a real, stable client URL without breaking the one-active-link invariant or re-issuing (which would revoke the client's earlier, still-circulating link — violating D-042 "in-flight WhatsApp links must not 404").

### Options evaluated

**Option 1 — Durable get-or-create client portal link, mirroring #127 (RECOMMENDED).**
Store the raw `token` plaintext on the `audience=='client'` portal magicLink doc (already rules-denied to all clients), add `getOrCreateClientPortalLink()` (mirror `getOrCreateCollaboratorLink`), and refactor `issuePortalLink` to get-or-create by default + explicit `reset` to rotate (mirror `issueCollaboratorLink`). The enqueue path calls the get-or-create helper (system actor) to obtain the stable URL.
- Security: raw token now readable by anyone with Admin-SDK / Firestore-export / backup access — the SAME tradeoff #127 already accepted for collaborator links. `secretHash` remains the only value compared on redeem. One-active-link invariant preserved (get-or-create reuses; only reset rotates). Revocation still works (soft-revoke).
- UX/deliverability: best — one stable client URL, prior WhatsApp links keep working (satisfies D-042), consistent with #127.
- Cost: MEDIUM. Refactor a security-sensitive callable (`issuePortalLink`) to get-or-create+reset, add token storage, add helper, add a system-actor mint path, update issuePortalLink tests. **Contradicts the in-code "secret never at rest" (D2) property for portal links and changes rotate-on-issue behavior → REQUIRES explicit human sign-off.**

**Option 1b — Deterministic/derived token via keyed HMAC (most D2-faithful; alternative to 1).**
Derive the secret as `HMAC(server_key, wid|pid|cid)` so any path re-derives the SAME URL without storing the raw secret; persist only `secretHash` + a server-managed key in Secret Manager.
- Security: preserves "no raw secret at rest" (only a signing key + hash), durable, re-derivable. Key rotation invalidates all links at once; introduces a new crypto primitive + key-management surface.
- Cost: MEDIUM-HIGH (Secret Manager wiring, key rotation policy). More elegant re D2 but diverges from the #127 pattern.

**Option 2 — Per-notification mint (issue a fresh link each enqueue). REJECTED.**
Matches the D-036 reversal note ("WA links unaffected since tokens are re-sent per notification"), BUT every automated send would REVOKE the client's earlier link (rotate-on-issue), so any earlier WhatsApp link 404s after the next status change — directly violates D-042. It also breaks `planTaskNotifications` purity/idempotency (re-runs would mint again) and floods `magicLinks` (dueSoonSweep mints en masse). Highest link-churn and worst UX. Not recommended.

**Option 3 — Durable public shortCode + separate auth at open. REJECTED for #137.**
A durable `/p/{shortCode}` URL with the secret proven at portal-open (e.g. phone OTP). Current portal auth requires the secret IN the URL token (`{shortCode}_{secret}`, verified by `redeemPortalLink`), so this is a full portal-auth redesign and adds tap-through friction that contradicts the "no app / no sign-up" portal ethos. Out of scope; large cost.

### Recommendation (FLAG FOR RUBBER-DUCK / HUMAN SIGN-OFF)

Adopt **Option 1** (mirror #127: durable get-or-create client portal link, `issuePortalLink` → get-or-create + explicit reset, store rules-denied plaintext token). Consider **Option 1b** if the reviewer wants to preserve "no raw secret at rest" and accepts Secret-Manager key management. This changes the security posture of client portal links and the rotate-on-issue behavior; it MUST be approved before code.

**Fallback if the reviewer declines the portal-durability change:** ship **part A (snake_case) alone** in #137 and DEFER part B (link population) until the durability decision is made — because there is no way to fill `{{portal_link}}`/`{{task_link}}` for client recipients with a working, non-churning URL otherwise.

---

## Decision: TS interface keys vs emitted map keys

**Keep the `packages/shared/src/notificationTypes.ts` interfaces camelCase (idiomatic); emit snake_case ONLY at the Twilio boundary (the `variables` object literal in `enqueueNotifications.ts` and `sendCollaboratorLink.ts`).** Rationale:
- The templates doc's tables already model exactly this: a snake_case **template variable** column and a camelCase **"Maps to"** type-field column (e.g. `task_title` | `taskTitle`). The bug #137 fixes is that the CODE emits camelCase into `contentVariables`; the interfaces were never the wrong shape.
- `IBaseTemplateVars` mixes envelope metadata (`templateName`, `trigger`) — which are NOT Twilio content variables — with content variables; snake_casing the whole interface would wrongly snake_case envelope fields.
- Interfaces have zero consumers and backend can't import them, so snake_casing them would be cosmetic while fighting TS idiom.
- New link fields are added camelCase: `portalLink`, `taskLink`.

(Alternative considered and rejected: make interface keys snake_case as pure wire-DTOs. Valid — zero lint risk, single source of truth — but conflates envelope fields and breaks TS idiom for no functional gain since nothing consumes them.)

---

## Resolved FINAL variable set per wired trigger

Only currently-enqueued triggers are wired. `blocked_reason` is DROPPED from the client-facing `task_blocked` template (doc §5 copy decision: client message says "on hold" and deliberately omits the internal reason to avoid leaking restricted content). `need_help` (internal) legitimately keeps `reason` — but `need_help` is NOT enqueued today, so its `taskLink` addition is TYPE-ONLY.

| Trigger (template) | Recipient(s) | Final snake_case variables | Source of each value |
|---|---|---|---|
| `task_status_change` (`siapp_task_status_change_v1_en`) | client (± member per `notify.toInternal`) | `firm_name`, `project_title`, `task_title`, `new_status`, `portal_link` | `firm_name`=workspace `name`; `project_title`=`projectData.name`; `task_title`=`taskData.title`; `new_status`=`taskData.status` (⚠ currently RAW enum e.g. `in_progress`; doc wants a human label — humanization flagged as open question, out of this PR's core); `portal_link`=durable client portal URL for (wid, projectId, `projectData.clientId`) via `getOrCreateClientPortalLink`. **Finding 2 (recommended): rename var → `portal_token`, value = bare `{shortCode}_{secret}`; bake `https://siapp.app/p/` into the template body.** |
| `task_blocked` (`siapp_task_blocked_v1_en`) | client (± member) | `firm_name`, `project_title`, `task_title`, `portal_link` | same sources as above; **`blocked_reason` DROPPED**. **Finding 2 (recommended): `portal_link`→`portal_token` (bare token; domain in body).** |
| `task_due_soon` (`siapp_task_due_soon_v1_en`) | client and/or member | `firm_name`, `project_title`, `task_title`, `due_date`, `task_link` | `due_date`=MYT-formatted `taskData.dueDate` (`"—"` when absent — doc note; today emits `''`); `task_link`= client portal URL for client recipients, dashboard deep link `${APP_ORIGIN}/${slug}/projects/${projectId}` for member recipients (⚠ see open question — single template, value varies by recipient type). **Finding 2 (recommended): `task_link`→`task_token` (bare token) for the CLIENT value; the member dashboard deep link has NO token form — see open Q F-2.** |
| `collab_access_link` (`siapp_collab_access_link_v1_en`) | collaborator | `firm_name`, `collaborator_name`, `access_link` | `firm_name`=workspace `name`; `collaborator_name`=collaborator `name`; `access_link`=`getOrCreateCollaboratorLink` URL (unchanged behavior, keys renamed). **Finding 2 (recommended): rename `access_link`→`access_token`, emit bare `{shortCode}_{secret}`, bake `https://siapp.app/t/` into the body.** |
| `project_welcome` (`siapp_project_welcome_v1_en`) | client (on-demand, Part C) | `firm_name`, `client_first_name`, `project_title`, `project_due_date`, `portal_link` | `firm_name`=workspace `name`; `client_first_name`=first token of client `name` (⚠ `IClientDoc` has a single `name` field, no first-name split — see open Q C-2); `project_title`=project `name`; `project_due_date`=`mytDateString(project.targetEndDate)` (⚠ project doc has NO `dueDate`; the due field is `targetEndDate?: Date` — see open Q C-3; `"—"` when absent); `portal_link`=freshly minted client portal URL via `buildPortalUrl(PORTAL_ORIGIN, token)`. **Finding 2 (recommended): emit the bare `token` (`{shortCode}_{secret}`) as `portal_token`; bake `https://siapp.app/p/` into the body — no `buildPortalUrl` at emit time.** |

Per-recipient link note: `templateVariables()` currently builds ONE shared map. To vary the link by recipient type, compute a `clientPortalLink` and a `memberTaskLink` once (per project/task) and select in the per-recipient `map()`. Resolve/mint the client link ONLY when the project is `published` and there is a non-suppressed client recipient (D-027: no magic links in draft); leave `portal_link`/`task_link` empty on suppressed/draft preview records (they never send).

### Template authoring contract — named variables (Finding 1, CONFIRMED CORRECT — no code change)

The merged #133 dispatcher (`backend/functions/src/lib/messaging/twilioProvider.ts`) sends variables as a **name-keyed JSON map**, NOT positional args. `buildContentVariables(variables)` iterates `Object.entries(variables)` and `JSON.stringify`s the object *preserving each key* (only substituting an em-dash `—` for empty values), and the result is passed straight through as `contentVariables` to `client.messages.create({ from, to, contentSid, contentVariables })`. Twilio/Meta then substitute **by name**.

**CONTRACT (do not regress):** every Content Template's declared variables MUST use NAMED placeholders whose names are EXACTLY the snake_case keys the enqueue code emits (`firm_name`, `project_title`, `task_title`, `new_status`, `due_date`, `collaborator_name`, and the link variable per the format decision below). Template authors MUST NOT use positional `{{1}}`/`{{2}}` placeholders — because our map is name-keyed, positional templates would receive no substitution and every send would fail (Twilio 63016/63021) with no compile-time or lint signal. This is the same failure mode Part A fixes at the code side (camelCase keys never matched the named templates); the contract locks BOTH sides to the same snake_case names. (Note: on this worktree branch the provider is present as the compiled `dist/.../twilioProvider.js` artifact; the source ships on the merged #133 work per this plan's header — the name-keyed behaviour is what origin/main carries.)

---

## Link variable format: full-URL value vs token-only (Finding 2 — DECISION, needs sign-off)

**The tension.** Every link-bearing template today passes the ENTIRE URL as the variable *value*: `sendCollaboratorLink.ts` emits `access_link = https://siapp.app/t/{token}`, and Parts B/C plan `portal_link`/`task_link` as full URLs too. Meta/Twilio template review may flag a **full-URL placeholder** as "a generic placeholder that could be used for abuse," raising REJECTION risk. The lower-risk form bakes the **static domain + path into the template BODY** and has the CODE emit only the **bare token** as the variable value.

**What the "bare token" actually is.** `buildPortalUrl(origin, token)` returns `${origin}/p/${token}` and `buildCollabUrl` returns `${origin}/t/${token}`, where `token = {shortCode}_{secret}` (`portalTokens.ts` lines 85-89, 119-123). Portal/collab auth requires the **secret in the URL** (`redeemPortalLink` verifies `secretHash` against the secret parsed from the token), so the bare token is the FULL `{shortCode}_{secret}` path segment — NOT just the 12-char `shortCode`. It is a ~60+ char opaque string (alphanumeric shortCode + `_` + 43-char base64url secret), which is exactly why it reads as an opaque code rather than an abuse-prone URL placeholder. `origin` is `PORTAL_ORIGIN` (default `https://siapp.app`).

**Helper impact.** `getOrCreateCollaboratorLink`/`mintCollaboratorLink` (`issueCollaboratorLink.ts`) and the planned `mintClientPortalLink`/`getOrCreateClientPortalLink` currently return `{ url, ... }` and NOT the raw token — but the plaintext `token` is already in scope in each (it is stored plaintext on the `magicLinks` doc under #127, rules-denied). Token-only therefore needs each helper to ALSO return `token` (trivial: it is already a local), and the emit sites to send `token` instead of `buildCollabUrl(...)`/`buildPortalUrl(...)`. No new crypto, no `magicLinks` shape change. Optionally add a `buildPortalToken()` accessor for symmetry, but it is just the existing `token`.

**Per-template evaluation (all 5 link-bearing templates).**

| Template | Var (today) | Full-URL value (current) | Token-only value (recommended) | Body change needed |
|---|---|---|---|---|
| `siapp_project_welcome_v1_en` (C) | `portal_link` | `https://siapp.app/p/{shortCode}_{secret}` | `{shortCode}_{secret}` | body line → `https://siapp.app/p/{{portal_token}}` |
| `siapp_task_status_change_v1_en` (B) | `portal_link` | `https://siapp.app/p/…` | `{shortCode}_{secret}` | `https://siapp.app/p/{{portal_token}}` |
| `siapp_task_blocked_v1_en` (B) | `portal_link` | `https://siapp.app/p/…` | `{shortCode}_{secret}` | `https://siapp.app/p/{{portal_token}}` |
| `siapp_task_due_soon_v1_en` (B) | `task_link` | client `https://siapp.app/p/…` / member `https://dashboard.siapp.app/{slug}/projects/{pid}` | client `{shortCode}_{secret}` — **member deep link has NO token form** | ⚠ mixed: token cleanly covers the CLIENT value; member dashboard deep link has no bare-token form → open Q F-2 |
| `siapp_collab_access_link_v1_en` (A) | `access_link` | `https://siapp.app/t/{shortCode}_{secret}` | `{shortCode}_{secret}` | `https://siapp.app/t/{{access_token}}` |

**Rejection risk (the driving factor).** Token-only wins: an opaque code is far less likely to be flagged than a full-URL placeholder. This is the deciding factor.

**Consistency requirement.** If we adopt token-only we MUST change it for ALL FIVE templates AND every emit site — INCLUDING `sendCollaboratorLink.ts` (which emits a full URL today) — so collaborator + client + task links are uniform. Half-migrating (token-only for new B/C links but leaving `access_link` a full URL) would leave one template at the higher rejection risk and split the authoring contract.

**The "can't end on a variable" tension (FLAG).** Meta rejects bodies that START or END with a variable. Critically, **token-only does NOT fix this by itself**: a body ending `…https://siapp.app/p/{{portal_token}}` still ENDS on a variable. The current full-URL drafts (`whatsapp-templates-v1.md` §1/§3/§4/§5/§9) ALSO end on `{{portal_link}}`/`{{task_link}}`/`{{access_link}}` — so BOTH approaches share this exposure. Resolution (applies to whichever format is chosen): the link must NOT be the final token in the body. Options — (a) add a trailing text line after the link (e.g. "— your Siapp tracker" / "This link is private to you.") — safest, keeps a clean tappable URL; (b) append a trailing period after the token (`…/{{portal_token}}.`) — WhatsApp strips trailing punctuation so it still taps, but more fragile than (a). Keeping the whole URL as one variable does NOT sidestep the rule either. So this fix is orthogonal to the URL-vs-token choice; do it regardless.

**Link-preview / tappability UX.** WhatsApp linkifies the FINAL rendered message text, not the template source. `https://siapp.app/p/` (static) + `{{portal_token}}` (variable) concatenate into one contiguous URL string (the token is alphanumeric/base64url with no spaces), so WhatsApp still renders a tappable link and preview exactly as with a full-URL value — PROVIDED there is no whitespace/newline between the static path and the token. No UX regression from token-only; the only authoring rule is "no space before the token."

**Backward-compat / versioning.** Changing a template body from full-URL to static-path+token is a body change → under the doc's rule ("never mutate an approved template's meaning; bump `v2`") it would force a re-author + re-approval of all 5. **BUT none of these templates are approved yet** — `whatsapp-templates-v1.md` is a DRAFT pack and its submission checklist is entirely unchecked. So making this decision NOW, before first Content-Template-Builder submission, costs ZERO re-approval. If we ship the full-URL form first and switch later, we pay a full `_v2` re-approval cycle on all 5. This is the strongest reason to decide before authoring.

**Interaction with Parts A/B.**
- Part A (snake_case): token-only also RENAMES the link variable itself (`portal_link`→`portal_token`, `task_link`→`task_token`, `access_link`→`access_token`) to signal "bare token, not URL" and reinforce the Finding-1 contract. The Part-A rename in `sendCollaboratorLink.ts` then targets `access_token` (value = token), not `access_link` (value = URL).
- Part B (durability): unchanged decision — Option 1/1b still governs whether the client link is durable; token-only only changes WHAT is emitted (the durable link's `token` rather than its URL). The get-or-create helper must return `token`.

### RECOMMENDATION (FLAG FOR HUMAN SIGN-OFF)

**Adopt TOKEN-ONLY for all five link-bearing templates, decided NOW before any template is submitted for approval.** Rationale: (1) lower Meta rejection risk (opaque code vs abuse-prone full-URL placeholder) — the driving factor; (2) zero re-approval cost because the pack is still an unapproved draft; (3) uniform across collaborator/client/task, reinforcing the named-variable contract. Apply it consistently (rename vars to `*_token`, emit bare `{shortCode}_{secret}`, bake `https://siapp.app/p/` and `/t/` into the bodies) AND separately fix the end-on-variable exposure by adding a trailing text line after the link in every link-bearing template.

**Safer-fallback / if the reviewer prefers minimal churn:** keep the full URL as a single variable (least code change, matches the current drafts), accept the modest abuse-flag rejection risk, and mitigate by putting the URL on its own final line with a trailing text line after it. This still requires the end-on-variable fix. If a template is later rejected for the URL placeholder, fall back to token-only (a `_v2` re-author).

The `task_due_soon` member deep link is the one value with no clean token form (open Q F-2) — resolve it alongside the existing open Q about that template's mixed recipients.

---

## Part (C) — Client "Send portal link via WhatsApp" (client analog of `sendCollaboratorLink`)

**Problem.** No path today sends a CLIENT their portal link over WhatsApp. `callables/issuePortalLink.ts` mints a client magic link but never enqueues a `messages` doc. The `project_welcome` trigger already exists in `TNotificationTrigger` (`enums.ts`) and as `IProjectWelcomeVars` (`notificationTypes.ts`), but nothing enqueues it. NOTE: there is **no** `WA_CONTENT_SID_PROJECT_WELCOME` constant or numeric content-SID registry in the repo — templates are referenced by NAME string (e.g. `COLLAB_ACCESS_LINK_TEMPLATE = 'collab_access_link_v1'`). Part C introduces `PROJECT_WELCOME_TEMPLATE = 'siapp_project_welcome_v1_en'` mirroring that pattern; the exact name (and the `siapp_…_en` convention vs the existing `collab_access_link_v1` constant) is an open question for the template author (open Q C-5).

**Design — new `sendPortalLink` callable (mirrors `callables/sendCollaboratorLink.ts`).**

- **Auth / role gate (REUSE).** Owner/admin/pm only. Reuse the same role check `issuePortalLink` performs (`requireIssuerUid`, currently a PRIVATE fn in `issuePortalLink.ts` — export it, or add a shared `requirePortalLinkIssuer`; open Q C-4). Then `assertWorkspaceActive(workspaceId)` (#24 read-only gate), identical to both siblings.
- **D-027 gate (REUSE).** Reuse `issueBlocker()` + `PORTAL_ISSUABLE_LIFECYCLES` (both already exported from `issuePortalLink.ts`) against the project snap: project exists, `lifecycle ∈ {published, completed}`, non-empty `clientId`. Map blockers to the same `HttpsError`s (`not-found` / `failed-precondition`).
- **Consent / opt-out gate (REUSE).** Read the CLIENT doc `workspaces/{wid}/clients/{clientId}` and apply the SAME two checks as `sendCollaboratorLink` (lines 50-55): `if (isOptedOut(client)) return { status: 'opted_out' }` then `if (!hasWaConsent(client)) return { status: 'no_consent' }`. Reuses `isOptedOut` (`lib/optOut.js`) + `hasWaConsent` (`lib/pdpa.js`) unchanged — the client doc carries `waConsent?` + `notificationsOptOut?` exactly like the collaborator doc.
- **Mint the link (REUSE existing mint — NO durability change).** Extract the revoke-active-then-mint transaction currently inline in `issuePortalLink` (lines ~109-151) into an exported helper `mintClientPortalLink(db, workspaceId, projectId, clientId, uid): Promise<{ url; expiresAt; linkId; rotated }>` — mirroring how `mintCollaboratorLink` is exported from `issueCollaboratorLink.ts` and reused by `sendCollaboratorLink`. `sendPortalLink` calls it to obtain a FRESHLY minted client URL captured into the message at send time. This is the SAME rotate-on-issue behavior the existing "Copy portal link" button already triggers on every click, so **C introduces no new durability problem and no new at-rest-secret change** — Part B's Option-1 plaintext-`token` storage is NOT required for C. If/when Part B lands (get-or-create durable client link), this helper becomes get-or-create and Send stops rotating (open Q C-6).
- **Enqueue the `messages` doc (mirror `sendCollaboratorLink` shape).**

  ```
  {
    id, channel: 'whatsapp',
    recipientPhone: client.phone, recipientType: 'client', recipientId: clientId,
    templateName: PROJECT_WELCOME_TEMPLATE,        // 'siapp_project_welcome_v1_en'
    variables: {
      firm_name,          // workspace `name`
      client_first_name,  // first token of client `name` (open Q C-2)
      project_title,      // project `name`
      project_due_date,   // mytDateString(project.targetEndDate) or '—' (open Q C-3)
      portal_link,        // freshly minted client URL (buildPortalUrl)
    },
    status: 'queued', trigger: 'project_welcome',
    costEstimateMyr: WA_UTILITY_COST_MYR,
    relatedTo: { type: 'project', id: projectId },
    createdAt: Timestamp.now(),
  }
  ```

  As with `sendCollaboratorLink`, opted-out / no-consent recipients return early WITHOUT enqueuing (there is no `suppressed`/`holdUntil` field on this on-demand callable path — those belong to the `enqueueNotifications` fan-out, not the per-action send).
- **Audit.** Mirror `issuePortalLink`: `writeAuditLog` `portal_link.reset` when a prior active link was rotated, else `portal_link.issue`, targeting the minted `linkId` (the mint helper returns `rotated`).
- **Return** `{ status: 'queued', expiresAt }` (mirrors `sendCollaboratorLink`).

**Interface reconciliation (honours Part A — keep interfaces camelCase).** `IProjectWelcomeVars` already declares `clientFirstName`, `projectTitle`, `projectDueDate`, `portalLink`, and inherits `firmName` from `IBaseTemplateVars`, so it fully covers the 5 template variables with **NO interface change needed** for C. Its extra `clientFullName` is unused by `siapp_project_welcome_v1_en` (the template needs first name only); leave it as-is. camelCase→snake_case mapping happens only at the emitted `variables` literal: `firmName`→`firm_name`, `clientFirstName`→`client_first_name`, `projectTitle`→`project_title`, `projectDueDate`→`project_due_date`, `portalLink`→`portal_link`.

**Firm-app UI (D-036/D-037 respected — firm bundle only).**
- Wrapper: add `sendPortalLink` to `apps/web/src/lib/callables.ts` mirroring the `sendCollaboratorLink` wrapper (`httpsCallable(functions, 'sendPortalLink')`), request `{ workspaceId, projectId }`, response union `{ status: 'queued'; expiresAt } | { status: 'opted_out' } | { status: 'no_consent' }`.
- Button: add a "Send portal link" action to `apps/web/src/surfaces/firm/projects/PortalLinkCard.tsx` — the project **Details tab** "Client portal link" card that already renders "Copy portal link" + "Reset link" and is already gated to owner/admin/pm + `lifecycle ∈ {published, completed}` + non-empty `clientId`. Model its sent / opted_out / no_consent status states on `apps/web/src/surfaces/firm/collaborators/CollabAccessLinkButton.tsx`. No new bundle, no cross-surface import → D-036/D-037 isolation intact. (Confirm this is the intended surface — open Q C-1.)

---

## Touched surfaces & files

Surfaces: `backend/functions` (Cloud Run/Functions) for A/B/C, plus the **firm app** (`apps/web`, `dashboard.siapp.app`) for C's Send button. C's front-end change is confined to the firm bundle → D-036/D-037 isolation unaffected.

Create/modify:
- `backend/functions/src/lib/enqueueNotifications.ts` — rename emitted keys to snake_case in `templateVariables()`; drop `blocked_reason`; add `portal_link`/`task_link` population; thread a resolved `portalLink` (and `memberTaskLink`) through `IPlanTaskNotificationsInput` so `planTaskNotifications` stays pure; resolve/mint the durable client portal link inside `enqueueTaskEvent` (system actor) gated on `published`.
- `backend/functions/src/callables/sendCollaboratorLink.ts` — rename `firmName`/`collaboratorName`/`accessLink` → `firm_name`/`collaborator_name`/`access_link`.
- `backend/functions/src/callables/issuePortalLink.ts` — **(Option 1)** refactor to get-or-create + explicit `reset`; store rules-denied plaintext token. (Only if durability change approved.)
- `backend/functions/src/lib/portalTokens.ts` — add `getOrCreateClientPortalLink()` (or a new `clientPortalLinks.ts`) mirroring `getOrCreateCollaboratorLink`; reuse `buildPortalUrl`. (Option 1.)
- **(C)** NEW `backend/functions/src/callables/sendPortalLink.ts` — the on-demand callable (gate reuse + consent reuse + `mintClientPortalLink` + enqueue `project_welcome` doc). Defines `PROJECT_WELCOME_TEMPLATE = 'siapp_project_welcome_v1_en'`.
- **(C)** `backend/functions/src/callables/issuePortalLink.ts` — extract the revoke+mint transaction into an exported `mintClientPortalLink()` helper (reused by the callable and `sendPortalLink`); export the owner/admin/pm role gate (or add a shared `requirePortalLinkIssuer`). This is a behavior-preserving refactor, INDEPENDENT of Part B's Option-1 durability change.
- **(C)** `backend/functions/src/index.ts` — export the new callable: `export { sendPortalLink } from './callables/sendPortalLink.js';` beside the existing `issuePortalLink` export (#21 block).
- **(C)** `apps/web/src/lib/callables.ts` — add the `sendPortalLink` httpsCallable wrapper mirroring `sendCollaboratorLink`.
- **(C)** `apps/web/src/surfaces/firm/projects/PortalLinkCard.tsx` — add a "Send portal link" button + sent/opted_out/no_consent status states (mirror `CollabAccessLinkButton.tsx`).
- **(C)** `packages/shared/src/notificationTypes.ts` — NO change needed: `IProjectWelcomeVars` already covers all 5 template vars (camelCase, per Part A).
- `packages/shared/src/notificationTypes.ts` — add `portalLink: string` to `ITaskStatusChangeVars` and `ITaskBlockedVars`; add `taskLink: string` to `INeedHelpVars`. Keep camelCase.
- Tests (see Test plan): `backend/functions/src/lib/enqueueNotifications.test.ts` (update asserted `variables` keys to snake_case + link assertions); NEW `sendCollaboratorLink` test; `issuePortalLink` tests updated for get-or-create+reset.
- `plans/whatsapp-templates-v1.md` — optional doc reconciliation note (collapse the "type gaps" checklist for items now wired; confirm `task_blocked` has no `blocked_reason`). Docs-only.

Explicitly NOT touched: `firestore.rules` (the `magicLinks` deny-all already covers the new `token` field), front-end apps, `provider.ts` stub.

---

## Data model changes

- `workspaces/{wid}/magicLinks/{id}` (client audience): **add a rules-denied plaintext `token` field** (Option 1), identical to the collaborator-link doc shape. No new collection, no index. Security-rules implication: NONE at the rules layer (`magicLinks` is already `allow read, write: if false` for all clients — server-only), but this is a real change to the at-rest secret posture for CLIENT links (flagged for sign-off). Multi-tenant isolation unchanged — links stay under `workspaces/{wid}/…`.
- `workspaces/{wid}/messages/{id}`: `variables` map keys change to snake_case + gain `portal_link`/`task_link`; `blocked_reason` removed for `task_blocked`. No schema/rules change (server-only collection).
- `packages/shared` type additions are documentation-only (no runtime/rules impact).
- **(C)** `workspaces/{wid}/messages/{id}`: adds `trigger: 'project_welcome'`, `recipientType: 'client'` records with snake_case `variables`. No new collection, index, or rules change (server-only collection). C reuses the EXISTING client portal-link mint (rotate-on-issue), so it adds **no at-rest-secret change** and does not touch `magicLinks` doc shape (the plaintext-`token` storage is a Part-B-only concern).

---

## Steps (each independently verifiable)

1. **Get human sign-off** on the portal-durability design for Part B ONLY (Option 1 vs 1b vs fallback). Parts A + C do NOT require this sign-off and can proceed. Do not write B code until resolved. (Gate — B only.)
2. Branch fresh from `origin/main`: `feat/137-whatsapp-vars-snakecase-and-links`.
3. **A1** — `enqueueNotifications.ts` `templateVariables()`: rename to `task_title`, `project_title`, `firm_name`, `new_status`, `due_date`; drop `blocked_reason`. Verify: unit test asserts snake_case keys.
4. **A2** — `sendCollaboratorLink.ts`: rename to `firm_name`, `collaborator_name`, `access_link`. Verify: new unit/emulator test asserts the queued `variables`.
5. **A3** — `notificationTypes.ts`: add `portalLink` to `ITaskStatusChangeVars`/`ITaskBlockedVars`, `taskLink` to `INeedHelpVars`. Verify: `pnpm -w typecheck` green.
5a. **C1** — refactor `issuePortalLink.ts`: extract the revoke+mint transaction into exported `mintClientPortalLink()`; export the owner/admin/pm role gate. Verify: existing `issuePortalLink` tests still green (behavior unchanged).
5b. **C2** — add `callables/sendPortalLink.ts`: reuse `requirePortalLinkIssuer` + `assertWorkspaceActive` + `issueBlocker`/`PORTAL_ISSUABLE_LIFECYCLES` + `isOptedOut`/`hasWaConsent` (client doc); mint via `mintClientPortalLink`; enqueue the `project_welcome` `messages` doc with snake_case vars; audit. Verify: new emulator test (gate, consent, enqueue shape, audit).
5c. **C3** — register `sendPortalLink` in `index.ts`. Verify: emulator loads the callable.
5d. **C4** — `apps/web/src/lib/callables.ts` wrapper + "Send portal link" button in `PortalLinkCard.tsx`. Verify: component test (button calls wrapper, renders sent/opted_out/no_consent states).
6. **B1** (Option 1) — add `token` storage to `issuePortalLink`; refactor to get-or-create + `reset`; add `getOrCreateClientPortalLink()`. Verify: issuePortalLink tests (durable reuse, reset rotates, one-active-link).
7. **B2** — thread a resolved `portalLink` (+ `memberTaskLink`) into `IPlanTaskNotificationsInput`; populate `portal_link` for `task_status_change`/`task_blocked`, and `task_link` for `task_due_soon` (portal for client, dashboard deep link for member). Resolve/mint inside `enqueueTaskEvent` only when `published` + non-suppressed client recipient, using a `system` actor. Keep `planTaskNotifications` pure. Verify: unit tests for planned records (link present when published, empty when suppressed/draft); emulator test that `enqueueTaskEvent` reuses a durable link (no rotation) across two events.
8. **B3** — build `memberTaskLink` from `APP_ORIGIN` + workspace `slug` + `projectId` (add a `defineString('APP_ORIGIN')` in the backend module if not already importable). Verify: unit test on the built URL.
9. Run full gate: `pnpm -w build && pnpm -w lint && pnpm -w typecheck && pnpm -w test`. Keep green (TS strict, no `any`, no `console.log`, named exports, function declarations).
10. Conventional commits; open PR that closes #137 with the security-posture change called out for review.

---

## Test plan (for Tester)

- **Unit (`enqueueNotifications.test.ts`)**: update the existing `variables` assertion (lines ~198-205) to snake_case (`task_title`, `project_title`, `new_status`, `firm_name`). Add: `task_blocked` planned record has NO `blocked_reason` and HAS `portal_link`; `task_status_change` HAS `portal_link`; `task_due_soon` HAS `due_date` + `task_link`; suppressed/draft records leave link vars empty; `due_date` renders `"—"` when `dueDate` absent (if that copy note is adopted). Confirm dedupe-id tests still pass.
- **Unit**: link-selection helper — client recipient → portal URL; member recipient → `${APP_ORIGIN}/${slug}/projects/${pid}` dashboard URL.
- **New unit/emulator (`sendCollaboratorLink`)**: queued `messages` doc `variables` == `{ firm_name, collaborator_name, access_link }`; still honors opt-out / no-consent gates.
- **Emulator (`issuePortalLink`, Option 1)**: get-or-create returns the SAME URL on repeat; `reset: true` rotates + revokes prior; one-active-link invariant holds under concurrent calls; audit entries (`portal_link.issue` first mint, `portal_link.reset` on reset); redeem still verifies `secretHash` (token field never used for verification).
- **Emulator (enqueue durability)**: two successive `enqueueTaskEvent` calls for the same (project, client) embed the SAME `portal_link` (no rotation), proving in-flight links don't 404 (D-042).
- **Rules test**: confirm `magicLinks` (with the new `token` field) remains fully denied to client/member reads.
- **New emulator (`sendPortalLink`, Part C)**: role gate rejects non-owner/admin/pm (`permission-denied`); D-027 gate rejects draft/no-client project (`failed-precondition`) and missing project (`not-found`); consented client → queued `messages` doc whose `variables` == `{ firm_name, client_first_name, project_title, project_due_date, portal_link }` (snake_case) with `trigger: 'project_welcome'`, `recipientType: 'client'`, non-empty `portal_link`; opted-out client → `{ status: 'opted_out' }` and NO enqueue; no-consent client → `{ status: 'no_consent' }` and NO enqueue; audit `portal_link.issue` (first) / `portal_link.reset` (rotation).
- **Component (`PortalLinkCard`, Part C)**: "Send portal link" button calls the `sendPortalLink` wrapper with `{ workspaceId, projectId }` and renders sent / opted_out / no_consent states — mirror the existing `CollabAccessLinkButton` test.

---

## Out of scope (deliberately)

- Wiring `task_assigned`, `need_help`, `project_welcome`, `inbound_auto_reply`, `wa_quota_90` to WhatsApp sends (not enqueued today; `INeedHelpVars.taskLink` is added as a type only).
- Building/registering Twilio Content Templates, `ContentSid` registry, or the #19 dispatcher / live Twilio send.
- Humanizing `new_status` (raw enum → "in progress") — flagged as an open question, not fixed here unless approved.
- Any front-end, `firestore.rules` structural, or admin-surface change.
- Template-copy authoring — but note as guidance to the template author: Meta rejects bodies that START or END with a variable; keep a text line around `{{portal_link}}`/`{{task_link}}` (the doc's drafts already do). Out of code scope.
- BM (`ms`) template variants (D-026 — v1.5).

---

## Sequencing & rollout

- **Parts A + C ship together now (one PR), independent of Part B.** Neither A nor C changes the client portal-link security posture: A is a pure key-rename at the Twilio boundary; C reuses the EXISTING per-action portal-link mint (the same rotate-on-issue behavior the "Copy portal link" button already has today), so C captures a fresh, working URL into the message at send time — the classic `sendCollaboratorLink` pattern — with **no durable-token storage and no new at-rest-secret change**.
- **Part B is gated on human sign-off** of the portal-link durability design (Option 1 / 1b / fallback) because AUTOMATED client notifications have no user/issuer context and need a STABLE, non-churning URL that survives across events (D-042). B can follow as a **separate PR** once the durability call is made; deferring B does not block A + C.
- **Why C ≠ B:** C is an explicit human action that mints + enqueues in ONE step (URL captured at send time); B must embed a durable link into machine-triggered fan-out where re-minting would 404 in-flight links. Same variable (`portal_link`), different provenance — only B needs durability.

---

## Risks / open questions (need a human call)

1. **Portal-link durability (PRIMARY, blocking).** Approve Option 1 (mirror #127: rules-denied plaintext token + get-or-create/reset) vs Option 1b (HMAC-derived, Secret-Manager key) vs fallback (ship A-only, defer B)? This changes the client portal-link security posture and rotate-on-issue behavior.
2. **`task_due_soon` single template, mixed recipients.** The one `siapp_task_due_soon_v1_en` declares `task_link` but fans out to BOTH client and member. Confirm it is acceptable to fill `task_link` with a `/p` portal URL for client recipients and a `dashboard.siapp.app` deep link for members (Meta only matches the variable NAME, not value), or whether a separate client due-soon template is wanted.
3. **Member recipients of client-facing templates.** `task_status_change`/`task_blocked` can fan out to members (`notify.toInternal`), but those templates are client-facing with `portal_link`. Confirm members should receive the project's client portal URL (mild leak of a client tracker link to a same-workspace member) or be excluded — pre-existing behavior, surfaced by link population.
4. **`new_status` humanization.** Code sends the raw enum (`in_progress`); the doc wants a human label. Fix in #137 or defer?
5. **`due_date` empty vs `"—"`.** Adopt the doc's `"—"` fill for absent due dates now, or keep `''`?
6. **System actor for automated mints.** Automated first-ever link mints have no user uid — use `createdBy: 'system'` and audit `actorType: 'system'`? Confirm audit-log shape accepts a system actor.
7. **(C-1) Client surface for the Send button.** Confirm `PortalLinkCard.tsx` (project Details tab) is the intended home, vs a client-detail surface or a share dialog.
8. **(C-2) `client_first_name` source.** `IClientDoc` stores a single `name` (no first-name split). Derive the first whitespace token, send the full `name`, or does the template author want full name? (`IProjectWelcomeVars.clientFullName` exists but is unused by this template.)
9. **(C-3) `project_due_date` source.** The project doc has **no `dueDate`** field; the due field is `targetEndDate?: Date`. Confirm mapping `project_due_date`←`targetEndDate` (MYT via `mytDateString`), and `"—"` when absent.
10. **(C-4) Role-gate export.** `requireIssuerUid` is currently private in `issuePortalLink.ts`. OK to export it (or add a shared `requirePortalLinkIssuer`) for reuse by `sendPortalLink`?
11. **(C-5) Template name / registry.** A `WA_CONTENT_SID_PROJECT_WELCOME` param DOES exist (`backend/functions/src/lib/messaging/contentSids.ts:59`, via `defineString('WA_CONTENT_SID_PROJECT_WELCOME', { default: '' })`); the human-readable template name is still a string. Confirm `siapp_project_welcome_v1_en` (define `PROJECT_WELCOME_TEMPLATE`); note the existing collab constant is `collab_access_link_v1` (no `siapp_`/`_en`) — reconcile the naming convention with the template author.
12. **(C-6) Mint-vs-reuse for C.** Confirm C reusing the existing rotate-on-issue mint (matches today's "Copy portal link") is acceptable, vs waiting for Part B's get-or-create so Send reuses a durable link (no rotation).

13. **(F-1) Link variable format (Finding 2, needs sign-off).** Adopt token-only (bare `{shortCode}_{secret}`, domain baked into the template body, vars renamed `*_token`) for all 5 link templates BEFORE first submission (recommended — zero re-approval cost), or keep full-URL single-variable and accept the abuse-flag rejection risk? Decides Part A/B/C emit shape and template authoring.
14. **(F-2) `task_due_soon` member deep link has no token form.** The member value is a `dashboard.siapp.app/{slug}/projects/{pid}` deep link with no bare-token equivalent. Under token-only, either (a) keep `task_due_soon` full-URL only (mixed with token elsewhere — breaks uniformity), or (b) split into a client token template + a member deep-link template. Ties to open Q #2.
15. **(F-3) End-on-variable exposure in the current drafts.** `whatsapp-templates-v1.md` §1/§3/§4/§5/§9 currently END the body on `{{portal_link}}`/`{{task_link}}`/`{{access_link}}`, which may trip Meta's "cannot end on a variable" rule — contradicting the Out-of-scope parenthetical that claims the drafts already keep text around the link. Confirm every link template gets a trailing text line (or trailing period) before submission — required for BOTH URL and token-only formats.
16. **(F-4) Provider source.** `twilioProvider.ts` (name-keyed `buildContentVariables`) SOURCE is on merged main at `backend/functions/src/lib/messaging/twilioProvider.ts` (shipped in #133, alongside `selectProvider.ts`/`provider.ts`), not merely a compiled `dist` artifact. Finding 1's contract assumes the merged name-keyed behaviour — confirmed present.

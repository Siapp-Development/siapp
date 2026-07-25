# Implementation plan — #24 Manual billing (D-019): trial expiry, plan gates, overage forecast

## Goal

Implement the manual-billing operational layer per **D-019** (manual invoicing, no Stripe) and **D-020** (Trial 30d → Standard RM79/seat/yr → Business RM149/seat/yr, MYR): trials auto-expire to a read-only workspace, the founder changes plan/seats/renewal in one click from the admin panel, WhatsApp usage is counted and forecast (in-app banner at 70%, WhatsApp DM to the owner at 90%), and firm owners get a Billing & usage screen per wireframe **[Bill]** (`pm_ux/plans/22-wireframe-review.md`). MVP scope reference: `pm_ux/plans/11-mvp-scope.md` billing/admin lines; pricing mechanics: `pm_ux/plans/06-pricing-model.md`.

**⚠ Decision tension flagged up front — D-030 vs this issue.** D-030 says "MVP launches as a single tier… no per-tier WA allowance arithmetic, no admin plan-change path". The codebase has already moved past parts of D-030: `adminAdjustWorkspace` (#10) accepts `trial|standard|business`, and #21's `PortalFooter` white-labels the `business` tier. This issue's acceptance criteria explicitly require the three tiers. This plan treats tiers as **billing metadata + WA allowance arithmetic only** — no new feature gates beyond what already shipped — and asks for explicit sign-off (Decision D1 below).

## What already exists (reuse, don't rebuild)

- **Workspace doc** ([packages/shared/src/firestoreTypes.ts](../packages/shared/src/firestoreTypes.ts) `IWorkspaceDoc`; written by [provisionWorkspace.ts](../backend/functions/src/admin/provisionWorkspace.ts)): `plan: 'trial'|'standard'|'business'`, `planExpiresAt`, `seatLimit`, `seatsUsed`, `whatsappAllowance: { includedPerPeriod, periodStart, used }`. `used` is written `0` at provision and **never updated** — no usage counting exists yet. There is **no** `billingStatus` field, and no `usageCounters/{period}` docs are written anywhere.
- **Admin plan/seat/renewal mutation**: [adjustWorkspace.ts](../backend/functions/src/admin/adjustWorkspace.ts) already validates + patches `plan` / `seatLimit` / `planExpiresAt`, writes the admin log **and** mirrors into the workspace `auditLog` (#23). [WorkspaceDetailPage.tsx](../apps/web/src/surfaces/admin/pages/WorkspaceDetailPage.tsx) already has one-click forms for all three. #24 **extends** these, it does not add a new callable.
- **Scheduled-function pattern**: [dueSoonSweep.ts](../backend/functions/src/scheduled/dueSoonSweep.ts) (#18) — pure candidate predicate + `sweepX(now)` runner + `onSchedule` export in [index.ts](../backend/functions/src/index.ts); unit tests invoke the runner directly.
- **Notification enqueue (#18)**: [enqueueNotifications.ts](../backend/functions/src/lib/enqueueNotifications.ts) writes server-only `workspaces/{wid}/messages` queue records (`queued`/`suppressed`, `holdUntil`); **#19's dispatcher is NOT built** — nothing is actually sent yet. The 90% owner DM can only *enqueue* under the D9 contract (`status=='queued' && !suppressed`), to be dispatched when #19 lands.
- **Rules posture** ([firestore.rules](../firestore.rules)): workspace doc is `read: isFirmMember`, `write: false`; membership/role checks are O(1) from custom claims (`isFirmMember`, `hasRole`); `usageCounters` match block exists (server-write only). Firm content writes (projects/tasks/clients/collaborators/docs/members) are rules-gated per collection.
- **Settings surface**: `SettingsLayout` + Team/Notifications pages under `/{slug}/settings/*` in [FirmShell.tsx](../apps/web/src/surfaces/firm/FirmShell.tsx); a billing route slots in beside them.
- **Functions cannot import `@siapp/shared`** (source-only package, NodeNext build) — constants must be mirrored, precedent: `WA_UTILITY_COST_MYR` in enqueueNotifications.ts.
- **Postmark mail lib** ([mail.ts](../backend/functions/src/lib/mail.ts), D-040) exists and degrades gracefully — available if we also want the day-25 trial reminder email (kept out of scope, see below).

**Surfaces touched**: firm app (`dashboard.siapp.app/{slug}`), admin app (`admin.siapp.app`), backend functions + rules. Apex, `/p/*` portal, `/t/*` collaborator bundles untouched → bundle isolation (D-036) unaffected; `scripts/check-bundle-isolation.mjs` must stay green.

## Acceptance criteria mapping

| Criterion | Where it lands |
|---|---|
| Tiers Trial/Standard/Business, MYR | Tier constants (prices RM79/RM149 per seat/yr, WA allowance 30 pool / 50/seat / 100/seat) in `@siapp/shared` + mirrored functions-side lib; allowance recomputed on plan/seat change |
| Trial auto-expires to read-only | New `trialExpirySweep` scheduled fn → `billingStatus: 'read_only'`; rules-level write denial (D2) + firm-shell banner + notification suppression |
| Admin one-click plan/seat/renewal | Extend existing `adminAdjustWorkspace` + `WorkspaceDetailPage` (add `billingStatus` control, allowance recompute, usage readout) |
| Overage forecast: 70% banner, 90% WA DM to owner | New `onMessageCreated` trigger counts usage into `whatsappAllowance.used` + `usageCounters/{period}`; banner computed client-side from workspace doc; 90% crossing enqueues an owner DM into `messages` (D5) |
| [Bill] billing/usage screen | New `BillingSettingsPage` at `/{slug}/settings/billing` (owner/admin) |

## Decisions needed — NEED USER APPROVAL

1. **D1 — Tier semantics vs D-030 (recommended: tiers = billing metadata + WA allowance arithmetic only).** Support all three `plan` values in admin + billing screen + allowance math (`trial`: 30 one-time pool; `standard`: 50 × seats / month; `business`: 100 × seats / month per 06-pricing-model.md). **No new feature gates** (branding/theming/API stay per D-030; portal footer tier logic from #21 is untouched). This contradicts D-030's "no per-tier WA allowance arithmetic" line — needs an explicit human call and ideally a D-030 amendment note in the decisions log.
   - *Alternative — literal D-030: single tier, admin panel only extends renewal dates*: contradicts this issue's acceptance criteria and code already shipped in #10/#21. Rejected pending your call.
2. **D2 — Read-only enforcement at the rules level (recommended), not UI-only.** New rules helper `workspaceActive(wid)` = one `get()` of the workspace doc checking `billingStatus != 'read_only'`, added to every firm-member **write** rule (create/update/delete on projects, phases, milestones, tasks, clients, collaborators, documents, departments, members, users-workspace writes). Reads untouched — zero extra cost on the hot path; the `get()` runs on writes only, which are comparatively rare. UI additionally disables mutating controls + shows a persistent banner, but the security boundary is rules. Server paths: callables that mutate firm data (`setProjectLifecycle`, invites, `updateNotificationSettings`, etc.) get a shared `assertWorkspaceActive(wid)` guard; the #18 enqueue pipeline suppresses with `suppressedReason: 'billing'`.
   - *Alternative A — UI-only gate*: a firm user with the JS console open keeps writing; "data preserved 90 days, read-only" becomes a lie. Rejected.
   - *Alternative B — mirror `billingStatus` into custom claims*: keeps rules O(1) but requires re-syncing claims for every member on expiry and a new claims-sync path for a workspace-level (not member-level) fact. More machinery for a per-write `get()` saving. Rejected at MVP.
3. **D3 — Portal/collaborator surfaces stay live (read) when a workspace is read-only (recommended).** Clients/collaborators can still *view*; their *write* paths (portal doc upload, `submitCollabUpdate`) are blocked by the same gate (rules `workspaceActive` on `validPortalDocumentCreate`; callable guard on `submitCollabUpdate`). Outbound notifications are suppressed. Rationale: "data preserved 90 days" + the portal is the firm's client-facing promise — going dark instantly on day 31 punishes the firm's clients; blocking writes stops ongoing free usage.
   - *Alternative — portal fully closed on expiry*: harsher lever; can be flipped later by adding `workspaceActive` to portal read rules. Rejected for MVP.
4. **D4 — Usage = counted at enqueue time (message-create, non-suppressed), not at delivery (recommended).** The data-model doc says increment "on Twilio webhook delivery" — but #19 (send) and #20 (delivery webhooks) don't exist, so nothing would ever count. New Firestore trigger `onDocumentCreated('workspaces/{wid}/messages/{mid}')`: skip if `suppressed == true`; transactionally bump `whatsappAllowance.used` (with `periodStart` month-rollover reset inside the txn) and `usageCounters/{YYYY-MM}.whatsappConv`. When #20 lands, counting can move to delivered status without schema change. **Flagged as a deliberate, temporary divergence** from firestore-data-model.md's trigger table.
   - *Alternative — wait for #19/#20*: ships this issue with a permanently-zero usage bar. Rejected.
5. **D5 — 90% alert = enqueue a WhatsApp DM to the owner into the existing `messages` collection (recommended).** When the usage trigger's increment crosses 90% of `includedPerPeriod`, enqueue one queue record: `trigger: 'wa_quota_90'`, `recipientType: 'member'`, recipient = `ownerId` (phone from `users/{ownerId}`; missing phone → `suppressed: 'no_phone'`), template `wa_quota_90_v1`, deterministic id `quota90_{wid}_{YYYY-MM}` + `create()` so it fires **once per period**. #19's dispatcher sends it when built — until then it sits queued (same posture as every #18 message). Quiet hours honoured via the existing `holdUntil` computation. Note: 06-pricing-model.md says "auto-email at 90%" — the issue supersedes with a WA DM; flagging the doc discrepancy.
   - *Alternative — in-app only + TODO*: owner may not open the app before overage lands on the invoice; the whole point is proactive warning. Rejected — enqueue costs nothing and needs no new infra.
6. **D6 — Keep the single `planExpiresAt` field; do NOT add `trialEndsAt`/`renewsAt` (recommended).** The field already exists, is provisioned, adjusted by admin, and typed in shared. Semantics: on `plan == 'trial'` it *is* the trial end; on paid plans it *is* the renewal date. The billing screen labels it accordingly. Adding two more date fields means migration + three sources of truth.
7. **D7 — Trial-only auto-expiry; paid plans never auto-expire (recommended).** The sweep targets `plan == 'trial' && planExpiresAt <= now && billingStatus != 'read_only'`. Lapsed paid renewals stay a founder judgment call (D-019 manual workflow: invoice 30 days ahead, chase, then manually set `billingStatus: 'read_only'` via the new admin control if truly churned). Auto-cutting a paying customer over a late bank transfer is the wrong default at design-partner scale.
8. **D8 — [Bill] screen ships without invoice history / payment-method management (recommended).** There is no invoice data model (D-019: invoices live in Wave/Xero). The wireframe's "invoice history + payment method" panels become static copy: "Billed manually — invoices via email; pay by FPX transfer or card link. Contact us to change your plan." Upgrade CTA = `mailto:` (founder). Invoice history is additive later if we ever mirror invoices into Firestore.

## Data model & rules changes

Multi-tenant isolation unchanged — all new writes are Admin-SDK (server) paths; new client reads are already member-gated.

**Workspace doc** — one additive field (server-written only):

```typescript
billingStatus?: 'active' | 'read_only';   // absent = 'active' (no backfill needed)
```

**`usageCounters/{YYYY-MM}`** — starts being written (shape already in firestore-data-model.md): `{ period, whatsappConv, computedAt }`, incremented by the usage trigger. Plain increment, not sharded — MVP scale (flag for later per the data-model hot-doc note). Rules already: member read, `write: false` — verify while touching.

**`messages`** — no schema change; new `trigger` value `'wa_quota_90'` + `recipientType: 'member'` (already introduced by #18/D7).

**firestore.rules**:

- New helper `workspaceActive(wid)` → `get(workspaces/$(wid)).data.get('billingStatus', 'active') != 'read_only'`.
- AND it into every firm-member `create`/`update`/`delete` rule and into `validPortalDocumentCreate` / `validCollabDocumentCreate` (D2/D3). Reads untouched. Siapp-admin and server paths unaffected (`write: false` stays; Admin SDK bypasses rules).

**Audit entries**: trial expiry sweep writes `auditLog` (`actorType: 'system'`, `action: 'billing.trial_expired'`); admin `billingStatus` change reuses adjustWorkspace's existing dual admin-log + workspace-audit mirroring (`action: 'workspace.status_change'`).

## Steps

1. **Shared types + constants** — [packages/shared/src/firestoreTypes.ts](../packages/shared/src/firestoreTypes.ts): add `TBillingStatus`, optional `billingStatus` on `IWorkspaceDoc`. New `packages/shared/src/billing.ts`: `PLAN_PRICES_MYR` (`standard: 79`, `business: 149`, per seat/yr), `WA_ALLOWANCE` (`trial: 30` flat, `standard: 50`/seat, `business: 100`/seat), `USAGE_WARN_AT = 0.7`, `USAGE_ALERT_AT = 0.9`, pure `includedForPlan(plan, seats)` and `forecastUsage(used, periodStart, now)` (linear month-end projection for the [Bill] bar). Export from shared index.
2. **Functions billing lib** — new `backend/functions/src/lib/billing.ts` (mirrors step-1 constants — shared is not consumable, see precedent note): `includedForPlan`, `crossedThreshold(prevUsed, newUsed, included, threshold)`, `periodKey(date)`. Unit tests `billing.test.ts` (pure, no emulator).
3. **Trial-expiry sweep** — new `backend/functions/src/scheduled/trialExpirySweep.ts` following the dueSoonSweep pattern: pure `isExpiredTrial(wsData, now)` + `sweepTrialExpiry(now)` (query `plan == 'trial' && planExpiresAt <= now`, in-memory `billingStatus` filter, patch `billingStatus: 'read_only'` + `updatedAt`, write system audit entry; per-workspace try/catch). Export `onSchedule` (daily, 00:15 UTC — after dueSoonSweep) from [index.ts](../backend/functions/src/index.ts). Tests: predicate unit tests + runner test with emulator harness used by dueSoonSweep.test.ts.
4. **Usage counting trigger + 90% DM** — new `backend/functions/src/triggers/onMessageCreated.ts`: skip suppressed and `trigger == 'wa_quota_90'` docs (no self-counting loops); transaction: month-rollover reset of `whatsappAllowance.{used,periodStart}` if `periodKey(periodStart) != periodKey(now)`, increment `used`, increment `usageCounters/{period}.whatsappConv` (upsert). If `crossedThreshold(…, 0.9)`: enqueue owner DM per D5 (deterministic id `quota90_{wid}_{period}`, `create()` dedupe, quiet-hours `holdUntil` via existing [quietHours.ts](../backend/functions/src/lib/quietHours.ts), owner phone from `users/{ownerId}`). Export trigger from index.ts. Unit tests for skip/rollover/threshold-crossing/dedupe.
5. **Read-only server guards** — new `backend/functions/src/lib/workspaceStatus.ts`: `assertWorkspaceActive(wid)` (throws `failed-precondition`). Apply to mutating firm/portal/collab callables: `setProjectLifecycle`, `invites` (create/accept), `updateNotificationSettings`, `setMemberDepartments`, `deleteTask`, `submitCollabUpdate`, `issuePortalLink`, `issueCollabLink`. Redeem callables stay open (read access, D3). Extend the #18 enqueue pipeline: read-only workspace → `suppressed: true, suppressedReason: 'billing'`.
6. **Rules gate** — [firestore.rules](../firestore.rules): add `workspaceActive(wid)`; AND into all firm-member write rules + portal/collab doc-create validators (D2/D3). Keep reads untouched.
7. **Rules tests** — new `backend/rules-tests/src/billingReadOnly.test.ts`: active workspace ⇒ writes allowed (regression); `billingStatus: 'read_only'` ⇒ pm/admin/owner task+project+client writes DENIED, reads ALLOWED; portal doc create DENIED, portal reads ALLOWED; workspace doc + usageCounters remain client-write-denied always; missing `billingStatus` field ⇒ treated as active.
8. **Admin: extend `adminAdjustWorkspace`** — [adjustWorkspace.ts](../backend/functions/src/admin/adjustWorkspace.ts): accept optional `billingStatus`; on `plan` or `seatLimit` change, recompute `whatsappAllowance.includedPerPeriod = includedForPlan(...)` in the same patch; audit action `workspace.status_change` when status changes. Update `IAdjustInput` in [adminFunctions.ts](../apps/web/src/surfaces/admin/lib/adminFunctions.ts). Extend callable unit tests.
9. **Admin UI** — [WorkspaceDetailPage.tsx](../apps/web/src/surfaces/admin/pages/WorkspaceDetailPage.tsx): add billing-status control (Activate / Set read-only), show `billingStatus`, WA allowance + `used` readout, and MYR price implied by plan × seats. One-click semantics preserved (each form already submits a single patch). [WorkspaceListPage.tsx](../apps/web/src/surfaces/admin/pages/WorkspaceListPage.tsx): surface `billingStatus` + expiry column if not already visible. Component tests.
10. **Firm shell: billing state + banners** — new `apps/web/src/surfaces/firm/billing/useWorkspaceBilling.ts` (`onSnapshot` on the workspace doc — member-readable already; returns plan, seats, planExpiresAt, billingStatus, allowance, usage %, forecast via shared `forecastUsage`). New `BillingBanners.tsx` mounted in [FirmShell.tsx](../apps/web/src/surfaces/firm/FirmShell.tsx) above `<Routes>`: (a) read-only banner (`role="alert"`, links to `/settings/billing`) when `billingStatus == 'read_only'`; (b) usage-warning banner when usage ≥ 70% ("On track to exceed your WhatsApp allowance — X of Y used", link to billing screen), dismissible per-session, `aria-live="polite"`. Tests: banner thresholds, read-only precedence over usage banner.
11. **[Bill] screen** — new `apps/web/src/surfaces/firm/settings/BillingSettingsPage.tsx` at `/{slug}/settings/billing` (route in FirmShell, nav link in `SettingsLayout`; visible to `owner`/`admin` per the role table — `pm`/`viewer` get the standard not-available treatment). Content per wireframe + D8: current plan card (name, MYR/seat/yr, seats used/limit, renewal or trial-end date with correct label per D6), WA usage bar with over-cap projection (`forecastUsage`), plan comparison table (static, from shared constants), "Contact us to change plan" CTA (`mailto:`), manual-billing static copy. Read-only workspaces see the same screen plus the expired notice. Component tests (usage bar math, trial vs paid labels, role gating).
12. **Docs sync** — update `pm_ux/plans/firestore-data-model.md` (add `billingStatus`, note enqueue-time counting divergence D4) and add a decisions-log amendment note for D-030 **only after D1 is approved** (Planner flags; Builder executes).

## Test plan

- **Unit (functions)**: billing lib math (allowance per plan/seats, threshold crossing incl. exact-90% edge, period keys/rollover); trial-expiry predicate (trial past/future expiry, paid plans ignored, already-read-only skipped); message trigger (suppressed skipped, quota-DM not self-counted, rollover reset, 90% enqueue dedupe id, missing owner phone → suppressed record).
- **Unit (web)**: `forecastUsage` projection; `useWorkspaceBilling` mapping; banner render matrix (0/69/70/89/90%, read-only); BillingSettingsPage (labels for trial vs paid, usage bar, role gate); admin detail-page status control submits correct patch.
- **Rules tests** (emulator, with data-clear between cases): full matrix in step 7.
- **Callable tests**: `adjustWorkspace` new fields + allowance recompute; `assertWorkspaceActive` rejection path on one representative callable (`setProjectLifecycle`).
- **Smoke (emulator)**: provision trial with `planExpiresAt` yesterday → run `sweepTrialExpiry(now)` directly → workspace read-only, firm task write denied, portal read still works; create 90%+ non-suppressed messages → owner DM queue record exists exactly once.

## Verification

- `pnpm turbo build lint typecheck test` green across workspace.
- Rules suite green with emulator **data-clear** between runs (rules-tests package convention).
- `node scripts/check-bundle-isolation.mjs` green — portal/collab/apex bundles must not pick up firm billing code.
- Manual pass: admin one-click plan→Business updates allowance; banner appears at 70% seeded usage.

## Out of scope

- Stripe / payment gateway, invoice generation or history, auto-renewal (D-019 explicitly defers).
- Day-25 trial reminder email (06-pricing-model.md workflow step 2) — belongs with the Postmark billing-email batch noted in the decisions log; founder can run it manually meanwhile.
- Actual sending of the 90% DM — #19 dispatcher territory; #24 only enqueues (D5).
- 90-day data purge after read-only expiry (retention job is its own ticket).
- Overage *billing* (RM0.60/0.45 per conversation invoicing) — founder computes from the usage screen manually; only the forecast/alerting is built.
- Seat-limit *enforcement* on invites (blocking invite when `seatsUsed >= seatLimit`) — not in this issue's criteria; flag if wanted.
- Sharded usage counters, workspace pagination in sweeps — MVP scale, flagged inline.

## Risks / open questions

- **D-030 conflict (D1)** is the big human call — the issue and the decision log disagree; the plan follows the issue but needs the log amended or the issue narrowed.
- **`workspaceActive` adds one `get()` per firm write** (~2× rules read cost on writes). Acceptable at MVP; the custom-claims mirror (D2 alt B) is the escape hatch if write latency/cost ever matters.
- **Enqueue-time counting over-counts** relative to delivered (failed sends still count) until #20 refines it — conservative in the right direction for overage warnings, but the [Bill] bar may read slightly high.
- **Trial allowance is a one-time pool** (30, not monthly) per 06-pricing-model.md; the month-rollover reset must skip `plan == 'trial'` — encoded in the billing lib, worth a dedicated test.
- **Owner phone may be absent** (`users/{ownerId}.phone` unset) — the 90% DM degrades to a suppressed `no_phone` record; the in-app 70% banner is then the only warning. Acceptable?

## Approved decisions (auto-approved — user unavailable, recommendations taken)

- **D1**: Tiers as billing metadata only (plan/seat/allowance math, no per-tier feature gates); amend D-030 in decisions log.
- **D2**: Read-only enforced at Firestore rules level (workspaceActive get()-gate) + callable guards + UI banners.
- **D3**: Portal/collab links stay readable when workspace is read-only; writes blocked.
- **D4**: WA usage counted at message-enqueue time (temporary until #20 delivery receipts).
- **D5**: 90% owner alert enqueued as WhatsApp DM into existing messages queue (dispatched when #19 ships). Doc discrepancy (email vs WA) resolved in favour of the issue: WA DM.
- **D6**: Keep single `planExpiresAt`; no separate trialEndsAt/renewsAt.
- **D7**: Auto-expiry sweep for trials only; lapsed paid plans remain a manual founder action in admin.
- **D8**: [Bill] screen ships without invoice history/payment methods; static copy + mailto CTA (D-019 manual billing).

## Verification & live smoke (post-build)

- `pnpm turbo run build lint typecheck test`: 18/18 green. Bundle isolation: pass. Rules tests: 433/433 (cleared emulator data, sequential run).
- Live smoke against emulators (dashboard :5174, apex :5173):
  - `[Bill]` settings page renders plan card (Trial, seats 4/10, ends date), usage progressbar, plans table (Trial 30-pool / Standard RM79 / Business RM149) and mailto CTA.
  - 70% usage banner (`role=status`, dismissible, links to billing) at 22/30; 93% banner at 28/30.
  - `billingStatus: read_only` → red `role=alert` banner, firm task save denied by rules ("Could not save the task."), portal `/p` and collab `/t` links stay readable (D3). Restoring `active` re-enables writes.
  - `onMessageCreated`: 6 message creates bumped `whatsappAllowance.used` 22→28, wrote `usageCounters/2026-07` (whatsappConv 6), crossing 90% enqueued exactly one `quota90_{wid}_{period}` WA DM which did not count itself.

### Fixes made during smoke

1. **`messageUsage.ts` transaction bug**: `txn.get(counterRef)` ran after `txn.update(wsRef)` — Firestore requires all reads before writes, so every real transaction threw ("usage counting failed") while mocked unit tests passed. Moved both reads to the top; added a regression test whose fake transaction throws on read-after-write.
2. **Copy leak**: "(D8)" decision reference and "Siapp bills manually at MVP" removed from user-facing BillingSettingsPage copy; test assertion updated.

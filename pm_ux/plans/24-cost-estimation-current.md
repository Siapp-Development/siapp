---
title: "Cost Estimation — Current Deployed Infrastructure (Refresh)"
status: draft
updated: 2026-09-02
supersedes: 21-cost-estimation.md
---

# Cost Estimation — Current Deployed Infrastructure (Refresh)

Bottom-up **product & service** cost model grounded in the **infrastructure that is actually in the codebase and deployed today** (Sept 2026), not the planned architecture. It refreshes [21-cost-estimation.md](./21-cost-estimation.md) (June 2026), which was sized against the *planned* stack in [13-tech-architecture.md](./13-tech-architecture.md). Where the two differ, this document is authoritative for internal forecasting; the deltas are called out in Section 1.

Scope is identical to the June doc — this is cash the **product itself** burns to run, reconciled against subscription revenue for gross margin. It **excludes**: people/salaries ([15-financial-plan.md](./15-financial-plan.md)), team SaaS (GitHub, Figma, 1Password), marketing/legal/accounting, and payment processing (billing is manual — [D-019](./decisions-log.md), and the `adminAdjustWorkspace` callable, impl-24).

> All figures in **MYR** unless marked USD. Exchange-rate assumption: **USD 1 = MYR 4.60** (Sept 2026; June doc used 4.70). Variable lines scale with paying-workspace count; fixed lines do not.

## 1. What changed since the June estimate ([21-cost-estimation.md](./21-cost-estimation.md))

Verified against the current monorepo (`apps/web`, `backend/functions`, `firebase.json`, `firestore.rules`, `backend/functions/src/lib/messaging/`, `.github/workflows/`).

| Area | June (planned) | Now (actual in code) | Cost effect |
|---|---|---|---|
| **Cloud Run API** | `min-instances=1` on an Express API → ~RM 24/mo fixed floor | Express API in `backend/api` is an **undeployed skeleton**; deploy pipeline ships `hosting,functions,firestore,storage` only (`deploy.yml`) | **−RM 24/mo fixed** (no idle instance) |
| **Compute model** | Mixed Cloud Run + Functions | **Cloud Functions 2nd gen only** (Node 22, `asia-southeast1`), `min-instances=0` (no idle cost, accepts cold starts) | Lower fixed, cold-start latency risk |
| **Scheduled work** | ~5 Scheduler jobs | 3 schedulers incl. `onMessageDispatchSweep` running **every 1 minute** (~43.2k invocations/mo) + daily due-soon & trial-expiry sweeps | New fixed-ish line, **absorbed by Cloud Run free tier** at current scale |
| **BigQuery export** | Firestore→BigQuery extension, ~RM 70/mo | **Not installed.** Reporting is done in-app via pre-aggregation triggers (`onTaskWrite`, `onProjectWrite`) | **−RM 70/mo fixed** |
| **Messaging** | Twilio WhatsApp **+ SMS fallback**, modelled 80% utility / 15% marketing / 5% service | **Twilio WhatsApp only, no SMS.** Every template in `contentSids.ts` is **utility-category** (task status/due/blocked, project welcome, collab link). Shared sender `+13604414161` | **Lower** — all-utility mix is the cheapest WA category; SMS line removed |
| **Transactional email** | Postmark deferred to ticket #11 | **Postmark live now** (`backend/functions/src/lib/mail.ts`) for team invites; degrades to returning the invite URL when the token is absent | Small new fixed line |
| **Hosting** | 1 site | **3 Firebase Hosting sites** — `apex` (marketing + `/p` + `/t`), `dashboard`, `admin` | Negligible now (free tier), watch egress |
| **Auth / MFA** | Firebase Auth free tier | Firebase Auth + **TOTP MFA for admin via Identity Platform (GCIP)** (impl-63) | New MAU-curve consideration (Section 2.7) |
| **Observability** | Sentry + Better Stack + BigQuery | **Sentry live** (`@sentry/react`); **Better Stack still not provisioned**; no BigQuery | **−RM ~190/mo fixed** vs June until Better Stack lands |
| **Write amplification** | ~5k writes/day/workspace | Triggers fan out per write (summary recompute + mirror + notification + activity) → higher write multiple | Slightly higher Firestore writes |

**Net:** the current fixed floor is **materially lower** than the June estimate (no Cloud Run idle instance, no BigQuery, Better Stack not yet on), and per-workspace variable cost is **lower** (all-utility WhatsApp, no SMS). Margins print better than the conservative June model — see Section 3.

## 2. Per-component cost — current stack

Each line flagged **Variable** (scales with workspaces) or **Fixed** (independent up to the noted ceiling). Prices in `asia-southeast1`.

### 2.1 Firestore (Native) — Variable

Rates: USD 0.06 / 100k reads, USD 0.18 / 100k writes, USD 0.02 / 100k deletes, USD 0.18/GB/mo storage.

| Item | Per-workspace volume | USD/mo | MYR/mo |
|---|---|---|---|
| Reads (~50k/day × 30 = 1.5M) | 1.5M | 0.90 | 4.14 |
| Writes (trigger fan-out, ~8k/day × 30 = 240k) | 240k | 0.43 | 1.98 |
| Storage (~50 MB docs) | 0.05 GB | 0.009 | 0.04 |
| PITR (7-day) + daily backup export (allocated) | — | 0.10 | 0.46 |
| **Subtotal — Firestore** | | **~1.44** | **~6.6 MYR / workspace** |

> Writes are higher than the June model because `onTaskWrite`/`onProjectWrite`/`onNotify*` triggers fan out (project-summary recompute + member mirrors + inbox notifications + activity log) on each source write. This is the top per-workspace watch-item for cost drift.

### 2.2 Cloud Functions 2nd gen — Mixed (mostly free at current scale)

2nd-gen functions run on Cloud Run infra. `min-instances=0` → **no idle cost**. Free tier: 2M invocations, 360k GiB-s, 180k vCPU-s per month.

- **Per-workspace triggers** (`onTaskWrite`, `onProjectWrite`, `onProjectDocumentWrite`, `onNotifyInbox*`, `onWorkspaceMemberWrite`, `onClientWrite`, `onMessageCreated`, etc.): ~50k invocations/mo/workspace → **~RM 0.5 / workspace** once past the free tier (Checkpoint C+).
- **Fixed scheduled sweeps:** `onMessageDispatchSweep` (every 1 min ≈ 43.2k inv/mo) + 2 daily sweeps. **Within the 2M-invocation free tier through Checkpoint B**; adds only a few RM/mo at Checkpoint C.
- **Callables** (`acceptInvite`, `issuePortalLink`, `redeemCollabLink`, `exportProject`, `admin*`, …): request-driven, negligible.

**~RM 0.5 / workspace variable; ~RM 0–8 / mo fixed** (sweeps, absorbed by free tier early).

### 2.3 Cloud Storage (documents) — Variable

Standard tier, `asia-southeast1`, USD 0.02/GB/mo. Firm files ≤ 25 MB, client uploads ≤ 10 MB, collab uploads ≤ 25 MB, avatars ≤ 5 MB (`storage.rules`).

- ~200 MB/workspace → ~RM 0.20/mo. Signed-URL download egress → ~RM 0.50/mo.
- **~RM 0.7 / workspace.**

### 2.4 Cloud Tasks / Pub/Sub / Scheduler — Fixed

Cloud Tasks 1M/mo free; Pub/Sub 10 GB free; Scheduler USD 0.10/job × 3 jobs. **~RM 3–5/mo** through ~500 workspaces.

### 2.5 Secret Manager, Cloud Logging, Error Reporting, Trace — Mixed

- Secret Manager (`twilioAccountSid`, `twilioAuthToken`, `postmarkServerToken`, deploy SA): ~RM 5/mo fixed.
- Cloud Logging: 50 GB/mo free; fits free through Checkpoint C.
- Error Reporting (backend `errorPayload()` structured logs) + Trace: free tiers.
- **~RM 5/mo fixed** through C; **~RM 50/mo** at D (logging overage).

### 2.6 Firebase Hosting (3 sites) — Fixed → low-variable

- One project, 3 targets (`apex`, `dashboard`, `admin`). Free tier: 10 GB stored + 360 MB/day egress; overage USD 0.15/GB.
- Bundles are small (~150–300 KB/surface, bundle-isolation enforced in CI). **~RM 0/mo** through Checkpoint C; budget **~RM 30–50/mo** at D (dashboard egress + marketing traffic).

### 2.7 Firebase Auth + Identity Platform (GCIP) — Fixed / MAU-curve

- Email-link (client magic links), Google OAuth (firm), email/password: free base.
- **TOTP MFA (admin)** requires the project on **Identity Platform** (impl-63). GCIP free tier: **50k MAU**, then tiered per-MAU billing.
- MAU is driven by **portal clients** (magic-link sign-ins), not firm seats. At 500 workspaces × ~50 active clients ≈ 25k MAU — **still inside the 50k free tier**. **Flag:** past ~1,000 workspaces client MAU approaches the free ceiling; model per-MAU cost into the Checkpoint-D+ forecast then.
- **~RM 0/mo** through Checkpoint D.

### 2.8 Twilio — WhatsApp (dominant variable cost) — Variable

WhatsApp Business API via Twilio Content Templates (`twilioProvider.ts`, Twilio SDK v5.13.1). **Malaysia rates, Sept 2026, approximate** — verify against the signed BSP agreement:

| Category | Per-conversation (USD) | MYR |
|---|---|---|
| Utility (status/notification) | ~0.020 | ~0.092 |
| Marketing | ~0.0735 | ~0.34 |
| Service (user-initiated, 24 h window) | 0.000 | 0.00 |

**All current templates are utility-category**, so the effective mix is ~100% utility. Modelling 250 conversations/mo:

| Item | Volume | USD/mo | MYR/mo |
|---|---|---|---|
| Utility conversations | 250 | 5.00 | 23.00 |
| Twilio platform fees (allocated) | — | 1.25 | 5.75 |
| **Subtotal — Twilio** | | **~6.25** | **~29 MYR / workspace** |

This is still the **single biggest COGS line** and the most behaviour-sensitive one, but it is **~24% cheaper** than the June model (RM 38) because there are no marketing-category templates and no SMS fallback in the shipped product. **Upside not modelled:** Meta makes utility templates sent **inside** the 24 h service window free — some task updates qualify, which would lower this further.

### 2.9 Transactional email — Postmark — Fixed-ish

- Live for team invites (`mail.ts`, `outbound` stream, `no-reply@siapp.app`). Free ≤ 100 emails/mo, then USD 15/10k.
- Invite volume is tiny (onboarding only). **~RM 0–15/mo** through Checkpoint C; **~RM 70/mo** at D.

### 2.10 Observability — Fixed

| Tool | Status | USD/mo | MYR/mo |
|---|---|---|---|
| Sentry (`@sentry/react` + `@sentry/vite-plugin`) | **Live** | 26 | 120 |
| Better Stack (uptime + status page) | **Planned, not provisioned** | (25) | (0 now / 118 when added) |
| Firestore → BigQuery | **Not used** | 0 | 0 |
| **Subtotal (current)** | | **26** | **~120 MYR/mo fixed** |

Budget **+RM 118/mo** the month Better Stack is turned on (runbook Part B2).

### 2.11 One-time / build-phase spend

| Item | One-off (MYR) |
|---|---|
| Domain (`siapp.app` + variants) | ~200 |
| WhatsApp Business sender registration + display-name review (via Twilio) | ~200 |
| Meta Business Verification | 0 (process, not cash) |
| TLS / DNS | 0 (free tier) |
| **Total one-time product cost** | **~400 MYR** |

## 3. Per-workspace COGS — for pricing reconciliation

Combining every **variable** line from Section 2:

| Line | Per-workspace (MYR/mo) |
|---|---|
| Firestore | 6.6 |
| Cloud Functions (marginal) | 0.5 |
| Cloud Storage + egress | 0.7 |
| Cloud Tasks / Pub/Sub / Scheduler (allocated) | 0.05 |
| Logging / Secret Manager (allocated) | 0.2 |
| **Twilio WhatsApp (250 utility conv)** | **29.0** |
| Postmark (allocated) | 0.15 |
| **Per-workspace infra COGS — Standard-shaped (5 seats, 250 conv)** | **~37 MYR/mo** |
| Per-workspace infra COGS — Business-shaped (10 seats, ~1,000 conv) | **~135 MYR/mo** |

Support is intentionally excluded (people cost). Compare like-for-like with the pricing-model COGS below.

### Reconciliation with the pricing model

| Scenario | Revenue/mo | June [21] infra COGS | **This doc (actual)** | Delta |
|---|---|---|---|---|
| 5-seat Standard, 250 conv | ~RM 395 | 46 | **37** | −9 (all-utility WA, no SMS) |
| 10-seat Business, ~1,000 conv | ~RM 1,490 | 190 | **135** | −55 |

**What this means:**

- The shipped product is **cheaper to run** than either the June actuals-model or the conservative pricing-model COGS. Real gross margin will print **above** the 67–71% quoted to customers/investors — keep the conservative number in customer- and board-facing material and use *this* document for internal cost alerts.
- The margin **headroom grew**. On a Business customer, COGS can rise from RM 135 to the ~RM 492 breach point (33% of RM 1,490) — **~RM 357 of headroom**, absorbing a ~4× Twilio spike, a category drift into marketing, or a Meta WA price increase, before any pricing revision is needed.

## 4. Total monthly product+service run cost at each scale

**Product+service only** — no people, no team SaaS, no marketing.

Formula: `Fixed floor + (variable per-workspace × workspace count)`

**Current fixed floor** = Cloud Tasks/PubSub/Scheduler (5) + Logging/Secret Manager (5) + Sentry (120) + Postmark (0–15) ≈ **~130 MYR/mo**. (Cloud Run min-instance RM 24 and BigQuery RM 70 from the June floor are gone; add **+RM 118** when Better Stack is provisioned → ~248.)

| Checkpoint | Workspaces | Variable (× ~37) | Fixed floor | **Total MYR/mo** | Revenue/mo ([15]) | Product gross margin |
|---|---|---|---|---|---|---|
| **A — design partners** | 2 | 74 | 130 | **~204** | 300 (discounted) | n/a (sub-scale) |
| **B — closed beta** | 10 | 370 | 145 | **~515** | 2,000 | **74%** |
| **C — early traction** | 100 | 3,700 | 250 | **~3,950** | 19,200 | **79%** |
| **D — Phase 1 exit** | 500 | 18,500 | 450 | **~18,950** | 200,000 | **91%** |

**Reading this:**

- Below ~25 paying workspaces the fixed floor still dominates — expected, pricing is sized for 100+.
- The current stack is **leaner than June projected at every checkpoint** (June: B ~874 / C ~5,060 / D ~23,670). The gap is the missing Cloud Run idle instance, no BigQuery, Better Stack off, and all-utility WhatsApp.
- At Checkpoint D the fixed floor amortises to under RM 1/workspace; product margin asymptotes toward ~91%.

## 5. Sensitivities

Ranked by impact on per-workspace COGS.

| Risk | Trigger | Impact | Mitigation |
|---|---|---|---|
| **Twilio category drift** | A future marketing/broadcast template ships and gets used | +15–35 MYR / workspace | Keep templates utility-category; audit any new template's category before release; higher overage rate on marketing |
| **Firestore write amplification** | A new trigger fans out on hot paths without a budget review | +5–15 MYR / workspace | "Writes per source-event" budget in PR review; batch trigger writes |
| **Firestore read explosion** | Listener-heavy screen ships without budget | +5–15 MYR / workspace | Reads-per-render budget; scope `onSnapshot` listeners tightly |
| **Cloud Run min-instances turned on** | API deploys, or a function needs `min-instances≥1` for cold-start SLA | +24 MYR/mo fixed per service | Only enable on customer-facing latency-critical paths |
| **Better Stack / more observability** | Provisioned per runbook | +118 MYR/mo fixed | Expected, budgeted; keep to free-tier monitors early |
| **Identity Platform MAU past free tier** | Client MAU > 50k (≈ >1,000 workspaces) | per-MAU billing kicks in | Model GCIP MAU cost into Checkpoint-D+ forecast |
| **Currency (USD→MYR)** | Ringgit weakens 10% | +10% on Twilio/GCP/Sentry/Postmark | Pass through at next price review |
| **Logging cost spike** | Verbose prod logs | +50–500 MYR/mo fixed | Logging budget alert at 75% of free tier; sample noisy services |

## 6. Cost-control thresholds

| Trigger | Action |
|---|---|
| Twilio cost > 40% of a workspace's subscription | Customer review — template-category audit or forced upgrade |
| Firestore writes > 500k/day/workspace | Investigate trigger fan-out before next release |
| Firestore reads > 3M/day/workspace | Investigate listener scope |
| Cloud Functions invocations approaching 2M/mo free tier | Confirm sweep cadence + trigger volume; consider batching |
| Total product+service cost > 25% of MRR | Quarterly cost review; freeze new infra spend |
| Cloud Logging > 80% of 50 GB free tier | Add log sampling |
| Identity Platform MAU > 40k | Model per-MAU cost; forecast into pricing |
| Per-workspace COGS exceeds headroom (~RM 492 Business / ~RM 116 Standard) | Pricing revision before next signup batch |

## 7. Open cost questions

| Question | Owner | Due |
|---|---|---|
| Confirm exact Twilio MY rates (utility/marketing/auth/service) against signed BSP agreement | Founder | Pre closed-beta |
| Quantify `onMessageDispatchSweep` (1-min cadence) compute at Checkpoint C — is a 5-min cadence acceptable to halve invocations? | First engineer | Checkpoint B |
| Measure real Firestore write multiple per task update (trigger fan-out) with production telemetry | First engineer | Checkpoint B |
| When does the Express API in `backend/api` deploy to Cloud Run, and does it need `min-instances`? | First engineer | At first API route ship |
| Model Identity Platform per-MAU cost curve past 50k client MAU | First engineer | Checkpoint C |
| Better Stack provisioning timing + monitor count vs free tier | Founder | Before public launch |

## 8. How to update this document

Update when: a vendor changes price; a new product-side component lands in [13-tech-architecture.md](./13-tech-architecture.md); the Express API deploys to Cloud Run; Better Stack or BigQuery is provisioned; a new WhatsApp template ships (re-check its category); or a pricing change in [25-pricing-model-market-fit.md](./25-pricing-model-market-fit.md) / [06-pricing-model.md](./06-pricing-model.md) requires re-running Section 3. Cost decisions that change the answer are logged in [decisions-log.md](./decisions-log.md).

---
title: "Cost Estimation — Product & Service Costs"
status: draft
updated: 2026-06-27
---

# Cost Estimation — Product & Service Costs

Bottom-up **product and service** cost model for the v1 in [11-mvp-scope.md](./11-mvp-scope.md) on the stack in [13-tech-architecture.md](./13-tech-architecture.md). Sized to validate the COGS rows in [06-pricing-model.md](./06-pricing-model.md).

This document deliberately **excludes**:

- People / salaries / founder comp → see [15-financial-plan.md](./15-financial-plan.md) and [16-team-hiring-plan.md](./16-team-hiring-plan.md)
- Team-facing SaaS (GitHub, Linear, Figma, 1Password, Notion) — not part of product COGS
- Marketing, legal, accounting, insurance, banking, office — not part of product COGS
- Stripe / FPX gateway — manual billing at MVP per [D-019](./decisions-log.md)

Everything below is cash the product itself burns to **run** — i.e. what should be reconciled against subscription revenue when measuring gross margin.

> All figures in **MYR** unless marked USD. Exchange rate assumption: **USD 1 = MYR 4.70** (June 2026). Variable lines scale with paying-workspace count; fixed lines do not.

## 1. Assumptions

### Workload per "typical paying workspace"

| Variable | v1 assumption | Source |
|---|---|---|
| Seats per workspace | 5 | mid-tier in [pricing](./06-pricing-model.md) |
| Active projects | 8 | discovery hypothesis |
| Active tasks / project | 60 | from seeded residential starter project (D-031) |
| WhatsApp conversations / mo | 250 (50 × 5 seats) | Standard pooled allowance |
| Inbound WA auto-replies / mo | ~25 | D-035: inbound not processed; static auto-reply, rate-limited 1/sender/24h |
| Documents stored | 200 files × ~1 MB = 200 MB | estimated |
| Firestore reads / day | ~50,000 | listener-heavy boards |
| Firestore writes / day | ~5,000 | tasks, notes, audit, metrics |
| Cloud Run requests / mo | ~20,000 | API + webhooks |

### Scale checkpoints

| Checkpoint | Paying workspaces | Maps to |
|---|---|---|
| **A — design partners** | 2 | M3 in revenue ramp |
| **B — closed beta** | 10 | M6 |
| **C — early traction** | 100 | M12–15 |
| **D — Phase 1 exit** | 500 | M24 |

## 2. Per-component cost — infrastructure & third-party services

Walking every box in the architecture diagram from [13-tech-architecture.md](./13-tech-architecture.md). Each line is flagged **Variable** (scales with workspaces) or **Fixed** (independent of workspace count up to the noted ceiling).

### 2.1 GCP — Firestore (Native) — Variable

Pricing in `asia-southeast1`: USD 0.06 per 100k reads, USD 0.18 per 100k writes, USD 0.18/GB/mo storage.

| Item | Per-workspace volume | Cost (USD/mo) | Cost (MYR/mo) |
|---|---|---|---|
| Reads (50k/day × 30 = 1.5M) | 1.5M | 0.90 | 4.23 |
| Writes (5k/day × 30 = 150k) | 150k | 0.27 | 1.27 |
| Storage (Firestore docs ~50 MB) | 0.05 GB | 0.009 | 0.04 |
| Backups (export to Coldline, allocated) | — | 0.05 | 0.24 |
| **Subtotal — Firestore** | | **~1.23 USD** | **~5.80 MYR / workspace** |

### 2.2 GCP — Cloud Run (API + webhooks) — Mixed

- **Fixed floor:** `min-instances=1` on the API service once paying customers exist → ~USD 5/mo ≈ **24 MYR/mo**.
- **Variable:** per-request compute at 20k req/mo per workspace → < USD 0.05 ≈ **~0.25 MYR / workspace**.

### 2.3 GCP — Cloud Functions 2nd gen (triggers) — Variable

Firestore `onWrite` triggers for pre-aggregation and audit fan-out. ~50k invocations/mo per workspace → < USD 0.05 ≈ **~0.25 MYR / workspace**.

### 2.4 GCP — Cloud Storage (documents) — Variable

- Standard tier, `asia-southeast1`: USD 0.02/GB/mo.
- Per workspace 200 MB → ~0.20 MYR/mo.
- Signed-URL download egress → ~0.50 MYR/mo.
- **~0.70 MYR / workspace.**

### 2.5 GCP — Cloud Tasks + Pub/Sub + Scheduler — Fixed

- Cloud Tasks: 1M tasks/mo free.
- Pub/Sub: 10 GB throughput free.
- Scheduler: USD 0.10/job/mo × ~5 jobs.

**~5 MYR/mo total** up to ~500 workspaces.

### 2.6 GCP — Secret Manager, Cloud Logging, Cloud Trace — Mixed

- Secret Manager: ~USD 1/mo for the secret set → **~5 MYR/mo fixed**.
- Cloud Logging: 50 GB/mo free; beyond → USD 0.50/GB. Through Checkpoint C this fits free.
- Cloud Trace: 2.5M spans/mo free.

**~5 MYR/mo fixed** through Checkpoint C; **~50 MYR/mo fixed** at Checkpoint D (logging overage).

### 2.7 Firebase Auth + Hosting — Fixed

- Auth: free for email/password and Google sign-in up to 50k MAU.
- Auth emails (password reset, verification): sent by Firebase built-in delivery, free (D-040). Custom sender domain configured in console.
- Hosting: 10 GB storage + 360 MB/day egress free.

**0 MYR/mo** through Checkpoint C; **~50 MYR/mo** at Checkpoint D (egress).

### 2.8 Twilio — WhatsApp + SMS — Variable

The dominant variable cost. WhatsApp Business API conversation rates in **Malaysia (June 2026, approximate)**:

| Category | Per-conversation cost (USD) | MYR equivalent |
|---|---|---|
| Utility (status / notification) | 0.022 | 0.10 |
| Authentication (OTP) | 0.022 | 0.10 |
| Marketing | 0.0735 | 0.35 |
| Service (user-initiated, 24 h window) | 0.000 (free) | 0.00 |

Plus Twilio's per-message platform fee.

Modelling 250 conversations/mo at **80% utility / 15% marketing / 5% service**:

| Item | Volume | Cost (USD/mo) | Cost (MYR/mo) |
|---|---|---|---|
| Utility | 200 | 4.40 | 20.70 |
| Marketing | 37.5 | 2.76 | 12.95 |
| Service | 12.5 | 0.00 | 0.00 |
| Twilio platform fees (allocated) | — | 0.50 | 2.35 |
| SMS fallback (10 segments/mo at USD 0.045) | 10 | 0.45 | 2.12 |
| **Subtotal — Twilio** | | **~8.11 USD** | **~38 MYR / workspace** |

This is the **single biggest COGS line** and the one most sensitive to behaviour. Overage rates in [pricing model](./06-pricing-model.md) and template-category nudges are the primary mitigations.

### 2.9 Transactional email — Postmark (team invites, founder billing) — Fixed-ish, deferred (D-040)

- **Not adopted until ticket #11 (team invites)** — MVP auth emails are handled free by Firebase Auth built-in delivery (D-040). 0 MYR/mo until then.
- USD 15/mo for 10k emails once adopted.
- 100 workspaces × ~30 emails/mo = 3k emails → fits **15 USD ≈ 70 MYR/mo** through Checkpoint C.
- At Checkpoint D → USD 25 ≈ **120 MYR/mo**.

### 2.10 Observability — Fixed

| Tool | Purpose | USD/mo | MYR/mo |
|---|---|---|---|
| Sentry Team | Frontend + backend error tracking, 50k events | 26 | 122 |
| Better Stack | Uptime monitoring + status page | 25 | 118 |
| Firestore → BigQuery extension | BQ storage + streaming for reporting | 15 | 70 |
| **Subtotal** | | **66** | **~310 MYR/mo fixed** |

Holds through Checkpoint C. At Checkpoint D budget another ~50 MYR for Sentry event tier bump.

### 2.11 One-time / build-phase product spend

The product itself needs almost no cash to *build* — most lines above only start metering when there's traffic. The genuine product/service line items during build are:

| Item | One-off (MYR) |
|---|---|
| Domain registration (siapp.my + variants, 3 yrs) | 600 |
| WhatsApp Business sender registration + display-name review (via Twilio) | 200 |
| Meta Business Verification (required for WA Business API) | 0 (process, not cash) |
| TLS / DNS (Cloudflare free) | 0 |
| **Total one-time product cost** | **~800 MYR** |

Everything else is metered usage that starts the day the first customer signs up. The "Phase 1 build cost" in [15-financial-plan.md](./15-financial-plan.md) is overwhelmingly *people*, not product.

## 3. Per-workspace COGS — for pricing reconciliation

Combining every **variable** line from Section 2:

| Line | Per-workspace (MYR/mo) |
|---|---|
| Firestore | 5.80 |
| Cloud Run compute (marginal) | 0.25 |
| Cloud Functions | 0.25 |
| Cloud Storage + egress | 0.70 |
| Cloud Tasks / Pub/Sub / Scheduler (allocated) | 0.05 |
| Logging / Secret Manager (allocated) | 0.20 |
| **Twilio (WhatsApp + SMS, 250 conv at 80/15/5 mix)** | **38.00** |
| Postmark (allocated) | 0.70 |
| **Per-workspace infra COGS — Standard customer (5 seats, 250 conv)** | **~46 MYR/mo** |
| Per-workspace infra COGS — Business customer (10 seats, 1,000 conv) | **~190 MYR/mo** |

Note: **support cost is intentionally not included here** — it's people cost, not product cost. The pricing-model COGS rows do include it. Compare like-for-like below.

### Reconciliation with [06-pricing-model.md](./06-pricing-model.md)

The pricing-model COGS already includes per-customer support + payment processing on top of infra. Stripping those out for a clean comparison:

| Scenario | Revenue/mo (MYR) | Pricing-model COGS (all-in) | Pricing-model **infra-only** COGS (excl. support + processing) | This doc's infra COGS | Delta |
|---|---|---|---|---|---|
| 5-seat Standard annual, 250 conv | 395 | 113 | 113 − 15 (support) − 0 (manual processing) = **98** | **46** | This doc **52 MYR lower** per customer |
| 10-seat Business annual, 1,000 conv | 1,490 | 487 | 487 − 30 (support, 2 tickets) − 0 = **457** | **190** | This doc **267 MYR lower** per customer |

**What this means:**

- The pricing model is **more conservative on infra** than this bottom-up estimate, by ~2–2.5×. That headroom is real safety margin and should stay there: Twilio category mix can shift, Firestore listener cost can spike, and the conservative number is what's quoted to customers and used in board updates.
- Use this document's numbers for **internal forecasting and cost-trigger alerts**; use the pricing model's numbers for **customer-facing and investor-facing material**.
- If actual telemetry after Checkpoint B shows this doc's numbers are right and the pricing model is over-conservative, **gross margin will print 85–90% instead of 67–71%** — a good problem to have.

### Where the pricing model would break

Gross margin ≥ 67% on a Business customer holds as long as per-customer COGS stays under **~492 MYR/mo** (33% of RM 1,490). Our infra estimate of 190 MYR has **~300 MYR of headroom per Business customer**, which absorbs:

- A 4× spike in Twilio cost (38 → 152 MYR/workspace via marketing-category drift), **or**
- A 2× spike in Firestore reads + a 50% Twilio increase, **or**
- A WhatsApp price increase from Meta of up to ~30%.

Anything worse breaches the margin target and triggers a pricing-model revision.

## 4. Total monthly product+service run cost at each scale

**Product+service only** — no people, no team SaaS, no marketing, no ops.

Formula: `Fixed floor + (variable per-workspace × workspace count)`

Fixed floor at v1 = Cloud Run min-instances (24) + Cloud Tasks/PubSub/Scheduler (5) + Logging/SM (5) + Postmark (70) + Observability (310) = **~414 MYR/mo**.

| Checkpoint | Workspaces | Variable (× ~46 MYR) | Fixed floor | **Total MYR/mo** | Revenue / mo (from [15-financial-plan.md](./15-financial-plan.md)) | Product gross margin |
|---|---|---|---|---|---|---|
| **A — design partners** | 2 | 92 | 414 | **~506** | 300 (discounted) | n/a (sub-scale) |
| **B — closed beta** | 10 | 460 | 414 | **~874** | 2,000 | **56%** (fixed floor dominates) |
| **C — early traction** | 100 | 4,600 | 460 | **~5,060** | 19,200 | **74%** |
| **D — Phase 1 exit** | 500 | 23,000 | 670 | **~23,670** | 200,000 | **88%** |

**Reading this:**

- Below ~30 paying workspaces the **fixed floor dominates** and product margin looks bad. That's fine — pricing is sized for 100+ workspaces, not for the design-partner phase.
- At Checkpoint C the per-workspace economics start to track the pricing model's gross-margin promise (~71%). The 74% here is slightly higher because support cost isn't loaded into this view.
- At Checkpoint D the fixed floor amortises down to ~1.30 MYR/workspace — essentially noise. Product margin asymptotes toward 88%.

> If Twilio cost runs hot (marketing-category drift), the per-workspace variable line moves first. Section 5 quantifies.

## 5. Sensitivities

Ranked by impact on per-workspace COGS.

| Risk | Trigger | Impact on per-workspace COGS | Mitigation |
|---|---|---|---|
| **Twilio category drift** | Customers misuse marketing templates | +20–40 MYR / workspace | Template-category audit; overage at higher rate |
| **Twilio platform price moves** | Meta raises WA utility rate | +5–15 MYR / workspace | `MessageProvider` abstraction (D-001); pass-through in overage rates |
| **Firestore read explosion** | Listener-heavy screens ship without budget review | +10–20 MYR / workspace | "Reads/writes per render" budget; per-PR review |
| **Currency (USD → MYR)** | Ringgit weakens 10% vs USD | +10% on Twilio + GCP + Postmark + Sentry lines | Pass through to pricing at next price review |
| **Cold-start mitigation widens** | Multiple Cloud Run services need `min-instances=1` | +24 MYR/mo fixed per service | Only enable on services with customer-facing latency |
| **Logging cost spike** | Verbose debug logs in production | +50–500 MYR/mo fixed | Cloud Logging budget alert at 75% of free tier |
| **Backups grow faster than modelled** | Document-heavy verticals (conveyancing) | +0.50 MYR / workspace | Coldline lifecycle already configured |

## 6. Cost-control thresholds

| Trigger | Action |
|---|---|
| Twilio cost > 40% of subscription revenue for a workspace | Customer review — possible forced upgrade or template-category audit |
| Firestore reads > 3M / day / workspace | Engineering investigates listener scope before next release |
| Total product+service cost > 25% of MRR | Quarterly cost review; freeze new infra spend |
| Cloud Logging > 80% of 50 GB free tier | Add log sampling on noisy services |
| Postmark > USD 50/mo | Move to AWS SES or Resend before USD 100 |
| Sentry events > 100k/mo | Add error-grouping rules; sample low-severity events |
| Per-workspace COGS exceeds pricing-model headroom (492 MYR Business / 116 MYR Standard) | Pricing revision required before next signup batch |

## 7. Open cost questions

| Question | Owner | Due |
|---|---|---|
| Confirm exact Twilio rates in MY (utility / marketing / authentication / service) with signed BSP agreement | Founder | Pre-sprint 1 (Q49-adjacent) |
| Confirm GCP committed-use discount applicability at Checkpoint C+ | First engineer | M9 |
| Whether to keep Sentry or move to OSS GlitchTip at Phase 3 | First engineer | Phase 2 review |
| BigQuery export storage growth — model assumes 100 MB/workspace, validate at Checkpoint B | First engineer | M6 |
| When does `min-instances` go from 1 → 2 (per service) for cold-start safety? | First engineer | At first p95 webhook breach |

## 8. How to update this document

Update when:

- A vendor changes price (Twilio, GCP, Postmark, Sentry, Better Stack).
- A new product-side component lands in [13-tech-architecture.md](./13-tech-architecture.md) — add a row in Section 2.
- A pricing change happens in [06-pricing-model.md](./06-pricing-model.md) — re-run Section 3 reconciliation.

Cost decisions that change the answer (e.g. switching transactional email provider, raising overage rate) are logged in [decisions-log.md](./decisions-log.md).

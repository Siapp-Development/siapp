---
title: "Pricing Model — Market-Fit Recommendation"
status: draft
updated: 2026-09-02
supersedes: none
relates: 06-pricing-model.md, 24-cost-estimation-current.md
---

# Pricing Model — Market-Fit Recommendation

A pricing model tuned to the **SEA SME professional-services** market and grounded in the **actual, lower cost base** in [24-cost-estimation-current.md](./24-cost-estimation-current.md). It builds on [06-pricing-model.md](./06-pricing-model.md) (per-seat, June) and proposes a shift to **flat-tier pricing with an included seat band** — a better fit for the price-sensitive, per-seat-averse buyer in [03-target-market.md](./03-target-market.md), while preserving the free-client wedge and healthy margins.

> **Decision status:** proposal. The MVP still launches **single-tier** ([D-030](./decisions-log.md)); billing stays **manual** ([D-019](./decisions-log.md), admin functions from impl-24). This doc defines the single MVP plan **and** the post-MVP tier split.

## 1. What the market tells us

From [02-competitive-analysis.md](./02-competitive-analysis.md) and [03-target-market.md](./03-target-market.md):

- **ICP:** MY construction contractors (G1–G5, ~8–12k addressable) and SME law firms (~1,800). Combined SAM ~12–17k firms. Target 2% at **~RM 350 ARPA/mo**.
- **Buyer psychology:** owner-operators, price-sensitive, buying a *client-communication + tracking* combo, not enterprise PM. They fear meters that punish growth.
- **Competitor anchors:** Buildertrend **USD ~499/mo** (~RM 2,300), Procore enterprise, Clio **USD 39–129/user/mo**. All USD, all far above our target. Siapp's wedge is **MYR pricing, WhatsApp-native, client portal free, local**.
- **Open discovery question ([03], Q):** *is per-seat the right meter for construction, or is per-project / flat better?* — this doc answers: **flat base + seat band**.

## 2. Principles

1. **Clients & collaborators are unlimited and free, forever.** They are the distribution loop (every WhatsApp update surfaces the brand), never a revenue line. Non-negotiable.
2. **Flat, predictable base — not a pure per-seat meter.** SEA SME owners say yes to a fixed monthly number and hesitate at "per user." Include a generous seat band; charge for seats only *above* the band. Predictable entry + real expansion revenue.
3. **Price the workflow value; meter only the one cost that moves.** Subscription covers the product. WhatsApp is metered above a pooled allowance so margins stay healthy — but allowances are generous because [24] shows all-utility messaging is cheap (~RM 0.10/conv).
4. **Local currency, local channel.** MYR pricing; manual FPX/invoice collection at MVP (no Stripe — [D-019]).
5. **One free way in.** 30-day full-feature trial, read-only after expiry, data preserved 90 days.
6. **Three plans max, one axis of difference.** Trial → Starter → Growth. White-label + advanced controls are the upgrade reason.
7. **Annual discount (~20%, ~2.5 months free)** to lock retention and cut manual-invoicing overhead.

## 3. Recommended structure

### 3.1 MVP — single tier (ships now, per D-030)

| | **Siapp Standard (MVP)** |
|---|---|
| Price | **RM 199 / mo** flat · **RM 159 / mo** annual (billed yearly) |
| Seats included | **5** firm users |
| Additional seat | **RM 35 / seat / mo** |
| Clients & collaborators | **Unlimited, free** |
| Projects | Unlimited |
| WhatsApp conversations | **500 / mo pooled** (utility) |
| WhatsApp overage | **RM 0.40 / conversation** |
| Branding | Logo + brand colour |
| Support | Email (48 h) |
| Trial | 30-day full-feature, 1 workspace, 3 projects, 50-conv pool, no card |

Why RM 199 flat / 5 seats: lands just above the **RM 350 ARPA** target once a typical firm adds 1–2 seats or a little overage, sits ~10× below Buildertrend, and clears a ~70%+ margin at [24]'s COGS (Section 5).

### 3.2 Post-MVP — tier split (when ≥ 10 paying firms give signal on which upgrade reason bites)

| Plan | Price (MYR/mo) | Annual (MYR/mo) | Seats incl. | Add-seat | WhatsApp incl. | Overage | Branding / other |
|---|---|---|---|---|---|---|---|
| **Trial** | Free 30 days | — | 1 | — | 50 (one-time pool) | — | Siapp branding; 3 projects; no card |
| **Starter** | **RM 149** | **RM 119** | 3 | RM 39 | 300 / mo | RM 0.40/conv | Logo + brand colour; unlimited projects & clients; email support |
| **Growth** | **RM 349** | **RM 279** | 8 | RM 35 | 800 / mo | RM 0.30/conv | **Full white-label** (custom domain, no Siapp branding), full theming, data export + API, priority support |
| **Scale** (post-Phase 1) | Custom | — | Custom | — | Custom | Pass-through | Firm's own WA sender, SSO/SAML, SLA, data residency |

**Notes**
- Minimum 1 seat (owner). Annual billed up-front, single invoice.
- Overage is deliberately near-nominal — allowances are sized so most firms never hit them; the meter exists to protect margin against outliers, not as a profit centre.
- The **only** hard upgrade wall is **white-label + custom domain + API** (Growth). Everything operational (unlimited projects, clients, collaborators, core PM, portal, WhatsApp, audit log, PDPA handling) is in **every** paid plan — no feature-gating paralysis.

### 3.3 Add-ons (post-MVP)

- Vertical template pack (e.g. "Conveyancing — MY Complete"): RM 99 one-time.
- Onboarding & template customization service: RM 1,500–5,000 one-time.
- Additional WhatsApp allowance block: RM 30 / 100 conv/mo (cheaper than per-conv overage; rewards forecasting).

## 4. Unit economics (against actual COGS in [24])

Per-workspace infra COGS from [24]: **~RM 37/mo** at 250 utility conv, scaling ~RM 0.10/extra conv.

| Scenario | Revenue/mo | Est. COGS/mo (infra, [24]) | Gross margin |
|---|---|---|---|
| Starter monthly, 3 seats, 300 conv | RM 149 | ~RM 42 | **~72%** ✓ |
| Starter **annual**, 3 seats, 300 conv | RM 119 | ~RM 42 | **~65%** ✓ |
| MVP Standard, 5 seats + 1 add-seat, 500 conv | RM 234 | ~RM 62 | **~74%** ✓ |
| Growth annual, 8 seats, 800 conv | RM 279 | ~RM 95 | **~66%** ✓ |
| Growth annual, 8 seats + 4 add-seats, 800 conv | RM 419 | ~RM 95 | **~77%** ✓ |

All clear the 65%+ SaaS-margin bar even at the discounted annual rate, with support cost (people, not in [24]) still leaving comfortable room. Because [24]'s COGS is **lower** than the June model, these prices carry more headroom than [06]'s per-seat plan did — the pricing risk is willingness-to-pay and simplicity, **not** cost.

## 5. Why flat + seat band beats the alternatives

| Model | Verdict | Reasoning |
|---|---|---|
| **Flat base + included seat band (recommended)** | ✅ | Predictable "one number" entry SEA SMEs say yes to; still expands via add-seats + WhatsApp; protects the free-client wedge; simplest to explain and to bill manually. |
| **Pure per-seat** ([06], June) | ⚠️ replace | Punishes the firm for hiring; owners mentally multiply "RM 99 × everyone" and stall. Fine for tech-forward SMBs, friction for MY contractors. |
| **Per-project metered** | ❌ | Penalizes the *right* behaviour (more projects in the system) and produces spiky, unpredictable invoices — the opposite of what a manual-billing, price-sensitive buyer wants. |
| **Per-client / portal seat** | ❌ | Destroys the distribution loop. Clients must always be free. |
| **Pure usage (WhatsApp only)** | ❌ | Margin too thin, no recurring-SaaS retention story. |
| **Freemium forever-free** | ❌ | Converts poorly without urgency; the 30-day full trial is sharper. |

## 6. Migration from [06-pricing-model.md](./06-pricing-model.md)

- [06] is per-seat (Standard RM 99/79, Business RM 179/149, min 2 seats). This doc replaces the **meter** (per-seat → flat + band) but keeps [06]'s spirit: free clients, WhatsApp overage, annual discount, white-label as the upgrade reason, manual billing.
- **Financial-plan consistency:** [15-financial-plan.md](./15-financial-plan.md) already models per-**account** ARPA (RM 150→450) and a flat "RM 499 Business" — this proposal *aligns the pricing page with how the financial plan already thinks* (per firm, not per seat).
- No customer impact: MVP hasn't launched paid tiers yet, so this is a pre-launch packaging decision, not a repricing of live accounts.
- If adopted, log the decision (per-seat → flat-tier) in [decisions-log.md](./decisions-log.md) and mark [06] `superseded`.

## 7. Discounts

- **Annual:** ~20% (built into headline).
- **Design partners (first 10 firms):** 50% off Growth for 12 months for a case study + monthly feedback call.
- **Association partners** (MBAM, REHDA, PAM, Bar Council): 20% off first year.
- **MDEC / SME digitalization grants:** list as approved vendor so customers subsidize adoption ([15]).
- **Non-profit / education:** 50% off.

Manual billing makes every discount a one-line invoice adjustment — record each in the admin panel (`adminAdjustWorkspace`).

## 8. Pricing page & communication

- One page, three columns: **Trial / Starter / Growth**. Default the toggle to **annual** (show "~20% off").
- Lead with **"Your clients are always free."**
- Realistic usage example: "A 5-PM firm with ~12 active projects typically sends ~300–500 WhatsApp updates/month — inside Starter/Standard's pooled allowance."
- ROI line: "Replaces 3–5 hours/week of spreadsheet + manual WhatsApp typing." At MY PM hourly rates, payback in week 1.
- Anchor against the pain, not the competitor: don't name Buildertrend on the page; do show the "priced for SEA firms" contrast implicitly via MYR + flat pricing.

## 9. Experiments to run in Year 1

1. **Flat vs seat-band sensitivity** — does the add-seat line create friction, or do firms expand willingly? Target: > 30% of accounts on > included seats by M9.
2. **Trial → paid conversion** — target 15–20%.
3. **Annual mix** — target > 40% annual (cheaper to operate manually).
4. **Starter → Growth upgrade rate** — do firms pay for white-label + custom domain, or stay on Starter?
5. **Overage incidence** — what % of firms ever hit the WhatsApp cap? If < 5%, allowances are (deliberately) generous; if > 20%, raise allowance or nudge template usage.

## 10. When to raise prices

- After ≥ 100 paying firms with NRR > 100%.
- After shipping at least one major capability customers asked for.
- Grandfather existing firms 12 months; raise on new logos first.

## 11. Open questions

| Question | Owner | Due |
|---|---|---|
| Validate flat RM 199 / 5-seat MVP price in discovery calls (vs RM 149/3-seat Starter) | Founder | Before paid launch |
| Confirm add-seat price point (RM 35) doesn't reintroduce per-seat anxiety | Founder | Closed beta |
| Confirm WhatsApp allowances (300/500/800) sit above real usage from [24] telemetry | Founder + first engineer | Closed beta |
| Decide whether Growth's upgrade reason (white-label) is compelling enough or needs a second reason | Founder | ≥ 10 paying firms |

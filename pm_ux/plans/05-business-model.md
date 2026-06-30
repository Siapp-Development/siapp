---
title: "Business Model"
status: draft
updated: 2026-06-16
---

# Business Model

## Model: B2B SaaS subscription + usage-based messaging

Siapp is sold to **firms** (not end clients). Firms pay a recurring subscription for the workspace + seats, plus metered fees for WhatsApp/SMS volume above tier allowances.

This pairs predictable SaaS ARR with usage revenue that **grows with the customer's success** (more active projects → more notifications → more revenue, without raising the price the buyer sees up-front).

## Revenue streams

| Stream | Type | % of revenue (Year 1 target) | % (Year 3 target) |
|---|---|---|---|
| **Subscription** (tiered plans) | Recurring SaaS | 75% | 60% |
| **Messaging usage** (WhatsApp/SMS overages) | Usage-based | 15% | 20% |
| **Onboarding & template customization** | One-time services | 8% | 5% |
| **Template marketplace** (paid vertical packs) | Recurring / one-time | 1% | 8% |
| **Integrations & API add-ons** (e.g. accounting sync) | Add-on subscription | 1% | 7% |

Service revenue (onboarding) is intentionally small and shrinks as templates mature; SaaS + usage is the engine.

## Unit economics (illustrative, validate with first 20 customers)

Assumptions are *deliberately conservative* for a Year-1 MY construction-firm customer on a mid-tier plan.

| Metric | Assumption | Notes |
|---|---|---|
| ARPA (Avg revenue / account / month) | RM 350 | Mid tier + light overages |
| Gross margin | 70–75% | Hosting + WhatsApp BSP cost is dominant variable cost |
| CAC (founder-led + referral) | RM 600–1,200 | Higher when paid acquisition starts |
| Payback period | < 6 months | Acceptable for SMB SaaS |
| Logo churn (monthly) | 2–3% target | Will be higher in first 6 months; target < 2% by month 18 |
| Net revenue retention | 105–115% | Usage growth + seat expansion offsets churn |
| LTV (gross-margin adjusted) | RM 8,000–12,000 | At ~2.5% monthly churn, GM 72%, ARPA RM 350 |
| LTV : CAC | > 5× target | Healthy for SMB SaaS |

## Cost structure

| Bucket | Notes |
|---|---|
| **WhatsApp BSP** (per-conversation) | Largest variable cost. Negotiate volume tiers with Twilio / 360dialog / Wati. Pass overage to customer. |
| **Cloud hosting** | Standard SaaS infra (DB, storage, compute). Small fraction at SMB scale. |
| **Document storage** | Per-tier caps to keep this bounded. |
| **Customer support** | Local, WhatsApp-led. Self-serve templates + in-app tours reduce ticket volume. |
| **R&D** | Concentrated investment Year 1–2: template engine, portal, messaging layer. |
| **Sales & marketing** | Founder-led + content + association partnerships. Avoid paid acquisition until LTV:CAC is proven. |
| **Compliance / legal** | PDPA, WhatsApp policy, contracts. Modest. |

## Customer acquisition motion

| Motion | Stage | When dominant |
|---|---|---|
| **Founder-led sales** to warm intros | 0 → 20 customers | Year 1 Q1–Q2 |
| **Design-partner-led referrals** | 20 → 100 customers | Year 1 Q3–Q4 |
| **Association & partner channel** (MBAM, Bar Council, accountant firms) | 100 → 500 customers | Year 2 |
| **Content + SEO + community** (templates as lead magnets) | 500 → 2,000 | Year 2–3 |
| **Light paid acquisition** (Google, FB) once payback is proven | Late Year 2+ | After LTV:CAC validated |
| **Outbound to verticals** | Selectively | Year 2+ |
| **PLG client → firm loop** | Always-on, compounding | From day 1 |

The **PLG loop is the underrated channel**: every client who receives a polished Siapp update sees Siapp branding (subtle but present), some of those clients run their own firms, and a fraction convert. Cost: near zero. Compounds with every active project.

## Partnership / channel strategy

- **WhatsApp BSPs** (Twilio, 360dialog, Wati): infrastructure partners; co-marketing potential.
- **Industry associations** (MBAM, REHDA, PAM, Malaysian Bar): credibility + access to membership lists.
- **Accounting software vendors** (SQL Account, AutoCount): integration + referral.
- **Local accountants & consultants**: referral partners with rev share (10–20% first-year).
- **MDEC / SME Corp / MyDigital**: government grant programs that subsidize SaaS adoption — Siapp should be on the approved vendor list.

## Pricing power (qualitative)

| Factor | Pricing power |
|---|---|
| Switching cost (templates, history, client relationships) | High after 6 months |
| Differentiated channel (WhatsApp) | High |
| Local-language UI/support | Medium (will be matched eventually) |
| Brand | Low initially, building |
| Network effects | Low (single-tenant per firm) |

Implication: **price modestly at launch**, raise on the back of switching cost and feature depth in Year 2.

## Risks to the model

1. **WhatsApp pricing changes** (Meta unilaterally adjusts BSP conversation pricing). Mitigation: multi-channel from day 1; track gross margin monthly; build pricing flexibility into contracts.
2. **Long enterprise sales drag** if we drift up-market. Mitigation: explicitly stay SMB in Year 1; don't accept RFPs.
3. **Vertical depth pressure** (firms want billing, e-signature, etc.). Mitigation: integrate, don't build.
4. **Concentration risk** (early on, a few large customers = a big % of ARR). Mitigation: prioritize logo count > ACV in Year 1.
5. **Currency exposure** (BSP cost in USD, revenue in MYR). Mitigation: pass overages in MYR with a buffer; review tiers quarterly.

## What we measure (north-star + leading indicators)

- **North star:** active client-visible projects per firm per month.
- **Leading:** time to first client notification sent (target < 24h from signup).
- **Retention:** weekly active PM users per firm.
- **Expansion:** seats added per firm per quarter; messaging volume growth.
- **Word of mouth:** referrals per active firm per quarter.

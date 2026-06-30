---
title: "Pricing Model"
status: draft
updated: 2026-06-27
---

# Pricing Model

> **MVP scope (D-030):** MVP launches with a **single tier** — all paying firms are on the same plan, with logo + primary colour only. **No custom domain, no white-label, no advanced theming, no per-tier branding differentiation** in MVP. The Trial → Standard → Business split below is the post-MVP plan once we have ≥ 10 paying firms and a real signal on which Business features matter.

## Principles

1. **Per-seat, simple.** Firms pay per internal user. Clients are *unlimited and free* on every plan — they're the wedge, not a revenue line.
2. **Price the value, meter the cost.** Subscription covers workflow value. WhatsApp/SMS is metered above an included allowance so margins stay healthy.
3. **Local currency, local channel.** MYR pricing for MY; manual collection (FPX bank transfer or card via invoice link) at MVP — no Stripe integration yet (D-019).
4. **One free way in.** 30-day full-feature trial. Read-only after expiry, data preserved 90 days.
5. **Three plans only.** Trial → Standard → Business. No feature-matrix paralysis.
6. **Annual discount** (~20%, ~2.5 months free) to lock in retention and reduce monthly invoicing overhead while billing is manual.

## Tier structure (Malaysia launch)

| Plan | Price (MYR / seat / mo) | Annual price (MYR / seat / mo) | Included WhatsApp conv. (per seat / mo) | Branding | Other |
|---|---|---|---|---|---|
| **Trial** | Free, 30 days | — | 30 (one-time pool) | Siapp branding visible | 1 user, up to 3 projects, no credit card |
| **Standard** | RM 99 | **RM 79** (~20% off) | 50 | Custom logo + brand colour | Unlimited projects, unlimited clients, English UI at v1 (BM in v1.5), email support |
| **Business** | RM 179 | **RM 149** (~17% off) | 100 | **Full white-label** (custom domain, no Siapp branding) | Full theming, API access, priority support, custom exports |

**Minimum:** 2 seats on paid plans. Annual billed up-front (single invoice).

### Overage pricing (WhatsApp)

- **Standard:** RM 0.60 per WhatsApp conversation above pooled allowance
- **Business:** RM 0.45 per WhatsApp conversation (better rate rewards heavier users for upgrading)
- In-app forecast banner at 70% usage; auto-email at 90%
- Margin design: blended COGS on messaging stays ≤ 35% of overage revenue

### Unit economics (validated)

| Scenario | Revenue / mo | COGS / mo | Gross margin |
|---|---|---|---|
| 5-seat firm, Standard annual, 50 conv/seat | RM 395 | RM 113 | **71%** ✓ |
| 10-seat firm, Business annual, 100 conv/seat | RM 1,490 | RM 487 | **67%** ✓ |

See [cogs-model.md](./cogs-model.md) for the full bottom-up cost breakdown.

### What's in every paid plan (no upsell wall)

- Unlimited clients
- Unlimited projects
- All core PM features (tasks, dates, notes, documents, dashboards)
- Client portal
- WhatsApp + SMS notifications
- Audit log
- PDPA-aligned data handling
- English UI at v1; BM UI in v1.5 (D-026)

### Standard vs Business differences

| Feature | Standard | Business |
|---|---|---|
| Custom logo + brand colour | ✓ | ✓ |
| Full theming (fonts, layouts, custom CSS) | — | ✓ |
| White-label client portal (no Siapp branding) | — | ✓ |
| Custom domain (portal.firmname.com) | — | ✓ |
| API access | — | ✓ |
| Custom data exports (PDF/CSV reports) | — | ✓ |
| Support response time | 48h email | Next business day |
| Included WhatsApp/seat | 50 | 100 |
| Overage rate | RM 0.60/conv | RM 0.45/conv |

### Future tiers (NOT in MVP)

- **Scale / Enterprise** — custom WhatsApp sender (firm's number), SSO/SAML, SLA, data residency. Added when first prospect with > 20 seats appears.

## Billing process (MVP — manual)

Decision: [D-019](./decisions-log.md) — manual billing until ≥ 20 paying customers OR billing admin time > 4 hrs/week.

**Workflow:**
1. Customer signs up via trial (self-serve, automated)
2. At day 25, automated reminder email: "Trial ends in 5 days — reply to subscribe"
3. Customer replies → founder sends invoice (Wave / Maybank2u invoice / Xero starter)
4. Customer pays via FPX bank transfer OR credit card link
5. On payment confirmation, founder upgrades workspace via admin panel (`/admin/workspaces/:id/plan`)
6. Annual renewal: 30 days before expiry, send invoice; on payment, extend

**Required tooling (admin panel — must build):**
- Workspace list with plan, seats, expiry date, MRR
- One-click plan change (Trial → Standard → Business)
- One-click seat count adjustment
- One-click extend renewal date
- Audit log of all admin actions

**Migration trigger to Stripe:**
- ≥ 20 paying customers, OR
- Manual billing > 4 hours/week, OR
- First customer requests auto-renewal

When triggered, integrate Stripe + FPX gateway (Curlec/iPay88). Existing customers stay on manual until natural renewal.

## Add-ons (future, not MVP)

- **Vertical template pack** (e.g. "Conveyancing — MY Complete"): RM 99 one-time
- **Onboarding & template customization service**: RM 1,500–5,000 one-time
- **Premium integrations** (SQL Account, AutoCount, DocuSign): RM 49–99/mo per integration on Business
- **Additional storage**: RM 25 / 50 GB / mo

## Discounts

- **Annual:** ~20% (built into headline price above)
- **Design partners** (first 10 firms): 50% off Business for 12 months in exchange for case study + monthly feedback call
- **Association partners** (MBAM, REHDA, PAM, Bar Council members): 20% off first year
- **MDEC / SME grant**: list as approved vendor so customers can subsidize
- **Non-profits / education**: 50% off (small revenue, good brand)

Manual billing makes discounts trivial to apply — just adjust the invoice. Document each in the admin panel so we don't lose track.

## Pricing alternatives considered (and why rejected for v1)

| Alternative | Why rejected |
|---|---|
| **Per-project metered** | Penalizes the right behavior (more projects in the system); spiky, unpredictable invoices. |
| **Per-client portal seat** | Destroys the wedge — the client portal is our distribution loop. Always free. |
| **Pure usage (WhatsApp only)** | Margin too thin; no recurring SaaS retention story. |
| **Freemium forever-free tier** | Free-forever tiers convert poorly without urgency. 30-day full trial is sharper. |
| **Stripe self-serve at MVP** | Adds 2–3 weeks of build + ongoing webhook complexity for < 20 customers. Manual is faster (D-019). |

## Revenue mix expectation per customer (mid-tier, mature)

- Subscription: ~85% of revenue
- Messaging overages: ~15%
- Add-ons: 0% at MVP; grows post-MVP

## Pricing experiments to run in Year 1

1. **Trial conversion** — measure % of trial workspaces that convert; target 15–20%.
2. **Annual vs monthly** — ratio of annual signups (annual is cheaper for us to operate).
3. **Standard → Business upgrade rate** — do firms upgrade for white-label, or stay on Standard?
4. **Overage rate sensitivity** — RM 0.60 vs RM 0.45 on Standard, does it materially affect churn?

## Communication of pricing

- One pricing page, three columns: Trial / Standard / Business.
- Show **client portal is free, always**.
- Show **annual saves ~20%** — default toggle to annual.
- Show realistic message example ("A 5-PM firm with 12 active projects typically uses ~250 WhatsApp conversations/month — within Standard's 250-conv pooled allowance").
- ROI line: "Replace 3–5 hours / week of spreadsheet maintenance + WhatsApp typing." At MY PM hourly rates, payback in week 1 of any month.

## When to raise prices

- After ≥ 100 paying customers with NRR > 100%.
- After shipping at least one major capability customers asked for and got.
- Grandfather existing customers for 12 months; raise on new logos first.


---
title: "Operating Cadence & KPIs"
status: draft
updated: 2026-06-27
---

# Operating Cadence & KPIs

How the company actually runs week to week. Lightweight at v1, formalize as headcount grows.

## Cadence

| Rhythm | Cadence | Owner | Purpose |
|---|---|---|---|
| **Daily standup** (async in Slack) | Daily | All | Yesterday/today/blockers — written, 3 lines max |
| **Weekly sync** (live, 45 min) | Weekly Mon | Founder | Metrics review, priorities for the week |
| **Weekly customer hour** | Weekly Wed | All | Listen to/read 3+ customer interactions together |
| **Bi-weekly sprint demo** | Fortnightly Fri | CTO | Whatever shipped, demoed live |
| **Monthly business review** | Monthly | Founder | Finance, KPIs, cohort retention, qualitative |
| **Quarterly planning** | Quarterly | Founders | Set the next quarter theme + 3–5 OKRs |
| **Quarterly retro** | Quarterly | All | What worked / didn't / will change |
| **Quarterly customer cohort review** | Quarterly | CS lead | Deep-dive on customer health |
| **Annual strategy week** | Annual | Founders + advisors | Reset vision/strategy/roadmap |

## OKR template (quarterly)

```markdown
## Q3 2026 — Theme: "Make signup → first WhatsApp self-serve"

### Objective 1: New firms reach value in their first sitting
- KR1: ≥ 60% of new signups send a WhatsApp within their first session
- KR2: Median time-to-first-WhatsApp < 30 minutes
- KR3: Median onboarding tickets per new signup < 0.5

### Objective 2: Retention proves the wedge
- KR1: Logo retention ≥ 92% trailing 90 days
- KR2: NRR ≥ 105% on the M+3 cohort
- KR3: ≥ 5 customer-recorded testimonials shipped
```

Rules:
- **Max 3 objectives, ≤ 4 KRs each.**
- KRs are outcomes, not activities.
- Track weekly; declare scores at quarter end (0.0–1.0); 0.6–0.8 is healthy.

## KPI dashboard

### North-star metric
- **Active client-visible projects per firm per month** — captures activation + retention + wedge usage in one number.

### Acquisition
- Signups / week
- Signup → trial activation rate
- Trial → paid conversion rate
- CAC (blended; per channel)
- CAC payback (months)

### Activation
- Time to first project created
- Time to first WhatsApp sent
- % of new firms reaching "Aha" (first message delivered + opened) within 24h

### Engagement
- Weekly active firms (≥ 1 PM updating ≥ 1 task)
- Daily active PMs per firm (depth of usage)
- WhatsApp messages sent / firm / week
- Client portal views / project / week

### Retention
- Logo churn (monthly)
- Net revenue retention (M+3, M+6, M+12 cohorts)
- Gross revenue retention

### Financial
- MRR (and split: subscription / messaging / add-ons)
- ARPA
- Gross margin (with BSP cost trended monthly)
- Runway months
- Burn multiple (net new ARR / burn)

### Reliability & quality
- Uptime (target 99.9% on Business+)
- P1 incidents / month
- Message delivery success rate
- Support response & resolution times (target p50 < 1 business day)
- WhatsApp sender quality rating per workspace

### Team / culture
- Voluntary attrition (annualized)
- Internal NPS (quarterly)
- Hire-to-impact days (engineering)

## Decisions log

Every decision that costs > 1 day to reverse goes here:

```markdown
- **2026-07-15** — Chose 360dialog as v1 BSP. Owners: founder + CTO.
  Why: lowest per-conversation cost in MY tier, EU GDPR posture useful for SG.
  Reversal cost: 2 weeks engineering + template re-approval cycle.
  Reviewed by: 2026-12-15 (volume + sender quality).
```

Stored at [/plans/decisions-log.md](./decisions-log.md) (start when first real decision lands).

## Roadmap process

- Roadmap lives at [12-product-roadmap.md](./12-product-roadmap.md), reviewed monthly, rewritten quarterly.
- New customer asks → tagged + counted; if ≥ 3 paying customers want the same thing, it enters consideration. We do not roadmap requests from prospects or free-tier users.
- "Not now" is a valid, respected answer. "Maybe" is forbidden.

## Customer voice loops

- Every founder + CS + engineer joins **≥ 1 customer call per week** (rotation).
- Customer call notes go into a shared sheet, tagged by theme.
- **Monthly themes review**: top 5 themes → action (ship, doc, no-op) explicitly assigned.
- **Quarterly customer advisory board**: 5–8 paying customers, 60-min Zoom, candid product chat.

## Status updates

- **Public changelog** in product (English at v1; BM added with the v1.5 BM UI launch per D-026), one entry per release.
- **Public status page** for incidents and scheduled maintenance.
- **Customer-facing monthly email** ("This month at Siapp"): one product highlight, one customer story, one ask (e.g. beta volunteers).
- **Internal weekly update letter** (founder → team): MRR, customer story, single most important thing for next week.

## Tools (small + sharp)

| Tool | Purpose | Alternative |
|---|---|---|
| Linear | Issues, sprints | Jira (avoid until forced) |
| GitHub | Source, CI, code review | — |
| Notion | Docs, customer notes | Coda |
| Slack | Internal comms | Discord |
| Loom | Async demos | Vimeo Record |
| Figma | Design | — |
| Pylon / Front | Customer support inbox (English at v1; BM agents added with v1.5) | Help Scout |
| Posthog / Mixpanel | Product analytics | Amplitude |
| Stripe + Maxwell / Curlec | Billing (with FPX) | iPay88 |
| BetterStack / Axiom | Logs + status page | Datadog |
| Sentry | Errors | Bugsnag |

## Onboarding for the operating cadence

Every new hire reads:
1. [mission-vision-values](./08-mission-vision-values.md)
2. [target-market](./03-target-market.md)
3. [mvp-scope](./11-mvp-scope.md)
4. This file
5. The decisions log
6. The latest monthly business review

…and they joined a customer call in their first week.

## What we measure to keep the cadence honest

- Are weekly metrics actually being read? (Slack reactions, comments, follow-ups)
- Are quarterly OKRs being scored? (Not just set.)
- Are decisions making it into the log? (If not, we're flying blind retrospectively.)
- Is the customer voice loop being maintained, or has someone gone three weeks without a customer call?

Treat operating discipline as a product feature with its own debt and its own bugs.

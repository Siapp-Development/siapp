---
title: "Customer Discovery Plan"
status: draft
updated: 2026-06-16
---

# Customer Discovery Plan

**The most important work between today and writing code.** We have two warm design partners — that is *signal*, not validation. Before building, we test whether the wedge generalizes and whether our pricing assumptions survive contact with strangers.

## Hypotheses to test (ranked by risk-to-business)

| # | Hypothesis | Risk if wrong | Test |
|---|---|---|---|
| H1 | SEA SME firms (construction + legal) will pay RM 199–499/mo for a project tracker with WhatsApp client notifications | Whole business model | 15 interviews per vertical, 5 LOI / paid pilots |
| H2 | The **client-facing portal** is the deciding feature, not just nice-to-have | Wrong wedge | Demo two mockups (with vs without portal); measure preference + WTP delta |
| H3 | Firms will trust a startup with their client data + WhatsApp sender | Slow adoption | Interview question + security/PDPA Q&A pack readiness |
| H4 | Siapp-Admin starter project + Duplicate (D-031) accelerate first-project setup to < 1 hour | Activation flatlines (PMs build from blank instead) | Time-to-first-project on 5 design pilots |
| H5 | WhatsApp BSP unit economics work at our target price | Margin collapse | Quotes from 3 BSPs (Twilio, 360dialog, Wati) + volume model |
| H6 | The two-vertical launch doesn't dilute focus | Slow execution | Stage-gate: if legal interviews drag, defer legal to v1.5 |
| H7 | "Per-project" pricing model isn't preferred over per-seat in construction | Pricing rejection | Direct A/B in pricing conversation |
| H8 | Firms will refer other firms once delighted (PLG loop is real) | GTM slows after Month 9 | Ask design partners to make 1 intro each at Month 3 |

## Customer interview script (60 min)

Use the **Mom Test** principles: ask about their past behavior, not their future intentions.

### Setup (5 min)
- Thank them. Explain you're researching how their firm runs projects. No pitch yet.

### Discovery (35 min) — past behavior, not opinions
1. Walk me through the last project you ran. Who's involved? How long did it take?
2. Show me the tools you use to track it. Open them now if possible.
3. What did you do *last week* to update the client? How long did that take?
4. When was the last time a client called asking for an update they should already have had?
5. What did you try before this current setup? Why did you stop?
6. How much would you say you (or your PMs) spend per week on admin and updates?
7. Have you ever paid for software to help with this? What and why did you stop?

### Solution probe (15 min) — only after discovery
- Show 3 screenshots (project list, client portal, WhatsApp template message preview). Watch their reaction.
- "If something like this existed, what would have to be true for you to switch?"
- "What's missing here that would be a deal-breaker?"

### Pricing test (5 min)
- "If this saved you N hours a week and stopped K client escalations a month, what would it be worth to you per month?"
- Anchor: "Comparable tools cost RM 200–500/month. What feels right for you?"
- Note WTP, who's the decision-maker, and how fast they buy.

### Commitment ladder (test seriousness)
- Will they intro you to another firm? (Easiest commitment.)
- Will they let you watch a real Friday-update session?
- Will they sign an LOI / pilot agreement?
- Will they pre-pay for early access (RM 99 deposit)?

## Target sample (Phase 0)

| Segment | # of interviews | Mix |
|---|---|---|
| MY construction (design-build, 5–50 ppl) | 15 | Owners (10), PMs (5) |
| MY law firm (SME, 5–30 ppl) | 15 | Partners (10), practice managers (5) |
| Adjacent verticals (ID, accounting, migration) | 5 | Owners only — sanity-check generalizability |
| Lost-deal alumni (failed past PM rollouts) | 5 | Why did it die? |
| **Total** | **40** | |

Sourcing: warm intros from design partners, MBAM/REHDA/Bar Council member lists, LinkedIn, founder network.

## Concrete experiments (run in parallel with interviews)

| Experiment | What | Decision it informs |
|---|---|---|
| **Smoke-test landing page** | One page in BM+EN, 3 taglines, email capture | Headline, tagline, sign-up appetite |
| **Paper prototype demo** | Figma mockup of firm UI + client portal + WhatsApp template, click-through | Wedge feature ranking |
| **WhatsApp BSP cost model** | Quotes from Twilio, 360dialog, Wati; build a per-conversation cost ladder | Pricing tier overages |
| **Pricing card test** | Show 3 priced tiers to 20 prospects, observe choice + objections | Tier shape, anchor pricing |
| **Concierge MVP for design partners** | Run a "fake" version using Notion + manual WhatsApp sends for 4 weeks | What workflows actually fire daily? |
| **Vertical starter-project sprint** | Co-write 5 starter-project seeds with design partners (D-031); ship as internal provisioning scripts, not customer-facing templates | Starter-project structure validated; signals for whether a customer-facing template engine is worth building |

## Output artifacts (end of Phase 0, before any code)

- Customer interview corpus (notes + clips, anonymized)
- Validated/invalidated table of H1–H8 with evidence
- Top 10 quotes (for landing page + pitch deck)
- Revised ICP definitions (tighten or broaden Year 1 focus)
- Pricing recommendations (final tiers, overage levels)
- **Go / no-go memo** for build phase — explicit. Includes which features are in v1, which are deferred, and what we'd need to see to reverse course later.

## Anti-patterns (things we will catch ourselves doing)

- Asking "would you use this?" instead of "what did you do last time?"
- Pitching in the first 30 minutes.
- Counting "great idea!" feedback as validation.
- Interviewing only warm intros (selection bias). Mix in cold outreach.
- Skipping the commitment ladder because it's awkward.
- Building v1 to satisfy *one* angry partner who isn't representative.

## Stage gate before code

Proceed to build only if:

- ≥ 25 of 40 interviews complete
- H1 validated: ≥ 8 firms verbally commit to paying within stated tier
- H2 validated: client portal ranked top-3 feature unprompted by ≥ 60%
- H5 validated: gross margin model ≥ 65% at target ARPA
- ≥ 3 signed pilot LOIs

Otherwise: iterate on positioning, pricing, or wedge before writing code.

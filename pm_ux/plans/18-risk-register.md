---
title: "Risk Register"
status: draft
updated: 2026-06-27
---

# Risk Register

A single place to track what could kill or wound the company, how likely it is, and what we're doing about it. Reviewed monthly.

## Scoring

- **Likelihood:** Low / Med / High (over the next 12 months)
- **Impact:** Low / Med / High / Critical
- **Score:** Critical > High > Med > Low (use judgment, not multiplication)

## Top risks

### R1 — WhatsApp BSP pricing or policy change disrupts margin

- **Likelihood:** Med · **Impact:** Critical
- **Why:** Meta unilaterally adjusts conversation pricing or category rules; our margins compress overnight.
- **Mitigations:**
  - Multi-channel from day 1 (SMS + email always available).
  - BSP abstraction layer so we can swap providers.
  - Quarterly margin review with explicit BSP-cost line.
  - Diversify BSP relationships by Phase 2 (primary + standby contract).
  - Overage pricing structured to absorb 30% cost swings without re-papering customers.
- **Trigger to escalate:** BSP cost per conversation rises > 15% in a quarter, OR gross margin drops below 60%.

### R2 — Founders run out of personal runway

- **Likelihood:** Med · **Impact:** Critical
- **Why:** Bootstrap stance + deferred salaries means burning founders out or forcing a bad raise.
- **Mitigations:**
  - Explicit personal-runway tracking per founder (in a private doc).
  - Realistic Phase-1 burn model that *includes* founder salary scenarios.
  - Grant applications in flight from Month 1.
  - Pre-approved investor list with a "raise quickly if needed" plan.
- **Trigger:** Either founder hits 6 months of personal runway.

### R3 — v1 ships, but firms don't activate (no WhatsApp sent in week 1)

- **Likelihood:** Med · **Impact:** High
- **Why:** Activation friction kills SMB SaaS.
- **Mitigations:**
  - Time-to-first-WhatsApp instrumented from day 1.
  - CS hire by Month 5–6.
  - Concierge onboarding for first 30 firms.
  - In-app activation checklist + Loom walkthroughs in English at v1; BM walkthroughs follow the v1.5 BM UI release (D-026).
- **Trigger:** Median time-to-first-WhatsApp > 24h after first 10 signups.

### R4 — Customers churn after 3–6 months ("we already adopted spreadsheets again")

- **Likelihood:** Med · **Impact:** High
- **Why:** Habit reversion is the SMB SaaS killer. Without weekly value, firms drift.
- **Mitigations:**
  - Templates create switching cost (their playbook lives in Siapp).
  - WhatsApp threads referenced from Siapp become institutional memory they can't get back to Sheets.
  - CS proactively checks in at day 30, 60, 90.
  - Build a "weekly digest" email to firm owners so they see ROI without logging in.
- **Trigger:** Logo churn > 4%/month after Month 6.

### R5 — Concentration risk in design partners or first customers

- **Likelihood:** High · **Impact:** Med (early), High (if it persists)
- **Why:** First handful of customers are often friends of friends; one loss is a big % of MRR.
- **Mitigations:**
  - Prioritize logo count > ACV in Phase 1.
  - Avoid customer-specific feature work that doesn't generalize.
  - Cap design-partner discounts at 50% to encourage realistic willingness-to-pay validation.

### R6 — A horizontal player (Asana/Monday) adds native WhatsApp + portal

- **Likelihood:** Low–Med · **Impact:** High
- **Why:** Removes our single biggest channel + feature advantage.
- **Mitigations:**
  - Lean hard on vertical templates (they will not build these).
  - Local-language UI + MY pricing (they won't match).
  - Land association partnerships before any horizontal arrives.
  - Brand the wedge in customers' minds with case studies that are about *outcomes*, not features.

### R7 — A construction-vertical incumbent (Buildertrend) enters MY at lower pricing

- **Likelihood:** Low–Med · **Impact:** High
- **Why:** Removes our positioning against expensive enterprise tools.
- **Mitigations:**
  - Be local-first in ways foreign vendors take 2 years to match: BM UI, MYR + FPX/GrabPay, MY industry templates, MY support hours.
  - Build an SG/ID beachhead so we have regional revenue defending MY.
  - Lock association partnerships exclusively where possible.

### R8 — Data breach or PDPA violation

- **Likelihood:** Low–Med · **Impact:** Critical
- **Why:** Customer trust collapses; regulatory + reputational damage.
- **Mitigations:**
  - Security baseline in [tech architecture](./13-tech-architecture.md) executed before launch.
  - Annual pen test starting Phase 2.
  - Sub-processor DPAs in place.
  - 72-hour breach notification runbook + tabletop exercises.
  - Cyber-liability insurance bound by Phase 1 launch.

### R9 — WhatsApp sender quality drops (we get throttled/blocked)

- **Likelihood:** Med · **Impact:** High
- **Why:** A noisy customer or bad opt-in flow flags Meta; sender gets downgraded; deliverability tanks for all customers on that sender.
- **Mitigations:**
  - Strict opt-in capture flow with audit trail.
  - Per-workspace sender quality monitoring + auto-throttling.
  - Acceptable Use Policy with kill-switch for abusive senders.
  - Multiple senders so a single drop is contained.
  - Move enterprise to their **own** sender (Scale tier) so they isolate quality risk.

### R10 — Founder split / co-founder conflict

- **Likelihood:** Med (over 5 years) · **Impact:** Critical
- **Why:** Statistically the #1 cause of startup failure.
- **Mitigations:**
  - Founders' agreement + vesting from day 1.
  - Clear role-owner decision authority.
  - Quarterly founder retro with structured prompts.
  - External coach or peer-founder circle by Phase 1.

### R11 — Hiring the wrong founding engineer

- **Likelihood:** Med · **Impact:** High
- **Why:** First engineer sets engineering culture, codebase quality, and pace.
- **Mitigations:**
  - Paid trial week or paid project before offer.
  - At least 5 reference calls (peers, manager, direct report if any).
  - Founders both involved in every interview loop.
  - 30-day mutual yes-go convention.

### R12 — Trying to serve too many verticals too early

- **Likelihood:** High · **Impact:** High
- **Why:** Two-vertical launch already stretches a small team. Tempting to bolt on architecture, design, accounting "while we're at it."
- **Mitigations:**
  - Explicit "anti-roadmap" of verticals NOT to pursue in Year 1.
  - New vertical requires (a) warm design partner, (b) ≤ 2 weeks template effort, (c) demonstrable pricing pull.

### R13 — Currency mismatch (USD costs, MYR revenue)

- **Likelihood:** Med · **Impact:** Med
- **Why:** BSP, Stripe, hosting often in USD. MYR weakens → margin shrinks.
- **Mitigations:**
  - Quarterly margin review with FX line.
  - Build a small USD reserve once cashflow allows.
  - Annual contract pricing for customers, monthly cost mostly USD — natural buffer.
  - Reprice tiers annually with FX rebase.

### R14 — A competitor acquires our design partner relationship

- **Likelihood:** Low · **Impact:** Med
- **Why:** Possible if a foreign vendor buys local distribution.
- **Mitigations:**
  - Make design partners successful enough that they're advocates, not just customers.
  - Have ≥ 3 design partners by Phase 1 end so no single loss is fatal.

### R15 — Macroeconomic downturn cuts SME software budgets

- **Likelihood:** Med · **Impact:** Med
- **Why:** SMEs cut software first in recessions.
- **Mitigations:**
  - Position as time-saving + reputation-protecting (not productivity-extra).
  - Maintain a free tier so firms downgrade rather than churn.
  - Diversify across verticals (legal less cyclical than construction).

## Lower-tier watchlist (track, don't act yet)

- LINE adoption in Thailand market (channel choice for TH expansion).
- AI tools enabling competitors to clone Siapp quickly.
- Regulatory shift in MY toward mandatory data localization.
- Burnout of an early customer's PM (champion loss).
- Open-source PM tools (Plane, Vikunja) maturing with WhatsApp plugins.

## Review process

- Owner: CEO (founder A).
- **Monthly:** quick scan of all rows; update likelihood/impact for any that moved.
- **Quarterly:** deep review with founders + advisors; archive or upgrade items.
- **Trigger-based:** when a trigger fires, escalate to weekly until resolved.

---
title: "Go-to-Market Strategy"
status: draft
updated: 2026-06-27
---

# Go-to-Market Strategy

## Positioning statement

> **For** SEA professional-services firms (construction & legal first)
> **who** lose hours to spreadsheets and lose trust to opaque client updates,
> **Siapp is** a client-facing project management platform
> **that** lets firms run projects from templates and keep clients informed automatically over WhatsApp —
> **unlike** Asana/Monday (no client portal, no WhatsApp), Procore/Clio (enterprise pricing, US-centric), or sheets-and-WhatsApp-groups (manual, untrackable),
> **Siapp** combines vertical templates + a beautiful client tracker + WhatsApp-native notifications, priced for SEA firms.

## GTM thesis

1. **Wedge with a single workflow per vertical**, not a platform pitch.
   - Construction: "Keep your homeowner clients updated automatically. Stop the Saturday spreadsheet."
   - Legal: "Your clients know exactly where their matter stands — without a phone call."

2. **Two anchor design partners (already warm)** validate templates, pricing, and messaging, then become public case studies and referral engines.

3. **Compound through the PLG client loop**: every client who sees a Siapp page is a marketing surface. Optimize for it.

4. **Earn the right to expand** verticals only after first vertical hits 50+ paying logos with healthy retention.

## Phased plan

### Phase 0 — Design partner sprint (Months 0–3)

**Goal:** v1 in production with 2 paying firms (construction + legal); WhatsApp notifications live.

- Ship: project + tasks + docs + notes + client portal + WhatsApp templated notifications + 2 Siapp-Admin-provisioned starter projects (residential build + conveyancing, MY).
- Deploy with both design partners in parallel; founder-led implementation.
- Weekly feedback sessions; aggressive scope discipline.
- Encode each partner's playbook **as a Siapp-Admin starter-project seed** (D-031). No customer-facing template authoring tool in this phase — their playbook becomes a hardcoded provisioning seed we ship with the product.
- Outputs: 2 case studies, 2 testimonials, baseline metrics (time saved, client satisfaction).

### Phase 1 — Local launch in Malaysia (Months 3–9)

**Goal:** 30–50 paying firms; NRR > 100% on cohort; founder-led + warm referral motion.

- **Channels:**
  - Direct outbound (LinkedIn, WhatsApp intros) to MBAM/REHDA/Bar Council member lists.
  - "Customer roundtables" — small invite-only sessions hosted with design partners.
  - Content: 2 long-form articles + 1 case study per month, distributed in WhatsApp groups + LinkedIn.
  - Speaking slots at MBAM/REHDA chapter meets, Bar Council CPD sessions.
- **Product:**
  - Self-serve trial flow (14-day Business tier).
  - English UI at v1 (BM UI ships in v1.5, ahead of Phase 2 — D-026).
  - FPX + GrabPay + card checkout.
  - Add 3 more starter-project seeds (conveyancing, residential renovation, commercial fit-out).
- **Pricing:** launch the three-tier MYR pricing; design partners locked in at 50% off.
- **Hire (lean):** 1 founding engineer, 1 customer success / onboarding (BM preferred, not required at v1), 1 part-time content marketer.

### Phase 2 — Repeatable motion in MY (Months 9–18)

**Goal:** 150–250 paying firms; first scaled channel proven; CAC payback < 6 months.

- **Channels (layered):**
  - Partner program with MY accounting firms, construction consultancies, legal IT consultants — rev share on referrals.
  - Listing on **MDEC / SME Corp** approved-vendor catalogs; co-marketing with grant programs.
  - SEO push on long-tail intent ("project management for contractors Malaysia", "law firm matter tracking BM").
  - Light paid acquisition once organic CAC + payback are baseline.
- **Product:**
  - Template marketplace (paid + free packs) — gated on D-031 revisit signals (customer demand for authoring tooling).
  - First major integration: **SQL Account** or **AutoCount** (MY market standard).
  - White-label client portal on Business+.
  - Mobile-first improvements based on field engineer feedback.
- **Hire:** 2 more engineers, 1 sales (founder transitions to manager), 1 partnerships lead.

### Phase 3 — Regional expansion (Months 18–36)

**Goal:** Enter Singapore + Indonesia; 800–1,500 paying firms across SEA.

- **Singapore:** higher ARPA, English-only, fewer accounts but bigger logos. Play: ride MY case studies up-market.
- **Indonesia:** volume play; localize to Bahasa Indonesia; partner with local payment + BSP.
- **Verticals 3–5:** interior design, accounting, migration consultancies (in that order, based on warm intros + template re-use).
- **Product:** API tier, SSO, data residency options for enterprise tier, AI-assisted template authoring.
- **Channel:** in-region partners (local accountants, software resellers, association MOUs).

## Launch tactics (Phase 1, concrete)

### Pre-launch (Month 3)

- Build a public **template gallery page** — even before all templates exist — for SEO + credibility.
- Set up a **branded waitlist** with a one-page English value prop (BM version slipped to Phase 2 — D-026).
- Pre-record a 90-second demo (mobile + desktop). It will be sent on WhatsApp; design accordingly.
- Establish a Siapp presence in 5 active WhatsApp / FB / Telegram groups for MY contractors and lawyers (with consent / context — no spam).

### Launch week

- **Soft launch:** post to LinkedIn from founder accounts; case studies from both design partners go live the same day.
- Press: pitch to *The Edge Malaysia*, *Vulcan Post*, *Tech in Asia* — angle is "Malaysian construction company replaces spreadsheets with WhatsApp-native PM tool."
- Webinar with MBAM chapter ("How [Design Partner] cut admin time 60%").

### Post-launch (continuous)

- **Customer story per month**, distributed in: LinkedIn, association newsletters, in-app changelog (English at v1; BM added in Phase 2 per D-026).
- **Template release per month**: a new vertical or sub-vertical template pack with a launch post.
- **Office hours**: weekly 30-min open Zoom for prospects.
- **Referral incentive**: 1 month free per referred firm that converts (both sides).

## Sales playbook (founder-led, Phase 0–1)

| Step | What | Time |
|---|---|---|
| 1. Outreach | Warm intro or LinkedIn DM with a 30-sec value prop + the case study link | 5 min |
| 2. Discovery call | 30 min; map their current workflow + pain; identify 1 template fit | 30 min |
| 3. Tailored demo | 30 min; demo *their template* with *their project names* | 60 min prep + 30 min call |
| 4. Pilot setup | Founder spins up account, imports their first project from spreadsheet, sends first WhatsApp test | 1–2 hr |
| 5. 14-day trial | Customer success checks in day 3 + day 10; resolves blockers | Async |
| 6. Close | Annual or monthly contract; FPX/card payment | < 1 week |

Target: **3 demos → 1 paid** in Phase 1; improve to **2:1** by Phase 2 as case studies and BM templates strengthen.

## Marketing assets needed for launch

- English website at v1 (BM landing pages slip to Phase 2 alongside the BM UI release — D-026): home, pricing, two industry pages (construction, legal), 2+ case studies, template gallery, blog, signup.
- 90-second hero demo video.
- 5 short (15–30s) WhatsApp-ready clips showing "the client gets a message" moment.
- 1 PDF playbook per vertical ("Running a residential build with Siapp").
- LinkedIn content cadence: 2 posts/week from founders + 1/week from Siapp page.
- Sales deck (10 slides) for partner / association meetings.

## Risks & mitigations (GTM-specific)

| Risk | Likelihood | Mitigation |
|---|---|---|
| First case studies underwhelm | Med | Pick design partners who already have a pain story + executive sponsor + willingness to share metrics |
| WhatsApp approval slow (BSP onboarding for new senders) | Med | Start BSP onboarding before product is finished; have email/SMS fallback ready |
| Founders stretched thin doing sales + product | High | Hire first CS person in Phase 1 explicitly to absorb onboarding |
| Channel partners overpromise, underdeliver | Med | Pay rev share only on closed-won; manage with quarterly partner scorecards |
| Trying to "platform" too early | High | Quarterly review of feature backlog vs. ICP fit; cut anything serving < 20% of customers in Year 1 |

## Definition of "Phase 1 success" (Month 9)

- ≥ 30 paying firms across construction + legal
- ≥ 2 public case studies with quantified impact
- Logo retention ≥ 90% trailing 3 months
- NRR ≥ 100%
- ≥ 1 association partnership signed
- Founder spending < 30% of time on direct sales (sign of repeatability)

If we hit these, scale spend. If not, **don't accelerate** — diagnose ICP/pricing/messaging first.

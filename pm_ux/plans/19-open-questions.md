---

## title: "Open Questions & Pre-Build Decisions" status: draft updated: 2026-06-17

# Open Questions & Pre-Build Decisions

The honest list of what we still don't know. Each item has an owner, a way to answer it, and a deadline. Build does not start until items marked **🚫 BLOCKER** are resolved.

## Legend

- 🚫 BLOCKER — must answer before writing application code
- ⚠️ IMPORTANT — answer before public launch
- 💭 STRATEGIC — answer within Phase 1

## How to use the "Riza's answer" column

Fill in as you go. Use one of:

- **A direct answer** — short, decisive ("Sdn Bhd only", "Drizzle", "50/50").
- **A working hypothesis** — prefix with `H:` (e.g. `H: Magic-link only`) so it's clear it's not final.
- `TBD — <next action>` if you can't decide yet (e.g. `TBD — need BSP quotes`).
- `N/A` if the question no longer applies; add a one-line reason.

When an item is decided, also append the answer + date to [decisions-log.md](./decisions-log.md) (create on first decision).

## Market & customer

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | Does the wedge generalize beyond our two warm design partners? | 🚫 | 40 discovery interviews ([plan](./10-customer-discovery-plan.md)) | Founder A | Pre-build, Month 2 | *Yes* |
| Q2 | Is the client portal the deciding feature for buyers? | 🚫 | Discovery + mockup A/B (with vs without) | Founder A | Pre-build, Month 2 | *Both the client and internal portals are deciding feature. They both must be simple to use and access.* |
| Q3 | What is real WTP per tier in MYR? | 🚫 | Pricing card test with 20 prospects | Founder A | Pre-build, Month 2 | *Draft set (D-020): Standard RM 79/seat annual, Business RM 149/seat annual. Validate in discovery; adjust before public launch. Manual billing at MVP (D-019).* |
| Q4 | Is per-project pricing preferred over per-seat in construction? | 💭 | Direct ask in discovery; later A/B | Founder A | Phase 1 end | *Make the pricing plan simpler. I think per seat is better.* |
| Q5 | Will law firms buy a tracker without billing/trust accounting? | ⚠️ | Discovery + 2 paid legal pilots | Founder A | Month 6 | *TBD* |
| Q6 | What's the realistic referral rate from a delighted firm? | 💭 | Ask design partners + first 10 customers for 1 intro at Month 3 | Founder A | Month 9 | *TBD* |
| Q7 | Will adjacent verticals (ID, accounting) really map onto the same template engine? | 💭 | 5 cross-vertical discovery calls | Founder B | Phase 1 end | *TBD* |

## Product & scope

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q8 | Concierge MVP findings — which workflows actually fire daily? | 🚫 | 4-week concierge with both design partners | Founder B | Pre-build, Month 3 | *Internal progress track and client access* |
| Q9 | Is BM-only good enough, or do we need Mandarin from launch? | ⚠️ | Survey in discovery; data from design partners | Founder A | Month 6 | *both english and BM* |
| Q10 | Magic-link auth vs OTP for client portal? | ⚠️ | Usability test with 5 non-tech clients | Founder B | Month 4 | *TBD* |
| Q11 | How do firms expect document permissioning to work for clients? | ⚠️ | Discovery + 2 prototyped flows | Founder B | Month 4 | *Internal half answered via Departments (D-025, [plan](./20-access-control-departments.md)). Client-facing half still uses `visibleToClient` per-doc; validate UX in discovery.* |
| Q12 | Do we need offline support for site engineers in v1? | 💭 | Field shadowing with design partner | Founder B | Month 6 | *no offline support yet.* |
| Q13 | Email notifications: do firms want them at all (vs WhatsApp only)? | ⚠️ | Discovery question + activation data | Founder A | Month 6 | *We will focus on whatsapp/text only for phase 1* |
| Q14 | Will firms want to white-label Siapp out of the box (free tier)? | 💭 | Watch upsell to Business tier | Founder A | Month 9 | *not now but set up theming for the platform* |

## Technical

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q15 | Which BSP? (360dialog vs Wati vs Twilio) | 🚫 | Quotes + sandbox test + reference calls | CTO | Pre-build, Month 1 | *Twilio* |
| Q16 | Auth provider (WorkOS / Clerk / Supabase Auth)? | 🚫 | Spike + cost model | CTO | Pre-build, Month 1 | *Firebase Auth* |
| Q17 | Drizzle vs Prisma? | 🚫 | Tech lead call after first engineer joins | CTO | Pre-build, Month 1 | *Firestore* |
| Q18 | Postgres host (Neon vs Supabase vs RDS)? | 🚫 | Cost + region availability check | CTO | Pre-build, Month 1 | *Firebase* |
| Q19 | Region for primary DB (SG vs MY)? | 🚫 | PDPA review + latency test | Founder + counsel | Pre-build, Month 1 | *Singapore* |
| Q20 | Single-app vs split firm/client portal apps? | 🚫 | Architecture sketch | CTO | Pre-build, Month 1 | *Single app* |
| Q21 | Single repo (monorepo) vs multi-repo? | 🚫 | CTO decision | CTO | Pre-build, Month 1 | *Monorepo* |
| Q22 | What's the queue choice for messaging (Graphile vs BullMQ)? | ⚠️ | Spike when load model exists | CTO | Month 4 | *GCP Queue* |
| Q23 | Cookies vs Bearer tokens for client portal sessions? | ⚠️ | Security review | CTO | Month 4 | *Bearer tokens* |
| Q24 | How do we keep BSP costs visible to customers in real time? | ⚠️ | UX + metering design | CTO + design | Month 5 | *TBD* |

## Business & legal

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q25 | Entity structure — Sdn Bhd only, or SG holding too? | 🚫 | Counsel + tax advisor | Founders | Pre-build, Month 1 | *No structure yet* |
| Q26 | Founder vesting & equity split | 🚫 | Founders' agreement | Founders | Pre-build, Month 1 | *Just one founder* |
| Q27 | Is "Siapp" trademark-clear in MY? Domain stack (`siapp.app`, `.my`, `.io`) available? | ⚠️ | MyIPO search + WHOIS | Founder A | Pre-build, Month 1 | *Invented spelling — expected clean. Per D-024, file MyIPO Class 9 + 42; register `.app` + `.my` + `.io` at retail. `siapp.com` taken — not pursued (D-024).* |
| Q28 | SST registration threshold — when do we cross it? | ⚠️ | Accountant | Founder A | Month 6 | *TBD* |
| Q29 | Are we a data controller or processor for the client portal? | ⚠️ | Counsel | Counsel | Month 3 | *TBD* |
| Q30 | Pre-launch insurance — when is cyber liability mandatory? | ⚠️ | Broker | Founder A | Month 6 | *TBD* |
| Q31 | Standard MSA + DPA in BM (legally valid) vs EN-only? | ⚠️ | Counsel | Counsel | Month 4 | *TBD* |
| Q32 | Grants — which to apply for and when? | 💭 | Cradle + MDEC research | Founder A | Month 2 | *TBD* |

## Brand & GTM

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q33 | Does the name "Siapp" land with target buyers? | ⚠️ | Validate in discovery calls — does the *siap + app* construction read clearly to MY SMEs, and is pronunciation (*syap*) instant? | Founder A | Month 2 | *Brand chosen (D-024, supersedes D-018). Validate reception in discovery; not blocking build.* |
| Q34 | Which tagline converts best? | ⚠️ | A/B test on landing page | Founder A | Month 6 | *TBD* |
| Q35 | Which industry association deal is most valuable (MBAM vs REHDA vs Bar)? | 💭 | Initial calls | Founder A | Month 6 | *TBD* |
| Q36 | Is content marketing in BM viable as a channel? | 💭 | 3-month test post-launch | Founder A | Month 12 | *TBD* |
| Q37 | Will the PLG client loop convert at the rate we model? | 💭 | Instrument client portal CTA + measure | Founder A + CTO | Month 12 | *TBD* |

## Funding

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q38 | Bootstrap vs pre-seed at Phase 1 → 2? | 💭 | Decision triggers in [financial plan](./15-financial-plan.md) | Founders | Month 12 | *TBD* |
| Q39 | If raising pre-seed: which 5 funds match SEA vertical SaaS? | 💭 | Investor research | Founder A | Month 9 | *TBD* |
| Q40 | Should we hire a fractional CFO for grant + tax + funding work? | 💭 | When founder time on finance &gt; 1 day/week | Founder A | Month 9 | *TBD* |

## Operating

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q41 | How do we resolve disagreement between founders fast? | 🚫 | Operating agreement; documented in [team plan](./16-team-hiring-plan.md) | Founders | Pre-build, Month 1 | *N/A — solo founder (D-015). Disagreement resolution managed via advisory bench instead.* |
| Q42 | When does CS become a full-time hire vs part-time? | ⚠️ | When &gt; 30 customers OR onboarding queue &gt; 5 | Founder A | Month 6 | *TBD* |
| Q43 | Who is on-call for production? | ⚠️ | Whoever shipped + rotation; document by launch | CTO | Month 8 | *Solo founder until first engineer hired* |

## Data model & infra detail

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q44 | Firestore collection structure (workspace / project / task hierarchy, denormalization strategy)? | 🚫 | Draft data model doc; review against query patterns | Founder | Pre-build, Month 1 | *Closed (D-021). See [firestore-data-model.md](./firestore-data-model.md).* |
| Q45 | Advisory bench composition (legal, sales, ops, tech)? | 💭 | Identify 3–5 advisors; light retainer or equity | Founder | Month 3 | *TBD* |
| Q46 | Equity reserved for founding engineer? | 💭 | Standard SEA range 0.5–2% vested 4yr / 1yr cliff | Founder | When hiring | *TBD* |
| Q47 | When to incorporate Sdn Bhd (before/after first paid contract)? | ⚠️ | Counsel + accountant; required before invoicing | Founder | Before first paid contract | *TBD* |
| Q48 | Are clients always free (no per-client charge ever)? | 🚫 | Recommended: yes — clients are wedge | Founder | Pre-build, Month 1 | *Yes — confirmed via per-seat decision (D-009, D-020); clients always free* |
| Q49 | Transactional email provider for auth / reminders (Postmark vs SES vs Resend)? | ⚠️ | Firebase Auth covers password/magic-link; pick provider for app-triggered email | Founder | Month 2 | *TBD — likely Resend or Postmark* |
| Q50 | Search infra (Firestore composite indexes vs Algolia/Typesense)? | 💭 | v1: Firestore only. Reassess when free-text search is required | Founder | Phase 1 end | *Firestore composite indexes at MVP; Algolia/Typesense deferred* |

## Collaborator feature (3-actor model)

| \# | Question | Type | How we answer | Owner | Due | Riza's answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q51 | Should clients see collaborator updates live, or only after PM approval? | ⚠️ | Default OFF (live). Per-task toggle to require PM approval for high-stakes work. | Founder | Pre-launch, Month 4 | *Closed (D-028, superseded by D-032): the approval toggle is removed from MVP entirely — collaborator `Mark Done` always flows through to the client immediately, gated only by D-027 lifecycle and per-task `visibleToClient`.* |
| Q52 | What happens when collaborator's phone number changes mid-project? | ⚠️ | PM can resend magic link to new number; old links revoked | Founder | Pre-launch, Month 5 | *PM-controlled re-issue* |
| Q53 | Should magic-link task page work offline (PWA) for site engineers in bad signal? | 💭 | Defer to v1.5; MVP is online-only | Founder | Phase 1 end | *Online-only at MVP* |
| Q54 | Photo & document retention — keep forever, or expire 12 months after project close? | ⚠️ | Affects Storage COGS; align with PDPA stance | Founder + counsel | Month 6 | *TBD — likely 24mo post-close, then archive* |
| Q55 | Collaborator NLU vs keyword-only for WhatsApp replies? | 💭 | Keyword-only at MVP (DONE / ETA / HELP). NLU when keyword path proves limiting | Founder | Phase 1 end | *Keyword-only at MVP* |
| Q56 | Multiple collaborators on one task — can they see each other's updates? | 💭 | Default: no (isolation per assignee). PM-toggle to share | Founder | Pre-launch, Month 5 | *only one collaborator on one task, but PM or any internal seats can edit.* |
| Q57 | Virus scanning for collaborator uploads — ClamAV on Cloud Run, or third-party service? | ⚠️ | Spike both; ClamAV cheaper if traffic is low | Founder | Month 5 | *TBD* |

## Decision blockers summary (must close before sprint 1)

- ~~Q1, Q2, Q3, Q8~~ — wedge & pricing **(closed)**
- ~~Q15–Q23~~ — tech architecture **(closed, D-001 through D-007)**
- Q27 — trademark on "Siapp" (invented spelling, expected clean — downgraded from blocker)
- ~~Q44~~ — Firestore data model **(closed, D-021)**
- ~~Q26, Q41~~ — N/A (solo founder, D-015)

**No remaining hard blockers.** Q27 trademark filing runs in parallel with build.

## Review cadence

- Owner: CEO.
- Weekly: scan for items that became answerable; promote / close.
- Monthly: prune answered items into the decisions log.
- Quarterly: re-evaluate ⚠️/💭 items; demote priority if no longer relevant.
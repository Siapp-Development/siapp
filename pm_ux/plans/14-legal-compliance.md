---
title: "Legal & Compliance"
status: draft
updated: 2026-06-16
---

# Legal & Compliance

> Not legal advice. Inputs for the founders + an MY-qualified lawyer to convert into binding documents. **Do not skip:** WhatsApp policy, PDPA, entity, contracts, IP. Each is a real blocker to launch.

## Entity & corporate structure

| Item | Recommendation | Notes |
|---|---|---|
| Operating entity | **Sdn Bhd** in Malaysia | Most credible for B2B + grants; eligible for MDEC tax incentives |
| Holding entity (if fundraising) | Consider **Singapore Pte Ltd** as parent | Standard for SEA startup funding; revisit at seed round |
| Founder vesting | 4-year vesting, 1-year cliff, defined in shareholders' agreement | Even for two co-founders. Especially for two co-founders. |
| Cap table tool | Carta / Pulley / a clean spreadsheet | Start clean; messy cap tables kill rounds |
| Bank | Maybank / CIMB business + a fintech (Wise / Aspire) for FX | FX matters because BSP/Stripe bill in USD |
| Accounting | Outsourced bookkeeper from Month 1 | Cheaper than fixing it at audit |

## PDPA (Malaysia) — what we must do

The **Personal Data Protection Act 2010 (PDPA)** applies because we process personal data of MY residents commercially. Recent 2024 amendments raised obligations (mandatory DPO for certain processors, breach notification within 72 hours, etc.). Validate current state with counsel.

Minimum compliance posture before public launch:

- **Privacy notice** in BM + EN, accessible from every signup and the client portal.
- **Consent capture** at signup (firm side) and at portal first access (client side).
- **Lawful basis** documented per processing purpose (account, billing, messaging, analytics).
- **Data subject rights** flow: access, correction, deletion, withdrawal of consent — with an SLA (e.g. 21 days) and audit trail.
- **Cross-border transfer** rules: if hosting in SG (ap-southeast-1), document the transfer mechanism and the recipient's safeguards.
- **Data Protection Officer (DPO):** appoint one (initially a founder); register if required by class.
- **Records of processing activities (RoPA):** maintain a simple log.
- **Vendor due diligence:** every sub-processor (BSP, Stripe, hosting, email) needs a signed DPA and is listed in the privacy notice.
- **Breach response plan:** runbook + 72-hour notification template.

## WhatsApp Business Platform compliance

Failing WhatsApp policy is an **existential** risk. Read and re-read Meta's Business Messaging Policy and Commerce Policy.

- Use **only** Meta-approved message templates for business-initiated messages.
- Respect the **24-hour customer-care window**: free-form messages allowed only within 24h of a user-initiated message.
- **Opt-in capture is mandatory** — log timestamp, source, language, and exact opt-in language for every client. Surface this in the client record.
- **Opt-out**: every templated message must include an opt-out mechanism (e.g. "Reply STOP"); we must process it and respect it across all senders.
- **No prohibited content**: legal disclaimers on construction defects, court matters — review templates carefully.
- **Sender quality**: Meta downgrades senders that get blocked/reported. Monitor sender quality per workspace; throttle or alert at signs of drop.
- **Template categories**: utility vs. marketing classification matters for pricing — categorize carefully.

## Terms of Service & contracts

| Contract | Audience | Key terms |
|---|---|---|
| **Master Subscription Agreement (MSA)** | Firms (customers) | Subscription, tiers, usage overages, SLA, IP, indemnity, limitation of liability, governing law (MY), termination, data ownership (customer owns their data) |
| **Data Processing Addendum (DPA)** | Firms | We act as processor for client personal data; firm is controller; sub-processor list; breach notification; SCCs equivalent if cross-border |
| **Acceptable Use Policy** | Firms + clients | No spam, no illegal content, no prohibited verticals |
| **Client Portal Terms** | End clients | Limited use; firm is data controller; PDPA notice |
| **Privacy Policy** | Public | PDPA-compliant; BM + EN |
| **Cookies Policy** | Public | Track only necessary + analytics with consent |
| **DPA with each sub-processor** | Inbound | BSP, Stripe, hosting, email, error tracking |
| **NDA template** | Discovery + pilots | Mutual, short-form |
| **Pilot agreement** | Design partners | Free/discounted access + case-study consent + feedback obligation |
| **Employment & contractor agreements** | Team | IP assignment, confidentiality, non-solicit (no non-compete in MY enforceability nuance) |

## Intellectual property

- **Trademark "Siapp"** in MY (Class 9 + 42), then SG, ID as expansion approaches. (Invented spelling — distinctive mark, registrable.)
- **Domain protection**: `.com`, `.com.my`, `.co`, `.io`; defensive locales as warranted.
- **Copyright**: code, templates, brand assets — owned by entity (ensure all contractors sign IP assignment).
- **Open source**: maintain a license inventory; default policy is **MIT/Apache OK, AGPL/SSPL forbidden**, copyleft case-by-case.

## Industry-specific considerations

### Construction
- Be careful with templated language that could be construed as legal advice on construction contracts.
- Document storage: no requirement to be a CIDB-registered document repository, but understand customers may treat us as one.

### Legal
- We do **not** practice law. Client portal messaging is **not** legal advice; templates must avoid implying it.
- Be aware of solicitor-client privilege concerns when files cross our systems — DPA + encryption + role-restricted access are the answer.
- Trust accounting features in v2 will need legal counsel review per jurisdiction.

## Financial / regulatory

- **SST (Service Tax)**: 8% on digital services in MY — confirm threshold for registration; charge correctly from launch if applicable.
- **Withholding tax**: review for cross-border SaaS payments (esp. on USD payments to Stripe/BSP).
- **AML / KYC**: low risk at v1 (we're not a money mover), but if we ever add payments-on-behalf-of-firms, this becomes major.
- **PCI**: outsource entirely to Stripe; never touch card data ourselves.

## Insurance

| Policy | Why |
|---|---|
| Cyber liability | Breach response, data restoration, customer notification costs |
| Professional indemnity (E&O) | Errors causing customer financial loss (missed deadlines, wrong recipient on message) |
| Public liability | Standard for an operating entity |
| D&O (when fundraising) | Director protection |

Premiums grow with revenue; budget early; broker should be local.

## Pre-launch legal checklist

- [ ] Sdn Bhd registered, bank account open, accounting service engaged
- [ ] Founders' agreement + vesting executed
- [ ] Trademark "Siapp" filed in MY
- [ ] MSA, DPA, AUP, Privacy Policy, Cookies Policy drafted by counsel (BM + EN versions)
- [ ] Sub-processor list published in Privacy Policy
- [ ] PDPA RoPA started
- [ ] DPO appointed
- [ ] Breach response runbook written and tabletop-tested
- [ ] WhatsApp BSP onboarding complete; sender verified; first templates approved
- [ ] Opt-in flow audited (legal + UX)
- [ ] Acceptable Use Policy enforceable (we have a "kill switch" for abusive senders)
- [ ] Insurance policies bound
- [ ] Open-source license inventory in repo
- [ ] All contractors have signed IP assignment

## Watchlist (changes that could disrupt us)

- PDPA amendments (e.g. new sectoral codes, breach notification scope)
- Meta WhatsApp pricing & policy changes
- MY SST rule changes for digital services
- Cross-border data transfer regimes in ID, ID Personal Data Protection Law enforcement

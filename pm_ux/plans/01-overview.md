---
title: "Siapp — Product Overview"
status: draft
updated: 2026-06-27
---

# Siapp — Product Overview

## One-liner

**Siapp is a client-facing project management platform that lets professional-services firms (construction, legal, and beyond) scaffold projects from a vertical-specific starter (and duplicate from prior projects), track tasks, and keep clients automatically informed over WhatsApp / SMS — without the spreadsheet chaos.**

## The problem

Professional-services firms in Southeast Asia run projects out of shared spreadsheets. This produces three recurring failures:

1. **Maintenance overhead.** Updating the master sheet, copying status to client-specific sheets, chasing engineers/lawyers for updates — most project managers spend hours per week on coordination, not work.
2. **Opaque client experience.** Clients have no real-time view. They learn about delays late, escalate, lose trust. Existing tools (Asana, Monday, ClickUp) assume both sides are inside the tool — clients rarely are.
3. **Reactive communication.** Status updates happen via WhatsApp messages typed by hand, often inconsistently. There's no audit trail and no automation.

Two real, paying-demand signals motivate building this now:

- A **Malaysian construction company** managing build projects across many client sites manually in Sheets.
- A **Malaysian law firm** managing case-style matters with the same pain pattern.

Both want (a) less manual maintenance, (b) a client-visible progress tracker, and (c) automated WhatsApp/SMS notifications.

## What Siapp does

A **firm-facing workspace** plus a **lightweight client portal** plus **automated messaging**.

### Firm side (internal)

- In MVP, every new firm gets one **Siapp-Admin-provisioned starter project** for their vertical (e.g. "Residential build — 18 months", "Conveyancing — Malaysia"), pre-populated with phases, tasks, dependencies, and per-task visibility/department/WA toggles. Subsequent projects come from **Duplicate** (carries structure, clears content) or **Blank**. A customer-facing template library is deferred (D-031).
- Tasks have: assignee (internal user or external contractor/company), start/due dates, status, notes, document attachments, and a per-task notification toggle.
- Document upload per task; notes timeline; audit log of changes.
- Dashboards: project health, overdue tasks, upcoming milestones, workload per assignee.

### Client side (external)

- A **read-only, branded progress tracker** — magic-link or simple login, no app install required.
- See current phase, % complete, upcoming milestones, recently completed tasks, documents the firm chose to share.
- Comment/acknowledge on specific milestones (optional, configurable).
- English at launch; Bahasa Malaysia in v1.5; Chinese later (D-026).

### Notifications (the wedge)

- Per-task toggle. When a task hits a configured state (e.g. *completed*, *approaching due*, *blocked*), Siapp sends the client a templated **WhatsApp** message (primary channel in MY) or **SMS** fallback.
- Templates are firm-branded and editable; variables auto-fill from the task.
- Two-way: client replies surface back into the task's note thread.
- Delivery + read receipts logged for accountability.

## Why now

- **WhatsApp Business API** maturity makes programmatic, compliant messaging affordable. It's the de facto channel in Malaysia, Indonesia, Singapore, Thailand.
- Vertical PM tools (Procore for construction, Clio for legal) are **expensive, US-centric, and over-built** for the SME segment in SEA.
- Horizontal PM tools (Asana, Monday, ClickUp) **don't solve client-side visibility or messaging**.
- SEA SMB digitization spend is growing post-pandemic; government grants (e.g. MY MDEC Digital Grant) subsidize SaaS adoption.

## Design principles

1. **Scaffold first.** A new firm should be productive in < 1 hour by working from a Siapp-Admin-seeded starter project or duplicating a prior project, not by configuring fields from scratch.
2. **Client experience is a product surface, not an afterthought.** What the client sees is as carefully designed as what the PM sees.
3. **Messaging is in the loop, not bolted on.** Every status change is a potential notification; firms shape the rules, the platform handles delivery.
4. **Multi-industry from day one, but launch vertical.** Architecture supports multiple vertical scaffolds (provisioning seeds in MVP; full template engine post-D-031 revisit); GTM focuses on construction first, legal second.
5. **Mobile-first for both sides.** Site engineers update on a phone; clients receive on a phone.

## Out of scope (v1)

- Time tracking & billing (consider v2, especially for legal).
- Native mobile apps — PWA is enough for v1.
- Gantt-chart heavy resource planning (Procore territory).
- Accounting / ERP integrations.

## Success metric (north star)

**Active client-visible projects per firm per month.** It captures (a) firms onboarded, (b) firms actually using the client-facing layer (the differentiator), and (c) ongoing usage rather than one-time setup.

## Related plans

- [Competitive analysis](./02-competitive-analysis.md)
- [Target market & ICP](./03-target-market.md)
- [Product strengths](./04-product-strengths.md)
- [Business model](./05-business-model.md)
- [Pricing model](./06-pricing-model.md)
- [Go-to-market strategy](./07-gtm-strategy.md)

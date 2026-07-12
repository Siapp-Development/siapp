# `/plans/` — Planning, Research & Ideation

All non-code, decision-shaping documents for Siapp live here. See [.github/instructions/plans-folder.instructions.md](../.github/instructions/plans-folder.instructions.md) for the rule (enforced for all Copilot agents).

## Index

### Strategy & market
| File | What it is |
|---|---|
| [01-overview.md](./01-overview.md) | High-level product description, problem, principles, scope |
| [02-competitive-analysis.md](./02-competitive-analysis.md) | Landscape map, detailed competitor notes, feature matrix, positioning |
| [03-target-market.md](./03-target-market.md) | Geographic focus, vertical strategy, ICP definitions, market sizing |
| [04-product-strengths.md](./04-product-strengths.md) | Differentiation, moats, objections, what we won't build |
| [05-business-model.md](./05-business-model.md) | Revenue streams, unit economics, costs, acquisition motion |
| [06-pricing-model.md](./06-pricing-model.md) | Tiers, overages, add-ons, discounts, experiments |
| [07-gtm-strategy.md](./07-gtm-strategy.md) | Positioning, phased plan, launch tactics, sales playbook |

### Company & brand
| File | What it is |
|---|---|
| [08-mission-vision-values.md](./08-mission-vision-values.md) | Mission, 5-year vision, operating values |
| [09-brand-identity.md](./09-brand-identity.md) | Name, narrative, voice, visual direction, brand decisions |

### Pre-build readiness
| File | What it is |
|---|---|
| [10-customer-discovery-plan.md](./10-customer-discovery-plan.md) | Hypotheses, interview script, experiments, stage gate to build |
| [11-mvp-scope.md](./11-mvp-scope.md) | v1 in/out of scope, Siapp-Admin starter projects at launch, scope-cut rules |
| [12-product-roadmap.md](./12-product-roadmap.md) | Phased roadmap with metric gates, themes, anti-roadmap |
| [13-tech-architecture.md](./13-tech-architecture.md) | Stack, multi-tenancy, BSP abstraction, security baseline, build vs buy |
| [14-legal-compliance.md](./14-legal-compliance.md) | Entity, PDPA, WhatsApp policy, contracts, IP, pre-launch checklist |
| [15-financial-plan.md](./15-financial-plan.md) | Bootstrap stance, budgets, revenue ramp, margin model, funding triggers |
| [16-team-hiring-plan.md](./16-team-hiring-plan.md) | Founding roles, hiring sequence, comp philosophy, equity |
| [17-operating-cadence.md](./17-operating-cadence.md) | Meeting rhythm, OKRs, KPI dashboard, decisions log |
| [18-risk-register.md](./18-risk-register.md) | Top risks with likelihood, impact, mitigations, escalation triggers |
| [19-open-questions.md](./19-open-questions.md) | Outstanding questions with owners + due dates; blockers before sprint 1 |
| [20-access-control-departments.md](./20-access-control-departments.md) | Internal access control via Departments (D-025); resolves internal half of Q11 |
| [21-cost-estimation.md](./21-cost-estimation.md) | Product & service cost model (infra + 3rd-party only, no people): per-workspace COGS, scale projections, and reconciliation with pricing model |
| [22-wireframe-review.md](./22-wireframe-review.md) | UX review of `designs/screens-wireframes.excalidraw` — issues, fixes, missing flows before hi-fi |
| [23-design-system-research.md](./23-design-system-research.md) | Component library / design system evaluation — shadcn/ui + Radix + Tailwind recommended, with decision matrix and companion libs |
| [decisions-log.md](./decisions-log.md) | Append-only record of resolved decisions; supersedes question rows when closed |
| [firestore-data-model.md](./firestore-data-model.md) | Firestore collection structure, security model, indexes, triggers (closes Q44 / D-021) |
| [figma-make-design-prompt.md](./figma-make-design-prompt.md) | Paste-ready prompt for Figma Make to generate firm + client + collaborator screens |

### Where to start
- **New to Siapp?** Read [01-overview.md](./01-overview.md) → [08-mission-vision-values.md](./08-mission-vision-values.md) → [11-mvp-scope.md](./11-mvp-scope.md).
- **Before writing code?** Close every 🚫 BLOCKER in [19-open-questions.md](./19-open-questions.md).
- **Investor / partner conversation?** [01](./01-overview.md), [02](./02-competitive-analysis.md), [07](./07-gtm-strategy.md), [15](./15-financial-plan.md).

## Conventions

- Kebab-case filenames, optional `NN-` prefix for ordering.
- Front-matter with `title`, `status` (`draft` / `in-review` / `accepted` / `superseded`), `updated`.
- Markdown only. Mermaid + KaTeX allowed.
- Subfolders are fine for grouping (e.g. `gtm/`, `research/`, `rfcs/`). Keep the top level shallow.
- Link to other plans rather than duplicating content.

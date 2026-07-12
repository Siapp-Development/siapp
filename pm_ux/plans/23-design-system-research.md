---
title: "Design System & Component Library Research"
status: draft
updated: 2026-07-12
---

# Design System & Component Library Research

Evaluation of publicly available design systems and React component libraries for Siapp's frontend, checked against the stack baseline ([13-tech-architecture.md](./13-tech-architecture.md), D-005: React + TS + Vite, single repo), the brand direction ([09-brand-identity.md](./09-brand-identity.md)), and the screen inventory from the wireframe pass ([22-wireframe-review.md](./22-wireframe-review.md)).

> **Coverage check (2026-07-12):** the candidate set was cross-checked against the ~180 entries in [alexpate/awesome-design-systems](https://github.com/alexpate/awesome-design-systems). The overwhelming majority of that list are **brand-locked corporate design systems** (Audi, Porsche, Salesforce Lightning, GOV.UK, NASA, Starbucks…) — built to express *their* brand, so they fail R5 by construction and are treated as reference material only. The genuinely adoptable general-purpose libraries it surfaced that were missing from the first pass are now included below (Blueprint, React Aria, Cloudscape, Polaris, Paste, Primer, Semi, Untitled UI React, Shoelace, Base Web, Evergreen, Grommet, Vibe). None changed the recommendation.

## Requirements the choice must satisfy

Derived from existing plans — these are constraints, not preferences:

| # | Requirement | Source |
|---|---|---|
| R1 | **Two distinct UI personalities from one codebase.** Firm app: dense, neutral, keyboard-friendly, dark-mode capable. Client portal: spacious, warm, mobile-default, light-mode default. `/p/*` must not pull in firm-side components. | [09](./09-brand-identity.md) "Two distinct UI personalities", [13](./13-tech-architecture.md) routing |
| R2 | **Accessibility built in** — keyboard interaction, focus management, ARIA on menus/dialogs/toggles. Non-negotiable per repo instructions; wireframe review flags icon-only buttons and color-only state chips. | [.github/instructions/accessibility.instructions.md](../../.github/instructions/accessibility.instructions.md), [22](./22-wireframe-review.md) cross-cutting notes |
| R3 | **Table-heavy firm surface.** A0 attention table, A2 projects list, A6 clients, A7 collaborators, Z1 tenants — sortable, filterable, dense rows, tabular numerals. | [22](./22-wireframe-review.md) |
| R4 | **Mobile-first client + collaborator surfaces** at 390pt with safe-area awareness, bottom sheets, magic-link landing states. | [22](./22-wireframe-review.md) B/C screens |
| R5 | **Brand fit:** clean grotesque type (Inter/Geist), indigo/slate primary + terracotta/amber accent, single-stroke icons, calm not playful. Must not carry an unremovable foreign design language. | [09](./09-brand-identity.md) visual direction |
| R6 | **Small team, wedge-first velocity.** The differentiator is client visibility + messaging, not bespoke UI infrastructure. Prefer boring, well-documented, hireable. | [13](./13-tech-architecture.md) north-star principle 1, [16](./16-team-hiring-plan.md) |
| R7 | **TypeScript strict, tree-shakeable, Vite-compatible, light bundle on `/p/*`.** Client portal loads on MY mobile networks. | [13](./13-tech-architecture.md), repo instructions |
| R8 | **i18n-ready.** English v1, Bahasa Malaysia v1.5, Chinese later (D-026). Date pickers, plurals, RTL not required but no hard-coded EN strings inside components. | [decisions-log.md](./decisions-log.md) D-026 |

## Candidates evaluated

### Tier 1 — recommended

#### shadcn/ui + Radix Primitives + Tailwind CSS ✅ (recommended)

- **Model:** copy-paste component source into `src/components/ui/` (not an npm dependency); behavior from Radix Primitives; styling via Tailwind utility classes + CSS variables.
- **R1 (two personalities):** strongest of all candidates. Components are owned source — fork/theme per surface with two CSS-variable theme files, one per route tree. No library default aesthetic to fight.
- **R2 (a11y):** Radix Primitives are WAI-ARIA-compliant out of the box (focus traps, roving tabindex, `aria-*` wiring on dialogs, menus, switches, tabs).
- **R3 (tables):** official data-table recipe wires up TanStack Table v8 (headless) — sorting, filtering, pagination, column visibility.
- **R4 (mobile):** Radix `Dialog`/`Popover` are touch-friendly; shadcn wraps Vaul for iOS-style bottom drawers.
- **R5 (brand):** Tailwind default sans is Inter; Lucide (shadcn's default icon set) matches the "simple, single-stroke" brand spec exactly.
- **R6/R7:** de-facto industry standard in 2025–26 React hiring pool; zero runtime CSS-in-JS; only Radix behavior packages ship to the bundle.
- **Trade-offs:**
  - Components are **owned source, not upgradable via version bump**. Fixes/updates are manual (the shadcn CLI has a `diff` command, but drift is real).
  - Requires Tailwind buy-in across the team.
  - No opinionated app shell — nav rails, page layouts are ours to build (acceptable: A0–A9 layout is bespoke anyway).

#### Mantine (runner-up)

- **Model:** traditional npm dependency, ~100 components, hooks library, first-class TS.
- **Strengths:** real `DataTable`, `Dates`, `Notifications`, `Modals` manager, form library included — highest out-of-the-box velocity (R6). Good a11y. CSS-variables theming with light/dark per subtree.
- **Weaknesses:** everything ships with a recognizable "Mantine look"; making the firm app and client portal feel like **two different products** (R1) means overriding the library's own opinion twice. Bundle is heavier on `/p/*` (R7). Icons/typography defaults need replacing for R5.
- **Verdict:** pick this only if the team decides copy-paste ownership is too much maintenance. Solid, not the best fit.

### Tier 2 — viable, not chosen

| Library | Why not |
|---|---|
| **Astryx (Meta)** — [astryx.atmeta.com](https://astryx.atmeta.com) | Newly open-sourced (2026). The strongest challenger to shadcn: theme-agnostic semantic tokens with swappable theme packages (near-perfect R1 fit), explicit dense-data doctrine with real `Table`/`TreeList`/`AppShell`/`SideNav` (R3), per-category subpath imports + first-class Tailwind interop (R7), `EmptyState` component matching our [22](./22-wireframe-review.md) B2x/B4x needs, and AI-agent-first CLI docs. **Rejected on R6 maturity:** v0.x-era, no API-stability track record, tiny community/hiring pool, unproven a11y audit trail vs Radix's years of battle-testing, and Meta's mixed OSS-maintenance history. Packaged dependency, not owned source. **Re-evaluate in 6–12 months** — if it holds a stable 1.x with active releases, it becomes a credible migration target. |
| **Radix Themes** | Radix's opinionated theme layer. Good a11y (same primitives) but a fixed design language and less freedom than shadcn for R1. Choose only if the team rejects Tailwind. |
| **React Aria / React Spectrum (Adobe)** | React Aria is the only credible **alternative headless primitives layer to Radix** — arguably deeper a11y/i18n coverage (R2, R8), including internationalized date pickers. Not chosen because shadcn's ecosystem is Radix-based; adopting React Aria means hand-assembling the styled layer ourselves. Fallback if a Radix gap appears. React Spectrum (the styled tier) expresses Adobe's brand — reference only. |
| **Blueprint (Palantir)** | Best-in-class for dense, data-heavy desktop UIs (R3) — tables, trees, complex selects. But explicitly desktop-oriented (weak R4 for the mobile portal), carries a strong Palantir look (R5), and SCSS-based theming makes the two-personality split (R1) harder than CSS variables. Mine its table/density patterns for the firm surface. |
| **Chakra UI v3** | Mature, accessible, good theming. But its maintainer momentum has shifted to Ark UI/Park UI; v2→v3 migration churn signals API instability (R6 risk). |
| **Park UI + Ark UI + Panda CSS** | Modern headless successor from the Chakra team. Architecturally similar to shadcn but a much smaller community/ecosystem in 2026 — hiring and LLM/StackOverflow coverage lag (R6). Re-evaluate in a year. |
| **HeroUI (ex-NextUI)** | Attractive defaults, good for the client portal aesthetic — but weak on dense data tables and enterprise patterns needed for A0/A2/Z1 (R3). |
| **Untitled UI React** | Open-source React + Tailwind component set (plus a paid Figma kit). Complements shadcn (same Tailwind idiom) rather than replacing it — a legitimate source of full-page layout patterns for hi-fi. Not a foundation on its own: smaller behavioral coverage than Radix. |
| **Semi Design (ByteDance)** | Strong table/enterprise coverage with a design-token theming story better than AntD's. Still a packaged foreign design language (R1, R5) and CN-enterprise ecosystem center of gravity (R6). |
| **Shoelace / Web Awesome** | Framework-agnostic web components with solid a11y. React DX is second-class (wrappers, SSR quirks, weaker TS inference) — R6/R7 penalty with no offsetting benefit for a React-only codebase. |

### Tier 3 — rejected

| Library | Why rejected |
|---|---|
| **Material UI (MUI)** | Material Design is a strong foreign brand language; "calm, confident, not tech-corporate" ([09](./09-brand-identity.md)) means overriding elevation, ripple, shape, and type systems everywhere. Cost of fighting it exceeds its value. Large bundle for `/p/*`. |
| **Ant Design** | Best-in-class dense tables (R3) but a heavy CN-enterprise personality, large bundle, and a poor fit for the warm mobile client portal (R1, R4, R5). |
| **IBM Carbon / Adobe Spectrum / Atlassian ADS** | Corporate design systems built to express *their* brands. Excellent to **read** (a11y and token documentation) — wrong to adopt. |
| **Shopify Polaris / AWS Cloudscape / Twilio Paste / GitHub Primer / Fluent UI / Zendesk Garden / Elastic EUI** | Same category: high-quality, open-source, and each engineered to make products look like Shopify/AWS/Twilio/GitHub/Microsoft/Zendesk/Elastic (R5 fail). Cloudscape and EUI are worth **reading** for data-dense console patterns; Paste is worth reading for its token architecture (and Siapp already builds on Twilio infra). |
| **Vibe (monday.com)** | A direct competitor's design system for a PM tool. Useful to study for board/table interaction patterns; adopting it would be both a brand and a positioning error. |
| **Base Web (Uber)** | In maintenance mode since 2023 — no active external development (R6 fail). |
| **Evergreen (Segment) / Grommet (HPE)** | Effectively dormant / low-momentum maintenance; community and release cadence no longer meet R6. |
| **Bootstrap / react-bootstrap** | Dated interaction patterns, weaker composability, no headless story. |
| **daisyUI / Flowbite** | Tailwind class-only kits without behavioral primitives — a11y (R2) would be hand-rolled. |

## Decision matrix

Scored 1–5 against the requirements (5 = fully satisfies):

| | R1 two personalities | R2 a11y | R3 tables | R4 mobile | R5 brand fit | R6 velocity/hiring | R7 bundle/TS | R8 i18n |
|---|---|---|---|---|---|---|---|---|
| **shadcn/ui + Radix + Tailwind** | 5 | 5 | 4* | 4 | 5 | 5 | 5 | 4 |
| Mantine | 3 | 4 | 5 | 4 | 3 | 5 | 3 | 4 |
| Astryx (Meta) | 5 | 3† | 5 | 4 | 3† | 2 | 4 | 3† |
| React Aria (headless, self-styled) | 5 | 5 | 3 | 4 | 5 | 3 | 4 | 5 |
| Blueprint | 2 | 4 | 5 | 2 | 2 | 4 | 3 | 3 |
| Radix Themes | 3 | 5 | 3 | 4 | 3 | 4 | 4 | 4 |
| Chakra v3 | 3 | 4 | 3 | 4 | 3 | 3 | 3 | 4 |
| MUI | 2 | 5 | 5 | 3 | 1 | 4 | 2 | 5 |
| Ant Design | 1 | 3 | 5 | 2 | 1 | 3 | 2 | 5 |

\* 4 not 5 because tables come via the TanStack Table recipe rather than a packaged component — slightly more assembly, much more control.

† Astryx scores marked † are provisional — too new (2026 release) for third-party a11y audits, custom-theme flexibility evidence, or i18n track record. Its architecture *suggests* higher scores; R6 is the binding constraint today.

## Recommendation

**Adopt shadcn/ui (Radix Primitives + Tailwind CSS) as the component foundation, with Lucide icons and TanStack Table for the firm-side data grids.**

The deciding requirement is **R1**. [09-brand-identity.md](./09-brand-identity.md) explicitly calls the two-personality split "intentional and a differentiator." A packaged library imposes one personality that must be overridden twice; owned component source themed by two CSS-variable files gives both personalities natively and keeps `/p/*` lean.

### Companion libraries (adopt when first needed, not before)

| Concern | Library | Notes |
|---|---|---|
| Data tables (A0/A2/A6/A7/Z1) | **TanStack Table v8** | Headless; shadcn data-table recipe. Enable tabular numerals per [22](./22-wireframe-review.md). |
| Server state | **TanStack Query** | Already implied by [copilot-instructions](../../.github/copilot-instructions.md) "State & Data". |
| Forms + validation | **React Hook Form + Zod** | Zod already chosen for the API layer (D-022) — share schemas FE/BE. |
| Charts (A0 KPIs, [Bill] usage bar) | **Recharts** | Simple, composable; sufficient for v1 chart needs. |
| Icons | **Lucide** | Matches single-stroke brand spec; tree-shakeable. |
| Toasts | **Sonner** | shadcn-integrated, accessible. |
| Mobile bottom sheets (B/C screens) | **Vaul** | shadcn `Drawer` wrapper; iOS-feel for the client portal. |
| Date/range picking (A3 timeline, A5 dates) | **react-day-picker** | shadcn `Calendar` base; locale support for BM/CN later (R8). |

### Theming approach: one system, two themes

Cross-checked against the ui-ux-pro-max skill guidance (2026-07-12): the two-personality mandate from [09](./09-brand-identity.md) and a *single shared design system* are not in conflict — the split lives at the **theme layer**, never the system layer.

**Identical on every surface (firm, client portal, admin):**

- Semantic token *names* (`--color-primary`, `--color-surface`, `--color-destructive`…) — only values differ per theme.
- The component library itself — one `Button`, one `Dialog`, one `Badge`, themed per surface. Never fork a component per surface.
- Type family (one grotesque, no second face — per [09](./09-brand-identity.md)), icon set + stroke width, focus rings, error placement, toast behavior, motion durations/easing, form validation patterns.
- Status-chip semantics — the three state machines flagged in [22](./22-wireframe-review.md) (lifecycle vs Active/Idle vs tenant status) get distinct chip *styles* within one shared taxonomy, not per-surface reinventions.

**Intentionally different (theme + density variants):**

| Dimension | Firm app (A0–A9) | Client portal (B1–B4, C1) | Admin (Z1–Z3) |
|---|---|---|---|
| Color values | Slate/indigo neutrals, high contrast | Warm greys, terracotta/amber accent | = firm theme |
| Default mode | Light, dark-capable | Light only | Light |
| Density | Compact spacing, tabular | Generous spacing, summary-first | = firm |
| Type scale | Smaller base, data-optimized | ≥ 16px body (mobile zoom/readability) | = firm |
| Layout | Sidebar nav, tables | Single-column, thumb-reach | Sidebar nav |

**Admin gets no third personality.** Z1–Z3 is internal-only (~2 users); it rides the firm theme wholesale, differentiated by a visible environment marker (distinct top-bar color + "Siapp Admin" label), not a different design language. A third theme would triple contrast-testing surface for no user benefit.

Implementation:

- One Tailwind config; tokens as CSS variables under two roots: `[data-surface="firm"]` (also used by admin) and `[data-surface="portal"]`.
- Token names follow the palette in [09-brand-identity.md](./09-brand-identity.md); finalize hex values with the contract designer (Month 1 brand-guide deliverable).
- Route-level code splitting keeps firm components out of the `/p/*` bundle (already mandated by [13](./13-tech-architecture.md)).

### Reference material (read, don't adopt)

- **Radix Colors** — 12-step accessible scales; good starting math for the indigo/slate + terracotta ramps.
- **Vercel Geist** — typographic scale reference for a grotesque-only type system.
- **Carbon / Spectrum a11y docs** — deepest public documentation on accessible data-dense patterns.
- **AWS Cloudscape / Elastic EUI / Blueprint docs** — the three best public references for dense data-table, filtering, and console-density patterns (firm surface A0/A2/Z1).
- **Twilio Paste token docs** — clean example of a two-layer token architecture (global → alias); relevant to the firm/portal theming split.
- **Vibe (monday.com)** — competitor PM-tool patterns for boards, timelines, and status chips; study, never adopt.
- **GOV.UK Design System / USWDS** — plain-language form patterns and error-state copy; useful when tightening the client-portal empty/error states flagged in [22](./22-wireframe-review.md).
- **Untitled UI (Figma kit)** — full-page layout references (dashboards, settings, empty states) for the hi-fi pass.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| shadcn components drift from upstream fixes | Pin the initial copy-in to a known CLI version; check `shadcn diff` quarterly; treat owned components as our code (tests per [testing instructions](../../.github/instructions/testing.instructions.md)). |
| Tailwind class sprawl hurts readability | Enforce the styling instructions ([styling.instructions.md](../../.github/instructions/styling.instructions.md)); extract variants with `cva` (already the shadcn convention). |
| Two theme files diverge structurally | Single token schema (same variable names, different values); lint that both surfaces define the full set. |
| Surface personalities drift into separate systems | Components live only in shared `src/components/ui/`; surface-specific *composition* is allowed, surface-specific *forks* of primitives are not. Review gate: any new component variant must work under both theme roots. |
| Team unfamiliar with headless-table assembly | Build the A2 projects table first as the reference implementation; reuse the pattern for A6/A7/Z1. |

## Open questions

| Q | Owner | Due |
|---|---|---|
| Confirm final brand hex ramps with contract designer before locking CSS variables | Founder + designer | Month 1 (with brand guide) |
| Recharts vs Tremor for [Bill] usage visualizations — decide when [Bill] is built | Eng | At [Bill] implementation |
| Component test depth for owned shadcn components (all vs. modified-only) | Eng | Sprint 1 |
| Re-evaluate Astryx (Meta) once it reaches a stable 1.x with sustained release cadence — strongest future challenger on R1/R3 | Eng | +6–12 months |

## Related plans

- [09-brand-identity.md](./09-brand-identity.md) — visual direction and the two-personality mandate
- [13-tech-architecture.md](./13-tech-architecture.md) — stack baseline (D-005) and routing split
- [22-wireframe-review.md](./22-wireframe-review.md) — screen inventory and a11y notes the library must serve
- [decisions-log.md](./decisions-log.md) — D-005 (frontend stack), D-022 (Zod), D-026 (languages)

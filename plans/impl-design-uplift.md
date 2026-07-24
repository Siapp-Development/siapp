# Design uplift — firm dashboard + client portal

**Status:** implementing · **Branch:** `feat/design-uplift` (stacked on `feat/stack-integration`, PR #66)

## Audit findings (browser walkthrough, seeded emulator data)

- **Broken utilities:** `text-muted-foreground`, `bg-muted`, `text-destructive` are used across
  ~20 files but never defined in the Tailwind v4 `@theme` — they silently no-op, so secondary
  text renders at full contrast and muted fills disappear. This is the single biggest reason the
  UI reads as unstyled.
- **Typography:** default system-ui everywhere; no display face, no scale discipline, headings
  are just `text-2xl font-bold`. No visual identity.
- **Firm sidebar:** plain white column with five text links; no icons, no active indicator
  beyond color, wordmark is a plain `<p>`.
- **Stat buckets / rows:** wireframe-grade bordered boxes; status conveyed by plain text; no
  progress visualisation anywhere on firm screens despite `progressPct` being available.
- **Portal:** warm background is there, but the header/nav are generic pills, the timespan bar
  is an ambiguous grey line, cards are flat bordered boxes, and the PDPA footer dominates.

## Direction — "Site office"

One system, two personalities (D-039, research doc 23):

- **Firm surface** = drawing-office precision. Boldness spent in exactly one place: a **deep
  slate-indigo sidebar** (structural, anchors the whole app). Everything else stays quiet —
  white cards, hairline borders, small colored badges, tabular numerals.
- **Portal surface** = the firm's letterhead. Warm paper, generous whitespace, **terracotta as
  a thin accent** (active nav, milestone markers, progress fill) — never as washes, to avoid
  the cream+terracotta cliché.
- **Type:** Space Grotesk Variable for display/headings/numerals (geometric, drafting-lettering
  feel), Inter Variable for UI/body. Self-hosted via `@fontsource-variable` (PDPA: no Google
  CDN calls).

## Scope

1. **Tokens** (`packages/ui/src/styles/tokens.css`): add `--muted`, `--muted-foreground`,
   `--destructive` (alias of danger), sidebar tokens, font tokens, shadow scale; per-surface
   overrides for portal warmth.
2. **Theme map** (`globals.css`): expose new colors + `--font-display`/`--font-sans`, heading
   base styles, font imports.
3. **Primitives** (`packages/ui`): new `Badge` (status variants) and `Progress`; refine
   `Button` (focus ring, active) and `Card` (radius/shadow).
4. **Firm screens:** FirmShell sidebar (dark, icons, active bar, user footer), DashboardPage
   (stat cards, task rows, attention rows w/ progress), ProjectsListPage rows, ProjectDetailPage
   header/tabs, TasksSection rows (status badges, overdue accent), LoginPage.
5. **Portal screens:** PortalShell header/nav/footer, PortalProjectPage (hero, progress,
   milestone, updates), TimespanBar (labeled, milestone-aware today marker).

Out of scope: admin surface (inherits token fixes), new features, information architecture
changes. All ARIA roles/names preserved so existing tests keep passing.

## Quality floor

WCAG AA contrast on every new pair; 44px touch targets on portal; base 16px, line-height 1.5;
motion 150–250ms and gated behind the existing `prefers-reduced-motion` kill-switch; keyboard
focus visible on the dark sidebar (light ring).

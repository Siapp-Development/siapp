# Impl Plan — Landing page revamp: hero video + trim marketing sections

Issue: **#154** — "Landing page revamp: hero video + trim marketing sections".

> **Authoritative & combined.** This file supersedes the earlier hero-only scope
> ("Replace landing page hero illustration with siapp-hero.gif"). It now covers BOTH:
> **Change 1** — swap the hero illustration for the `siapp-hero.mp4` video; and
> **Change 2** — remove 6 below-the-fold marketing sections and their now-dead helpers.
> The two changes interact (Change 2 turns several helpers that Change 1 originally
> preserved into dead code), so they MUST be planned together — see the Dead-code cascade.
>
> **Resolved decisions (human, 2026-09-08):**
> 1. **Asset is an MP4, not a GIF.** Use `apps/web/src/assets/siapp-hero.mp4` (~197 KB) rendered
>    as a `<video>`. The GIF idea is dropped (the 45 MB GIF was removed from disk).
> 2. **`#product` nav/footer link → REMOVE** (Option 1 below): delete the "Product" link from
>    nav + footer and update `MarketingFooter.test.tsx`.
> 3. **Analytics events → OK to drop** (`product_demo_*`, `industry_view_*`,
>    `client_portal_preview_viewed`). Remove the dead `TMarketingEvent` union members for hygiene.

## Goal
Revamp the Siapp marketing landing page (**marketing apex** surface only — `apps/web`,
`--mode apex`). (1) Replace the JS-driven `<HeroWorkflowDemo />` in the hero with the
`apps/web/src/assets/siapp-hero.mp4` video rendered as a `<video>` element (autoplay gated on
`prefers-reduced-motion`). (2) Trim the
below-the-fold page down to a tighter narrative by removing 6 sections (Industries, Client portal,
For-your-team/Product, Benefits, Differentiation, Outcomes strip), leaving
**Problem → HowItWorks → Trust → Faq → FinalCta**. This is a presentation-only change: no data
model, no auth, no backend, no cross-surface impact. Bundle isolation (D-036) is preserved and
strengthened — the change stays entirely inside the marketing surface and net-removes code from the
apex bundle. No binding decision in the decisions log governs the landing-page hero or section set,
so there is no decision conflict to flag.

## Touched surfaces & files
Surface: **marketing / apex bundle only** (`dashboard.siapp.app`, `siapp.app/p/*`, `siapp.app/t/*`,
`admin.siapp.app` untouched). All paths below are under
`apps/web/src/surfaces/marketing/`.

### Modify
- **`sections/Hero.tsx`** (Change 1)
  - Remove `import { HeroWorkflowDemo } from '../components/demo/HeroWorkflowDemo.tsx';`
  - Add `import heroVideo from '@/assets/siapp-hero.mp4';` (the `@/*` alias is the established
    asset-import pattern — see `MarketingNav.tsx` / `MarketingFooter.tsx` importing
    `@/assets/siapp-logo-full.png`).
  - Add `import { useReducedMotion } from '../hooks/useReducedMotion.ts';` and call it inside the
    component to gate video autoplay (see Rendering decision).
  - Replace `<HeroWorkflowDemo />` (line 39) with a `<video>` in the right-hand grid column.
- **`sections/BelowFold.tsx`** (Change 2) — remove 6 imports (lines 1, 2, 3, 7, 8, 9) and their 6
  JSX elements. Remaining render order: `Problem → HowItWorks → Trust → Faq → FinalCta`.
- **`components/MarketingNav.tsx`** (Change 2) — remove the `#industries` and `#client-portal`
  entries from `NAV_LINKS` (lines 18–19). **Also resolve `#product`** (line 16) — see Nav/footer
  anchor integrity below (its target section is being removed).
- **`components/MarketingFooter.tsx`** (Change 2) — remove the `#industries` (lines 37–41) and
  `#client-portal` (lines 42–46) footer `<li>` links. **Also resolve `#product`** (lines 27–31).
- **`components/MarketingFooter.test.tsx`** (Change 2) — line 31 asserts the `Product` → `#product`
  link exists; the "Product" link is being removed (resolved decision #2), so retarget that
  assertion to a surviving link (e.g. `How it works` → `#how-it-works` or `FAQ` → `#faq`) or drop it.
- **`components/icons.tsx`** (Change 2, optional cleanup) — `ArrowRightIcon` (line 44, only used by
  `OutcomesStrip`) and `ChatIcon` (line 61, only used by `DemoPortal`) become dead exports. Removing
  them is optional (unused named exports do not fail lint/typecheck); recommended for hygiene.
- **`lib/track.ts`** (Change 2) — remove the now-dead `TMarketingEvent` union members
  `product_demo_started`, `product_demo_completed`, `industry_view_construction`,
  `industry_view_legal`, `client_portal_preview_viewed` (they lose all emit sites; resolved
  decision #3). See Analytics below.

### Delete
Change 1:
- `components/demo/HeroWorkflowDemo.tsx`
- `components/demo/HeroWorkflowDemo.test.tsx`

Change 2 — the 6 sections:
- `sections/IndustryDemo.tsx`
- `sections/ClientPortalSection.tsx`
- `sections/InternalProduct.tsx`
- `sections/Benefits.tsx`
- `sections/Differentiation.tsx`
- `sections/OutcomesStrip.tsx`

Change 2 — dead-code cascade (importer set becomes empty after the above — grep-verified):
- `components/demo/demoContent.ts`
- `components/IndustrySwitcher.tsx`
- `components/IndustrySwitcher.test.tsx`
- `components/demo/DemoPortal.tsx`
- `components/demo/DemoTimeline.tsx`
- `components/demo/DeviceFrames.tsx`
- `components/demo/WhatsappBubble.tsx`

(After all deletions, `components/demo/` is empty and may be removed.)

### Keep (still referenced by the surviving surface — do NOT delete)
- **`hooks/useReducedMotion.ts`** — its previous only consumer (`HeroWorkflowDemo`) is deleted, but
  Change 1's `<video>` now uses it to gate autoplay, so it stays live. **KEEP.**
- `components/SectionHeading.tsx` — still used by Problem, HowItWorks, Trust, Faq.
- `components/icons.tsx` — `CheckIcon` (Trust), `ChevronDownIcon` (FaqAccordion), `MenuIcon`/
  `CloseIcon` (MarketingNav) still used. File stays.
- `hooks/useInViewOnce.ts` — still used by `SectionHeading`.
- `components/CtaLink.tsx` (+ test) — used by Hero, FinalCta, MarketingNav.
- `components/FaqAccordion.tsx` (+ test), sections Problem / HowItWorks / Trust / Faq / FinalCta.

## Data model changes
**None.** No Firestore collections, fields, indexes, or security rules are affected. Multi-tenant
workspace isolation is not touched. This is a purely presentational marketing-page change.

## Rendering decision (the `<video>`)
In `Hero.tsx`, call `useReducedMotion()` in the component body, then replace `<HeroWorkflowDemo />`
with:

```tsx
const reducedMotion = useReducedMotion();
// ...
<video
  className="w-full h-auto rounded-xl"
  autoPlay={!reducedMotion}
  loop
  muted
  playsInline
  controls={reducedMotion}
  preload="metadata"
  aria-label="Siapp in action: a firm marks a project task done, the client instantly receives a WhatsApp update, and their portal progress advances with a new status entry."
>
  <source src={heroVideo} type="video/mp4" />
</video>
```

Rationale / details:
- **Import style**: `import heroVideo from '@/assets/siapp-hero.mp4'` returns a bundled URL string
  (Vite asset handling). Prefer the `@/assets/...` alias over a deep relative path for consistency
  with existing image imports.
- **Autoplay + a11y (WCAG 2.2.2 Pause, Stop, Hide)**: A looping video that autoplays indefinitely
  needs a pause mechanism. We satisfy this by honoring `prefers-reduced-motion`: when reduced motion
  is preferred we do **not** autoplay and expose native `controls` so the user starts it themselves;
  otherwise it autoplays. `muted` is required for autoplay to be allowed by browsers; `playsInline`
  keeps it inline on iOS instead of going fullscreen.
- **Accessible name**: `aria-label` on `<video>` conveys the animation's meaning to screen-reader
  users (there is no caption/transcript because the clip is silent product motion, not speech).
- **Sizing**: The video occupies the wider right column of the hero grid
  (`lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]`). `w-full h-auto` makes it fluid and fill the
  column while preserving aspect ratio; the parent grid already constrains max width. Keep
  `rounded-xl` for visual parity with the previous device-frame look (Builder may drop/adjust the
  radius if it doesn't match the asset — cosmetic).
- **`preload="metadata"`**: fetch just enough to size/start the video without pulling the whole clip
  eagerly; the asset is ~197 KB so this is low-risk either way.
- **Optional (Builder discretion, keep tight)**: add explicit intrinsic `width`/`height` attributes
  if the video's pixel dimensions are known, to reserve layout space and avoid CLS. Only add if the
  real dimensions are read from the asset; do not guess. A `poster` frame is optional and not
  required (no poster asset exists).

## Change 2 — section removal details

### `BelowFold.tsx` after edit
Current order: Problem, HowItWorks, IndustryDemo, ClientPortalSection, InternalProduct, Benefits,
Differentiation, OutcomesStrip, Trust, Faq, FinalCta. Remove the 6 middle sections; remaining:
```
<Problem /> → <HowItWorks /> → <Trust /> → <Faq /> → <FinalCta />
```
This still reads as a coherent funnel (problem → how it works → social proof/trust → objections →
CTA), so no reordering is needed. Remove the 6 corresponding `import` lines too so no unused-import
lint error remains. `BelowFold` stays the default-exported lazy chunk consumed by `MarketingHome`.

### Confirm each deleted section has no other importer (grep-verified)
Each of the 6 sections is imported **only** by `BelowFold.tsx`. HeroWorkflowDemo is imported **only**
by `Hero.tsx`. Builder must re-run `grep -rn "<name>" apps/web` after each deletion to confirm zero
remaining references.

### Nav/footer anchor integrity — **CRITICAL DECISION on `#product`**
- `#industries` (owned by `IndustryDemo`, id line 17) and `#client-portal` (owned by
  `ClientPortalSection`, id line 38) targets are being deleted → remove their nav links
  (`MarketingNav` lines 18–19) and footer links (`MarketingFooter` lines 37–46). Mandatory.
- **`#product` is owned by `InternalProduct.tsx` (`<section id="product">`, line 53) — which is being
  DELETED.** So the "Product" nav link (`MarketingNav` line 16) and footer link (`MarketingFooter`
  lines 27–31) would become **dead anchors**. **RESOLVED (decision #2): remove the "Product" link
  from both nav and footer.** Surviving nav = `How it works`, `FAQ`. Then **update
  `MarketingFooter.test.tsx` line 31** which currently asserts
  `getByRole('link', { name: 'Product' })` → `#product`; retarget that assertion to a surviving
  link (e.g. `How it works` → `#how-it-works`, or `FAQ` → `#faq`) or drop it.
- `#how-it-works` (owned by `HowItWorks`, id line 25) and `#faq` (owned by `Faq`, id line 51) targets
  **survive** — those nav/footer links stay valid. `#top` (MarketingHome) unaffected.
- **Final invariant to verify:** after edits, every remaining `href="#..."` in `MarketingNav` and
  `MarketingFooter` resolves to an `id` that still exists in the DOM. Grep the surviving section ids
  (`#how-it-works`, `#faq`, plus `#product` only if re-pointed) against the anchor lists.

### Dead-code cascade — definitive keep/delete (grep-verified importer sets)
After removing the 6 sections **and** `HeroWorkflowDemo`, re-evaluated every shared helper:

| File | Importers BEFORE | Importers AFTER removals | Verdict |
|---|---|---|---|
| `components/demo/demoContent.ts` | IndustryDemo, ClientPortalSection, HeroWorkflowDemo, DemoPortal, DemoTimeline, IndustrySwitcher | none (all deleted) | **DELETE** |
| `components/IndustrySwitcher.tsx` | IndustryDemo | none | **DELETE** |
| `components/IndustrySwitcher.test.tsx` | (tests IndustrySwitcher) | n/a | **DELETE** |
| `components/demo/DemoPortal.tsx` | IndustryDemo, ClientPortalSection | none | **DELETE** |
| `components/demo/DemoTimeline.tsx` | IndustryDemo | none | **DELETE** |
| `components/demo/DeviceFrames.tsx` | IndustryDemo, ClientPortalSection, InternalProduct, HeroWorkflowDemo | none | **DELETE** |
| `components/demo/WhatsappBubble.tsx` | IndustryDemo, HeroWorkflowDemo | none | **DELETE** |
| `hooks/useReducedMotion.ts` | HeroWorkflowDemo | Hero (`<video>` autoplay gate) | **KEEP** |
| `components/SectionHeading.tsx` | Problem, HowItWorks, Trust, Faq (+ deleted ones) | Problem, HowItWorks, Trust, Faq | **KEEP** |
| `hooks/useInViewOnce.ts` | SectionHeading, ClientPortalSection | SectionHeading | **KEEP** |
| `components/icons.tsx` (`CheckIcon`) | Trust, ClientPortalSection, HeroWorkflowDemo, DemoTimeline | Trust | **KEEP file** |
| `components/icons.tsx` (`ChevronDownIcon`) | FaqAccordion | FaqAccordion | **KEEP** |
| `components/icons.tsx` (`MenuIcon`/`CloseIcon`) | MarketingNav | MarketingNav | **KEEP** |
| `components/icons.tsx` (`ArrowRightIcon`) | OutcomesStrip | none | dead export — optional remove |
| `components/icons.tsx` (`ChatIcon`) | DemoPortal | none | dead export — optional remove |

`components/demo/` becomes empty → remove the empty directory. Do all deletions **before** the final
grep sweep so no orphan import remains.

### Analytics — events being dropped (Change 2 + Change 1)
Removed emit sites (all in deleted files):
- `product_demo_started`, `product_demo_completed` — `HeroWorkflowDemo` (Change 1).
- `industry_view_construction`, `industry_view_legal` — `IndustrySwitcher` (via IndustryDemo).
- `client_portal_preview_viewed` — `ClientPortalSection`.

These events are defined only in `lib/track.ts`'s `TMarketingEvent` union and are **not** registered/
validated anywhere central (no backend allowlist, no analytics config) — grep-confirmed. Dropping the
emit sites is self-contained. Surviving events: `early_access_cta_clicked` (CtaLink), `faq_opened`
(FaqAccordion). Flag to PM if any funnel depends on the dropped events (see Risks).

## Accessibility decision & tradeoff
**Chosen approach: render a `<video autoPlay loop muted playsInline>` whose autoplay is gated on
`prefers-reduced-motion` via the existing `useReducedMotion` hook.** Documented rationale:
- A looping video that autoplays indefinitely triggers WCAG 2.2.2 (Pause, Stop, Hide). Unlike a GIF,
  a `<video>` gives us real control: when the user prefers reduced motion we **don't** autoplay and
  we expose native `controls` so they can start/stop it themselves — this satisfies 2.2.2.
- `muted` is required for browsers to allow autoplay; `playsInline` keeps it inline on iOS.
- The clip is silent product motion (no speech), so no captions/transcript are needed; an
  `aria-label` supplies the accessible name that conveys the flow's meaning.
- The 197 KB MP4 is far lighter than the rejected 45 MB GIF, so landing-page LCP is not a concern.
- **Tradeoff recorded**: for non-reduced-motion users the video autoplays and loops (expected for a
  marketing hero); reduced-motion users get a paused, user-controllable clip. This is a deliberate,
  in-scope a11y-conscious choice, not an oversight.

## Steps (each independently verifiable)

**Change 1 — hero video**
1. **Edit `Hero.tsx` imports**: remove the `HeroWorkflowDemo` import; add
   `import heroVideo from '@/assets/siapp-hero.mp4';` and
   `import { useReducedMotion } from '../hooks/useReducedMotion.ts';`. Call `useReducedMotion()` in
   the component body. Verify: file parses; no other `HeroWorkflowDemo` reference remains.
2. **Swap the render**: replace `<HeroWorkflowDemo />` (line 39) with the `<video>` block above.
   Verify: `grep -rn "HeroWorkflowDemo" apps/web/src` returns **only** the two files to delete.
3. **Delete** `HeroWorkflowDemo.tsx` + `HeroWorkflowDemo.test.tsx`. Verify:
   `grep -rn "HeroWorkflowDemo" apps/web` returns nothing.

**Change 2 — section removal**
4. **Edit `BelowFold.tsx`**: remove the 6 imports (Benefits, ClientPortalSection, Differentiation,
   IndustryDemo, InternalProduct, OutcomesStrip) and their 6 JSX elements. Verify remaining order is
   Problem → HowItWorks → Trust → Faq → FinalCta; no unused imports.
5. **Delete the 6 section files**. After each, `grep -rn "<SectionName>" apps/web` must return zero
   references (they were BelowFold-only).
6. **Delete the cascade files** (demoContent, IndustrySwitcher + test, DemoPortal, DemoTimeline,
   DeviceFrames, WhatsappBubble, useReducedMotion) and remove the now-empty `components/demo/` dir.
   After each deletion, grep the symbol across `apps/web` to confirm no remaining importer.
7. **Nav/footer anchors**: in `MarketingNav.tsx` remove the `#industries`, `#client-portal`, **and
   `#product`** `NAV_LINKS` entries; in `MarketingFooter.tsx` remove the `#industries`,
   `#client-portal`, **and `#product`** `<li>`s (resolved decision #2). Verify: every remaining
   `href="#..."` resolves to an existing section `id` (`#how-it-works`, `#faq`).
8. **Update `MarketingFooter.test.tsx`**: retarget/replace the line-31 `Product` → `#product`
   assertion (point it at a surviving link such as `How it works` → `#how-it-works`, or drop it).
9. **(Hygiene)** remove `ArrowRightIcon` + `ChatIcon` from `icons.tsx`, and the 5 now-unused
   members from `TMarketingEvent` in `lib/track.ts` (resolved decision #3).
10. **Validate**: run the full suite (see Validation). All green.

## TypeScript
No new ambient declaration is needed. `apps/web/src/vite-env.d.ts` starts with
`/// <reference types="vite/client" />`, and Vite's client types already declare `*.mp4` (alongside
`*.png/*.jpg/*.svg/*.webp` and other media) as a module resolving to a URL `string`.
`tsconfig.app.json` relies on these ambient types (no explicit `compilerOptions.types` override) and
includes `src`, with the `@/*` → `./src/*` path alias configured. So
`import heroVideo from '@/assets/siapp-hero.mp4'` typechecks with no extra work. **Do not add a custom
`images.d.ts`.**

## Test plan (for Tester)
- **Delete** `HeroWorkflowDemo.test.tsx` and `IndustrySwitcher.test.tsx` alongside their components
  (they test deleted behavior). No replacements.
- **Hero component test** (add or extend, minimal): render `<Hero />` and assert:
  - A `<video>` is present whose accessible name (`aria-label`) mentions the WhatsApp/portal flow —
    e.g. `getByLabelText(/whatsapp/i)` (query the video element). Note `<video>` has no default ARIA
    role, so query by label text rather than role.
  - The rendered `<source>`/video has a defined `src` (vitest resolves the asset import to a stub
    string).
  - No leftover demo replay control (e.g. no "Mark task complete" button in the hero).
  - (Optional) mock `useReducedMotion` → `true` and assert the video has `controls` and is not
    autoplaying.
- **`MarketingFooter.test.tsx`**: update the line-31 assertion so it no longer requires the
  `Product`/`#product` link (or retargets to a surviving anchor). Keep the Privacy/Terms assertions.
  Add (optional) a negative assertion that `Industries` / `Client portal` links are gone.
- **`MarketingNav`** (optional new test, if Tester wants coverage): assert `NAV_LINKS` no longer
  renders `Industries` / `Client portal`, and that no rendered nav `href` points at a removed id.
- **No BelowFold/MarketingHome smoke test exists** — nothing to update there; consider (optional) a
  minimal smoke test asserting the removed sections' headings (e.g. "Not another blank
  project-management tool.") are absent, to lock the trim in.
- **No** rules/hook/backend tests — nothing in those layers changed. `useReducedMotion` had no test.
- Confirm the full `apps/web` vitest suite passes after deletions (surviving tests: CtaLink,
  FaqAccordion, MarketingFooter).

## Validation commands (repo-correct)
Run from repo root (turbo orchestrates the `@siapp/web` workspace):
- Typecheck: `pnpm typecheck` (turbo → `tsc -b`) — catches any dangling import from a deleted file.
- Lint: `pnpm lint` (turbo → `eslint .`) — catches unused imports/vars.
- Test: `pnpm test` (turbo test + bundle-isolation + backup checks) — or scoped:
  `pnpm --filter @siapp/web test`
- Build: `pnpm build` (runs `tsc -b` then the three-mode Vite build) — or scoped:
  `pnpm --filter @siapp/web build`

Bundle-isolation guard (`scripts/check-bundle-isolation.test.mjs`, part of `pnpm test`) stays green —
this change only removes marketing code and adds one marketing-scoped asset.

## Out of scope
- Static poster-frame image for the video's paused/reduced-motion state (none exists; the native
  `controls` fallback is sufficient — a poster is a possible follow-up).
- Re-encoding/optimizing `siapp-hero.mp4` or adding a `.webm` source, or lazy-loading strategy
  changes.
- Rewriting the surviving sections' copy/layout, adding new sections, or reordering beyond the
  natural collapse to Problem → HowItWorks → Trust → Faq → FinalCta.
- Introducing replacement analytics events for the dropped ones.
- Any change to non-apex surfaces (`dashboard`, `p/*`, `t/*`, `admin`) or to Firestore/rules/backend.

## Risks / open questions
All four originally-open questions are now **resolved** (see the banner at the top):
1. **`#product` anchor — RESOLVED.** Remove the "Product" link from nav + footer and update
   `MarketingFooter.test.tsx`. No dead anchors remain.
2. **Dropped analytics — RESOLVED (accepted).** `product_demo_*`, `industry_view_*`,
   `client_portal_preview_viewed` are dropped; their `TMarketingEvent` members are removed.
3. **Reduced-motion a11y — RESOLVED.** The `<video>` gates autoplay on `useReducedMotion` and exposes
   `controls` for reduced-motion users, satisfying WCAG 2.2.2. No poster asset needed.
4. **Asset weight — RESOLVED.** The 45 MB GIF was dropped; the 197 KB `siapp-hero.mp4` is used.
5. **Layout parity (Builder check, not blocking).** The video's aspect ratio may not match the old
   two-device layout; Builder should visually check the hero grid at mobile and `lg` breakpoints, and
   eyeball vertical rhythm between the surviving sections after the trim.

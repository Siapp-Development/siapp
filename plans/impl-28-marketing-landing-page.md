---
title: "Marketing Landing Page — siapp.app"
status: draft
updated: 2026-07-25
---

# impl-28 — Marketing Landing Page (siapp.app)

A production-quality, award-calibre marketing + early-access lead-gen page for the apex surface. This plan supersedes the original brief by grounding every decision in **what already exists in this repo** — the design-token system, the portal/firm surface themes, the logo assets, the bundle-isolation constraints, and the Firebase backend — instead of describing a greenfield Framer build.

**Reference:** original brief (sections 1–27) supplied 2026-07-25. Where this plan diverges, this plan wins.

---

## 0. What changed since the brief was written

The brief assumed a from-scratch build. Reality:

| Brief assumption | Repo reality | Consequence |
| --- | --- | --- |
| Framer components + new style variables | React 18 + Vite + Tailwind v4 + `packages/ui` tokens (`tokens.css`) already encode the **exact** palette in the brief (`--primary: #3e4c77`, `--accent: #c4553d`, portal warm neutrals, etc.) | Build zero new color values. Marketing consumes semantic tokens; add only marketing-specific tokens (hero type scale, section spacing, motion durations). |
| "Use Inter or Geist" | Self-hosted **Inter Variable** (body) + **Space Grotesk Variable** (display) already shipped, PDPA-conscious (no font CDN) | Keep both. Space Grotesk gives the hero a distinctive voice the brief's "no decorative secondary typeface" rule was guarding against generic scripts — a grotesk display face is compliant and already our brand. |
| Build phone mockup, timeline, progress, WhatsApp bubble from scratch | Real product components exist: `TimespanBar`, portal overview page, task status chips, `Progress`, `Badge`, `Card`, firm timeline board (PR #70) | Product demos are **stylized recreations using real component patterns**, not screenshots — but we copy visual DNA from the live surfaces so the demo matches the actual product. |
| Logo "when available" | Three assets shipped: `siapp-logo-full.png` (wordmark), `siapp-logo-simple.png`, `siapp-logo-simple-reversed.png` (for dark bg) | Use full wordmark in nav/footer, reversed simple mark on the slate-indigo final CTA section. Export SVG/WebP variants during this ticket for crispness + weight. |
| Generic "lead form backend" | Decision (2026-07-25): **no in-app lead capture**. Leads are collected in a Typeform. | All "Request early access" CTAs open the Typeform in a new tab (`rel="noopener noreferrer"`). No backend work, no new Firestore collection, no rules change. The brief's inline lead form (§3, §17) is replaced by a prominent CTA button in the final section. |
| SEO title placeholder | `apex.html` title is "Simple project tracking for small firms" | Replace with the brief's metadata; add OG/Twitter tags, JSON-LD `SoftwareApplication`. |
| Analytics events | No analytics wired | Ship a `track(eventName, props)` no-op wrapper with the brief's event names. Wire a real provider later; no cookie banner needed while it's a no-op. |

Also new since the brief: client portal now shows **"Prepared for {client}"** + Siapp footer wordmark (PR #72), dashboard has a **timeline board + task drawer** (PR #70), and the design-uplift pass (PR #69) established the "one system, two personalities" surface theming — the marketing page becomes the **third personality**: it must visually bridge the cool firm surface and the warm portal surface, because the page literally shows both.

---

## 1. Architecture

### 1.1 Placement & code-splitting

```
apps/web/src/surfaces/marketing/
  MarketingHome.tsx            — page assembly (replaces skeleton)
  marketing.css                — marketing-only tokens (type scale, section rhythm, motion vars)
  components/
    MarketingNav.tsx           — sticky nav + mobile menu
    MarketingFooter.tsx
    SectionHeading.tsx         — eyebrow + h2 + lede, one component, variants
    CtaLink.tsx                — primary/secondary CTA; primary = Typeform link (new tab), fires track()
    IndustrySwitcher.tsx       — Construction | Legal segmented control
    FaqAccordion.tsx
    demo/
      HeroWorkflowDemo.tsx     — the hero "mark task complete" scene
      DeviceFrames.tsx         — DesktopWindow, PhoneFrame (pure CSS chrome)
      WhatsappBubble.tsx
      DemoTimeline.tsx         — stylized phase/task list (visual DNA from firm timeline)
      DemoPortal.tsx           — stylized portal card (visual DNA from PortalProjectPage)
      demoContent.ts           — construction + legal fixture data (single source)
      useAutoplayOnView.ts     — IntersectionObserver + reduced-motion gate
  hooks/
    useReducedMotion.ts
  lib/
    track.ts                   — analytics event stub
```

- Everything stays inside the apex chunk; **no imports from `surfaces/firm` or `surfaces/portal`** (bundle-isolation CI enforces this). Demo components are lookalikes, not shared imports — intentional: marketing fidelity must not couple to product refactors.
- `MarketingHome` remains the eager `/` route. Below-the-fold sections (industry demo, portal section, FAQ) load via `React.lazy` + `Suspense` with reserved-height placeholders (CLS = 0).
- Marketing sets `data-surface` per section where useful: the client-portal feature section renders its mockup inside a `[data-surface='portal']` wrapper so warm tokens apply automatically.

### 1.2 Lead capture — Typeform

- **No backend.** Every "Request early access" CTA is an `<a>` to the Typeform (opens in a new tab, `target="_blank" rel="noopener noreferrer"`), which owns the form fields, validation, and success state.
- **Typeform URL:** `https://form.typeform.com/to/GyoSjy9n`
- The URL lives in one place: `VITE_EARLY_ACCESS_FORM_URL=https://form.typeform.com/to/GyoSjy9n` in the committed `apps/web/.env`, read by `CtaLink` — swapping the form later touches zero components. Build fails loudly if unset (same pattern as the Firebase env guard). Frontend-only; no functions, rules, or Firestore changes.
- We do **not** embed the Typeform widget (third-party script would hurt the performance budget and CSP posture); a plain link keeps the page dependency-free.
- CTA click still fires `early_access_cta_clicked` (with a `location` prop: nav / hero / final / strip) before navigation.
- The brief's post-submit success copy ("You're on the list…") should be configured **inside the Typeform's** thank-you screen — noted as a launch checklist item, not code.

### 1.3 SEO / metadata

- `apex.html`: new `<title>` — "Siapp — Client-facing project management with WhatsApp updates"; meta description per brief; canonical; OG + Twitter card tags; JSON-LD `SoftwareApplication` (name, description, operatingSystem: Web, offers: pre-release).
- OG image (1200×630): slate-indigo bg, wordmark, headline "Every client knows where their project stands." Static asset generated during build-out (design step below), stored `apps/web/public/og.png`.
- Note: apex is a SPA; the marketing route is the entry HTML, so tags in `apex.html` are correct and crawlable without SSR. FAQ section gets `FAQPage` JSON-LD injected statically in the HTML too.

---

## 2. Visual system (marketing layer)

All values as CSS custom properties in `marketing.css`, consuming `tokens.css` primitives:

- **Type scale** (`clamp()`-based, no JS breakpoint logic):
  - `--mk-hero`: clamp(2.25rem, 5.5vw, 4.5rem) / 1.05, Space Grotesk, -0.02em
  - `--mk-h2`: clamp(1.75rem, 3vw, 2.75rem)
  - `--mk-lede`: clamp(1.0625rem, 1.4vw, 1.1875rem)
  - Demo UI text: 13–14px; portal mockup body ≥16px
- **Layout**: `--mk-container: 72rem` (1152px ≈ brief's 1200); 12-col CSS grid on desktop sections; text measure capped at `65ch`.
- **Section rhythm**: `--mk-section-y: clamp(4rem, 10vw, 7.5rem)`.
- **Backgrounds alternate deliberately**: white → firm-cool `#F6F7F9` (problem/product) → portal-warm `#FAF8F5` (client portal section) → white → `--primary-deep` (final CTA). The page's background temperature *tells the story* of firm-side vs client-side.
- **Motion tokens**: `--mk-dur-fast: 180ms`, `--mk-dur: 320ms`, `--mk-dur-demo: 2400ms` total sequence; easing `cubic-bezier(0.22, 1, 0.36, 1)`. Every animation gated by `useReducedMotion` (instant state swaps when reduced).
- **Radius/shadow/borders**: reuse `--radius`, `--shadow-card`, `--shadow-raised`. Device frames get one bespoke deeper shadow.
- **Terracotta discipline**: accent appears only in — WhatsApp/notification moments, the active milestone marker, the demo "Mark task complete" success beat, one detail in the final CTA. Nowhere else.

---

## 3. Page build — section by section

Order, copy, and behavior follow the brief (sections 6–19) with these repo-specific implementation notes:

1. **Nav** — sticky, `backdrop-filter: saturate blur` over white, border-b on scroll. Links: Product, How it works, For construction, For legal, FAQ (anchor scroll, `scroll-margin-top` on targets). Primary CTA button always visible; mobile = disclosure menu (`<dialog>`-free, simple expanding panel, focus-trapped, `aria-expanded`). Logo: `siapp-logo-full` at h-7.
2. **Hero** — copy verbatim from brief §7. Two-column ≥1024px: copy 40–45%, product scene 55–60%. Scene = `HeroWorkflowDemo`: `DesktopWindow` (DemoTimeline, "The Vue Phase 2", Lim Builders) → connector path → `WhatsappBubble` → connector → `PhoneFrame` (DemoPortal, 64%, Aisha Rahman). "Mark task complete" is a real `<button>`; sequence per brief §7 (done-state → success tick → bubble slides in → 64→68% → new update row) over ~2.4s; autoplay once via `useAutoplayOnView`, replayable, `aria-live="polite"` announcement ("Task marked done. WhatsApp update sent. Portal progress now 68%."). Reduced motion: all five states apply instantly on click. Mobile: vertical stack task → bubble → portal, connectors become vertical.
3. **Problem** — warm off-white bg, three cards (copy per brief §8), closing statement as a large pull-quote-style line. No fear tone.
4. **How it works** — 3 steps (brief §9), connected by an inline SVG line that draws on scroll (`stroke-dashoffset`, IntersectionObserver; static when reduced-motion). Steps stack on mobile with a left rail line.
5. **Industry demo** — "One simple product. Built around the way your firm works." `IndustrySwitcher` = radiogroup (roving tabindex, arrow keys). Both states from `demoContent.ts` (construction: The Vue Phase 2 / 7 phases; legal: Conveyancing — 14 Jalan Maarof / 7 stages, copy per brief §10). Crossfade 320ms; layout heights matched to prevent CLS. Fires `industry_view_construction` / `industry_view_legal`.
6. **Client portal section** — wrapped in `[data-surface='portal']`. Large `PhoneFrame` with full portal anatomy (brief §11 list — matches what the real portal now ships: firm identity, progress, TimespanBar-style span, phase, milestone, updates, documents, WhatsApp button, "Powered by Siapp" footer). Desktop: phone is `position: sticky` while three supporting points scroll past; mobile: normal stack. Fires `client_portal_preview_viewed` on first intersection.
7. **Internal product section** — "Simple enough to start. Structured enough to trust." Wide `DesktopWindow` showing projects list + phase-grouped timeline; feature labels around it as annotated callouts (5 labels per brief §12). Realistic Malaysian data: Lim Builders, Tan & Partners, projects "Bungalow Renovation — Damansara Heights", "Fit-out — Menara UOA". Keep density low.
8. **Benefits** — three cards, copy per brief §13. No invented numbers.
9. **Differentiation** — four cards, copy per brief §14.
10. **"One update, three outcomes" strip** — compact 3-state stepper reusing `WhatsappBubble` + chips from the hero demo; click/hover/keyboard steps through Firm → WhatsApp → Portal states (brief §15). `role="tablist"` semantics or a simple stepped button group.
11. **Trust** — "Built for the way Malaysian firms already work." Six truthful points (brief §16) as a quiet two-column list with check marks; italic note re: early design partners. `TestimonialCard` component built and exported **but not rendered**.
12. **Final CTA** — `--primary-deep` background, reversed logo mark, headline + body per brief §17. Instead of an inline form: one large primary "Request early access" `CtaLink` to the Typeform plus supporting microcopy ("Takes under a minute. We will only use your information to contact you about Siapp."). Terracotta check-mark detail motif (echoing the logo's "p" counters).
13. **FAQ** — accordion, 7 Q&As verbatim from brief §18. Native-feeling disclosure: buttons with `aria-expanded` + `aria-controls`, chevron rotate, height animation (none under reduced motion). Fires `faq_opened` with question id.
14. **Footer** — compact per brief §19, including "Siapp is pronounced 'syap'." Links: Product/Construction/Legal/FAQ anchors, Privacy (placeholder route or mailto for now), Contact (mailto), LinkedIn placeholder.

---

## 4. Accessibility & performance gates

- WCAG AA sweep: semantic h1→h2→h3, focus-visible everywhere (already global), external-link CTAs announce they open in a new tab (visually-hidden text or icon + `aria-label`), 44px tap targets, status never color-only (chips keep text), alt text on all imagery, `prefers-reduced-motion` honored in every animation (global CSS kill-switch already exists; component logic must also skip JS-driven sequences).
- Performance budget: apex marketing chunk ≤ 150KB gz JS added; images as WebP/AVIF + SVG; lazy-load below fold; no third-party scripts; no video/WebGL; reserved dimensions on every async visual (CLS 0). Run Lighthouse locally: ≥95 perf/a11y/SEO on mobile throttling before ship.
- Bundle isolation: `node scripts/check-bundle-isolation.mjs` must stay green (no firm/admin modules in apex).

## 5. Analytics hooks

`lib/track.ts` — `export function track(event: TMarketingEvent, props?: Record<string, string>): void` (no-op + `import.meta.env.DEV` console.debug). Events wired: `early_access_cta_clicked` (with `location` prop), `product_demo_started`, `product_demo_completed`, `industry_view_construction`, `industry_view_legal`, `faq_opened`, `client_portal_preview_viewed`. Form-submission analytics live in Typeform. No cookie banner (nothing collected client-side).

## 6. Testing

- **Unit/component (Vitest + RTL)**: CtaLink renders Typeform href with `noopener noreferrer` + fires track with location; FaqAccordion keyboard + aria; IndustrySwitcher arrow-key roving + content swap; HeroWorkflowDemo state machine (click → all 5 state changes, reduced-motion instant path); track() called with right names.
- **Manual/browser**: Playwright pass at 375px / 768px / 1280px; keyboard-only walkthrough; VoiceOver spot check on hero demo; confirm Typeform opens in new tab.

## 7. Delivery plan (single feature branch, one PR)

| Step | Scope | Exit check |
| --- | --- | --- |
| 1 | Marketing scaffold: tokens, nav, footer, CtaLink + env-driven Typeform URL, section shells, SEO/OG in apex.html | typecheck + build + bundle isolation |
| 2 | Hero + workflow demo + demoContent fixtures | demo autoplay/replay/reduced-motion verified in browser |
| 3 | Problem / How-it-works / Benefits / Differentiation / Trust sections | responsive pass |
| 4 | Industry demo + portal section + "one update" strip | switcher a11y + CLS check |
| 5 | FAQ + final CTA | keyboard walkthrough |
| 6 | Polish: motion timing, Lighthouse, a11y sweep, OG image | full gate: `pnpm turbo run build lint typecheck test` + isolation script |

Launch checklist (outside code): confirm the Typeform (`https://form.typeform.com/to/GyoSjy9n`) collects work email, company, industry, optional team size, and set its thank-you screen to "You're on the list. We'll contact you when Siapp is ready for your firm."

Non-goals (explicitly deferred): in-app lead capture backend, admin leads viewer, real analytics provider, blog/pricing pages, i18n (BM copy), testimonials content, SSR/prerender.

## 8. Ten-second test (quality bar, brief §27)

Ship only if a first-time visitor can answer within one viewport + one scroll: what Siapp is, who it's for (MY construction/legal firms), the once→WhatsApp→portal loop, that it's simple, and how to get access. Calm confidence over spectacle; nothing fake anywhere on the page.

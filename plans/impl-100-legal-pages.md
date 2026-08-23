---
title: "Public legal pages on the marketing site (issue #100)"
status: draft
updated: 2026-08-22
issue: Siapp-Development/siapp#100
---

# impl-100 — Public legal pages + footer Privacy link

## Goal

Publish four public-facing legal documents on the **apex marketing surface**
(`siapp.app`) at **stable, human-navigable URLs**, and wire the marketing footer's
"Privacy" link to the new `/privacy` route. Two of the pages
(`/legal/campaign-privacy`, `/legal/sms-terms`) are referenced during **Twilio
phone-number / A2P campaign registration**, so their rendered output must preserve
the four carrier-mandated disclosures (mobile-number non-sharing, message-frequency
note, "message and data rates may apply", and STOP/HELP opt-out) that the drafts in
`/plans/legal/` already contain. The four drafts (`privacy-policy.md`,
`terms-and-conditions.md`, `campaign-privacy-policy.md`, `sms-messaging-terms.md`)
already exist and are the content source. This ticket is **frontend-only**: no
backend, Firestore, rules, or functions changes. It respects **D-036 / D-037**
(physical bundle isolation — apex must not import firm/admin code) and the
`impl-28` marketing conventions (function-component pages, named exports, Tailwind,
semantic landmarks, `prefers-reduced-motion`, TypeScript strict). Bilingual EN/BM
per `pm_ux/plans/14-legal-compliance.md` is a launch requirement tracked as an open
question, not delivered here.

---

## Rendering approach — decision

**Recommendation: hand-authored static TSX page components (one per document),
sharing a `LegalPageLayout`.** Content is transcribed from the `/plans/legal/`
drafts into semantic TSX (real `<h1>/<h2>/<h3>`, `<table>` with `<th scope>`,
lists, and cross-links as router `<Link>`s).

Why static TSX and **not** runtime markdown rendering, even though
`react-markdown@^10` already exists in `apps/web/package.json`:

- **GFM tables.** `privacy-policy.md` §2 and §6 are GitHub-flavoured markdown
  tables. `react-markdown` alone does **not** render them — it needs `remark-gfm`,
  which is **a new dependency** we were asked to avoid. Static `<table>` gives
  proper `<caption>`/`<th scope="col">` a11y with zero new deps.
- **Semantic + a11y control.** Landmarks, single-`h1` hierarchy, "opens in a new
  tab" affordances, and the draft banner are exact and testable in TSX.
- **Link rewriting.** Drafts link to sibling `./*.md` files and to an internal
  `pm_ux/plans/14-legal-compliance.md` doc; TSX lets us map cross-links to routes
  and drop the internal planning link cleanly.
- **Bundle weight.** Keeps the low-traffic legal pages out of any markdown runtime;
  they lazy-load as a tiny text chunk.

The `/plans/legal/*.md` drafts remain the **counsel-review source of truth**; the
shipped TSX must be verified against them (see Test plan → transcription diff). The
`react-markdown`-based alternative is documented under Risks for the reviewer.

---

## Touched surfaces & files

Surface: **apex only** (`siapp.app`). No dashboard/admin/portal/collab changes.

### Create

- `apps/web/src/surfaces/marketing/legal/legalRoutes.ts`
  Single source of route path constants + page titles:
  `LEGAL_PATHS = { privacy: '/privacy', terms: '/terms', campaignPrivacy: '/legal/campaign-privacy', smsTerms: '/legal/sms-terms' }`.
  Referenced by the router, the footer, the layout cross-links, and tests.
- `apps/web/src/surfaces/marketing/legal/LegalPageLayout.tsx`
  Shared chrome for all legal pages: `SkipLink`, a **minimal** top bar (Siapp
  wordmark linking `to="/"` — **not** `MarketingNav`, whose `#anchor` links only
  work on the home page), `<main id="main">` with a readable `max-w-[65ch]`
  container, an optional draft-notice slot, a "Last updated" line, and a slim
  footer listing all four legal pages + Contact. Named export
  `LegalPageLayout({ title, updated, draft, children })`. Tailwind styling for
  headings/paragraphs/lists/tables applied via component classes (no
  `@tailwindcss/typography` dependency assumed).
- `apps/web/src/surfaces/marketing/legal/LegalDraftNotice.tsx`
  Reusable "Draft — pending legal review" callout (`role="note"`), shown when a
  page passes `draft`. Gives the visibly-draft treatment.
- `apps/web/src/surfaces/marketing/legal/PrivacyPolicyPage.tsx` — transcribes
  `privacy-policy.md` (incl. §2 and §6 as real `<table>`; §4 preserves the four
  Twilio disclosures verbatim). Named export `PrivacyPolicyPage`.
- `apps/web/src/surfaces/marketing/legal/TermsPage.tsx` — transcribes
  `terms-and-conditions.md`. Named export `TermsPage`.
- `apps/web/src/surfaces/marketing/legal/CampaignPrivacyPage.tsx` — transcribes
  `campaign-privacy-policy.md` (Twilio-referenced). Named export
  `CampaignPrivacyPage`.
- `apps/web/src/surfaces/marketing/legal/SmsTermsPage.tsx` — transcribes
  `sms-messaging-terms.md` (Twilio-referenced). Named export `SmsTermsPage`.
- Tests:
  - `apps/web/src/surfaces/marketing/legal/LegalPages.test.tsx`
  - `apps/web/src/surfaces/marketing/components/MarketingFooter.test.tsx`

### Modify

- `apps/web/src/routes/apexRouter.tsx` — add the four legal routes (lazy, grouped
  chunk) **before** the `{ path: '*' }` catch-all; each with
  `HydrateFallback: LoadingFallback` and `errorElement: <RouteErrorFallback surface="apex" />`.
- `apps/web/src/routes/apexRouter.test.tsx` — add cases asserting each legal path
  renders its `h1`.
- `apps/web/src/surfaces/marketing/components/MarketingFooter.tsx` — add **Privacy**
  (`LEGAL_PATHS.privacy`) and **Terms** (`LEGAL_PATHS.terms`) items to the footer
  nav using react-router `Link` (import `Link` from `'react-router'`). Existing
  `#anchor` and Typeform links unchanged.

### No change required

- `firebase.json` — the apex hosting target already rewrites `**` → `/index.html`,
  so `/privacy`, `/terms`, `/legal/campaign-privacy`, `/legal/sms-terms` all resolve
  to the SPA and return 200 at stable URLs. **Builder must still verify** no
  `robots.txt`/`sitemap.xml` exists in `apps/web/public/` (currently only
  `favicon.png`, `og.png`) — if one is later added, include the four legal URLs.

---

## Data model changes

**None.** No Firestore collections/fields, no `firestore.rules`, no indexes, no
Cloud Functions, no Storage. These are static content routes. Multi-tenant
workspace isolation and security rules are untouched. **D-036/D-037 bundle
isolation is preserved**: all new modules live under `src/surfaces/marketing/**`
and import only `@/components/*`, `@siapp/ui`, `react`, and `react-router` — no
`src/surfaces/firm/**` or `src/surfaces/admin/**` imports. `node
scripts/check-bundle-isolation.mjs` must stay green (the legal routes are additive
lazy chunks; the `/p` and `/t` dynamic-entry assertions are unaffected).

---

## Steps

1. **Route constants.** Create `legal/legalRoutes.ts` exporting `LEGAL_PATHS` and a
   `LEGAL_LINKS` array (`{ label, path }`) for the layout/footer to map over.
2. **Shared layout + draft notice.** Build `LegalPageLayout.tsx` and
   `LegalDraftNotice.tsx`. Layout: `SkipLink` → minimal logo-home bar → `<main
   id="main">` with `<h1>{title}</h1>`, "Last updated" line, `draft` notice slot,
   `{children}`, then the slim four-link + Contact footer. Ensure exactly one `h1`
   per page (page body uses `h2`/`h3` only). Verify focus-visible + 44px tap
   targets on links.
3. **Transcribe the four pages.** For each draft, create the page component that
   renders the body inside `LegalPageLayout`. Rules:
   - Copy body text **verbatim**; do not paraphrase legal wording.
   - Render markdown tables as `<table>` with a `<caption>` (or preceding heading)
     and `<th scope="col">` header cells.
   - Convert sibling `.md` cross-links to router `<Link>`s via `LEGAL_PATHS`
     (`./privacy-policy.md`→`/privacy`, `./terms-and-conditions.md`→`/terms`,
     `./campaign-privacy-policy.md`→`/legal/campaign-privacy`,
     `./sms-messaging-terms.md`→`/legal/sms-terms`).
   - **Drop** the internal `pm_ux/plans/14-legal-compliance.md` link from public
     copy.
   - Pass `updated="22 August 2026"` and `draft={true}` (see open question on draft
     handling before final ship).
   - Preserve, word-for-word, the four Twilio disclosures in `CampaignPrivacyPage`,
     `SmsTermsPage`, and `PrivacyPolicyPage §4`: (a) non-sharing statement, (b)
     "message frequency varies", (c) "Message and data rates may apply", (d)
     STOP/HELP opt-out.
4. **Router wiring.** In `apexRouter.tsx`, add four `lazy` route objects (grouped
   so Vite emits one shared `legal` chunk), placed before `{ path: '*' }`, each
   with `HydrateFallback: LoadingFallback` and the apex `errorElement`.
5. **Footer wiring.** In `MarketingFooter.tsx`, import `Link` from `'react-router'`
   and add **Privacy** → `LEGAL_PATHS.privacy` and **Terms** → `LEGAL_PATHS.terms`
   list items to the footer nav (client-side navigation, no `#`/external attrs).
6. **Transcription verification.** Diff each shipped page's visible text against its
   `/plans/legal/*.md` draft; confirm no clause — especially the Twilio four — was
   dropped or altered.
7. **Gates.** Run `pnpm turbo run build lint typecheck test` and
   `node scripts/check-bundle-isolation.mjs`; confirm all green and that each legal
   URL loads at `siapp.app/...` in a local `firebase emulators` / preview build.

Each step is independently verifiable (typecheck/build/test after 4–6; manual URL
load after 7).

---

## Test plan (for Tester)

Vitest + React Testing Library, matching `apexRouter.test.tsx` patterns
(`createMemoryRouter(apexRoutes, { initialEntries: [...] })`).

- **Routing** (`apexRouter.test.tsx`): each of `/privacy`, `/terms`,
  `/legal/campaign-privacy`, `/legal/sms-terms` renders its expected `h1`; unknown
  paths still hit `NotFoundScreen`.
- **Structure / a11y** (`LegalPages.test.tsx`): each page renders exactly one
  `role="heading" level={1}`, a `role="main"` landmark, and a home/back link; the
  draft notice (`role="note"`) is present while `draft`.
- **Twilio-compliance guard** (critical): assert the rendered
  `CampaignPrivacyPage` and `SmsTermsPage` (and `PrivacyPolicyPage`) contain the
  required strings — a non-sharing phrase (`/do not share, sell, rent/i`),
  `/message frequency varies/i` (or "frequency varies"),
  `/message and data rates may apply/i`, `/STOP/`, and `/HELP/`. This test exists
  specifically to fail if a future edit deletes a carrier-mandated clause.
- **Tables** (`PrivacyPolicyPage`): the §2 data table renders as a `table` with
  column headers (`role="columnheader"`).
- **Footer** (`MarketingFooter.test.tsx`): renders a "Privacy" link with `href`
  `/privacy` and a "Terms" link with `href` `/terms`; existing anchor/Typeform
  links unaffected.
- **Isolation**: `node scripts/check-bundle-isolation.mjs` stays green (CI step, not
  a unit test).

---

## Out of scope

- Bilingual **BM** translations (ships EN only; BM is a plan-14 launch requirement —
  see open questions).
- Filling `[●]` placeholders / obtaining counsel-approved final legal text.
- Any backend, Firestore, rules, functions, or Storage change.
- Legal pages on dashboard/admin/portal/collab surfaces; in-app consent/DPA flows.
- Cookie/consent banner, analytics on legal pages.
- SSR/prerendering, sitemap.xml/robots.txt generation (noted as conditional check
  only).
- Changing the existing footer `#anchor` or Typeform links.

---

## Risks / open questions (need a human/counsel call)

1. **Draft status vs Twilio review (highest priority).** The two Twilio-referenced
   pages (`/legal/campaign-privacy`, `/legal/sms-terms`) still contain `[●]`
   placeholders and "DRAFT — not legal advice" banners. A2P reviewers typically
   **reject** incomplete/placeholder policies. **Recommendation:** before A2P
   submission, fill the concrete values these pages need — support email, support
   phone, company registration no., registered address, hosting region, retention
   periods, DPO/privacy email — and remove the "DRAFT" banner on those two pages.
   `/privacy` and `/terms` may remain visibly draft pending counsel. **Question:**
   who provides the placeholder values, and do we hold the two Twilio pages until
   they're final, or ship visibly-draft?
2. **Bilingual EN/BM.** `pm_ux/plans/14-legal-compliance.md` requires BM+EN before
   launch. This ships EN only. Is EN-only acceptable for initial A2P registration,
   with BM added later?
3. **Search indexing of draft legal text.** Should draft pages carry
   `noindex`? Recommend `noindex` until counsel-approved (Twilio's human reviewer
   opens the direct URL, so it's unaffected). Note the SPA can't emit per-route
   robots meta before JS runs — decide whether a `document`-level effect is enough
   or whether it's deferred.
4. **SPA rendering for automated crawlers.** Apex is a client-rendered SPA
   (`**`→`index.html`). Twilio A2P review is human-in-browser, so content renders
   fine; a non-JS automated fetch would see an empty shell. Prerender/SSG is out of
   scope — flag if Twilio's tooling requires static HTML.
5. **Footer scope.** Issue #100 names only the "Privacy" link. Recommend adding
   **Terms** alongside it for completeness; confirm that's wanted.
6. **Entity name.** Drafts cite "Siapp Sdn Bhd (Company No. `[●]`)" — confirm the
   registered entity/number before these become public.
7. **Rendering approach sign-off.** Plan recommends static TSX (avoids a new
   `remark-gfm` dep for the privacy tables and gives full a11y control). If the
   reviewer prefers single-source markdown via the existing `react-markdown`, that
   path requires adding `remark-gfm`, frontmatter stripping, and a link-rewrite
   `components` map, and copying the `.md` into `apps/web/src` — confirm the
   trade-off.

---
title: "Brand Identity & Narrative"
status: draft
updated: 2026-07-12
---

# Brand Identity & Narrative

Brand is a forcing function on every customer touchpoint — pitches, the app UI, WhatsApp templates, the client portal. Decide the spine now; details evolve.

## Name

**Siapp** — pronounced *syap*. Built from *siap* (Malay/Manglish for "done, ready, complete") + *app*, collapsed at the shared "ap." Five letters; one syllable; both meanings in a single word.

The brand *is* the user moment. Every time a firm closes a task or a collaborator marks an update, that small satisfaction of *siap* — finished, off the plate — is the feeling we sell. Naming the product after that feeling makes the marketing write itself.

- **Primary domain:** `siapp.app` (the TLD doubles the *siap + app* pun — brand and URL collapse into the same word)
- **Secondary domain:** `siapp.my` (local trust, MY-localized landing)
- **Defensive:** `siapp.io`
- **`siapp.com` status:** owned by a third party (parked/squatter). Decision: do not pursue unless it surfaces at <~$2k. See [D-024](./decisions-log.md#d-024--siapp-brand) for full rationale.
- **Brand name:** Siapp (always one capital S, double-P — never "SiApp" or "siap")
- **Pronunciation gloss in copy on first mention:** *Siapp (syap)* or *Siapp — rhymes with "yap."*
- **Company:** Siapp Sdn Bhd (at incorporation)

Checks before launch:
- [ ] MY trademark search (MyIPO Class 9 + 42) — invented spelling, distinctive mark, expected clean
- [ ] SG trademark search (IPOS) for Year 2 expansion
- [ ] Register domain stack: `siapp.app`, `siapp.my`, `siapp.io`
- [ ] Set a watch on `siapp.com` (drop-catch + Sedo listing alerts)
- [ ] Social handles: `@usesiapp` (preferred) or `@siappapp` (LinkedIn, X, IG, FB, TikTok)
- [ ] WhatsApp BSP display-name: "Siapp" or "[FirmName] via Siapp"

**Why this name works:**
- **Invented spelling = registrable mark.** Trademark counsel will have an easier time defending "Siapp" than any geographic or descriptive term.
- **Names the feeling, not the founder.** The product's emotional payoff *is* the brand name.
- **Cultural depth without a cultural tax.** Carries Malay meaning for local users; reads as a clean modern brand to anyone else (same phonetic family as Snap, Slack, Zapp).
- **Domain math is open.** Five-letter invented spellings rarely have squatters; `siapp.app` + `siapp.my` stack is achievable at retail price (<$120/yr total). (`siapp.com` is taken; not pursued — see [D-024](./decisions-log.md#d-024--siapp-brand).)
- **Verb-shaped.** "Mark it siapp." "Get the build siapp." Customers will use it as a verb without prompting.

## Brand promise (one sentence)

> **"Every client knows where their project stands, every week, without you having to type it."**

Read at the homepage hero, on the pricing page, and in the first WhatsApp template a client receives.

## Brand pillars

| Pillar | What it means in product/marketing |
|---|---|
| **Calm** | The client portal is restful, not noisy. WhatsApp messages are short and specific, never marketing-flavored. |
| **Confident** | We use direct language. No "powered by AI synergy." We say what it does. |
| **Local** | English at v1, BM by v1.5 (D-026); MYR-first pricing; references to MY contexts (CIDB, conveyancing) feel native from day one. |
| **Professional** | The firm looks better to its client because Siapp exists. Branding leans serious, not playful — the "siapp" satisfaction is quiet, not a high-five. |

## Voice & tone

- **Voice (constant):** straightforward, knowledgeable, respectful of the reader's time.
- **Tone (varies):**
  - To firms: peer-to-peer, business-pragmatic. ("Stop the Saturday spreadsheet.")
  - To clients (on portal & WhatsApp): warm, factual, action-oriented. ("Your roof installation is complete. Next: ceiling works, expected by 18 Jul.")
  - To partners: institutional, plain, low on jargon.

Forbidden words/phrases (default ban): "revolutionary," "synergize," "delight," "AI-powered" (use only when literally true and necessary).

## Visual direction (draft brief for a designer)

- **Logo:** wordmark first. Lean into the **double-P** — let the twin uprights read as twin checkmarks, twin pillars, or two "siap stamps" sitting next to each other. Any glyph mark must survive at 16px and remain legible in monochrome on WhatsApp avatars.
- **Palette:**
  - Primary: deep, trustworthy (think indigo or slate blue — not corporate navy, not tech purple).
  - Accent: warm, human (terracotta or amber) used sparingly for status/success.
  - Neutrals: high-contrast greys for data density on the firm side; softer warm-greys for the client portal.
  - **Finalized v1 hexes (2026-07-13, D-039):** primary slate-indigo `#3E4C77`, accent terracotta `#C4553D`, warning amber `#B8860B`, success `#2E7D4F`, danger `#B3372F`; cool neutrals (firm) `#101321`→`#F7F8FA`, warm neutrals (portal) `#2A2622`→`#FAF8F5`. Source of truth: `packages/ui` tokens + [decisions-log.md](./decisions-log.md).
- **Typography:**
  - UI: a clean grotesque (Inter, Geist, or similar) — strong at small sizes for table-heavy firm UI.
  - Display: same family at heavier weight, no second face. Keep load light.
- **Iconography:** simple, single-stroke. No 3D, no isometric illustrations.
- **Photography (marketing only):** real MY job sites, real lawyer desks. No global stock photos of people in suits high-fiving.

## Two distinct UI personalities

| Surface | Personality | Why |
|---|---|---|
| Firm app | Dense, neutral, keyboard-friendly, dark-mode capable | PMs live in it 8 hours/day |
| Client portal | Spacious, warm, summary-first, mobile-default, light-mode default | Clients visit briefly, need instant orientation |

Designing these as two products is intentional and a differentiator.

**Clarification (2026-07-12):** two personalities ≠ two design systems. Both surfaces share one component library, one semantic token schema, one type family, one icon set, and one interaction grammar; the personalities are expressed as two *theme + density* value sets on the same system. The internal Siapp Admin surface (Z1–Z3) does **not** get a third personality — it rides the firm theme with a visible "Siapp Admin" environment marker. See [23-design-system-research.md](./23-design-system-research.md) for the token/theming model.

## Brand presence in product

- **MVP (single tier):** "Powered by Siapp" footer is **always shown** on the client portal and the collaborator task page. Firm's logo + name dominate the header; Siapp branding sits as a small footer link. No white-label, no custom domain, no per-tier branding differentiation in MVP. See [D-030](./decisions-log.md).
- **Post-MVP (when tiering ships):** "Powered by Siapp" footer remains on Standard. Business+ unlocks full white-label client portal (firm domain, no Siapp footer). Scale+ adds custom WhatsApp sender (firm's number).

The post-MVP plan monetizes brand visibility while preserving the PLG client distribution loop on lower tiers. MVP intentionally keeps all firms on the same surface to validate the wedge before introducing differentiation.

## Story (the version we tell investors / partners / hires)

Two firms — a builder in Selangor and a law firm in KL — independently described the same Friday-night ritual: copying status into a spreadsheet, then typing the same updates into eight WhatsApp groups, then waking up Saturday to do it again. Their clients still escalated. Their PMs still burned out. Their reputations still suffered the inevitable delays they couldn't surface in time.

There is no product priced and shaped for them. Procore is for someone ten times their size. Asana doesn't know what a client is. Clio doesn't speak WhatsApp. The Sheets template is what's left.

Siapp is the product that should exist: a project tracker built around the client's experience, sending the right WhatsApp message at the right moment, priced for an SME owner who decides over coffee. It starts with two verticals in Malaysia and grows into the way SEA firms keep their clients in the loop — every closed task a small *siapp*.

## Brand decisions to finalize (with deadlines)

| Decision | Owner | Due |
|---|---|---|
| Domain stack acquisition (`siapp.app`, `siapp.my`, `siapp.io`) + watch on `siapp.com` | Founder | Month 0 (before pre-launch) |
| MyIPO trademark filing on "Siapp" (Class 9 + 42) | Founder + IP counsel | Month 1 |
| Logo + 1-page brand guide | Contract designer | Month 1 |
| Pick primary tagline from candidates | Founder + design partners | Month 3 |
| Bahasa Malaysia editorial style guide | Bilingual writer | v1.5 prep (post-launch; English-only at v1 per D-026) |
| WhatsApp message tone library (10 templates × 2 languages) | Founder + writer | Month 3 |

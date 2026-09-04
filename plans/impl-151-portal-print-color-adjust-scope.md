# Impl Plan — Issue #151: Scope portal print `print-color-adjust` off the universal `*` selector (fix slow iOS Print)

## Goal
The client portal's Print action (`window.print()`, D-042 / #126) is slow on iOS because `packages/ui/src/styles/globals.css` applies `-webkit-print-color-adjust: exact; print-color-adjust: exact` to a **universal `*` selector** inside `@media print`. Flagging every node as "must preserve backgrounds exactly" defeats WebKit/iOS Safari's background-dropping print optimization for the entire rasterized tree, which matches the iOS-only symptom. This plan scopes that rule to only the client portal's print-only DOM subtree so WebKit can drop backgrounds on the (large) majority of boxes while still printing the handful of meaning-bearing colored elements. Surface affected: client portal `siapp.app/p/*` (D-036); the shared `@siapp/ui` stylesheet is edited but the change is behaviourally scoped to the portal print layout. Bundle isolation (D-036/D-037) is unaffected — no cross-surface imports are added.

## Recommended selector strategy (and why it is the safest)
**Scope the exact-color rule to the print-only container subtree**, not to individual elements:

1. Add a stable, style-free marker class `print-layout` to the print-only container `<div>` in `apps/web/src/surfaces/portal/print/PortalPrintLayout.tsx` (currently `className="hidden print:block"` → `className="print-layout hidden print:block"`). `print-layout` is a hand-authored marker with **no** Tailwind utility of the same name, so it has **zero** screen effect.
2. In `packages/ui/src/styles/globals.css`, replace the universal rule with a container-scoped rule:
   ```css
   /* was:  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } */
   .print-layout,
   .print-layout * {
     -webkit-print-color-adjust: exact;
     print-color-adjust: exact;
   }
   ```

### Why this over the fully-surgical per-element approach
The issue floated a "better" option: mark only the timeline bar spans and status chips. Investigation shows the print DOM contains **three** distinct meaning-bearing colored backgrounds, not two:
- **Timeline status bars** — `span` in `PortalTaskTimeline.tsx` (~lines 181–193) using `BAR_STATUS_CLASSES` (`bg-success` / `bg-accent` / `bg-warning` / `bg-primary` / `bg-slate-300`).
- **Status chips** — the `Badge` component (`packages/ui/src/components/Badge.tsx`) rendered by `PortalTaskList.tsx` (line 75) with tint variants (`bg-success-tint`, `bg-danger-tint`, `bg-warning-tint`, `bg-primary-tint`, `bg-muted`). `Badge` has **no single stable class** (it is a `cva` base string + per-variant classes), so a selector would have to match Tailwind utility classes or a newly-added marker.
- **"Blocked by virus scan" chip** — an inline `span` with `bg-destructive/10` in `PortalDocumentsSection.tsx` (line 152). This renders in the **static (print) list** and is easy to miss in an enumeration.

Because meaning-bearing colored backgrounds are spread across three components (and future portal chips could add more), a per-element allow-list is fragile: missing one silently drops its color in print, breaking the accessibility invariant with no compile-time signal. The container-scoped rule **guarantees every current and future colored background inside the print layout survives**, removes the whole-page `*` regression (the actual root cause), touches one component file + the stylesheet, and stays trivially reviewable. It is the best safety/perf/simplicity balance. Perf still improves substantially: `exact` no longer applies to the always-mounted screen dashboard duplicate, the app shell, modals, marketing, admin, or firm surfaces — only to the bounded one-project landscape summary subtree.

## Touched surfaces & files
- **Client portal (`siapp.app/p/*`)** print output only.
- Modify `apps/web/src/surfaces/portal/print/PortalPrintLayout.tsx` — add `print-layout` marker class to the root print container `<div>` (line 46).
- Modify `packages/ui/src/styles/globals.css` — replace the `@media print { * { … } }` block (~lines 175–178) with the `.print-layout, .print-layout *` rule. Keep the surrounding `@page { size: landscape; margin: 12mm; }` and `html, body { background: #ffffff !important; }` rules and the explanatory comment (update the comment to note the rule is now scoped to `.print-layout`).

No changes to `PortalTaskTimeline.tsx`, `PortalTaskList.tsx`, `Badge.tsx`, or `PortalDocumentsSection.tsx` are required for the primary fix.

## Data model changes
None. No Firestore collections, fields, indexes, or `firestore.rules` changes. Multi-tenant workspace isolation is untouched.

## Steps
1. In `apps/web/src/surfaces/portal/print/PortalPrintLayout.tsx`, change the root container `className` from `"hidden print:block"` to `"print-layout hidden print:block"`. (Marker only; ordering irrelevant; no visual change on screen.)
2. In `packages/ui/src/styles/globals.css`, inside the existing `@media print { … }` block, replace the universal `*` rule with:
   ```css
   .print-layout,
   .print-layout * {
     -webkit-print-color-adjust: exact;
     print-color-adjust: exact;
   }
   ```
   Update the adjacent comment to state the rule is scoped to the portal print-only subtree (fixes iOS print perf, #151) while still forcing meaning-bearing backgrounds (timeline bars, status chips, virus-scan chip) to print.
3. Verify no other surface relies on the removed global `*` print rule: the only print feature in the product is the D-042 portal print layout (`window.print()`), so removing the global rule does not regress firm/admin/marketing printing. (See Risks — Tester/Validator to confirm.)
4. Manual/QA verification on iOS Safari: open a portal project, tap Print, confirm (a) the print preview generates noticeably faster and (b) timeline bars, status chips, and any "Blocked by virus scan" chip still render their fill colors in the preview/PDF.
5. Confirm the on-screen dashboard is visually identical before/after (the `print-layout` marker and the scoped rule have no screen effect).

## Test plan (for Tester)
- **Component test** — render `PortalPrintLayout` and assert the root print container element carries both the `print-layout` marker class and the existing `hidden print:block` classes (guards against accidental removal of the scoping hook that the CSS depends on).
- **Component test (invariant anchors)** — assert that within the print layout: timeline bars still receive their `BAR_STATUS_CLASSES` background utility, `PortalTaskList` still renders `Badge` chips with variant classes, and the `bg-destructive/10` virus-scan chip still renders when `scanStatus === 'infected'`. These lock the DOM structure the scoped selector depends on so a future refactor that moves colored elements outside `.print-layout` is caught.
- **No new rules tests** — no `firestore.rules` change.
- **Snapshot/screen regression (optional, lightweight)** — assert `PortalProjectPage`'s screen tree is unchanged (the marker is print-only).
- CSS itself is not unit-testable here; rely on the DOM-anchor component tests above plus the manual iOS verification in Steps 4–5. Validator to run build/lint/typecheck/test and confirm no bundle-isolation regressions.

## Out of scope (deliberately)
- **The DOM-duplication / 2× Firestore listener issue — recommended as a SEPARATE follow-up issue, NOT this PR.** `PortalPrintLayout` is mounted unconditionally in `PortalProjectPage.tsx` (lines 68–74) alongside the screen dashboard. It wraps `PortalUpdatesSection` and `PortalDocumentsSection`, which call `usePortalUpdates` / `usePortalDocuments` — each opening its own Firestore `onSnapshot`. Because the same sections also render in the screen tree, the portal opens **two** sets of listeners per project view (extra reads + a second full copy of the project in the DOM). This is real, but it is **not** the iOS print-perf root cause, and fixing it properly is non-trivial: it needs either conditional mounting driven by `beforeprint`/`afterprint` (with care that data is loaded before the print dialog opens) or lifting the updates/documents data into shared hooks passed down as props to both trees. That refactor carries its own timing/regression risk and would bloat this PR. **Recommendation: keep this PR surgical (CSS scope only) and file a follow-up issue for the listener duplication.**
- No changes to timeline math, status derivation, Badge variants, or portal data model.
- No server-side PDF (explicitly excluded by D-042).
- No changes to firm/admin/marketing print behaviour beyond removing the shared universal rule they were not using.

## Risks / open questions
- **Shared stylesheet blast radius.** `globals.css` is in `@siapp/ui` and imported by every surface, so the current `*` rule technically applied to all surfaces' print output. No other surface has a print feature (D-042 is the only one), so removing the global rule should be safe — but Tester/Validator should confirm no firm/admin view depends on `print-color-adjust: exact` for a background it prints. If one is later found, it gets its own scoped marker rather than restoring the global `*`.
- **Marker-class coupling.** The fix depends on the `print-layout` class staying on the print container. The component test in the Test plan guards this. If the print DOM is ever refactored to render colored elements outside the `.print-layout` subtree, their print colors would drop — the invariant-anchor tests are designed to catch that.
- **Residual iOS cost.** Scoping to `.print-layout *` still applies `exact` to every node inside the bounded one-project summary. If profiling shows this is still too slow for very large projects, the next step (a follow-up) would be the fully-surgical per-element markers — but that trades safety for speed and should only be taken with measurement in hand.
- **Open question (human call):** Is the DOM-duplication / double-listener follow-up worth prioritising now (read-cost + correctness) or can it wait? This plan assumes it is deferred to a separate issue.

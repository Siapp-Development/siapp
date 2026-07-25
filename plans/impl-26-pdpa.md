---
title: "Implementation plan — #26 PDPA compliance — consent capture + deletion endpoint"
status: draft
updated: 2026-07-24
---

# Implementation plan — #26 PDPA compliance — consent capture + deletion endpoint

## Goal

Make Siapp's handling of client/collaborator personal data PDPA-aligned before real client data flows, per [pm_ux/plans/11-mvp-scope.md](../pm_ux/plans/11-mvp-scope.md) ("PDPA-aligned data handling — consent capture, deletion request endpoint") and [pm_ux/plans/14-legal-compliance.md](../pm_ux/plans/14-legal-compliance.md). Three deliverables: (1) **consent capture** — a firm-attested WhatsApp/SMS-notification consent record on client and collaborator docs, captured in the firm CRUD forms, logged with timestamp/actor/language/copy-version as Meta and PDPA require, and **enforced** in the notification enqueue pipeline (new `no_consent` suppression); (2) a **deletion endpoint** — an owner/admin-only callable `deletePersonalData` that anonymizes a client/collaborator in place, strips PII from denormalized copies and queue records, revokes magic links, and writes a request + fulfilment audit trail; (3) a **data-handling review** against 14-legal-compliance.md (checklist below, code gaps closed here, non-code items flagged).

This is the erasure half of PDPA; #25 `exportProject` (just shipped on this branch) is the portability half — this plan reuses its callable conventions (claims gating, mirrored types, log-and-continue audit writes). Consistent with D-035 (outbound-only messaging; `notificationsOptOut` reserved for the STOP webhook) and D-027/D-029 (audit-preserving deletion posture). No logged decision is contradicted.

## Acceptance criteria mapping

| Issue criterion | Where it lands |
|---|---|
| Consent capture for clients/collaborators (WA notification consent) | `waConsent` field on client/collaborator docs, written from `ClientForm`/`CollaboratorForm` attestation checkbox (rules-validated); `consent_updated` audit entries via the existing `onClientWrite`/`onCollaboratorWrite` diff triggers; `enqueueNotifications` suppresses `no_consent` when absent; publish-preview `countWaRecipients` counts only consented recipients |
| Deletion request endpoint + fulfilment flow | `deletePersonalData` callable (owner/admin): anonymize person doc + denorms + message-queue PII, revoke magic links; writes `pdpa.delete_request` + `pdpa.delete_fulfilled` audit entries; firm UI dialog on both list pages |
| Data-handling review against 14-legal-compliance.md | Review table in this plan (§ Data-handling review); code gaps are in scope, legal/document gaps flagged as out of scope with owners |

**Explicitly deferred to #19/#20:** actual WhatsApp/SMS dispatch, the Twilio inbound webhook, STOP-keyword processing (the thing that *sets* `notificationsOptOut`), the in-template "Reply STOP" opt-out footer, and the once-per-24h auto-reply. This ticket only guarantees that when #19 starts sending, non-consented and opted-out recipients are already suppressed at enqueue time.

## Touched surfaces & files

**Surfaces:** firm app (`dashboard.siapp.app`) forms/lists + dialog; client portal (`siapp.app/p/*`) footer notice; collaborator page (`siapp.app/t/*`) footer notice; backend functions; rules. Marketing apex and admin bundles untouched. The portal/collab changes are static text — no new imports crossing bundles; `scripts/check-bundle-isolation.mjs` must stay green (D-036).

Create:

- `backend/functions/src/lib/pdpa.ts` — pure helpers: `hasWaConsent(data)`, `buildAnonymizedClientFields()` / `buildAnonymizedCollaboratorFields()` (field-level erasure payloads incl. `FieldValue.delete()` markers), `redactMessagePii(messageData, subjectPhone, subjectName)`. Pure where possible (unit-testable without emulators, same convention as `optOut.ts` / `phoneIndex.ts`).
- `backend/functions/src/lib/pdpa.test.ts`
- `backend/functions/src/callables/deletePersonalData.ts` — the callable (see Design). Mirrors `exportProject.ts` posture: `requireOwnerAdminClaims`-style claims check before any read, NodeNext `.js` imports, local type mirrors (functions cannot import `@siapp/shared`).
- `backend/functions/src/callables/deletePersonalData.test.ts` — pure-helper + auth tests.
- `apps/web/src/surfaces/firm/pdpa/DeletePersonalDataDialog.tsx` (+ `.test.tsx`) — typed-confirmation dialog shared by the clients and collaborators list pages; owner/admin only.
- `backend/rules-tests/src/pdpa.rules.test.ts` — consent-field write validation + erased-doc lockdown (or extend the existing clients/collaborators rules spec if the Builder prefers; either way the cases in the Test plan must exist).

Modify:

- `packages/shared/src/enums.ts` — `TSuppressedReason` + `'no_consent'`; `TAuditAction` + `'client.consent_updated' | 'collaborator.consent_updated' | 'pdpa.delete_request' | 'pdpa.delete_fulfilled'`; new `TConsentMethod = 'firm_attested'` (union of one, widened later when portal-confirmed consent lands).
- `packages/shared/src/firestoreTypes.ts` — `IWaConsent` interface; `waConsent?: IWaConsent` and `pdpaErased?: { requestedBy: string; at: Date }` on `IClientDoc` and `ICollaboratorDoc`.
- `packages/shared/src/callableTypes.ts` — `IDeletePersonalDataRequest` / `IDeletePersonalDataResponse`.
- `backend/functions/src/lib/activityDiff.ts` (+ test) — extend the local `TAuditAction` mirror; when a client/collaborator diff touches **only** `waConsent`, emit `*.consent_updated` instead of the generic `*.update` (before/after limited to the consent object).
- `backend/functions/src/lib/enqueueNotifications.ts` (+ test) — client recipients without `waConsent.granted === true` → `suppressed: true, suppressedReason: 'no_consent'` (see precedence in Design).
- `backend/functions/src/lib/optOut.ts` (+ test) — `countWaRecipients` counts a recipient only when consented **and** not opted out (publish-preview accuracy).
- `backend/functions/src/index.ts` — export `deletePersonalData`; header comment line.
- `firestore.rules` — clients/collaborators create/update allowlists gain `waConsent` (with shape validation); `pdpaErased` is server-only (merged-doc allowlist only, like `notificationsOptOut`); all firm updates denied once `pdpaErased` is set.
- `apps/web/src/surfaces/firm/clients/ClientForm.tsx` (+ list-page test), `useClients.ts` — consent checkbox + attestation copy; write/clear `waConsent`.
- `apps/web/src/surfaces/firm/collaborators/CollaboratorForm.tsx`, `useCollaborators.ts` — same.
- `apps/web/src/surfaces/firm/clients/ClientsListPage.tsx` (+ test) and `apps/web/src/surfaces/firm/collaborators/CollaboratorsListPage.tsx` (+ test) — consent badge (alongside the existing opt-out badge), "Delete personal data" action wired to the dialog (owner/admin only).
- `apps/web/src/lib/callables.ts` (+ test) — typed `deletePersonalData` wrapper.
- `apps/web/src/surfaces/portal/PortalFooter.tsx` (+ test) — privacy notice line (D5).
- `apps/web/src/surfaces/collab/CollabTaskPage.tsx` (+ test) — same notice line at page bottom (no footer component exists on /t today; a plain `<footer>` element inline is enough).
- Optional, documentation-only: `pm_ux/plans/firestore-data-model.md` — add `waConsent`/`pdpaErased` to the client/collaborator doc listings.

## Data model changes

New fields — **no new collections**; multi-tenant isolation unchanged (everything stays under `workspaces/{wid}/…`; the callable proves owner/admin membership on `{wid}` via custom claims before any read, same as `deleteTask`/`exportProject`).

```typescript
// on workspaces/{wid}/clients/{cid} AND workspaces/{wid}/collaborators/{colid}
waConsent?: {
  granted: boolean,          // false = firm explicitly recorded refusal
  method: 'firm_attested',   // only value at MVP (D1)
  recordedBy: string,        // uid of the firm member attesting
  recordedAt: Timestamp,
  language: 'en' | 'ms',     // language the consent was given in (Meta opt-in log requirement)
  textVersion: string,       // version id of the attestation copy, e.g. 'consent_v1'
}
pdpaErased?: {               // server-only (Admin SDK); presence = anonymized
  requestedBy: string,       // uid of the owner/admin who ran the deletion
  at: Timestamp,
}
```

Rules implications:

- `waConsent` joins both **create** and **update** allowlists for clients/collaborators, firm-writable by owner/admin/pm with shape validation: `granted is bool`, `method == 'firm_attested'`, `recordedBy == request.auth.uid`, `recordedAt is timestamp`, `language in ['en','ms']`, `textVersion is string`, no extra keys. (Consent stays firm-writable — capture is client-side CRUD like the rest of #16; the audit trail comes from the existing `onClientWrite`/`onCollaboratorWrite` diff triggers, which is the same integrity model as every other client/collaborator field.)
- `notificationsOptOut` stays server-only and independent — consent (`waConsent`) and withdrawal-by-STOP (`notificationsOptOut`, #19/#20) are two separate fields; the firm can never clear a STOP (D-035).
- `pdpaErased` is **absent from both diff allowlists** (merged-doc `hasOnly` list only, like `notificationsOptOut`) — only the callable writes it.
- Once erased, the doc is frozen: `allow update` additionally requires `!('pdpaErased' in resource.data)`. Read stays firm-visible (the anonymized stub renders as "Deleted client" in lists and project headers).
- `/phoneIndex` is already server-only; no change.

## Design

### 1. Consent model & capture

- **One consent, one channel concept**: `waConsent` covers all phone-channel notifications (WA + SMS fallback) — they are one product behaviour ("Siapp messages this person's phone"). Per-channel consent is over-engineering at MVP (D8).
- **Capture point**: the firm records consent when creating/editing the person — checkbox in `ClientForm`/`CollaboratorForm` with attestation copy (rendered in the form, versioned as `consent_v1`):
  > "☐ This person has agreed to receive WhatsApp/SMS updates about their projects from {firmName}, sent via Siapp. / Orang ini bersetuju menerima kemas kini WhatsApp/SMS tentang projek mereka daripada {firmName}, dihantar melalui Siapp."
- Checking the box writes `waConsent: { granted: true, method: 'firm_attested', recordedBy: uid, recordedAt: serverTimestamp(), language, textVersion: 'consent_v1' }`. Unchecking on edit writes a fresh record with `granted: false` (do **not** delete the field — a dated refusal record is itself compliance evidence). On edit, the form shows current state + "recorded by {name} on {date}".
- **Audit**: `onClientWrite`/`onCollaboratorWrite` already diff and write audit entries; `activityDiff.ts` learns to emit `client.consent_updated` / `collaborator.consent_updated` when the diff is consent-only. This satisfies "log timestamp, source, language, and exact opt-in language" (14-legal-compliance, WhatsApp section) — the exact language is recoverable from `textVersion`.
- Magic-link recipients cannot sign anything (no auth, no identity assurance), hence firm-attested at MVP; portal-confirmed consent (`method: 'portal_confirmed'`) is the designed upgrade path (D1).

### 2. Enqueue suppression (`no_consent`)

- `enqueueNotifications.planTaskNotifications`: for **client** recipients, after the existing opt-out check, require `hasWaConsent(clientData)` (`waConsent.granted === true`). Absent/`granted:false` → record written with `suppressed: true, suppressedReason: 'no_consent'` (audit-preserving, same as `opt_out`).
- **Precedence** (first match wins, extending the existing D8 table): lifecycle → billing → `opt_out` → `no_consent` → `no_recipient`/`no_phone`. Rationale: STOP is the stronger legal signal; a resolvable-but-unconsented recipient should say `no_consent`, not `no_phone`.
- **Member (`internal`) recipients are exempt** — firm employees are notified under the employment/contract basis, not consent; documented in the RoPA line of the review table.
- **Collaborator recipients** are not yet in the enqueue path (they arrive with #19/#20 dispatch work); the `hasWaConsent` helper is written generically so that path inherits the same gate. Note this contract in the `pdpa.ts` header.
- `countWaRecipients` (publish preview, #16) updated to count only consented + not-opted-out recipients, so the "will notify N people" preview matches what will actually send. **Behaviour note:** the existing "missing doc still counts" stance flips for consent — a missing doc cannot prove consent, so it no longer counts. Update the helper's doc comment and tests.
- Existing records with no `waConsent` field: **no consent** (D2) — no backfill, no grandfathering.

### 3. Deletion endpoint + fulfilment

`deletePersonalData` callable — request `{ workspaceId, subjectType: 'client' | 'collaborator', subjectId }`, owner/admin claims required (reuse the `requireOwnerAdminClaims` pattern from `exportProject`; consider extracting it to `lib/claims.ts` since this is its second consumer). At MVP the request and the fulfilment are one synchronous call (the data subject contacts the firm; the firm operator runs it — D4), but **both** audit entries are written so the trail matches the PDPA request→fulfilment model and a future async flow slots in without schema change:

1. Write `pdpa.delete_request` audit entry (actor = caller; `before` = redaction-safe summary: subject type/id only, **not** the PII being erased).
2. Anonymize the person doc in place (D3): `name` → `'Deleted client'` / `'Deleted collaborator'`; `phone`, `email`, `companyName`/`company`, `trade`, `notes`, `waConsent` → `FieldValue.delete()`; collaborators also get `status: 'archived'`; set `pdpaErased: { requestedBy, at }`. Keep `notificationsOptOut` if set (harmless, and preserves the STOP record). Doc id, `createdAt`, `createdBy` remain — referential integrity for `project.clientId` and task assignee ids is preserved.
   - Removing `phone` makes the existing `onClientWrite`/`onCollaboratorWrite` triggers drop the `/phoneIndex` refs automatically (verify the trigger handles phone-field-deleted; add a test if not covered).
3. Revoke magic links: query `workspaces/{wid}/magicLinks` where `subjectId == subjectId`, mark revoked (whatever the existing revocation mechanism in `portalTokens.ts`/`collabLinks.ts` uses — reuse it; do not invent a second revocation shape). Portal/collab access dies with the links.
4. Scrub denormalized PII, all inside the workspace:
   - clients: `projects` where `clientId == subjectId` → `clientNameDenorm: 'Deleted client'`.
   - collaborators: task `assignees[]` entries with this id → name denorm → `'Deleted collaborator'` (entry and id retained).
   - `activity` entries where `actorType`/`actorId` match → `actorNameDenorm` redacted. (Collection-group or per-project loop at MVP scale; batched writes.)
5. Redact the message queue: `messages` where `recipientId == subjectId` → `recipientPhone: 'REDACTED'` and scrub `variables` values equal to the subject's (pre-erasure) name/phone. Keep the docs — `costEstimateMyr`, status, and counts feed billing/usage (#24); redaction satisfies erasure without corrupting the ledger (D6).
6. Write `pdpa.delete_fulfilled` audit entry with per-collection scrub counts (like `project.export`'s entity counts). Steps 3–5 are batched and **log-and-continue is NOT acceptable here** — unlike audit writes, a partial erasure is a compliance failure. Fail loudly with counts of what succeeded, so the operator can re-run (the callable must be **idempotent**: re-running on an erased subject re-scrubs and succeeds).
7. Response: `{ scrubbed: { projects, tasks, activity, messages, magicLinks } }` surfaced in the confirmation dialog.

**Not scrubbed at MVP (documented, D7):** free-text content authored *about* the subject (task notes, update bodies, document files) — that is firm-authored business content where the firm is controller; and historical audit-log `before`/`after` payloads (e.g. the original `client.create` entry contains name+phone) — retained under the legal-obligation/record-keeping basis, flagged for counsel review.

### 4. Privacy notice (portal + collab)

One static line (bilingual EN/MS, matching the notice requirement direction in 14-legal-compliance) appended to `PortalFooter` and to the bottom of `CollabTaskPage`:

> "{firmName} shares project updates with you via Siapp. Your contact details are handled per {firmName}'s privacy notice — contact {firmName} to access, correct or delete your data. / {firmName} berkongsi kemas kini projek dengan anda melalui Siapp. Hubungi {firmName} untuk akses, pembetulan atau pemadaman data anda."

No link target at MVP (the counsel-drafted privacy policy page doesn't exist yet); the line names the firm as the contact point, which is correct — the firm is the controller, Siapp the processor (D5).

## Data-handling review (14-legal-compliance.md → status)

| 14-legal-compliance item | Status after #26 | Owner of remainder |
|---|---|---|
| Privacy notice BM+EN on portal | Partial — static notice line (this ticket); full policy page is counsel work | Founders + counsel |
| Consent capture (firm side at signup; client side at portal first access) | Firm-attested capture shipped (this ticket); portal-confirmed consent deferred (D1) | Post-MVP ticket |
| Lawful basis documented per purpose | Member notifications = contract; client/collab notifications = consent (`waConsent`); note in RoPA | Founders (RoPA doc) |
| Data subject rights: access / correction / deletion / withdrawal | Access = #25 export + firm UI; correction = existing CRUD; deletion = this ticket; withdrawal = consent uncheck (this ticket) + STOP (#19/#20). SLA tracking (21 days) is process, not code, at MVP | Founders (process doc) |
| Audit trail for rights requests | `pdpa.delete_request`/`pdpa.delete_fulfilled` + `*.consent_updated` audit entries | Done here |
| Cross-border transfer, DPO, RoPA, vendor DPAs, breach runbook | Not code | Founders + counsel |
| WhatsApp opt-in logging (timestamp, source, language, exact language) | `waConsent` fields + `textVersion` (this ticket) | Done here |
| WhatsApp opt-out (STOP) processing | Deferred to #19/#20 by design (D-035); suppression plumbing already respects `notificationsOptOut` | #19/#20 |

## Decision points

**D1 — Consent method at MVP.**
Options: (a) firm-attested checkbox in the CRUD forms; (b) client-confirmed via portal first-access; (c) both.
**Recommendation: (a).** Magic-link users have no authenticated identity to bind a consent signature to, and the portal link itself is only delivered *after* a notification is sent — a bootstrapping paradox. The firm attests (they have the real-world relationship and collected the phone number); `method: 'firm_attested'` plus the upgrade path to `'portal_confirmed'` keeps (b) cheap later. 14-legal-compliance's "consent at portal first access" line is satisfied at MVP by the portal notice; flag for counsel.

**D2 — Default for existing records (no `waConsent` field).**
Options: (a) absent = no consent → suppress; (b) grandfather existing records as consented.
**Recommendation: (a), conservative.** No real client data flows yet (that is this ticket's premise) and no messages dispatch until #19 — so suppression costs nothing today and avoids ever having a "consent" that nobody recorded. Firms re-open the edit form and tick the box. The list-page badge makes un-consented records visible so firms can sweep them.

**D3 — Deletion semantics.**
Options: (a) anonymize in place + `pdpaErased` flag; (b) hard-delete the doc; (c) offer both.
**Recommendation: (a).** Hard delete orphans `project.clientId`, task assignee ids, and `/phoneIndex` maintenance, and destroys the evidence that erasure was performed. Anonymize-in-place erases the PII (the actual PDPA obligation), preserves referential integrity and the audit trail (D-029 posture), and the frozen stub renders honestly as "Deleted client". (b)/(c) add failure modes with no compliance gain.

**D4 — Who can trigger deletion.**
Options: (a) workspace owner/admin only, via firm UI; (b) also a self-serve portal/collab surface for data subjects.
**Recommendation: (a).** The firm is the data controller; PDPA requests go controller-ward, and the firm must verify the requester's identity anyway (a magic-link holder is not a verified data subject). Siapp gives the controller a one-click fulfilment tool with an audit trail — that is the processor's job. Siapp-admin can assist via existing impersonation if a firm is unresponsive.

**D5 — Privacy notice placement & copy.**
Options: (a) static bilingual line in portal footer + collab page bottom, naming the firm as contact; (b) dedicated privacy page + link; (c) blocking consent interstitial on first portal access.
**Recommendation: (a).** (b) requires counsel-drafted content that doesn't exist; (c) adds friction to the product's wedge surface and captures nothing legally meaningful from an unauthenticated token holder. Copy is versioned in code; swap for the counsel-approved text pre-launch.

**D6 — Message-queue records containing phone numbers.**
Options: (a) redact `recipientPhone` + matching `variables` values in place; (b) delete the message docs; (c) leave untouched.
**Recommendation: (a).** (b) corrupts the usage/billing ledger (#24 counts messages) and the D8 audit posture; (c) fails erasure — a phone number is exactly the PII the subject asked to remove. Redaction keeps the ledger intact minus the PII.

**D7 — Historical audit-log entries whose `before`/`after` contain the subject's PII.**
Options: (a) retain under the legal-obligation/record-keeping basis, document it; (b) scrub PII inside historical audit payloads too.
**Recommendation: (a), with explicit counsel sign-off as an open question.** Erasure rights are commonly qualified by record-keeping exemptions, and scrubbing audit history undermines the very trail PDPA fulfilment relies on. If counsel disagrees, (b) is an additive follow-up (a scan of `auditLog` for `targetId == subjectId`).

**D8 — Consent granularity.**
Options: (a) one `waConsent` covering WA + SMS fallback; (b) per-channel consent.
**Recommendation: (a).** One user-facing behaviour ("Siapp messages this person's phone about their projects"), one consent. Per-channel adds UI and rules surface for zero MVP benefit; the field shape doesn't preclude adding a channel scope later.

## Steps

1. **Shared types** — `enums.ts` (`no_consent`, four `TAuditAction` values, `TConsentMethod`), `firestoreTypes.ts` (`IWaConsent`, `waConsent`/`pdpaErased` on both docs), `callableTypes.ts` (`IDeletePersonalDataRequest/Response`). Verify: `pnpm turbo typecheck` green.
2. **`lib/pdpa.ts` + tests** — `hasWaConsent`, anonymization payload builders, `redactMessagePii`. Pure; verify via unit tests alone.
3. **Enqueue suppression** — `enqueueNotifications.ts` client-recipient consent gate with the precedence above; `optOut.ts` `countWaRecipients` consent-awareness. Verify: extended unit tests (consented / absent / `granted:false` / opted-out-and-unconsented precedence).
4. **Rules** — clients/collaborators allowlists + `waConsent` shape validation; `pdpaErased` server-only; erased-doc update freeze. Verify: new rules tests in `backend/rules-tests`.
5. **Audit diff** — `activityDiff.ts` consent-only diffs → `*.consent_updated`. Verify: unit tests.
6. **`deletePersonalData` callable** — claims gate, anonymize, revoke links, scrub denorms, redact messages, dual audit entries, idempotent re-run, scrub-count response; export from `index.ts`. Verify: pure-helper unit tests + emulator run against seeded data.
7. **Firm UI: consent capture** — form checkbox + attestation copy + recorded-by display; hooks write `waConsent`; list-page consent badges. Verify: component tests; manual emulator pass (create client without consent → publish preview count excludes them).
8. **Firm UI: deletion** — `DeletePersonalDataDialog` (typed confirmation, scrub-count result), wired on both list pages for owner/admin; `callables.ts` wrapper. Verify: component tests.
9. **Portal/collab notice** — `PortalFooter` + `CollabTaskPage` bilingual line. Verify: component tests; bundle-isolation script green.
10. **Docs** — optional `firestore-data-model.md` field additions. Full gate: `pnpm turbo build lint typecheck test` green.

## Test plan

- **Unit (functions):** `pdpa.test.ts` — `hasWaConsent` truth table (absent field, `granted:false`, malformed object); anonymization builders emit exactly the erasure field set; `redactMessagePii` redacts phone + name-matching variables and nothing else. `enqueueNotifications.test.ts` — client with consent → queued; absent/`granted:false` → `suppressed 'no_consent'`; opted-out **and** unconsented → `'opt_out'` (precedence); member recipients unaffected by consent. `optOut.test.ts` — `countWaRecipients` excludes unconsented; missing-doc-counts flip documented in a test. `activityDiff.test.ts` — consent-only diff → `consent_updated`; mixed diff → generic `update`. `deletePersonalData.test.ts` — non-owner/admin denied, wrong-workspace claims denied, invalid args.
- **Rules tests:** owner/admin/pm can write well-formed `waConsent` on create and update; wrong shape / wrong `recordedBy` / extra keys denied; viewer denied; `pdpaErased` client-write denied (create and update); any firm update on an erased doc denied; `notificationsOptOut` still client-unwritable.
- **Component (web):** ClientForm/CollaboratorForm — checkbox present with attestation copy, unchecked by default on create, reflects + updates existing consent on edit, submitted values include the consent record; list pages — consent badge states, delete action visible for owner/admin only; dialog — typed confirmation gates the call, success shows scrub counts, error surfaces retry guidance; PortalFooter/CollabTaskPage — notice renders with firm name (both languages present).
- **Emulator/manual:** end-to-end deletion on a seeded workspace — verify person doc anonymized + frozen, phoneIndex refs gone, magic link dead (portal 401s), `clientNameDenorm` scrubbed, messages redacted, two audit entries; re-run callable → succeeds idempotently.

## Out of scope

- WhatsApp/SMS dispatch, Twilio webhook, STOP processing, in-template opt-out footer, auto-reply (#19/#20).
- Portal-confirmed consent (`method: 'portal_confirmed'`) and any client-facing consent UI beyond the notice line.
- Counsel-drafted privacy policy page, DPA/MSA documents, RoPA, DPO, breach runbook — non-code items in the review table.
- Scrubbing firm-authored free text (notes/updates/documents) and historical audit payloads (D7 — pending counsel).
- Workspace-level deletion / full account erasure (firm offboarding is a different flow).
- Automated 21-day SLA tracking of deletion requests (process at MVP; the audit trail supports adding it later).

## Risks / open questions

- **Legal review of the attestation + notice copy** (D1, D5, D7) — the recommended wording is engineering placeholder; counsel must sign off pre-launch. The `textVersion` field means copy swaps are cheap and traceable.
- **`onClientWrite` trigger behaviour on phone-field deletion** — the phoneIndex sync must drop refs when `phone` is removed (not just changed). Builder must verify and add a test if uncovered; otherwise the callable should drop the refs itself.
- **Denorm scrub completeness** — the scrub list (projects.clientNameDenorm, task assignee denorms, activity actorNameDenorm, messages, magicLinks) is derived from the current data model; the Builder should grep for `Denorm` fields touching client/collaborator names before finalizing, and the Tester should verify against a fully-exercised seed workspace. Any denorm added later must join the scrub list (note in `pdpa.ts` header).
- **Idempotency vs partial failure** — batched scrubs across many projects can partially fail; the design requires loud failure + safe re-run. Tester should force a mid-run failure in the emulator if feasible.
- **`countWaRecipients` behaviour flip** (missing docs no longer count) changes the publish-preview number for existing draft projects — acceptable pre-launch, but note it in the PR description.
- **Consent for collaborators added before this ships** — same as D2: firms must re-edit to attest. If seed/demo data creates collaborators, seeds may want `waConsent` added (Builder judgement; seeds are internal).

## Approved decisions (auto-approved — user unavailable, recommendations taken)

- **D1**: Firm-attested consent checkbox in client/collaborator CRUD forms; portal-confirmed consent is the later upgrade path.
- **D2**: Absent consent field = NO consent → suppress WA (conservative; nothing dispatches until #19).
- **D3**: Deletion = anonymize in place + `pdpaErased` freeze flag; no hard deletes (referential integrity + audit trail).
- **D4**: Owner/admin-only deletion trigger at MVP; data subjects contact the firm (controller).
- **D5**: Static bilingual privacy-notice footer line on portal/collab surfaces naming the firm; counsel copy swap pre-launch.
- **D6**: Redact `recipientPhone` + PII variables in `messages` docs in place; keep docs (billing ledger intact).
- **D7**: Historical audit payloads with PII retained under record-keeping basis; flagged for counsel review.
- **D8**: One consent covers WA + SMS.

## Live smoke results (emulator, post-verification)

All checks against the running emulator stack (auth/firestore/storage/functions + apex :5173 + dashboard :5174), owner account.

- **Consent capture (D1/D8)**: New-collaborator form saved `waConsent { granted: true, method: 'firm_attested', recordedBy: <owner uid>, recordedAt, language: 'en', textVersion: 'consent_v1' }` — verified via Firestore REST. Client form shows the same bilingual attestation checkbox in a `WhatsApp/SMS notifications (PDPA)` fieldset with the "No consent is on record — suppressed" hint.
- **No-consent badge (D2)**: rows without consent show "No WhatsApp consent"; consented rows show none.
- **Erasure flow (D3/D4/D6)**: "Delete personal data" dialog renders type-to-confirm; after confirm the collaborator doc was anonymized in place (`name: "Deleted collaborator"`, phone/email/waConsent removed, `status: archived`, `pdpaErased { requestedBy, at }`) — verified via REST. Erased row appears under archived with a "Personal data deleted" badge and **no** Edit/Archive/Delete actions.
- **Audit trail**: `pdpa.delete_request` + `pdpa.delete_fulfilled` entries present in `workspaces/dev-workspace/auditLog`.
- **Privacy notice (D5)**: bilingual EN+BM footer naming "Dev Workspace" renders on both the client portal (`/p/…`) and the collaborator task page (`/t/…`).

### Fixes made during smoke

- `scrubSummary` copy: a subject with no related denorms reported "0 record(s) anonymized", reading like a failure even though the subject doc is always anonymized. Now leads with the unconditional outcome: "record anonymized and frozen, N access link(s) revoked, N related record(s) scrubbed, N queued message(s) redacted". Tests updated.

Verification after fix: turbo build/lint/typecheck/test 18/18 ✓, bundle isolation ✓, rules 452/452 ✓ (unchanged since fix touched web copy only).

/**
 * PDPA helpers (#26). Pure — unit-test without emulators.
 *
 * - `hasWaConsent` is the D2 consent gate: absent/malformed waConsent means
 *   no consent (no grandfathering). One grant covers WA + SMS (D8). Firm
 *   members are exempt (contract basis) — callers only gate client and
 *   collaborator recipients. #19/#20's dispatcher inherits this gate because
 *   unconsented records are enqueued `suppressed: true` and never dispatch.
 * - The anonymize builders implement D3: erase-by-anonymization in place so
 *   projects/tasks/audit history keep their non-PII shape. The Firestore
 *   `FieldValue.delete()` sentinel is injected so these stay pure.
 * - `redactMessagePii` implements D6: message-queue docs are audit evidence
 *   of what was sent, so PII fields are redacted in place, not deleted.
 *   Audit-log payloads are retained as-is (D7 — legal-obligation basis).
 */

export const ANONYMIZED_CLIENT_NAME = 'Deleted client';
export const ANONYMIZED_COLLABORATOR_NAME = 'Deleted collaborator';
export const PDPA_REDACTED = 'REDACTED';

/**
 * D2 gate: true only for an explicit `waConsent.granted === true` record.
 * A `granted: false` record (dated refusal) and an absent field both fail.
 */
export function hasWaConsent(data: Record<string, unknown> | undefined): boolean {
  const consent = data?.['waConsent'];
  if (typeof consent !== 'object' || consent === null) {
    return false;
  }
  return (consent as Record<string, unknown>)['granted'] === true;
}

/**
 * In-place anonymization payload for a client doc (D3). Keeps id, language,
 * notificationsOptOut, createdAt/createdBy; the caller adds the `pdpaErased`
 * freeze marker. `deleteMarker` is `FieldValue.delete()` in production.
 */
export function buildAnonymizedClientFields(deleteMarker: unknown): Record<string, unknown> {
  return {
    name: ANONYMIZED_CLIENT_NAME,
    phone: deleteMarker,
    email: deleteMarker,
    companyName: deleteMarker,
    notes: deleteMarker,
    waConsent: deleteMarker,
  };
}

/**
 * In-place anonymization payload for a collaborator doc (D3). Also archives
 * the collaborator so it drops out of assignment pickers.
 */
export function buildAnonymizedCollaboratorFields(deleteMarker: unknown): Record<string, unknown> {
  return {
    name: ANONYMIZED_COLLABORATOR_NAME,
    phone: deleteMarker,
    email: deleteMarker,
    company: deleteMarker,
    trade: deleteMarker,
    waConsent: deleteMarker,
    status: 'archived',
  };
}

/**
 * D6 redaction payload for a `workspaces/{wid}/messages` doc, or null when
 * the doc holds no PII for this subject (already redacted — idempotent).
 * Redacts `recipientPhone` and any template variable equal to the subject's
 * pre-erasure name or phone.
 */
export function redactMessagePii(
  messageData: Record<string, unknown>,
  subject: { name: string; phone: string | null },
): Record<string, unknown> | null {
  const update: Record<string, unknown> = {};

  const phone = messageData['recipientPhone'];
  if (typeof phone === 'string' && phone !== '' && phone !== PDPA_REDACTED) {
    update['recipientPhone'] = PDPA_REDACTED;
  }

  const rawVariables = messageData['variables'];
  if (typeof rawVariables === 'object' && rawVariables !== null) {
    const variables = { ...(rawVariables as Record<string, unknown>) };
    let changed = false;
    for (const [key, value] of Object.entries(variables)) {
      if (
        typeof value === 'string' &&
        value !== '' &&
        (value === subject.name || (subject.phone !== null && value === subject.phone))
      ) {
        variables[key] = PDPA_REDACTED;
        changed = true;
      }
    }
    if (changed) {
      update['variables'] = variables;
    }
  }

  return Object.keys(update).length > 0 ? update : null;
}

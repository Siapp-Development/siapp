/**
 * PDPA consent capture helpers (#26, D1): the versioned firm-attested
 * checkbox copy and the waConsent record writer used by the client and
 * collaborator forms. The copy is versioned — bump CONSENT_TEXT_VERSION when
 * the wording changes so every stored record points at the text the firm
 * actually attested to.
 */

import type { IDeletePersonalDataResponse, TLocale } from '@siapp/shared';
import { serverTimestamp } from 'firebase/firestore';

export const CONSENT_TEXT_VERSION = 'consent_v1';

/** Bilingual attestation copy shown beside the checkbox (D1). */
export function consentAttestationCopy(firmName: string): { en: string; ms: string } {
  return {
    en: `This person has agreed to receive WhatsApp/SMS updates about their projects from ${firmName}, sent via Siapp.`,
    ms: `Orang ini bersetuju menerima kemas kini WhatsApp/SMS tentang projek mereka daripada ${firmName}, dihantar melalui Siapp.`,
  };
}

/**
 * A rules-valid waConsent record (exact key set; recordedBy must be the
 * caller). Written on create when checked, and on edit whenever the checkbox
 * state differs from the stored record — unchecking writes a fresh
 * granted:false refusal (itself compliance evidence), never a field delete.
 */
export function buildWaConsentRecord(
  granted: boolean,
  uid: string,
  language: TLocale,
): Record<string, unknown> {
  return {
    granted,
    method: 'firm_attested',
    recordedBy: uid,
    recordedAt: serverTimestamp(),
    language,
    textVersion: CONSENT_TEXT_VERSION,
  };
}

/**
 * True when a consent write is needed: the checkbox state differs from the
 * stored record. `storedGranted` is null when no record exists — leaving the
 * box unchecked then writes nothing (D2: absent stays absent).
 */
export function consentWriteNeeded(checked: boolean, storedGranted: boolean | null): boolean {
  return checked !== (storedGranted === true);
}

/** Human summary of the scrub counts for the deletion dialog. */
export function scrubSummary(response: IDeletePersonalDataResponse): string {
  const { scrubbed } = response;
  // The subject record itself is always anonymized and frozen — the counts
  // below only cover related data, so lead with the unconditional outcome.
  const parts = [
    'record anonymized and frozen',
    `${scrubbed.magicLinks} access link(s) revoked`,
    `${scrubbed.projects + scrubbed.tasks + scrubbed.taskUpdates + scrubbed.activity} related record(s) scrubbed`,
    `${scrubbed.messages} queued message(s) redacted`,
  ];
  return parts.join(', ');
}

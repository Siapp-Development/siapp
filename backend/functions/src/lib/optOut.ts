/**
 * Notification opt-out helpers (#16, D-035). notificationsOptOut is set by
 * the STOP webhook (#19) and must be respected by every send-counting or
 * send path. Pure — unit-tests without emulators.
 */

import { hasWaConsent } from './pdpa.js';

/** True when a client/collaborator doc carries a server-set opt-out. */
export function isOptedOut(data: Record<string, unknown> | undefined): boolean {
  return data?.['notificationsOptOut'] === true;
}

/**
 * Normalized WhatsApp de-dupe key for a phone number (#157 D4). Client phones
 * are stored E.164, so a trim is enough to make two clients that share a number
 * collapse to one send. Empty string = no usable phone.
 */
export function normalizePhoneKey(phone: string | null | undefined): string {
  return typeof phone === 'string' ? phone.trim() : '';
}

/**
 * WA recipient count for the publish preview: the linked client(s) plus each
 * assigned collaborator, counting only recipients who both hold a waConsent
 * grant (#26 D2: absent = no consent) and have not opted out. Missing docs
 * (undefined data) no longer count — a dangling ref cannot carry a consent
 * record, so enqueue would suppress it anyway. #157 (D4): multiple clients that
 * share the same E.164 phone collapse to ONE send, so they count once.
 */
export function countWaRecipients(params: {
  clientDocs: ReadonlyArray<Record<string, unknown> | undefined>;
  collaboratorDocs: ReadonlyArray<Record<string, unknown> | undefined>;
}): number {
  const clientPhones = new Set<string>();
  for (const data of params.clientDocs) {
    if (!hasWaConsent(data) || isOptedOut(data)) {
      continue;
    }
    const raw = data?.['phone'];
    const phone = normalizePhoneKey(typeof raw === 'string' ? raw : '');
    if (phone === '') {
      continue;
    }
    clientPhones.add(phone);
  }
  const collaboratorCount = params.collaboratorDocs.filter(
    (data) => hasWaConsent(data) && !isOptedOut(data),
  ).length;
  return clientPhones.size + collaboratorCount;
}

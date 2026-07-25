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
 * WA recipient count for the publish preview: the linked client plus each
 * assigned collaborator, counting only recipients who both hold a waConsent
 * grant (#26 D2: absent = no consent) and have not opted out. Missing docs
 * (undefined data) no longer count — a dangling ref cannot carry a consent
 * record, so enqueue would suppress it anyway.
 */
export function countWaRecipients(params: {
  clientLinked: boolean;
  clientData: Record<string, unknown> | undefined;
  collaboratorDocs: ReadonlyArray<Record<string, unknown> | undefined>;
}): number {
  const clientCount =
    params.clientLinked && hasWaConsent(params.clientData) && !isOptedOut(params.clientData)
      ? 1
      : 0;
  const collaboratorCount = params.collaboratorDocs.filter(
    (data) => hasWaConsent(data) && !isOptedOut(data),
  ).length;
  return clientCount + collaboratorCount;
}

/**
 * Notification opt-out helpers (#16, D-035). notificationsOptOut is set by
 * the STOP webhook (#19) and must be respected by every send-counting or
 * send path. Pure — unit-tests without emulators.
 */

/** True when a client/collaborator doc carries a server-set opt-out. */
export function isOptedOut(data: Record<string, unknown> | undefined): boolean {
  return data?.['notificationsOptOut'] === true;
}

/**
 * WA recipient count for the publish preview: the linked client (unless
 * opted out) plus each assigned collaborator (unless opted out). Missing
 * docs (undefined data) still count — a dangling ref cannot prove consent
 * was withdrawn, and the pre-#16 behaviour counted them.
 */
export function countWaRecipients(params: {
  clientLinked: boolean;
  clientData: Record<string, unknown> | undefined;
  collaboratorDocs: ReadonlyArray<Record<string, unknown> | undefined>;
}): number {
  const clientCount = params.clientLinked && !isOptedOut(params.clientData) ? 1 : 0;
  const collaboratorCount = params.collaboratorDocs.filter((data) => !isOptedOut(data)).length;
  return clientCount + collaboratorCount;
}

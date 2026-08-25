/**
 * sendCollaboratorLink (#127, Q-WA): firm owner/admin/pm mints/reuses the
 * collaborator access link and ENQUEUES a WhatsApp `messages` doc using the
 * `collab_access_link_v1` template.
 *
 * DELIVERY DEPENDENCY: the WA send stack is a no-op stub today (no #19
 * dispatcher, no Twilio). This callable only writes the queue record — it does
 * NOT deliver. It honours the same opt-out / consent gates as
 * enqueueNotifications so a firm never queues to a recipient who declined.
 */

import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { assertWorkspaceActive } from '../lib/workspaceStatus.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { isOptedOut } from '../lib/optOut.js';
import { hasWaConsent } from '../lib/pdpa.js';
import { mintCollaboratorLink, requireCollabLinkIssuer } from './issueCollaboratorLink.js';

/** Mirrors WA_UTILITY_COST_MYR in @siapp/shared. */
const WA_UTILITY_COST_MYR = 0.1;

/** Reserved template name (#127, Q-WA) — see plans/whatsapp-templates-v1.md. */
export const COLLAB_ACCESS_LINK_TEMPLATE = 'collab_access_link_v1';

export const sendCollaboratorLink = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const collaboratorId = typeof data['collaboratorId'] === 'string' ? data['collaboratorId'] : '';
  if (!workspaceId || !collaboratorId) {
    throw new HttpsError('invalid-argument', 'workspaceId and collaboratorId are required.');
  }

  const issuer = requireCollabLinkIssuer(request, workspaceId);
  await assertWorkspaceActive(workspaceId);

  const db = getFirestore();
  const [collaboratorSnap, workspaceSnap] = await Promise.all([
    db.doc(`workspaces/${workspaceId}/collaborators/${collaboratorId}`).get(),
    db.doc(`workspaces/${workspaceId}`).get(),
  ]);
  if (!collaboratorSnap.exists) {
    throw new HttpsError('not-found', 'Collaborator not found.');
  }

  const collaborator = collaboratorSnap.data() ?? {};
  // Respect the same gates as enqueueNotifications (#16 D-035, #26 D2).
  if (isOptedOut(collaborator)) {
    return { status: 'opted_out' as const };
  }
  if (!hasWaConsent(collaborator)) {
    return { status: 'no_consent' as const };
  }

  const phone = typeof collaborator['phone'] === 'string' ? collaborator['phone'] : '';
  const collaboratorName = typeof collaborator['name'] === 'string' ? collaborator['name'] : '';
  const firmName = typeof workspaceSnap.get('name') === 'string' ? workspaceSnap.get('name') : '';

  const { url, expiresAt } = await mintCollaboratorLink(db, workspaceId, collaboratorId, issuer.uid);

  const messageRef = db.collection(`workspaces/${workspaceId}/messages`).doc();
  await messageRef.set({
    id: messageRef.id,
    channel: 'whatsapp',
    recipientPhone: phone,
    recipientType: 'collaborator',
    recipientId: collaboratorId,
    templateName: COLLAB_ACCESS_LINK_TEMPLATE,
    variables: {
      firmName,
      collaboratorName,
      accessLink: url,
    },
    status: 'queued',
    trigger: 'collab_access_link',
    costEstimateMyr: WA_UTILITY_COST_MYR,
    relatedTo: { type: 'collaborator', id: collaboratorId },
    createdAt: Timestamp.now(),
  });

  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: issuer.uid,
    action: 'collab_link.issue',
    targetType: 'magicLink',
    targetId: messageRef.id,
    after: {
      collaboratorId,
      channel: 'whatsapp',
      expiresAt: expiresAt.toDate().toISOString(),
    },
    ...callableRequestMeta(request),
  });

  return { status: 'queued' as const, expiresAt: expiresAt.toDate().toISOString() };
});

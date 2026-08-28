/**
 * sendCollaboratorLink (#127, Q-WA): firm owner/admin/pm reuses (get-or-create)
 * the collaborator's ONE durable access link and ENQUEUES a WhatsApp `messages`
 * doc using the `collab_access_link_v1` template. Durable/reset-only: sending
 * never rotates a still-valid link — the same URL is re-surfaced every time.
 *
 * DELIVERY: this callable enqueues a `messages` doc which the scheduled dispatch
 * sweep (`sweepMessageQueue`, #133) delivers over WhatsApp once Twilio config is
 * present (absent creds → `selectProvider` falls back to NoopProvider). It
 * honours the same opt-out / consent gates as enqueueNotifications so a firm
 * never queues to a recipient who declined.
 */

import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { assertWorkspaceActive } from '../lib/workspaceStatus.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { isOptedOut } from '../lib/optOut.js';
import { hasWaConsent } from '../lib/pdpa.js';
import { getOrCreateCollaboratorLink, requireCollabLinkIssuer } from './issueCollaboratorLink.js';

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

  // Fail-soft when the collaborator has no phone on file: WhatsApp cannot
  // deliver, and `selectDispatchable` filters empty phones — so enqueueing would
  // strand an undeliverable doc showing "queued". Return BEFORE get-or-create
  // and BEFORE enqueue, mirroring the opt-out / consent gates above.
  const phone = typeof collaborator['phone'] === 'string' ? collaborator['phone'] : '';
  if (phone === '') {
    return { status: 'no_phone' as const };
  }

  const collaboratorName = typeof collaborator['name'] === 'string' ? collaborator['name'] : '';
  const firmName = typeof workspaceSnap.get('name') === 'string' ? workspaceSnap.get('name') : '';

  // Durable, reset-only (#127): reuse the collaborator's active link if any —
  // sending over WhatsApp must never rotate an existing valid URL.
  const { token, expiresAt, linkId, created } = await getOrCreateCollaboratorLink(
    db,
    workspaceId,
    collaboratorId,
    issuer.uid,
  );

  const messageRef = db.collection(`workspaces/${workspaceId}/messages`).doc();
  await messageRef.set({
    id: messageRef.id,
    channel: 'whatsapp',
    recipientPhone: phone,
    recipientType: 'collaborator',
    recipientId: collaboratorId,
    templateName: COLLAB_ACCESS_LINK_TEMPLATE,
    // snake_case, token-only (#137, Finding 1/2): keys must match the approved
    // Meta template's named variables; the value is the bare
    // `{shortCode}_{secret}` token — the static `https://siapp.app/t/` prefix
    // is baked into the template body, so no full URL is emitted here.
    variables: {
      firm_name: firmName,
      collaborator_name: collaboratorName,
      access_token: token,
    },
    status: 'queued',
    trigger: 'collab_access_link',
    costEstimateMyr: WA_UTILITY_COST_MYR,
    relatedTo: { type: 'collaborator', id: collaboratorId },
    createdAt: Timestamp.now(),
  });

  // Only a first-ever mint is audited as collab_link.issue; re-surfacing an
  // existing durable link is not (the WhatsApp queue write is the record of
  // this send). Never audit a rotation here — Send must not rotate.
  if (created) {
    await writeAuditLog(workspaceId, {
      actorType: 'user',
      actorId: issuer.uid,
      action: 'collab_link.issue',
      targetType: 'magicLink',
      targetId: linkId,
      after: {
        collaboratorId,
        channel: 'whatsapp',
        expiresAt: expiresAt.toDate().toISOString(),
      },
      ...callableRequestMeta(request),
    });
  }

  return { status: 'queued' as const, expiresAt: expiresAt.toDate().toISOString() };
});

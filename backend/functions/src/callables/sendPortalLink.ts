/**
 * sendPortalLink (#137, Part C): firm owner/admin/pm sends a CLIENT their
 * project portal link over WhatsApp on demand. Mirrors `sendCollaboratorLink`:
 * it mints the client portal link and ENQUEUES a `messages` doc using the
 * `project_welcome` trigger (template `siapp_project_welcome_v1_en`).
 *
 * Per-action mint (C-6): reuses the EXISTING rotate-on-issue mint
 * (`mintClientPortalLink`) — the same behaviour the firm-app "Copy portal link"
 * button already triggers — so the message captures a FRESH, working URL at send
 * time. No durable-link storage and no at-rest-secret change (Part B, deferred).
 *
 * DELIVERY: this callable enqueues a `messages` doc which the scheduled dispatch
 * sweep (`sweepMessageQueue`, #133) delivers over WhatsApp once Twilio config is
 * present (absent creds → `selectProvider` falls back to NoopProvider). It
 * honours the same opt-out / consent gates as `sendCollaboratorLink`, so a firm
 * never queues to a recipient who declined.
 */

import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { assertWorkspaceActive } from '../lib/workspaceStatus.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { isOptedOut } from '../lib/optOut.js';
import { hasWaConsent } from '../lib/pdpa.js';
import { mytDateString } from '../lib/quietHours.js';
import { issueBlocker, mintClientPortalLink, requirePortalLinkIssuer } from './issuePortalLink.js';

/** Mirrors WA_UTILITY_COST_MYR in @siapp/shared. */
const WA_UTILITY_COST_MYR = 0.1;

/**
 * Canonical template name (C-5): `siapp_<trigger>_v1_en`. The dispatcher
 * resolves the Twilio ContentSid by `trigger` (WA_CONTENT_SID_PROJECT_WELCOME),
 * so this string is the human-readable authoring reference on the queue record.
 */
export const PROJECT_WELCOME_TEMPLATE = 'siapp_project_welcome_v1_en';

/** First whitespace-delimited token of a client's `name` (C-2), or ''. */
function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ?? '';
}

/** MYT-formatted project due date, or '—' when absent (C-3). */
function projectDueDateOf(targetEndDate: unknown): string {
  if (
    targetEndDate !== null &&
    typeof targetEndDate === 'object' &&
    typeof (targetEndDate as { toDate?: () => Date }).toDate === 'function'
  ) {
    return mytDateString((targetEndDate as { toDate: () => Date }).toDate());
  }
  return '—';
}

export const sendPortalLink = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : '';
  if (!workspaceId || !projectId) {
    throw new HttpsError('invalid-argument', 'workspaceId and projectId are required.');
  }

  const uid = requirePortalLinkIssuer(request, workspaceId);
  await assertWorkspaceActive(workspaceId); // #24 D2: read-only gate

  const db = getFirestore();
  const [projectSnap, workspaceSnap] = await Promise.all([
    db.doc(`workspaces/${workspaceId}/projects/${projectId}`).get(),
    db.doc(`workspaces/${workspaceId}`).get(),
  ]);

  // D-027 gate (REUSE): project exists, lifecycle ∈ {published, completed},
  // non-empty clientId — identical to issuePortalLink.
  const blocker = issueBlocker({
    projectExists: projectSnap.exists,
    lifecycle: projectSnap.get('lifecycle'),
    clientId: projectSnap.get('clientId'),
  });
  if (blocker === 'not-found') {
    throw new HttpsError('not-found', 'Project not found.');
  }
  if (blocker === 'not-published') {
    throw new HttpsError(
      'failed-precondition',
      'Publish the project before sharing a portal link.',
    );
  }
  if (blocker === 'no-client') {
    throw new HttpsError('failed-precondition', 'Link a client to the project first.');
  }
  const clientId = projectSnap.get('clientId') as string;

  const clientSnap = await db.doc(`workspaces/${workspaceId}/clients/${clientId}`).get();
  if (!clientSnap.exists) {
    throw new HttpsError('not-found', 'Client not found.');
  }
  const client = clientSnap.data() ?? {};

  // Same consent gates as sendCollaboratorLink (#16 D-035, #26 D2): return the
  // same status shape and do NOT enqueue when the client declined WhatsApp.
  if (isOptedOut(client)) {
    return { status: 'opted_out' as const };
  }
  if (!hasWaConsent(client)) {
    return { status: 'no_consent' as const };
  }

  // Fail-soft when the client has no phone on file: WhatsApp cannot deliver, and
  // `selectDispatchable` filters empty phones — so enqueueing would strand an
  // undeliverable doc showing "queued". Return BEFORE the rotate-on-issue mint
  // and BEFORE enqueue, mirroring the opt-out / consent gates above.
  const phone = typeof client['phone'] === 'string' ? client['phone'] : '';
  if (phone === '') {
    return { status: 'no_phone' as const };
  }

  const clientName = typeof client['name'] === 'string' ? client['name'] : '';
  const firmName = typeof workspaceSnap.get('name') === 'string' ? workspaceSnap.get('name') : '';
  const projectTitle = typeof projectSnap.get('name') === 'string' ? projectSnap.get('name') : '';
  const projectDueDate = projectDueDateOf(projectSnap.get('targetEndDate'));

  // Per-action mint (C-6): capture a FRESH working token at send time — the same
  // rotate-on-issue behaviour the "Copy portal link" button already triggers.
  const { token, expiresAt, linkId, rotated } = await mintClientPortalLink(
    db,
    workspaceId,
    projectId,
    clientId,
    uid,
  );

  const messageRef = db.collection(`workspaces/${workspaceId}/messages`).doc();
  await messageRef.set({
    id: messageRef.id,
    channel: 'whatsapp',
    recipientPhone: phone,
    recipientType: 'client',
    recipientId: clientId,
    templateName: PROJECT_WELCOME_TEMPLATE,
    // snake_case, token-only (#137, Finding 1/2): keys ARE the wire contract and
    // must match the approved Meta template's named variables. `portal_token` is
    // the bare `{shortCode}_{secret}` token — the static `https://siapp.app/p/`
    // prefix is baked into the template body, so no full URL is emitted.
    variables: {
      firm_name: firmName,
      client_first_name: firstNameOf(clientName),
      project_title: projectTitle,
      project_due_date: projectDueDate,
      portal_token: token,
    },
    status: 'queued',
    trigger: 'project_welcome',
    costEstimateMyr: WA_UTILITY_COST_MYR,
    relatedTo: { type: 'project', id: projectId },
    createdAt: Timestamp.now(),
  });

  // Mirror issuePortalLink audit: a rotation (a prior active link revoked) is
  // portal_link.reset; a first-ever mint is portal_link.issue.
  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: rotated ? 'portal_link.reset' : 'portal_link.issue',
    targetType: 'magicLink',
    targetId: linkId,
    after: {
      projectId,
      clientId,
      channel: 'whatsapp',
      expiresAt: expiresAt.toDate().toISOString(),
    },
    ...callableRequestMeta(request),
  });

  return { status: 'queued' as const, expiresAt: expiresAt.toDate().toISOString() };
});

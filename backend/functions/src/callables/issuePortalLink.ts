/**
 * issuePortalLink (#21, D2): firm owner/admin/pm mints a client portal magic
 * link for a published/completed project (D-027 gate) with a linked client.
 *
 * One active link per (project, client). Revocation is soft (Q1): it blocks
 * re-redemption; already-signed-in sessions are bounded by the lifecycle
 * re-check in rules. `reset: true` records the rotation as an explicit
 * 'portal_link.reset' audit entry (vs 'portal_link.issue' on first mint).
 *
 * #142 (Part B): the client portal link is now DURABLE, mirroring the #127
 * collaborator model. The default path is GET-OR-CREATE
 * (`getOrCreateClientPortalLink`): while an active, unexpired link with a
 * re-surfaceable token exists it returns the SAME url/token every time, so
 * in-flight WhatsApp links never 404 (D-042). The raw URL token is persisted
 * plaintext on the `audience=='client'` magicLink doc — which firestore.rules
 * denies to ALL clients (`magicLinks` allow read, write: if false) — so the url
 * can be re-surfaced without rotation. Redemption still verifies ONLY against
 * `secretHash`, so the stored token never weakens auth. `reset: true` remains
 * the explicit ROTATE path (revoke prior + mint fresh), audited
 * 'portal_link.reset'. The enqueue path (system actor, no user uid) calls
 * `getOrCreateClientPortalLink` with `createdBy: 'system'` to obtain the stable
 * token embedded in automated client notifications.
 */

import {
  FieldValue,
  Timestamp,
  getFirestore,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

import {
  PORTAL_LINK_TTL_MS,
  buildPortalUrl,
  generatePortalToken,
  hashSecret,
  portalLinkAnchorId,
} from '../lib/portalTokens.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { assertWorkspaceActive } from '../lib/workspaceStatus.js';

/** Apex origin carried in portal URLs (D-036: portal lives on siapp.app). */
const portalOrigin = defineString('PORTAL_ORIGIN', { default: 'https://siapp.app' });

/** Lifecycles a portal link may be issued for (D-027 external-access gate). */
export const PORTAL_ISSUABLE_LIFECYCLES = ['published', 'completed'] as const;

export interface IIssueGateInput {
  projectExists: boolean;
  lifecycle: unknown;
  clientId: unknown;
}

/**
 * Why a portal link cannot be issued for this project, or null when it can.
 * Pure so the gate unit-tests without emulators.
 */
export function issueBlocker(
  input: IIssueGateInput,
): 'not-found' | 'not-published' | 'no-client' | null {
  if (!input.projectExists) {
    return 'not-found';
  }
  if (
    typeof input.lifecycle !== 'string' ||
    !(PORTAL_ISSUABLE_LIFECYCLES as readonly string[]).includes(input.lifecycle)
  ) {
    return 'not-published';
  }
  if (typeof input.clientId !== 'string' || input.clientId === '') {
    return 'no-client';
  }
  return null;
}

/**
 * Owner/admin/pm gate for portal-link issuance (D-027). Exported (#137) so
 * `sendPortalLink` reuses the SAME role check rather than duplicating it.
 */
export function requirePortalLinkIssuer(request: CallableRequest, workspaceId: string): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = request.auth?.token['workspaces'] as
    | Record<string, { role?: unknown }>
    | undefined;
  const role = workspaces?.[workspaceId]?.role;
  if (role !== 'owner' && role !== 'admin' && role !== 'pm') {
    throw new HttpsError('permission-denied', 'Your role cannot issue portal links.');
  }
  return uid;
}

export interface IMintedClientPortalLink {
  /** Full portal URL: `https://siapp.app/p/{shortCode}_{secret}`. */
  url: string;
  /** Bare `{shortCode}_{secret}` URL path segment (token-only send, #137). */
  token: string;
  expiresAt: Timestamp;
  linkId: string;
  /** True when a prior active link for the pair was revoked by this mint. */
  rotated: boolean;
}

/**
 * Fields every client-portal mint needs inside a transaction. `anchorRef` is the
 * deterministic per-triple pointer doc (see `portalLinkAnchorId`) that ALL mints
 * for a `(workspaceId, projectId, clientId)` contend on.
 */
interface IClientLinkContext {
  linksRef: CollectionReference;
  anchorRef: DocumentReference;
  workspaceId: string;
  projectId: string;
  clientId: string;
  issuerUid: string;
}

/**
 * Reads the link the anchor currently points at, within the transaction. The
 * anchor read itself is the serialization point (see the rubber-duck note on
 * `getOrCreateClientPortalLink`); this second read of the specific active link
 * doc lets us decide reuse-vs-rotate against consistent state.
 */
async function readAnchoredLink(
  tx: Transaction,
  ctx: IClientLinkContext,
  anchorSnap: DocumentSnapshot,
): Promise<{ priorRef: DocumentReference | null; priorSnap: DocumentSnapshot | null }> {
  const activeLinkId = anchorSnap.get('activeLinkId');
  if (typeof activeLinkId !== 'string' || activeLinkId === '') {
    return { priorRef: null, priorSnap: null };
  }
  const priorRef = ctx.linksRef.doc(activeLinkId);
  const priorSnap = await tx.get(priorRef);
  return { priorRef, priorSnap };
}

/**
 * Soft-revokes the anchor's prior active link within the transaction when it is
 * still live (Q1: blocks re-redemption of the old URL — an already-sent link is
 * rejected at redeem via `revoked==true`). Returns true when a link was rotated.
 * All reads must already have happened (Firestore: reads-before-writes).
 */
function revokePriorClientLink(
  tx: Transaction,
  priorRef: DocumentReference | null,
  priorSnap: DocumentSnapshot | null,
  issuerUid: string,
): boolean {
  if (
    priorRef === null ||
    priorSnap === null ||
    !priorSnap.exists ||
    priorSnap.get('revoked') !== false
  ) {
    return false;
  }
  tx.update(priorRef, {
    revoked: true,
    revokedAt: FieldValue.serverTimestamp(),
    revokedBy: issuerUid,
  });
  return true;
}

/**
 * Write half of a mint (no reads, so it slots in after the anchor/prior reads):
 * creates a fresh durable client link doc and REPOINTS the anchor at it in the
 * SAME transaction. The anchor's `activeLinkId` is exactly what every future
 * get-or-create reads to re-surface this link (D-042). #142 (Part B): the raw
 * URL `token` is persisted plaintext on the doc (magicLinks is rules-denied to
 * ALL clients + firm roles) so the url re-surfaces without rotation; redemption
 * still verifies ONLY `secretHash`, never this field. The anchor pointer doc
 * carries NO `shortCode`/`audience`/`subjectId`/`revoked`, so the redeem
 * collection-group lookup and the deletePersonalData revoke sweep never match it.
 */
function writeFreshClientLink(
  tx: Transaction,
  ctx: IClientLinkContext,
  rotated: boolean,
): IMintedClientPortalLink {
  const now = Timestamp.now();
  const { shortCode, secret, token } = generatePortalToken();
  const linkRef = ctx.linksRef.doc();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + PORTAL_LINK_TTL_MS);
  tx.set(linkRef, {
    id: linkRef.id,
    shortCode,
    secretHash: hashSecret(secret),
    token,
    audience: 'client',
    scopeType: 'project',
    scopeId: ctx.projectId,
    subjectId: ctx.clientId,
    issuedAt: now,
    expiresAt,
    useCount: 0,
    revoked: false,
    createdBy: ctx.issuerUid,
  });
  tx.set(ctx.anchorRef, {
    kind: 'portal-anchor',
    activeLinkId: linkRef.id,
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    clientId: ctx.clientId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {
    url: buildPortalUrl(portalOrigin.value(), token),
    token,
    expiresAt,
    linkId: linkRef.id,
    rotated,
  };
}

function clientLinkContext(
  db: Firestore,
  workspaceId: string,
  projectId: string,
  clientId: string,
  issuerUid: string,
): IClientLinkContext {
  const linksRef = db.collection(`workspaces/${workspaceId}/magicLinks`);
  return {
    linksRef,
    anchorRef: linksRef.doc(portalLinkAnchorId(workspaceId, projectId, clientId)),
    workspaceId,
    projectId,
    clientId,
    issuerUid,
  };
}

/**
 * ROTATE path (explicit Reset): revokes the current active client portal link
 * for the (project, client) pair and mints a fresh one atomically. #142 (Part
 * B): the mint now contends on the deterministic per-triple anchor doc — the
 * transaction reads `anchorRef` FIRST, so a concurrent Reset + get-or-create
 * cannot both mint (one retries and observes the other's committed anchor).
 * Assumes the caller has already authorized the actor and validated the pair.
 */
export async function mintClientPortalLink(
  db: Firestore,
  workspaceId: string,
  projectId: string,
  clientId: string,
  issuerUid: string,
): Promise<IMintedClientPortalLink> {
  const ctx = clientLinkContext(db, workspaceId, projectId, clientId, issuerUid);
  return db.runTransaction(async (tx) => {
    // SERIALIZATION POINT: read the deterministic anchor first (see the
    // rubber-duck note on getOrCreateClientPortalLink for WHY this serializes).
    const anchorSnap = await tx.get(ctx.anchorRef);
    const { priorRef, priorSnap } = await readAnchoredLink(tx, ctx, anchorSnap);
    const rotated = revokePriorClientLink(tx, priorRef, priorSnap, issuerUid);
    return writeFreshClientLink(tx, ctx, rotated);
  });
}

export interface IResolvedClientPortalLink extends IMintedClientPortalLink {
  /** True when a fresh link was minted; false when an existing one was reused. */
  created: boolean;
}

/**
 * GET-OR-CREATE (#142, durable/reset-only): returns the (project, client) pair's
 * active, unexpired link url unchanged when one with a re-surfaceable token
 * exists; otherwise mints a fresh one (revoking any stale prior). Never rotates a
 * still-valid link — that is Reset's job — so in-flight WhatsApp links keep
 * resolving (D-042). The enqueue path passes `issuerUid: 'system'`.
 *
 * ── Rubber-duck: WHY the anchor read serializes concurrent mints ──────────────
 * The old code ran the active-link QUERY with a plain `.get()` outside any
 * transaction and the mint transaction only revoke-queried. Firestore does NOT
 * lock empty result sets: a query inside a transaction serializes against
 * documents it RETURNS, not against documents that do not yet exist. So two
 * concurrent first-mints for the same triple could both observe "no active
 * link" and both create a link with a DIFFERENT token — two active links,
 * breaking the one-active-link invariant and D-042 (in-flight WhatsApp links
 * must not 404). This is realistic: the automated enqueue path (system actor)
 * fires on overlapping task writes in one project.
 *
 * The fix funnels EVERY mint through a single transaction that FIRST reads a
 * deterministic docRef — `anchorRef`, whose id is derived purely from
 * `(workspaceId, projectId, clientId)` (see `portalLinkAnchorId`). Reading a
 * specific docRef DOES create a lock/contention point (unlike a query on an
 * empty set): Firestore tracks the version of every doc a transaction reads and
 * aborts the commit if any of them changed. Two concurrent transactions both
 * read `anchorRef` at the same version, but only one can commit its anchor
 * repoint; the other's read version is now stale, so it retries, re-reads the
 * anchor — now pointing at the winner's freshly-minted link — and REUSES it
 * (returning the SAME token). Exactly one active link, one token: D-042 holds.
 *
 * Reset interacts cleanly: `reset:true` calls `mintClientPortalLink`, which runs
 * the SAME anchor-first transaction — it revokes the link the anchor points at
 * and repoints the anchor at the fresh link, so a later get-or-create reads the
 * new pointer and never resurrects the rotated (now `revoked==true`, rejected at
 * redeem) URL.
 */
export async function getOrCreateClientPortalLink(
  db: Firestore,
  workspaceId: string,
  projectId: string,
  clientId: string,
  issuerUid: string,
): Promise<IResolvedClientPortalLink> {
  const ctx = clientLinkContext(db, workspaceId, projectId, clientId, issuerUid);
  return db.runTransaction(async (tx) => {
    const nowMs = Date.now();
    // SERIALIZATION POINT: the deterministic anchor read (see note above).
    const anchorSnap = await tx.get(ctx.anchorRef);
    const { priorRef, priorSnap } = await readAnchoredLink(tx, ctx, anchorSnap);

    if (priorSnap !== null && priorSnap.exists && priorSnap.get('revoked') === false) {
      const token = priorSnap.get('token');
      const expiresAt = priorSnap.get('expiresAt') as Timestamp | undefined;
      const expiresMs = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : 0;
      if (expiresMs > nowMs && typeof token === 'string' && token !== '') {
        return {
          url: buildPortalUrl(portalOrigin.value(), token),
          token,
          expiresAt: expiresAt as Timestamp,
          linkId: priorSnap.id,
          rotated: false,
          created: false,
        };
      }
    }

    // No re-surfaceable link: revoke any stale prior and mint the fresh durable
    // one, repointing the anchor — all in this one contended transaction.
    const rotated = revokePriorClientLink(tx, priorRef, priorSnap, issuerUid);
    const minted = writeFreshClientLink(tx, ctx, rotated);
    return { ...minted, created: true };
  });
}

export const issuePortalLink = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : '';
  const reset = data['reset'] === true;
  if (!workspaceId || !projectId) {
    throw new HttpsError('invalid-argument', 'workspaceId and projectId are required.');
  }

  const uid = requirePortalLinkIssuer(request, workspaceId);
  await assertWorkspaceActive(workspaceId); // #24 D2: read-only gate

  const db = getFirestore();
  const projectSnap = await db.doc(`workspaces/${workspaceId}/projects/${projectId}`).get();
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

  if (reset) {
    // ROTATE: revoke the active link and mint a fresh one (explicit Reset).
    const { url, expiresAt, linkId } = await mintClientPortalLink(
      db,
      workspaceId,
      projectId,
      clientId,
      uid,
    );
    await writeAuditLog(workspaceId, {
      actorType: 'user',
      actorId: uid,
      action: 'portal_link.reset',
      targetType: 'magicLink',
      targetId: linkId,
      after: { projectId, clientId, expiresAt: expiresAt.toDate().toISOString() },
      ...callableRequestMeta(request),
    });
    return { url, expiresAt: expiresAt.toDate().toISOString() };
  }

  // GET-OR-CREATE: idempotent Copy — reuse the active durable link if present.
  const { url, expiresAt, linkId, created } = await getOrCreateClientPortalLink(
    db,
    workspaceId,
    projectId,
    clientId,
    uid,
  );
  if (created) {
    // Only first-ever creation is audited; re-surfacing is not (lightweight).
    await writeAuditLog(workspaceId, {
      actorType: 'user',
      actorId: uid,
      action: 'portal_link.issue',
      targetType: 'magicLink',
      targetId: linkId,
      after: { projectId, clientId, expiresAt: expiresAt.toDate().toISOString() },
      ...callableRequestMeta(request),
    });
  }

  return {
    url,
    expiresAt: expiresAt.toDate().toISOString(),
  };
});

/**
 * Pure portal magic-link token helpers for the #21 portal callables — kept
 * free of Admin SDK imports so they unit-test without emulators (same
 * convention as invites.ts / claims.ts).
 *
 * URL token format (D2): `{shortCode}_{secret}` — `shortCode` is a 12-char
 * alphanumeric doc-lookup key (stored plaintext, collection-group indexed);
 * `secret` is 32 bytes base64url whose SHA-256 is the only form at rest.
 * Constants mirror PORTAL_LINK_TTL_DAYS / portal claim shapes in
 * @siapp/shared (source-only package this NodeNext build cannot consume).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Mirrors PORTAL_LINK_TTL_DAYS in @siapp/shared. */
export const PORTAL_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const SHORT_CODE_LENGTH = 12;

// No underscore/dash: the first '_' in the URL token is the separator.
const SHORT_CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface IPortalToken {
  shortCode: string;
  secret: string;
  /** `{shortCode}_{secret}` — the URL path segment. */
  token: string;
}

/** 12-char alphanumeric shortCode + 32-byte base64url secret. */
export function generatePortalToken(): IPortalToken {
  const bytes = randomBytes(SHORT_CODE_LENGTH);
  let shortCode = '';
  for (const byte of bytes) {
    shortCode += SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length];
  }
  const secret = randomBytes(32).toString('base64url');
  return { shortCode, secret, token: `${shortCode}_${secret}` };
}

/** SHA-256 hex digest — the only form of the secret persisted in Firestore. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Constant-time comparison of a presented secret against the stored hash. */
export function verifySecret(secret: string, secretHash: string): boolean {
  const presented = Buffer.from(hashSecret(secret), 'hex');
  const stored = Buffer.from(secretHash, 'hex');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

/**
 * Splits a raw URL token into shortCode + secret, or null when malformed.
 * Deliberately strict (lengths, alphabets) so garbage never reaches the
 * Firestore lookup; all failures collapse into the uniform redeem error.
 */
export function parsePortalToken(raw: unknown): { shortCode: string; secret: string } | null {
  if (typeof raw !== 'string' || raw.length > 200) {
    return null;
  }
  const separator = raw.indexOf('_');
  if (separator !== SHORT_CODE_LENGTH) {
    return null;
  }
  const shortCode = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (!/^[a-zA-Z0-9]{12}$/.test(shortCode)) {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{20,}$/.test(secret)) {
    return null;
  }
  return { shortCode, secret };
}

/**
 * Deterministic portal principal uid (#21, D1): re-redemption reuses the
 * same Firebase Auth user, so a client never accumulates ghost accounts.
 */
export function portalUid(wid: string, pid: string, cid: string): string {
  return `portal_${wid}_${pid}_${cid}`;
}

/** `https://siapp.app/p/{shortCode}_{secret}` on the apex origin (D-036). */
export function buildPortalUrl(origin: string, token: string): string {
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}/p/${token}`;
}

/**
 * Deterministic get-or-create anchor doc id for a client portal link, keyed by
 * the `(workspaceId, projectId, clientId)` triple (#142, Part B concurrency
 * fix). Every mint for the same triple derives the SAME id, so all concurrent
 * `getOrCreateClientPortalLink` transactions read ONE deterministic docRef and
 * contend on it — Firestore serializes those reads, aborting+retrying all but
 * one, which guarantees a single active link (empty-result QUERIES do not
 * serialize; a specific-docRef read does). The anchor is a pointer doc stored
 * INSIDE the rules-denied `magicLinks` collection; it carries no `shortCode`,
 * `audience`, `subjectId` or `revoked` field, so the redeem collection-group
 * lookup and the deletePersonalData / revoke sweeps never match it. The
 * `anchor_` prefix + SHA-256 hex keeps it disjoint from 20-char auto-ids.
 */
export function portalLinkAnchorId(
  workspaceId: string,
  projectId: string,
  clientId: string,
): string {
  const digest = createHash('sha256')
    .update(`${workspaceId}:${projectId}:${clientId}`)
    .digest('hex');
  return `anchor_${digest}`;
}

/** Mirrors COLLAB_LINK_TTL_DAYS in @siapp/shared (#22). */
export const COLLAB_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Deterministic collaborator principal uid (#127): one auth user per
 * (workspace, collaborator) pair, so re-redemption never accumulates ghosts.
 * ids are Firestore auto-ids (no underscores), so the uid splits cleanly:
 * ['collab', wid, colid].
 */
export function collabUid(wid: string, colid: string): string {
  return `collab_${wid}_${colid}`;
}

/**
 * The collaborator id from a `collab_{wid}_{colid}` uid, or null when the
 * value is not a collab principal uid (#127 activity attribution).
 */
export function parseCollabUid(uid: string): { wid: string; colid: string } | null {
  if (!uid.startsWith('collab_')) {
    return null;
  }
  const parts = uid.split('_');
  if (parts.length !== 3 || parts[1] === '' || parts[2] === '') {
    return null;
  }
  return { wid: parts[1], colid: parts[2] };
}

/** `https://siapp.app/t/{shortCode}_{secret}` on the apex origin (D-036). */
export function buildCollabUrl(origin: string, token: string): string {
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}/t/${token}`;
}

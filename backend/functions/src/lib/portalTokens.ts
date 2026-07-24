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

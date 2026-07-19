/**
 * Pure invite helpers for the #11 invite callables — kept free of Admin SDK
 * imports so they unit-test without emulators (same convention as claims.ts).
 *
 * Wire/doc shapes mirror IInviteDoc / callableTypes in @siapp/shared; the
 * shared package is source-only with .ts-extension imports which this
 * package's NodeNext build cannot consume, so the contract is mirrored here.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const INVITE_ROLES = ['admin', 'pm', 'viewer'] as const;
export type TInviteRole = (typeof INVITE_ROLES)[number];

export const INVITE_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type TInviteStatus = (typeof INVITE_STATUSES)[number];

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Stable error codes surfaced to the accept page (mirrors TInviteErrorCode). */
export type TInviteErrorCode =
  | 'invite/not-found'
  | 'invite/expired'
  | 'invite/revoked'
  | 'invite/already-used'
  | 'invite/email-mismatch'
  | 'invite/email-unverified'
  | 'invite/already-member'
  | 'invite/already-in-workspace';

export function isInviteRole(value: unknown): value is TInviteRole {
  return typeof value === 'string' && (INVITE_ROLES as readonly string[]).includes(value);
}

/** Lowercased/trimmed email, or null when it is not a plausible address. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim().toLowerCase();
  // Deliberately loose — Firebase Auth is the real arbiter of valid emails.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return null;
  }
  return email;
}

/** 32 bytes of entropy, base64url — the raw token that is emailed, never stored. */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest — the only form of the token persisted in Firestore. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of a presented token against the stored hash. */
export function tokenMatchesHash(token: string, tokenHash: string): boolean {
  const presented = Buffer.from(hashInviteToken(token), 'hex');
  const stored = Buffer.from(tokenHash, 'hex');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

/** `/invite/{wid}/{inviteId}/{token}` on the dashboard origin. */
export function buildInviteUrl(
  origin: string,
  workspaceId: string,
  inviteId: string,
  token: string,
): string {
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}/invite/${encodeURIComponent(workspaceId)}/${encodeURIComponent(
    inviteId,
  )}/${encodeURIComponent(token)}`;
}

export interface IInviteState {
  status: TInviteStatus;
  expiresAtMs: number;
}

/**
 * Why an invite cannot be accepted right now, or null when it is acceptable.
 * A pending-but-expired invite maps to 'invite/expired' — callers should also
 * lazily stamp `status: 'expired'` on the doc.
 */
export function inviteAcceptBlocker(state: IInviteState, nowMs: number): TInviteErrorCode | null {
  if (state.status === 'revoked') {
    return 'invite/revoked';
  }
  if (state.status === 'accepted') {
    return 'invite/already-used';
  }
  if (state.status === 'expired' || state.expiresAtMs <= nowMs) {
    return 'invite/expired';
  }
  return null;
}

import { describe, expect, it } from 'vitest';

import {
  INVITE_TTL_MS,
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  inviteAcceptBlocker,
  isInviteRole,
  normalizeEmail,
  tokenMatchesHash,
} from './invites.js';

describe('isInviteRole', () => {
  it('accepts the invitable roles', () => {
    expect(isInviteRole('admin')).toBe(true);
    expect(isInviteRole('pm')).toBe(true);
    expect(isInviteRole('viewer')).toBe(true);
  });

  it('rejects owner — ownership is never granted by invite', () => {
    expect(isInviteRole('owner')).toBe(false);
  });

  it('rejects junk values', () => {
    expect(isInviteRole('')).toBe(false);
    expect(isInviteRole(undefined)).toBe(false);
    expect(isInviteRole(42)).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  New.Hire@Example.COM ')).toBe('new.hire@example.com');
  });

  it('rejects malformed addresses and non-strings', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail('two words@example.com')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe('token generation and hashing', () => {
  it('generates unique high-entropy url-safe tokens', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes to sha256 hex and never echoes the raw token', () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it('matches a token only against its own hash', () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(tokenMatchesHash(token, hash)).toBe(true);
    expect(tokenMatchesHash(generateInviteToken(), hash)).toBe(false);
    expect(tokenMatchesHash(token, 'zz-not-hex')).toBe(false);
  });
});

describe('buildInviteUrl', () => {
  it('builds /invite/{wid}/{inviteId}/{token} on the given origin', () => {
    expect(buildInviteUrl('https://dashboard.siapp.app', 'wks1', 'inv1', 'tok')).toBe(
      'https://dashboard.siapp.app/invite/wks1/inv1/tok',
    );
  });

  it('tolerates a trailing slash and escapes segments', () => {
    expect(buildInviteUrl('http://localhost:5173/', 'wks 1', 'inv1', 'a/b')).toBe(
      'http://localhost:5173/invite/wks%201/inv1/a%2Fb',
    );
  });
});

describe('inviteAcceptBlocker', () => {
  const future = Date.now() + INVITE_TTL_MS;
  const past = Date.now() - 1000;

  it('returns null for a live pending invite', () => {
    expect(inviteAcceptBlocker({ status: 'pending', expiresAtMs: future }, Date.now())).toBeNull();
  });

  it('flags revoked, accepted and expired states with distinct codes', () => {
    expect(inviteAcceptBlocker({ status: 'revoked', expiresAtMs: future }, Date.now())).toBe(
      'invite/revoked',
    );
    expect(inviteAcceptBlocker({ status: 'accepted', expiresAtMs: future }, Date.now())).toBe(
      'invite/already-used',
    );
    expect(inviteAcceptBlocker({ status: 'expired', expiresAtMs: future }, Date.now())).toBe(
      'invite/expired',
    );
  });

  it('treats a pending invite past its expiry as expired (lazy expiry)', () => {
    expect(inviteAcceptBlocker({ status: 'pending', expiresAtMs: past }, Date.now())).toBe(
      'invite/expired',
    );
  });
});

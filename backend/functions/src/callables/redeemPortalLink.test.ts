/**
 * Pure verification tests for redeemPortalLink (#21, D1/D2): the link-state
 * blocker matrix and the uniform failure shape. Token parsing/hashing is
 * covered in lib/portalTokens.test.ts; the mint path runs in the emulator
 * walkthrough.
 */

import { describe, expect, it } from 'vitest';

import { invalidOrExpired, linkBlocker } from './redeemPortalLink.js';

const NOW = Date.parse('2026-07-23T00:00:00Z');

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    audience: 'client',
    scopeType: 'project',
    revoked: false,
    expiresAtMs: NOW + 1000,
    ...overrides,
  };
}

describe('linkBlocker', () => {
  it('accepts a live client project link', () => {
    expect(linkBlocker(validInput(), NOW)).toBeNull();
  });

  it('rejects collaborator links and non-project scopes', () => {
    expect(linkBlocker(validInput({ audience: 'collaborator' }), NOW)).toBe('audience');
    expect(linkBlocker(validInput({ scopeType: 'task' }), NOW)).toBe('audience');
    expect(linkBlocker(validInput({ audience: undefined }), NOW)).toBe('audience');
  });

  it('rejects revoked links (including malformed revoked fields)', () => {
    expect(linkBlocker(validInput({ revoked: true }), NOW)).toBe('revoked');
    expect(linkBlocker(validInput({ revoked: undefined }), NOW)).toBe('revoked');
    expect(linkBlocker(validInput({ revoked: 'no' }), NOW)).toBe('revoked');
  });

  it('rejects expired and unreadable expiries', () => {
    expect(linkBlocker(validInput({ expiresAtMs: NOW }), NOW)).toBe('expired');
    expect(linkBlocker(validInput({ expiresAtMs: NOW - 1 }), NOW)).toBe('expired');
    expect(linkBlocker(validInput({ expiresAtMs: null }), NOW)).toBe('expired');
  });
});

describe('invalidOrExpired', () => {
  it('is a single uniform permission-denied error with the stable code', () => {
    const error = invalidOrExpired();
    expect(error.code).toBe('permission-denied');
    expect(error.details).toEqual({ code: 'portal/invalid_or_expired' });
  });
});

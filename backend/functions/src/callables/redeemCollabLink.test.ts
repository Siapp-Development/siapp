/**
 * Pure verification tests for redeemCollabLink (#22): the link-state blocker
 * matrix (pins audience 'collaborator' + scope 'task') and the uniform
 * failure shape. Token parsing/hashing is covered in
 * lib/portalTokens.test.ts; the mint path runs in the emulator walkthrough.
 */

import { describe, expect, it } from 'vitest';

import { collabInvalidOrExpired, collabLinkBlocker } from './redeemCollabLink.js';

const NOW = Date.parse('2026-07-23T00:00:00Z');

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    audience: 'collaborator',
    scopeType: 'task',
    revoked: false,
    expiresAtMs: NOW + 1000,
    ...overrides,
  };
}

describe('collabLinkBlocker', () => {
  it('accepts a live collaborator task link', () => {
    expect(collabLinkBlocker(validInput(), NOW)).toBeNull();
  });

  it('rejects client links and non-task scopes', () => {
    expect(collabLinkBlocker(validInput({ audience: 'client' }), NOW)).toBe('audience');
    expect(collabLinkBlocker(validInput({ scopeType: 'project' }), NOW)).toBe('audience');
    expect(collabLinkBlocker(validInput({ audience: undefined }), NOW)).toBe('audience');
  });

  it('rejects revoked links (including malformed revoked fields)', () => {
    expect(collabLinkBlocker(validInput({ revoked: true }), NOW)).toBe('revoked');
    expect(collabLinkBlocker(validInput({ revoked: undefined }), NOW)).toBe('revoked');
    expect(collabLinkBlocker(validInput({ revoked: 'no' }), NOW)).toBe('revoked');
  });

  it('rejects expired and unreadable expiries', () => {
    expect(collabLinkBlocker(validInput({ expiresAtMs: NOW }), NOW)).toBe('expired');
    expect(collabLinkBlocker(validInput({ expiresAtMs: NOW - 1 }), NOW)).toBe('expired');
    expect(collabLinkBlocker(validInput({ expiresAtMs: null }), NOW)).toBe('expired');
  });
});

describe('collabInvalidOrExpired', () => {
  it('is a single uniform permission-denied error with the stable code', () => {
    const error = collabInvalidOrExpired();
    expect(error.code).toBe('permission-denied');
    expect(error.details).toEqual({ code: 'collab/invalid_or_expired' });
  });
});

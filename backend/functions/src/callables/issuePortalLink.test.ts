/**
 * Pure gate tests for issuePortalLink (#21): the D-027 lifecycle gate and
 * linked-client requirement. The Firestore/audit side runs in the emulator
 * walkthrough; role gating mirrors the other callables' claim checks.
 */

import { describe, expect, it } from 'vitest';

import { PORTAL_ISSUABLE_LIFECYCLES, issueBlocker } from './issuePortalLink.js';

describe('issueBlocker', () => {
  it('allows published and completed projects with a linked client', () => {
    for (const lifecycle of PORTAL_ISSUABLE_LIFECYCLES) {
      expect(issueBlocker({ projectExists: true, lifecycle, clientId: 'c1' })).toBeNull();
    }
  });

  it('rejects a missing project', () => {
    expect(issueBlocker({ projectExists: false, lifecycle: 'published', clientId: 'c1' })).toBe(
      'not-found',
    );
  });

  it('rejects draft, archived and deleted lifecycles (D-027 gate)', () => {
    for (const lifecycle of ['draft', 'archived', 'deleted']) {
      expect(issueBlocker({ projectExists: true, lifecycle, clientId: 'c1' })).toBe(
        'not-published',
      );
    }
  });

  it('rejects a malformed lifecycle value', () => {
    expect(issueBlocker({ projectExists: true, lifecycle: 42, clientId: 'c1' })).toBe(
      'not-published',
    );
    expect(issueBlocker({ projectExists: true, lifecycle: undefined, clientId: 'c1' })).toBe(
      'not-published',
    );
  });

  it('rejects a project without a linked client', () => {
    expect(issueBlocker({ projectExists: true, lifecycle: 'published', clientId: '' })).toBe(
      'no-client',
    );
    expect(
      issueBlocker({ projectExists: true, lifecycle: 'published', clientId: undefined }),
    ).toBe('no-client');
  });
});

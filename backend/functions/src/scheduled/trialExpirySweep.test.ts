import { describe, expect, it } from 'vitest';

import { isExpiredTrial } from './trialExpirySweep.js';

const NOW = new Date('2026-07-24T00:15:00Z');

function ts(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

describe('isExpiredTrial (D7 trial-only auto-expiry)', () => {
  it('accepts a trial past its expiry', () => {
    expect(isExpiredTrial({ plan: 'trial', planExpiresAt: ts('2026-07-23T00:00:00Z') }, NOW)).toBe(
      true,
    );
  });

  it('accepts a trial expiring exactly now', () => {
    expect(isExpiredTrial({ plan: 'trial', planExpiresAt: ts('2026-07-24T00:15:00Z') }, NOW)).toBe(
      true,
    );
  });

  it('rejects a trial with a future expiry', () => {
    expect(isExpiredTrial({ plan: 'trial', planExpiresAt: ts('2026-07-25T00:00:00Z') }, NOW)).toBe(
      false,
    );
  });

  it('never expires paid plans, however late (D7)', () => {
    expect(
      isExpiredTrial({ plan: 'standard', planExpiresAt: ts('2020-01-01T00:00:00Z') }, NOW),
    ).toBe(false);
    expect(
      isExpiredTrial({ plan: 'business', planExpiresAt: ts('2020-01-01T00:00:00Z') }, NOW),
    ).toBe(false);
  });

  it('skips workspaces already read-only (idempotent re-runs)', () => {
    expect(
      isExpiredTrial(
        {
          plan: 'trial',
          billingStatus: 'read_only',
          planExpiresAt: ts('2026-07-01T00:00:00Z'),
        },
        NOW,
      ),
    ).toBe(false);
  });

  it('treats an explicit active status as expirable', () => {
    expect(
      isExpiredTrial(
        { plan: 'trial', billingStatus: 'active', planExpiresAt: ts('2026-07-01T00:00:00Z') },
        NOW,
      ),
    ).toBe(true);
  });

  it('never expires on a missing or malformed planExpiresAt', () => {
    expect(isExpiredTrial({ plan: 'trial' }, NOW)).toBe(false);
    expect(isExpiredTrial({ plan: 'trial', planExpiresAt: '2026-07-01' }, NOW)).toBe(false);
  });
});

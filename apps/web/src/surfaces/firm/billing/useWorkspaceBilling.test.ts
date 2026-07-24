import { Timestamp } from 'firebase/firestore';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));

import { mapWorkspaceBilling } from './useWorkspaceBilling.ts';

const NOW = new Date('2026-07-16T00:00:00Z');

describe('mapWorkspaceBilling', () => {
  it('defaults to an active trial when the doc has no billing fields', () => {
    const billing = mapWorkspaceBilling(undefined, NOW);

    expect(billing.plan).toBe('trial');
    expect(billing.billingStatus).toBe('active');
    expect(billing.waUsed).toBe(0);
    // Trial pool fallback via includedForPlan
    expect(billing.waIncluded).toBe(30);
    expect(billing.waUsedFraction).toBe(0);
    expect(billing.waForecast).toBe(0);
  });

  it('treats a missing billingStatus as active (pre-#24 docs, no backfill)', () => {
    const billing = mapWorkspaceBilling({ plan: 'standard', seatLimit: 5 }, NOW);
    expect(billing.billingStatus).toBe('active');
  });

  it('maps read_only and the stored allowance', () => {
    const billing = mapWorkspaceBilling(
      {
        plan: 'standard',
        billingStatus: 'read_only',
        seatLimit: 5,
        seatsUsed: 3,
        whatsappAllowance: {
          includedPerPeriod: 250,
          used: 225,
          periodStart: Timestamp.fromDate(new Date('2026-07-01T00:00:00Z')),
        },
      },
      NOW,
    );

    expect(billing.billingStatus).toBe('read_only');
    expect(billing.waUsed).toBe(225);
    expect(billing.waIncluded).toBe(250);
    expect(billing.waUsedFraction).toBeCloseTo(0.9);
  });

  it('falls back to includedForPlan when includedPerPeriod is absent', () => {
    const billing = mapWorkspaceBilling({ plan: 'business', seatLimit: 4 }, NOW);
    expect(billing.waIncluded).toBe(400);
  });

  it('projects usage linearly to month end', () => {
    // Half the month elapsed at 100 used -> ~206 by 1 Aug (31-day July).
    const billing = mapWorkspaceBilling(
      {
        plan: 'standard',
        seatLimit: 2,
        whatsappAllowance: {
          includedPerPeriod: 100,
          used: 100,
          periodStart: Timestamp.fromDate(new Date('2026-07-01T00:00:00Z')),
        },
      },
      NOW,
    );

    expect(billing.waForecast).toBeGreaterThan(200);
    expect(billing.waForecast).toBeLessThan(210);
  });
});

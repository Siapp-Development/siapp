import { describe, expect, it } from 'vitest';

import {
  USAGE_ALERT_AT,
  crossedThreshold,
  includedForPlan,
  periodKey,
  rollAllowance,
} from './billing.js';

describe('includedForPlan (D-020 allowance arithmetic)', () => {
  it('gives the trial its one-time 30 pool regardless of seats', () => {
    expect(includedForPlan('trial', 1)).toBe(30);
    expect(includedForPlan('trial', 10)).toBe(30);
  });

  it('scales paid plans per seat', () => {
    expect(includedForPlan('standard', 5)).toBe(250);
    expect(includedForPlan('business', 5)).toBe(500);
    expect(includedForPlan('standard', 1)).toBe(50);
  });

  it('treats zero/negative seats as one seat', () => {
    expect(includedForPlan('standard', 0)).toBe(50);
  });
});

describe('crossedThreshold (90% alert edge)', () => {
  it('fires when the increment lands exactly on the line', () => {
    // 90% of 100 = 90: 89 → 90 crosses.
    expect(crossedThreshold(89, 90, 100, USAGE_ALERT_AT)).toBe(true);
  });

  it('fires when the increment jumps over the line', () => {
    expect(crossedThreshold(88, 91, 100, USAGE_ALERT_AT)).toBe(true);
  });

  it('does not fire below the line or when already past it', () => {
    expect(crossedThreshold(80, 81, 100, USAGE_ALERT_AT)).toBe(false);
    expect(crossedThreshold(90, 91, 100, USAGE_ALERT_AT)).toBe(false);
    expect(crossedThreshold(95, 96, 100, USAGE_ALERT_AT)).toBe(false);
  });

  it('handles fractional lines (90% of 250 = 225)', () => {
    expect(crossedThreshold(224, 225, 250, USAGE_ALERT_AT)).toBe(true);
    expect(crossedThreshold(225, 226, 250, USAGE_ALERT_AT)).toBe(false);
  });

  it('never fires on a zero allowance', () => {
    expect(crossedThreshold(0, 1, 0, USAGE_ALERT_AT)).toBe(false);
  });
});

describe('periodKey (MYT month key)', () => {
  it('formats YYYY-MM in Malaysia time', () => {
    expect(periodKey(new Date('2026-07-15T04:00:00Z'))).toBe('2026-07');
  });

  it('rolls to the next month at MYT midnight, not UTC midnight', () => {
    // 2026-07-31 17:00 UTC = 2026-08-01 01:00 MYT.
    expect(periodKey(new Date('2026-07-31T17:00:00Z'))).toBe('2026-08');
    expect(periodKey(new Date('2026-07-31T15:00:00Z'))).toBe('2026-07');
  });
});

describe('rollAllowance (month rollover, D4)', () => {
  const july = new Date('2026-07-01T00:00:00Z');
  const august = new Date('2026-08-10T04:00:00Z');

  it('keeps the allowance inside the same period', () => {
    const state = { used: 12, periodStart: july };
    expect(rollAllowance('standard', state, new Date('2026-07-20T04:00:00Z'))).toBe(state);
  });

  it('resets paid plans when the month changes', () => {
    const rolled = rollAllowance('standard', { used: 12, periodStart: july }, august);
    expect(rolled.used).toBe(0);
    expect(rolled.periodStart).toBe(august);
  });

  it('never resets the trial one-time pool', () => {
    const state = { used: 12, periodStart: july };
    expect(rollAllowance('trial', state, august)).toBe(state);
  });
});

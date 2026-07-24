import { describe, expect, it, vi } from 'vitest';

import { countsAgainstAllowance, recordMessageUsage } from './messageUsage.js';

vi.mock('firebase-admin/firestore', () => {
  interface IFakeSnap {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
    get: (field: string) => unknown;
  }
  const wsData: Record<string, unknown> = {
    plan: 'trial',
    whatsappAllowance: {
      includedPerPeriod: 30,
      used: 5,
      periodStart: { toDate: () => new Date('2026-07-01T00:00:00Z') },
    },
  };
  const snap = (data: Record<string, unknown> | undefined): IFakeSnap => ({
    exists: data !== undefined,
    data: () => data,
    get: (field: string) => data?.[field],
  });
  const fakeDb = {
    doc: (path: string) => ({ path }),
    runTransaction: async <T>(
      fn: (txn: {
        get: (ref: { path: string }) => Promise<IFakeSnap>;
        update: (ref: { path: string }, data: Record<string, unknown>) => void;
        set: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<T>,
    ): Promise<T> => {
      let wroteAlready = false;
      return fn({
        get: (ref) => {
          if (wroteAlready) {
            // Mirrors the real emulator/production behaviour: Firestore
            // transactions reject any read issued after the first write.
            throw new Error('Firestore transactions require all reads before writes');
          }
          return Promise.resolve(snap(ref.path === 'workspaces/w1' ? wsData : undefined));
        },
        update: () => {
          wroteAlready = true;
        },
        set: () => {
          wroteAlready = true;
        },
      });
    },
  };
  return {
    getFirestore: () => fakeDb,
    Timestamp: { fromDate: (d: Date) => d },
  };
});

describe('countsAgainstAllowance (D4 enqueue-time counting filter)', () => {
  it('counts a plain queued message', () => {
    expect(countsAgainstAllowance({ status: 'queued', trigger: 'task_status_change' })).toBe(true);
  });

  it('counts a quiet-hours held message (it will still dispatch)', () => {
    expect(
      countsAgainstAllowance({
        status: 'queued',
        trigger: 'task_due_soon',
        holdUntil: new Date(),
      }),
    ).toBe(true);
  });

  it('skips suppressed records — they never dispatch', () => {
    expect(
      countsAgainstAllowance({
        status: 'queued',
        trigger: 'task_status_change',
        suppressed: true,
        suppressedReason: 'opt_out',
      }),
    ).toBe(false);
  });

  it('skips the 90% quota DM itself — no self-counting loop', () => {
    expect(countsAgainstAllowance({ status: 'queued', trigger: 'wa_quota_90' })).toBe(false);
  });
});

describe('recordMessageUsage transaction shape', () => {
  it('performs every read before the first write (Firestore txn invariant)', async () => {
    // Regression for the live-smoke failure where the usageCounters read
    // happened after the workspace update, so every real txn threw.
    await expect(
      recordMessageUsage('w1', { status: 'queued', trigger: 'task_status_change' }),
    ).resolves.toBeUndefined();
  });
});

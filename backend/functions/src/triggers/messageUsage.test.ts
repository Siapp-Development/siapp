import { beforeEach, describe, expect, it, vi } from 'vitest';

import { countsAgainstAllowance, recordMessageUsage } from './messageUsage.js';

const mockState = vi.hoisted(() => ({
  workspaceData: {
    plan: 'trial',
    whatsappAllowance: {
      includedPerPeriod: 30,
      used: 26,
      periodStart: { toDate: () => new Date('2026-07-01T00:00:00Z') },
    },
    ownerId: 'user-owner',
    name: 'Acme Builders',
  } as Record<string, unknown>,
  ownerData: { phone: '+60123456789' } as Record<string, unknown>,
  createdMessages: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));

vi.mock('firebase-admin/firestore', () => {
  interface IFakeSnap {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
    get: (field: string) => unknown;
  }
  const snap = (data: Record<string, unknown> | undefined): IFakeSnap => ({
    exists: data !== undefined,
    data: () => data,
    get: (field: string) => data?.[field],
  });
  const fakeDb = {
    doc: (path: string) => ({
      path,
      get: async () =>
        snap(
          path === 'workspaces/w1'
            ? mockState.workspaceData
            : path === 'users/user-owner'
              ? mockState.ownerData
              : undefined,
        ),
      create: async (data: Record<string, unknown>) => {
        mockState.createdMessages.push({ path, data });
      },
    }),
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
          return Promise.resolve(
            snap(ref.path === 'workspaces/w1' ? mockState.workspaceData : undefined),
          );
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

beforeEach(() => {
  mockState.workspaceData['whatsappAllowance'] = {
    includedPerPeriod: 30,
    used: 26,
    periodStart: { toDate: () => new Date('2026-07-01T00:00:00Z') },
  };
  mockState.workspaceData['ownerId'] = 'user-owner';
  mockState.workspaceData['name'] = 'Acme Builders';
  mockState.ownerData['phone'] = '+60123456789';
  mockState.createdMessages.length = 0;
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
  it('performs every read before the first write and stamps queued quota alerts', async () => {
    // Regression for the live-smoke failure where the usageCounters read
    // happened after the workspace update, so every real txn threw.
    await expect(
      recordMessageUsage(
        'w1',
        { status: 'queued', trigger: 'task_status_change' },
        new Date('2026-10-11T12:00:00Z'),
      ),
    ).resolves.toBeUndefined();

    expect(mockState.createdMessages).toHaveLength(1);
    expect(mockState.createdMessages[0]).toMatchObject({
      path: 'workspaces/w1/messages/quota90_w1_2026-10',
      data: {
        trigger: 'wa_quota_90',
        status: 'queued',
        recipientType: 'member',
        restrictedToDepartments: [],
      },
    });
    expect(mockState.createdMessages[0]?.data['suppressed']).toBeUndefined();
  });

  it('stamps suppressed quota alerts too when the owner has no phone', async () => {
    mockState.ownerData['phone'] = undefined;

    await recordMessageUsage(
      'w1',
      { status: 'queued', trigger: 'task_status_change' },
      new Date('2026-10-11T12:00:00Z'),
    );

    expect(mockState.createdMessages).toHaveLength(1);
    expect(mockState.createdMessages[0]?.data).toMatchObject({
      trigger: 'wa_quota_90',
      status: 'queued',
      suppressed: true,
      suppressedReason: 'no_phone',
      restrictedToDepartments: [],
    });
  });
});

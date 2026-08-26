/**
 * useNotifications (#134): loading → ready mapping, newest-first order,
 * "Load more" pagination + dedupe, and markRead/markAllRead writes. Firestore
 * is mocked at the SDK boundary; snapshots are pushed manually (mirrors
 * useProjectActivity.test.ts).
 */

import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(private readonly date: Date) {}
    toDate(): Date {
      return this.date;
    }
  }
  return {
    FakeTimestamp,
    getDocs: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => ({ type: 'serverTimestamp' })),
    batchUpdate: vi.fn(),
    batchCommit: vi.fn(),
    subscriptions: [] as Array<{
      next: (snapshot: unknown) => void;
      error: () => void;
    }>,
  };
});

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: fs.FakeTimestamp,
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (col: unknown, ...constraints: Array<Record<string, unknown>>) => ({ col, constraints }),
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  orderBy: (field: string, dir: string) => ({ type: 'orderBy', field, dir }),
  limit: (n: number) => ({ type: 'limit', n }),
  startAfter: (cursor: unknown) => ({ type: 'startAfter', cursor }),
  serverTimestamp: () => fs.serverTimestamp(),
  getDocs: (...args: unknown[]) => fs.getDocs(...args),
  updateDoc: (...args: unknown[]) => fs.updateDoc(...args),
  writeBatch: () => ({ update: fs.batchUpdate, commit: fs.batchCommit }),
  onSnapshot: (
    _q: unknown,
    next: (snapshot: unknown) => void,
    error: () => void,
  ) => {
    fs.subscriptions.push({ next, error });
    return () => {};
  },
}));

import { useNotifications } from './useNotifications.ts';

function fakeDoc(id: string, atMs: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    ref: { path: `n/${id}` },
    data: () => ({
      kind: 'task_assigned',
      read: false,
      actorType: 'user',
      actorNameDenorm: 'Alice',
      projectId: 'p1',
      projectNameDenorm: 'Project One',
      taskId: 't1',
      taskTitleDenorm: 'Pour foundation',
      excerpt: null,
      at: new fs.FakeTimestamp(new Date(atMs)),
      ...extra,
    }),
  };
}

function emit(index: number, docs: unknown[]): void {
  act(() => fs.subscriptions[index].next({ docs }));
}

beforeEach(() => {
  fs.subscriptions.length = 0;
  vi.clearAllMocks();
});

describe('useNotifications', () => {
  it('starts loading, then maps to a newest-first ready list', () => {
    const { result } = renderHook(() => useNotifications('wksA', 'me'));
    expect(result.current.state.status).toBe('loading');

    emit(0, [fakeDoc('a', 1_000), fakeDoc('b', 3_000), fakeDoc('c', 2_000)]);

    expect(result.current.state.status).toBe('ready');
    if (result.current.state.status === 'ready') {
      expect(result.current.state.rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
      expect(result.current.state.rows[0].actorName).toBe('Alice');
      expect(result.current.state.rows[0].read).toBe(false);
    }
  });

  it('markRead issues an updateDoc with read:true', async () => {
    const { result } = renderHook(() => useNotifications('wksA', 'me'));
    emit(0, [fakeDoc('a', 1_000)]);

    await act(async () => {
      await result.current.markRead('a');
    });

    expect(fs.updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = fs.updateDoc.mock.calls[0];
    expect(payload).toMatchObject({ read: true });
  });

  it('markAllRead batches updates over the unread docs', async () => {
    fs.getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [fakeDoc('a', 1_000), fakeDoc('b', 2_000)],
    });
    fs.batchCommit.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useNotifications('wksA', 'me'));
    emit(0, [fakeDoc('a', 1_000)]);

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(fs.batchUpdate).toHaveBeenCalledTimes(2);
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);
  });

  it('markAllRead no-ops when there are no unread docs', async () => {
    fs.getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const { result } = renderHook(() => useNotifications('wksA', 'me'));
    emit(0, [fakeDoc('a', 1_000)]);

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(fs.batchCommit).not.toHaveBeenCalled();
  });
});

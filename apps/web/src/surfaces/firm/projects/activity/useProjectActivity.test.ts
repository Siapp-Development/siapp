/**
 * useProjectActivity (#23 D8): owner single-query vs pm merged multi-query
 * behaviour, dedupe by id, newest-first sort. Firestore is mocked at the SDK
 * boundary; snapshots are pushed manually.
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
    subscriptions: [] as Array<{
      q: { constraints: Array<Record<string, unknown>> };
      next: (snapshot: unknown) => void;
      error: () => void;
    }>,
  };
});

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: fs.FakeTimestamp,
  collection: (_db: unknown, path: string) => ({ path }),
  query: (col: unknown, ...constraints: Array<Record<string, unknown>>) => ({ col, constraints }),
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  orderBy: (field: string, dir: string) => ({ type: 'orderBy', field, dir }),
  limit: (n: number) => ({ type: 'limit', n }),
  startAfter: (cursor: unknown) => ({ type: 'startAfter', cursor }),
  getDocs: vi.fn(),
  onSnapshot: (
    q: { constraints: Array<Record<string, unknown>> },
    next: (snapshot: unknown) => void,
    error: () => void,
  ) => {
    fs.subscriptions.push({ q, next, error });
    return () => {};
  },
}));

import { useProjectActivity } from './useProjectActivity.ts';

function fakeDoc(id: string, atMs: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    data: () => ({
      action: 'task_created',
      actorType: 'user',
      actorNameDenorm: 'Alice',
      restrictedToDepartments: [],
      payload: {},
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

describe('useProjectActivity', () => {
  it('owner subscribes with a single unconstrained query and sorts newest first', () => {
    const { result } = renderHook(() => useProjectActivity('wksA', 'p1', 'owner', []));

    expect(fs.subscriptions).toHaveLength(1);
    expect(
      fs.subscriptions[0].q.constraints.some((c) => c['type'] === 'where'),
    ).toBe(false);

    emit(0, [fakeDoc('a', 1_000), fakeDoc('b', 3_000), fakeDoc('c', 2_000)]);

    expect(result.current.status).toBe('ready');
    if (result.current.status === 'ready') {
      expect(result.current.rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
      expect(result.current.hasMore).toBe(false);
    }
  });

  it('pm gets an unrestricted query plus one per department, deduped by id', () => {
    const { result } = renderHook(() => useProjectActivity('wksA', 'p1', 'pm', ['structural']));

    expect(fs.subscriptions).toHaveLength(2);
    const filters = fs.subscriptions.map((sub) =>
      sub.q.constraints.find((c) => c['type'] === 'where'),
    );
    expect(filters[0]).toMatchObject({ field: 'restrictedToDepartments', op: '==', value: [] });
    expect(filters[1]).toMatchObject({
      field: 'restrictedToDepartments',
      op: 'array-contains',
      value: 'structural',
    });

    // Not ready until every query has answered.
    emit(0, [fakeDoc('open1', 2_000)]);
    expect(result.current.status).toBe('loading');

    emit(1, [
      fakeDoc('restricted1', 3_000, { restrictedToDepartments: ['structural'] }),
      fakeDoc('open1', 2_000), // overlap — must dedupe
    ]);

    expect(result.current.status).toBe('ready');
    if (result.current.status === 'ready') {
      expect(result.current.rows.map((r) => r.id)).toEqual(['restricted1', 'open1']);
    }
  });

  it('reports an error when any subscription fails', () => {
    const { result } = renderHook(() => useProjectActivity('wksA', 'p1', 'owner', []));
    act(() => fs.subscriptions[0].error());
    expect(result.current.status).toBe('error');
  });
});

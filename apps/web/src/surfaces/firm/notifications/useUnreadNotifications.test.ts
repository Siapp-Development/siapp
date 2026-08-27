/**
 * useUnreadNotifications (#134): the red dot is true when the limit(1) unread
 * snapshot is non-empty, false when empty. Firestore is mocked at the SDK
 * boundary.
 */

import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  subscriptions: [] as Array<{ next: (snapshot: unknown) => void; error: () => void }>,
}));

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  query: (col: unknown, ...constraints: Array<Record<string, unknown>>) => ({ col, constraints }),
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  limit: (n: number) => ({ type: 'limit', n }),
  onSnapshot: (_q: unknown, next: (snapshot: unknown) => void, error: () => void) => {
    fs.subscriptions.push({ next, error });
    return () => {};
  },
}));

import { useUnreadNotifications } from './useUnreadNotifications.ts';

beforeEach(() => {
  fs.subscriptions.length = 0;
  vi.clearAllMocks();
});

describe('useUnreadNotifications', () => {
  it('is false before any snapshot', () => {
    const { result } = renderHook(() => useUnreadNotifications('wksA', 'me'));
    expect(result.current).toBe(false);
  });

  it('is true when the unread snapshot is non-empty', () => {
    const { result } = renderHook(() => useUnreadNotifications('wksA', 'me'));
    act(() => fs.subscriptions[0].next({ empty: false }));
    expect(result.current).toBe(true);
  });

  it('is false when the unread snapshot is empty', () => {
    const { result } = renderHook(() => useUnreadNotifications('wksA', 'me'));
    act(() => fs.subscriptions[0].next({ empty: false }));
    act(() => fs.subscriptions[0].next({ empty: true }));
    expect(result.current).toBe(false);
  });

  it('is false when the subscription errors', () => {
    const { result } = renderHook(() => useUnreadNotifications('wksA', 'me'));
    act(() => fs.subscriptions[0].next({ empty: false }));
    act(() => fs.subscriptions[0].error());
    expect(result.current).toBe(false);
  });
});

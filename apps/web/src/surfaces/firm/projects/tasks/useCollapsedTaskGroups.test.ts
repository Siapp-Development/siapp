import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCollapsedTaskGroups } from './useCollapsedTaskGroups.ts';

const KEY_PREFIX = 'siapp:tasks-collapsed:';

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => (store.has(key) ? (store.get(key) as string) : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

let storage: ReturnType<typeof createStorageMock>;

beforeEach(() => {
  storage = createStorageMock();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCollapsedTaskGroups', () => {
  it('defaults to no collapsed groups with no stored preference', () => {
    const { result } = renderHook(() => useCollapsedTaskGroups('p1'));

    expect([...result.current.collapsed]).toEqual([]);
  });

  it('reads an existing collapsed set from localStorage on mount', () => {
    storage.setItem(`${KEY_PREFIX}p1`, JSON.stringify(['phaseA', 'phaseB']));

    const { result } = renderHook(() => useCollapsedTaskGroups('p1'));

    expect([...result.current.collapsed].sort()).toEqual(['phaseA', 'phaseB']);
  });

  it('persists collapsed groups to localStorage under the project key', () => {
    const { result } = renderHook(() => useCollapsedTaskGroups('p1'));

    act(() => result.current.setCollapsed((prev) => new Set(prev).add('phaseA')));

    expect(storage.getItem(`${KEY_PREFIX}p1`)).toBe(JSON.stringify(['phaseA']));
  });

  it('keeps each project’s accordion state isolated', () => {
    storage.setItem(`${KEY_PREFIX}p2`, JSON.stringify(['phaseZ']));
    const { result, rerender } = renderHook(({ pid }) => useCollapsedTaskGroups(pid), {
      initialProps: { pid: 'p1' },
    });

    act(() => result.current.setCollapsed(new Set(['phaseA'])));
    expect([...result.current.collapsed]).toEqual(['phaseA']);

    rerender({ pid: 'p2' });
    expect([...result.current.collapsed]).toEqual(['phaseZ']);

    rerender({ pid: 'p1' });
    expect([...result.current.collapsed]).toEqual(['phaseA']);
  });

  it('degrades to no collapsed groups when localStorage.getItem throws', () => {
    storage.getItem.mockImplementation(() => {
      throw new Error('storage disabled');
    });

    const { result } = renderHook(() => useCollapsedTaskGroups('p1'));

    expect([...result.current.collapsed]).toEqual([]);
  });

  it('ignores malformed stored data', () => {
    storage.setItem(`${KEY_PREFIX}p1`, '{"not":"an array"}');

    const { result } = renderHook(() => useCollapsedTaskGroups('p1'));

    expect([...result.current.collapsed]).toEqual([]);
  });

  it('does not throw when localStorage.setItem is blocked (best-effort persistence)', () => {
    storage.setItem.mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    const { result } = renderHook(() => useCollapsedTaskGroups('p1'));

    expect(() =>
      act(() => result.current.setCollapsed(new Set(['phaseA']))),
    ).not.toThrow();
    expect([...result.current.collapsed]).toEqual(['phaseA']);
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSidebarCollapsed } from './useSidebarCollapsed.ts';

const STORAGE_KEY = 'siapp:sidebar-collapsed';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useSidebarCollapsed', () => {
  it('defaults to expanded (not collapsed) with no stored preference', () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });

  it('reads an existing collapsed preference from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true');

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(true);
  });

  it('toggles the collapsed state and persists it to localStorage', () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => result.current.toggle());

    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');

    act(() => result.current.toggle());

    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('persists an explicit setCollapsed(true)', () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => result.current.setCollapsed(true));

    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('degrades to the expanded default when localStorage.getItem throws', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });

  it('does not throw when localStorage.setItem is blocked (best-effort persistence)', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(() => act(() => result.current.toggle())).not.toThrow();
    expect(result.current.collapsed).toBe(true);
  });
});

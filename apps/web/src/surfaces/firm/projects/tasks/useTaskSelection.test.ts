/**
 * useTaskSelection (#156): keyed-by-id ephemeral multi-select for the firm
 * Tasks list. Covers toggle, group select-all with indeterminate state,
 * clear, and pruning of ids that leave the selectable set.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useTaskSelection } from './useTaskSelection.ts';

describe('useTaskSelection', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useTaskSelection(['a', 'b', 'c']));

    expect(result.current.count).toBe(0);
    expect(result.current.isSelected('a')).toBe(false);
    expect(result.current.selectedIds).toEqual([]);
  });

  it('toggles a single id on and off', () => {
    const { result } = renderHook(() => useTaskSelection(['a', 'b', 'c']));

    act(() => result.current.toggle('b'));
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle('b'));
    expect(result.current.isSelected('b')).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('selectMany / deselectMany act on batches', () => {
    const { result } = renderHook(() => useTaskSelection(['a', 'b', 'c']));

    act(() => result.current.selectMany(['a', 'c']));
    expect(result.current.selectedIds).toEqual(['a', 'c']);

    act(() => result.current.deselectMany(['a']));
    expect(result.current.selectedIds).toEqual(['c']);
  });

  it('groupState returns none / some / all over the group ids', () => {
    const { result } = renderHook(() => useTaskSelection(['a', 'b', 'c', 'd']));

    expect(result.current.groupState(['a', 'b'])).toBe('none');

    act(() => result.current.toggle('a'));
    expect(result.current.groupState(['a', 'b'])).toBe('some');

    act(() => result.current.toggle('b'));
    expect(result.current.groupState(['a', 'b'])).toBe('all');
  });

  it('toggleGroup selects the whole group then clears it', () => {
    const { result } = renderHook(() => useTaskSelection(['a', 'b', 'c']));

    act(() => result.current.toggleGroup(['a', 'b']));
    expect(result.current.groupState(['a', 'b'])).toBe('all');
    expect(result.current.count).toBe(2);

    act(() => result.current.toggleGroup(['a', 'b']));
    expect(result.current.groupState(['a', 'b'])).toBe('none');
    expect(result.current.count).toBe(0);
  });

  it('toggleGroup on a partial group selects the remaining ids', () => {
    const { result } = renderHook(() => useTaskSelection(['a', 'b', 'c']));

    act(() => result.current.toggle('a'));
    act(() => result.current.toggleGroup(['a', 'b']));

    expect(result.current.groupState(['a', 'b'])).toBe('all');
  });

  it('clear removes everything', () => {
    const { result } = renderHook(() => useTaskSelection(['a', 'b', 'c']));

    act(() => result.current.selectMany(['a', 'b']));
    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
  });

  it('prunes ids that leave the selectable set', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useTaskSelection(ids),
      { initialProps: { ids: ['a', 'b', 'c'] } },
    );

    act(() => result.current.selectMany(['a', 'b']));
    expect(result.current.count).toBe(2);

    // Task 'b' is deleted / filtered out of the list.
    rerender({ ids: ['a', 'c'] });

    expect(result.current.isSelected('b')).toBe(false);
    expect(result.current.selectedIds).toEqual(['a']);
    expect(result.current.count).toBe(1);
  });
});

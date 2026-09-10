/**
 * Ephemeral multi-select state for the firm Tasks list view (#156). Selection
 * is keyed by task id (the list is single-project, so ids are unique) and is
 * NOT persisted — Escape / a successful bulk action clears it. Stale ids are
 * pruned whenever the underlying selectable row set changes so the floating
 * bar can never act on a task that was deleted or filtered away.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

/** Whether none, some, or all of a group's selectable ids are selected. */
export type TGroupSelectionState = 'none' | 'some' | 'all';

export interface IUseTaskSelection {
  /** Number of currently selected tasks. */
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectMany: (ids: readonly string[]) => void;
  deselectMany: (ids: readonly string[]) => void;
  clear: () => void;
  /** Aggregate state of a group's selectable ids (for the header checkbox). */
  groupState: (groupIds: readonly string[]) => TGroupSelectionState;
  /** Select the whole group, or clear it if every id is already selected. */
  toggleGroup: (groupIds: readonly string[]) => void;
  /** The selected ids that still exist in the current selectable set. */
  selectedIds: readonly string[];
}

/**
 * @param selectableIds Ids of the currently rendered, selectable task rows.
 *   Selection is pruned to this set on every change.
 */
export function useTaskSelection(selectableIds: readonly string[]): IUseTaskSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const selectableSet = useMemo(() => new Set(selectableIds), [selectableIds]);

  // Prune ids that are no longer selectable (task deleted / filtered out).
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (selectableSet.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectableSet]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: readonly string[]) => {
    if (ids.length === 0) {
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const deselectMany = useCallback((ids: readonly string[]) => {
    if (ids.length === 0) {
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const groupState = useCallback(
    (groupIds: readonly string[]): TGroupSelectionState => {
      if (groupIds.length === 0) {
        return 'none';
      }
      let selectedCount = 0;
      for (const id of groupIds) {
        if (selected.has(id)) {
          selectedCount += 1;
        }
      }
      if (selectedCount === 0) {
        return 'none';
      }
      return selectedCount === groupIds.length ? 'all' : 'some';
    },
    [selected],
  );

  const toggleGroup = useCallback(
    (groupIds: readonly string[]) => {
      if (groupIds.length === 0) {
        return;
      }
      const allSelected = groupIds.every((id) => selected.has(id));
      if (allSelected) {
        deselectMany(groupIds);
      } else {
        selectMany(groupIds);
      }
    },
    [selected, deselectMany, selectMany],
  );

  const selectedIds = useMemo(
    () => selectableIds.filter((id) => selected.has(id)),
    [selectableIds, selected],
  );

  return {
    count: selectedIds.length,
    isSelected,
    toggle,
    selectMany,
    deselectMany,
    clear,
    groupState,
    toggleGroup,
    selectedIds,
  };
}

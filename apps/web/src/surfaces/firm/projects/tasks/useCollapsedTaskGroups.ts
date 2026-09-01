/**
 * Persisted collapse state for the project board's phase-group accordion
 * (#13). Which phase groups a member has collapsed is remembered per project
 * in `localStorage` so the layout survives reloads and navigation. This is
 * UI-only, non-sensitive preference state — never a token (D-007). Storage
 * access is guarded so a disabled/throwing store (private mode, SSR) degrades
 * to the default (all expanded) instead of breaking the board.
 */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const STORAGE_PREFIX = 'siapp:tasks-collapsed:';

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

function readInitial(projectId: string): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (raw === null) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((value): value is string => typeof value === 'string'));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

export interface IUseCollapsedTaskGroups {
  collapsed: ReadonlySet<string>;
  setCollapsed: Dispatch<SetStateAction<ReadonlySet<string>>>;
}

export function useCollapsedTaskGroups(projectId: string): IUseCollapsedTaskGroups {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => readInitial(projectId));

  // Re-read when switching projects without remounting, so each project keeps
  // its own accordion state. Skips the first run (the initializer already read
  // the current project) to avoid clobbering it.
  const previousProjectId = useRef(projectId);
  useEffect(() => {
    if (previousProjectId.current !== projectId) {
      previousProjectId.current = projectId;
      setCollapsed(readInitial(projectId));
    }
  }, [projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(projectId), JSON.stringify([...collapsed]));
    } catch {
      // Persistence is best-effort; a blocked store must not break the board.
    }
  }, [collapsed, projectId]);

  return { collapsed, setCollapsed };
}

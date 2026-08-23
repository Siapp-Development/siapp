/**
 * Collapsible-sidebar state for the firm shell (#104), persisted to
 * `localStorage` so a member's preference survives reloads. This is UI-only,
 * non-sensitive state — never a token (D-007). `localStorage` access is
 * guarded so a disabled/exception-throwing store (private mode, SSR) degrades
 * to the expanded default instead of throwing.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'siapp:sidebar-collapsed';

function readInitial(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export interface IUseSidebarCollapsed {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (next: boolean) => void;
}

export function useSidebarCollapsed(): IUseSidebarCollapsed {
  const [collapsed, setCollapsed] = useState<boolean>(readInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
    } catch {
      // Persistence is best-effort; a blocked store must not break the UI.
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((current) => !current), []);

  return { collapsed, toggle, setCollapsed };
}

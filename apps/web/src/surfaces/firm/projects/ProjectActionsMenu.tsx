/**
 * Project header overflow (⋯) menu (#138). Surfaces the same D-027 lifecycle
 * actions as the Details-tab `LifecycleActions` (shared gating via
 * `projectLifecycle.ts`) plus a shortcut to the client portal link, so a PM can
 * act from any tab without opening Details.
 *
 * Built on the `@siapp/ui` Popover (open/close, outside-dismiss, Escape, focus
 * restore) with menu semantics layered on top: `role="menu"` panel,
 * `role="menuitem"` buttons, roving Arrow/Home/End focus, first item focused on
 * open. Complete/Archive run immediately (parity with `LifecycleActions`).
 *
 * "Copy client link" does NOT mint a link: client portal secrets are never at
 * rest (only their SHA-256 hash), so an existing link can't be re-surfaced and
 * copying one would force a rotation that invalidates earlier links. Instead it
 * reveals the Details-tab portal card (`onShowPortalLink`) where issuing is an
 * explicit, warned action.
 */

import type { TMemberRole, TProjectLifecycleAction } from '@siapp/shared';
import { Alert, Popover } from '@siapp/ui';
import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { setProjectLifecycle } from '@/lib/callables.ts';
import {
  canRunLifecycleAction,
  lifecycleErrorMessage,
} from './projectLifecycle.ts';
import type { IProjectRow } from './useProjects.ts';

interface IMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
}

export interface IProjectActionsMenuProps {
  workspaceId: string;
  project: IProjectRow;
  role: TMemberRole;
  /**
   * Reveals the Details-tab client portal link card. Used by "Copy client
   * link" because the existing link can't be copied without rotating it.
   */
  onShowPortalLink: () => void;
}

export function ProjectActionsMenu({
  workspaceId,
  project,
  role,
  onShowPortalLink,
}: IProjectActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const canComplete = canRunLifecycleAction(project.lifecycle, role, 'complete');
  const canArchive = canRunLifecycleAction(project.lifecycle, role, 'archive');
  const canCopyLink =
    (role === 'owner' || role === 'admin' || role === 'pm') &&
    (project.lifecycle === 'published' || project.lifecycle === 'completed') &&
    project.clientId !== '';

  async function runLifecycle(action: TProjectLifecycleAction): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await setProjectLifecycle({ workspaceId, projectId: project.id, action });
      setOpen(false);
    } catch (err) {
      setError(lifecycleErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const items: IMenuItem[] = [];
  if (canComplete) {
    items.push({
      key: 'complete',
      label: 'Mark as Completed',
      onSelect: () => void runLifecycle('complete'),
    });
  }
  if (canArchive) {
    items.push({
      key: 'archive',
      label: 'Archive Project',
      onSelect: () => void runLifecycle('archive'),
    });
  }
  if (canCopyLink) {
    items.push({
      key: 'copy-link',
      label: 'Copy client link',
      onSelect: () => {
        setOpen(false);
        onShowPortalLink();
      },
    });
  }

  // Focus the first item when the menu opens (WAI-ARIA menu button pattern).
  useEffect(() => {
    if (open) {
      itemRefs.current[0]?.focus();
    }
  }, [open]);

  // No permitted actions → no empty kebab.
  if (items.length === 0) {
    return null;
  }

  function focusItem(index: number): void {
    const count = items.length;
    const next = ((index % count) + count) % count;
    itemRefs.current[next]?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(items.length - 1);
    }
  }

  return (
    <div>
      {error !== null && (
        <Alert variant="destructive" className="mb-2">
          {error}
        </Alert>
      )}
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        role="menu"
        aria-label="Project actions"
        onKeyDown={handleMenuKeyDown}
        trigger={
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Project actions"
            disabled={pending}
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </button>
        }
      >
        {items.map((item, index) => (
          <button
            key={item.key}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={pending}
            onClick={item.onSelect}
            className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </Popover>
    </div>
  );
}

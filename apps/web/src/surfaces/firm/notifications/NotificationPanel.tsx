/**
 * Notification inbox popover panel (#134). Renders the realtime list with
 * Today / Earlier date grouping, a "Mark all as read" action, "Load more"
 * pagination, and loading / error / empty states.
 *
 * The @siapp/ui `Popover` wrapper (in `NotificationBell`) already handles
 * Escape-to-close, outside-click dismissal and restore-focus-to-bell. This
 * panel adds the missing pieces: initial focus on open and a Tab focus trap,
 * so keyboard users stay within the list while it's open.
 */

import { useEffect, useRef } from 'react';

import { NotificationItem } from './NotificationItem.tsx';
import { useNotifications, type INotificationRow } from './useNotifications.ts';

export interface NotificationPanelProps {
  workspaceId: string;
  workspaceSlug: string;
  uid: string;
  onClose: () => void;
}

function isToday(date: Date | null): boolean {
  if (date === null) {
    return true;
  }
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (root === null) {
    return [];
  }
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ];
}

export function NotificationPanel({
  workspaceId,
  workspaceSlug,
  uid,
  onClose,
}: NotificationPanelProps) {
  const { state, loadMore, markRead, markAllRead } = useNotifications(workspaceId, uid);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Initial focus into the panel when it mounts (opens).
  useEffect(() => {
    const [first] = focusableWithin(panelRef.current);
    first?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = focusableWithin(panelRef.current);
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const rows = state.status === 'ready' ? state.rows : [];
  const today = rows.filter((row) => isToday(row.at));
  const earlier = rows.filter((row) => !isToday(row.at));

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      onKeyDown={handleKeyDown}
      className="flex max-h-[28rem] w-80 flex-col"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        <button
          type="button"
          onClick={() => void markAllRead()}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Mark all as read
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {state.status === 'loading' && (
          <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="px-3 py-6 text-center text-sm text-muted-foreground">
            Couldn't load notifications.
          </p>
        )}
        {state.status === 'ready' && rows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            You're all caught up.
          </p>
        )}
        {state.status === 'ready' && rows.length > 0 && (
          <>
            {today.length > 0 && (
              <NotificationGroup
                heading="Today"
                rows={today}
                workspaceSlug={workspaceSlug}
                markRead={markRead}
                onClose={onClose}
              />
            )}
            {earlier.length > 0 && (
              <NotificationGroup
                heading="Earlier"
                rows={earlier}
                workspaceSlug={workspaceSlug}
                markRead={markRead}
                onClose={onClose}
              />
            )}
            {state.hasMore && (
              <div className="p-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={state.loadingMore}
                  className="w-full rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  {state.loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface NotificationGroupProps {
  heading: string;
  rows: INotificationRow[];
  workspaceSlug: string;
  markRead: (id: string) => Promise<void>;
  onClose: () => void;
}

function NotificationGroup({
  heading,
  rows,
  workspaceSlug,
  markRead,
  onClose,
}: NotificationGroupProps) {
  return (
    <div className="py-1">
      <h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </h3>
      <ul className="space-y-1">
        {rows.map((row) => (
          <NotificationItem
            key={row.id}
            row={row}
            workspaceSlug={workspaceSlug}
            markRead={markRead}
            onClose={onClose}
          />
        ))}
      </ul>
    </div>
  );
}

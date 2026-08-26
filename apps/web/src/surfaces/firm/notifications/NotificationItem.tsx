/**
 * A single notification row (#134). A real, keyboard-operable `<button>` that
 * marks the notification read then navigates to its deep link and closes the
 * panel. Unread state is conveyed in the accessible name (not colour alone) —
 * the red dot is decorative.
 */

import { cn } from '@siapp/ui';
import { useNavigate } from 'react-router';

import { notificationDeepLink, notificationIcon, notificationLine } from './notificationLabels.ts';
import type { INotificationRow } from './useNotifications.ts';

export interface NotificationItemProps {
  row: INotificationRow;
  workspaceSlug: string;
  markRead: (id: string) => Promise<void>;
  onClose: () => void;
}

function relativeTime(date: Date | null): string {
  if (date === null) {
    return 'just now';
  }
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return date.toLocaleDateString();
}

export function NotificationItem({ row, workspaceSlug, markRead, onClose }: NotificationItemProps) {
  const navigate = useNavigate();
  const { title, body } = notificationLine(row);
  const Icon = notificationIcon(row.kind);

  function handleActivate(): void {
    // Fire-and-forget the read write — navigation shouldn't wait on it, and a
    // failed write simply leaves the row unread (no data loss).
    void markRead(row.id);
    onClose();
    navigate(notificationDeepLink(workspaceSlug, row.projectId, row.taskId));
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleActivate}
        className={cn(
          'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
          'hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          !row.read && 'bg-accent/30',
        )}
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-foreground">{title}</span>
          {body !== null && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{body}</span>
          )}
          <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
            {relativeTime(row.at)}
          </span>
        </span>
        {!row.read && (
          <span className="mt-1.5 flex shrink-0 items-center">
            <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
            <span className="sr-only">Unread</span>
          </span>
        )}
      </button>
    </li>
  );
}

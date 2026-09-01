/**
 * Notification bell (#134). A real `<button>` whose accessible name reflects
 * unread state, paired with a decorative red dot (state is in the name, not
 * colour alone). Owns the popover open state and reuses the @siapp/ui
 * `Popover` primitive (Escape / outside-click / restore-focus, D-038).
 */

import { Popover } from '@siapp/ui';
import { Bell } from 'lucide-react';
import { useState } from 'react';

import { NotificationPanel } from './NotificationPanel.tsx';
import { useUnreadNotifications } from './useUnreadNotifications.ts';

export interface NotificationBellProps {
  workspaceId: string;
  workspaceSlug: string;
  uid: string;
}

export function NotificationBell({ workspaceId, workspaceSlug, uid }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const hasUnread = useUnreadNotifications(workspaceId, uid);

  const trigger = (
    <button
      type="button"
      aria-label={hasUnread ? 'Notifications, unread' : 'Notifications'}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((prev) => !prev)}
      className="relative flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-active hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none active:bg-sidebar-active"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {hasUnread && (
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-sidebar" aria-hidden="true" />
      )}
    </button>
  );

  return (
    <Popover open={open} onClose={() => setOpen(false)} trigger={trigger} align="start" className="p-0">
      <NotificationPanel
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        uid={uid}
        onClose={() => setOpen(false)}
      />
    </Popover>
  );
}

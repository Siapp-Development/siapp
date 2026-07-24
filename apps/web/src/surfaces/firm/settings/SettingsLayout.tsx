/**
 * Shared layout for the settings pages (#18): a small sub-nav
 * (Team · Notifications) above the active settings page, instead of extra
 * top-level sidebar items.
 */

import { cn } from '@siapp/ui';
import { NavLink, Outlet } from 'react-router';

export interface ISettingsLayoutProps {
  workspaceSlug: string;
}

function SettingsTab({ to, label }: { to: string; label: string }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'rounded-md px-3 py-1.5 text-sm text-foreground hover:text-primary',
            isActive && 'bg-muted font-semibold text-primary',
          )
        }
      >
        {label}
      </NavLink>
    </li>
  );
}

export function SettingsLayout({ workspaceSlug }: ISettingsLayoutProps) {
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Settings">
        <ul className="flex gap-2">
          <SettingsTab to={`/${workspaceSlug}/settings/team`} label="Team" />
          <SettingsTab to={`/${workspaceSlug}/settings/notifications`} label="Notifications" />
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}

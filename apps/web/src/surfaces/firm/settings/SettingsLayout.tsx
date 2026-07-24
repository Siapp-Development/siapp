/**
 * Shared layout for the settings pages (#18): a small sub-nav
 * (Team · Notifications · Billing) above the active settings page, instead
 * of extra top-level sidebar items. Billing (#24) is owner/admin-only.
 */

import { cn } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { NavLink, Outlet } from 'react-router';

export interface ISettingsLayoutProps {
  workspaceSlug: string;
  role: TMemberRole;
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

export function SettingsLayout({ workspaceSlug, role }: ISettingsLayoutProps) {
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Settings">
        <ul className="flex gap-2">
          <SettingsTab to={`/${workspaceSlug}/settings/team`} label="Team" />
          <SettingsTab to={`/${workspaceSlug}/settings/notifications`} label="Notifications" />
          {(role === 'owner' || role === 'admin') && (
            <SettingsTab to={`/${workspaceSlug}/settings/billing`} label="Billing" />
          )}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}

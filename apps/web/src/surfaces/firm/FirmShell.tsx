import { Button, cn } from '@siapp/ui';
import type { ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useParams } from 'react-router';

import siappLogoSimple from '@/assets/siapp-logo-simple.png';
import { SkipLink } from '@/components/SkipLink.tsx';
import { BillingBanners } from './billing/BillingBanners.tsx';
import { BillingSettingsPage } from './billing/BillingSettingsPage.tsx';
import { ClientsListPage } from './clients/ClientsListPage.tsx';
import { CollaboratorsListPage } from './collaborators/CollaboratorsListPage.tsx';
import { DashboardPage } from './dashboard/DashboardPage.tsx';
import { ProjectDetailPage } from './projects/ProjectDetailPage.tsx';
import { ProjectsListPage } from './projects/ProjectsListPage.tsx';
import { NotificationSettingsPage } from './settings/NotificationSettingsPage.tsx';
import { SettingsLayout } from './settings/SettingsLayout.tsx';
import { TeamSettingsPage } from './settings/TeamSettingsPage.tsx';
import { useAuth } from './auth/useAuth.ts';

/** Sidebar nav link — NavLink supplies aria-current="page" on the active route. */
function NavItem({
  to,
  end = false,
  label,
  icon,
}: {
  to: string;
  end?: boolean;
  label: string;
  icon: ReactNode;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
            isActive
              ? 'bg-sidebar-active text-sidebar-active-foreground before:absolute before:top-1.5 before:bottom-1.5 before:-left-2 before:w-0.5 before:rounded-full before:bg-accent'
              : 'text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-sidebar-active-foreground',
          )
        }
      >
        <span aria-hidden="true" className="shrink-0 opacity-80">
          {icon}
        </span>
        {label}
      </NavLink>
    </li>
  );
}

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const NAV_ICONS = {
  home: (
    <svg {...ICON_PROPS}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  ),
  projects: (
    <svg {...ICON_PROPS}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  ),
  clients: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" />
    </svg>
  ),
  collaborators: (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c.7-2.8 3-4.5 5.5-4.5s4.8 1.7 5.5 4.5" />
      <path d="M16 5.7a3 3 0 0 1 0 5.6M18.5 15.6c1.2.8 2 2 2.3 3.9" />
    </svg>
  ),
  settings: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
    </svg>
  ),
} as const;

function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * Firm dashboard shell at dashboard.siapp.app/:workspaceSlug/* — the URL slug
 * must map to a workspace in the user's claims; otherwise a single
 * "not available" screen is shown for both unknown and foreign slugs so
 * workspace existence never leaks.
 */
export function FirmShell() {
  const { workspaceSlug } = useParams<'workspaceSlug'>();
  const { state, signOutUser } = useAuth();

  // RequireAuth guarantees a signed-in user; this narrows the union for TS.
  if (state.status !== 'signedIn') {
    return null;
  }

  if (state.workspaces === 'loading') {
    return (
      <main id="main" className="px-6 py-16">
        <p role="status" aria-live="polite" className="text-center">
          Loading your workspace…
        </p>
      </main>
    );
  }

  const workspace =
    state.workspaces === 'error'
      ? undefined
      : state.workspaces.find((w) => w.slug === workspaceSlug);

  if (workspace === undefined) {
    return (
      <>
        <SkipLink />
        <main id="main" className="mx-auto max-w-xl px-6 py-16">
          <h1 className="text-2xl font-bold">Workspace not available</h1>
          <p className="mt-2">
            This workspace doesn't exist or your account doesn't have access to it.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/">Go to your workspace</Link>
          </Button>
        </main>
      </>
    );
  }

  const role = state.claims.workspaces[workspace.id]?.role ?? 'viewer';

  return (
    <div className="flex min-h-screen">
      <SkipLink />
      <aside className="on-dark sticky top-0 flex h-screen w-60 flex-col bg-sidebar px-4 py-5">
        <p className="flex items-center px-3">
          <img
            src={siappLogoSimple}
            alt="Siapp"
            className="h-9 w-9 rounded-md bg-white object-contain p-1"
          />
        </p>
        <p className="mt-5 px-3 text-xs font-medium tracking-wide text-sidebar-foreground/70 uppercase">
          {workspace.name}
        </p>
        <nav aria-label="Workspace" className="mt-2">
          <ul className="flex flex-col gap-0.5">
            <NavItem to={`/${workspace.slug}`} end label="Home" icon={NAV_ICONS.home} />
            <NavItem
              to={`/${workspace.slug}/projects`}
              label="Projects"
              icon={NAV_ICONS.projects}
            />
            <NavItem to={`/${workspace.slug}/clients`} label="Clients" icon={NAV_ICONS.clients} />
            <NavItem
              to={`/${workspace.slug}/collaborators`}
              label="Collaborators"
              icon={NAV_ICONS.collaborators}
            />
            <NavItem
              to={`/${workspace.slug}/settings/team`}
              label="Settings"
              icon={NAV_ICONS.settings}
            />
          </ul>
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-sidebar-border pt-4">
          <p className="flex items-center gap-2.5 px-1">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold text-white"
            >
              {userInitials(state.user.displayName ?? state.user.email ?? '?')}
            </span>
            <span className="truncate text-sm text-sidebar-foreground">
              {state.user.displayName ?? state.user.email}
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="border-sidebar-border bg-transparent text-sidebar-foreground shadow-none hover:bg-sidebar-active hover:text-white"
            onClick={() => void signOutUser()}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-8 py-8">
        {/* #24: read-only / usage banners on every firm page */}
        <BillingBanners workspaceId={workspace.id} workspaceSlug={workspace.slug} />
        <Routes>
          <Route
            index
            element={
              <DashboardPage
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                workspaceName={workspace.name}
                role={role}
                departments={state.claims.workspaces[workspace.id]?.departments ?? []}
                uid={state.user.uid}
              />
            }
          />
          <Route
            path="projects"
            element={
              <ProjectsListPage
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                workspaceName={workspace.name}
                role={role}
                departments={state.claims.workspaces[workspace.id]?.departments ?? []}
                uid={state.user.uid}
                userName={state.user.displayName ?? state.user.email ?? ''}
              />
            }
          />
          <Route
            path="projects/:projectId"
            element={
              <ProjectDetailPage
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                role={role}
                departments={state.claims.workspaces[workspace.id]?.departments ?? []}
                uid={state.user.uid}
                userName={state.user.displayName ?? state.user.email ?? ''}
              />
            }
          />
          <Route
            path="clients"
            element={
              <ClientsListPage
                workspaceId={workspace.id}
                workspaceName={workspace.name}
                role={role}
                uid={state.user.uid}
              />
            }
          />
          <Route
            path="collaborators"
            element={
              <CollaboratorsListPage
                workspaceId={workspace.id}
                workspaceName={workspace.name}
                role={role}
                uid={state.user.uid}
              />
            }
          />
          <Route
            path="settings"
            element={<SettingsLayout workspaceSlug={workspace.slug} role={role} />}
          >
            <Route
              path="team"
              element={
                <TeamSettingsPage
                  workspaceId={workspace.id}
                  workspaceName={workspace.name}
                  role={role}
                  uid={state.user.uid}
                />
              }
            />
            <Route
              path="notifications"
              element={
                <NotificationSettingsPage
                  workspaceId={workspace.id}
                  workspaceName={workspace.name}
                  role={role}
                />
              }
            />
            <Route
              path="billing"
              element={
                <BillingSettingsPage
                  workspaceId={workspace.id}
                  workspaceName={workspace.name}
                  role={role}
                />
              }
            />
          </Route>
        </Routes>
      </main>
    </div>
  );
}

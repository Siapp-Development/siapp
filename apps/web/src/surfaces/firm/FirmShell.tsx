import { Avatar, Button, cn } from '@siapp/ui';
import type { ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useParams } from 'react-router';

import siappLogoSimpleReversed from '@/assets/siapp-logo-simple-reversed.png';
import { SkipLink } from '@/components/SkipLink.tsx';
import { BillingBanners } from './billing/BillingBanners.tsx';
import { BillingSettingsPage } from './billing/BillingSettingsPage.tsx';
import { ClientsListPage } from './clients/ClientsListPage.tsx';
import { CollaboratorsListPage } from './collaborators/CollaboratorsListPage.tsx';
import { DashboardPage } from './dashboard/DashboardPage.tsx';
import { ProjectDetailPage } from './projects/ProjectDetailPage.tsx';
import { ProjectsListPage } from './projects/ProjectsListPage.tsx';
import { NotificationSettingsPage } from './settings/NotificationSettingsPage.tsx';
import { ProfileSettingsPage } from './settings/ProfileSettingsPage.tsx';
import { SettingsLayout } from './settings/SettingsLayout.tsx';
import { TeamSettingsPage } from './settings/TeamSettingsPage.tsx';
import { useAuth } from './auth/useAuth.ts';
import { useSidebarCollapsed } from './useSidebarCollapsed.ts';

/** Sidebar nav link — NavLink supplies aria-current="page" on the active route. */
function NavItem({
  to,
  end = false,
  label,
  icon,
  collapsed,
}: {
  to: string;
  end?: boolean;
  label: string;
  icon: ReactNode;
  collapsed: boolean;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          cn(
            'relative flex items-center rounded-md text-sm font-medium transition-colors duration-150',
            'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
            collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2',
            isActive
              ? 'bg-sidebar-active text-sidebar-active-foreground before:absolute before:top-1.5 before:bottom-1.5 before:-left-2 before:w-0.5 before:rounded-full before:bg-accent'
              : 'text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-sidebar-active-foreground active:bg-sidebar-active',
          )
        }
      >
        <span aria-hidden="true" className="shrink-0 opacity-80">
          {icon}
        </span>
        <span className={cn(collapsed && 'sr-only')}>{label}</span>
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

/** Double-chevron that points the way the sidebar will move when toggled. */
function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      {collapsed ? <path d="m9 6 6 6-6 6" /> : <path d="m15 6-6 6 6 6" />}
    </svg>
  );
}

const SIGN_OUT_ICON = (
  <svg {...ICON_PROPS}>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

/**
 * Firm dashboard shell at dashboard.siapp.app/:workspaceSlug/* — the URL slug
 * must map to a workspace in the user's claims; otherwise a single
 * "not available" screen is shown for both unknown and foreign slugs so
 * workspace existence never leaks.
 */
export function FirmShell() {
  const { workspaceSlug } = useParams<'workspaceSlug'>();
  const { state, signOutUser } = useAuth();
  const { collapsed, toggle } = useSidebarCollapsed();

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
          <div className="mt-6 flex gap-3">
            <Button asChild variant="outline">
              <Link to="/">Go to your workspace</Link>
            </Button>
            <Button variant="outline" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </main>
      </>
    );
  }

  const role = state.claims.workspaces[workspace.id]?.role ?? 'viewer';
  const profileName = state.profile.displayName ?? state.user.displayName ?? state.user.email ?? '';
  const profilePhoto = state.profile.photoUrl ?? state.user.photoURL ?? undefined;

  return (
    <div className="flex min-h-screen">
      <SkipLink />
      <aside
        className={cn(
          'on-dark sticky top-0 flex h-screen flex-col bg-sidebar py-5 transition-[width] duration-200 motion-reduce:transition-none',
          collapsed ? 'w-16 px-2' : 'w-60 px-4',
        )}
      >
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between px-3')}>
          <img src={siappLogoSimpleReversed} alt="Siapp" className="h-9 w-9 object-contain" />
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="sidebar-nav"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-active hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none active:bg-sidebar-active"
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>
        {!collapsed && (
          <p className="mt-5 px-3 text-xs font-medium tracking-wide text-sidebar-foreground/70 uppercase">
            {workspace.name}
          </p>
        )}
        <nav id="sidebar-nav" aria-label="Workspace" className="mt-2">
          <ul className="flex flex-col gap-0.5">
            <NavItem to={`/${workspace.slug}`} end label="Home" icon={NAV_ICONS.home} collapsed={collapsed} />
            <NavItem
              to={`/${workspace.slug}/projects`}
              label="Projects"
              icon={NAV_ICONS.projects}
              collapsed={collapsed}
            />
            <NavItem
              to={`/${workspace.slug}/clients`}
              label="Clients"
              icon={NAV_ICONS.clients}
              collapsed={collapsed}
            />
            <NavItem
              to={`/${workspace.slug}/collaborators`}
              label="Collaborators"
              icon={NAV_ICONS.collaborators}
              collapsed={collapsed}
            />
            <NavItem
              to={`/${workspace.slug}/settings/team`}
              label="Settings"
              icon={NAV_ICONS.settings}
              collapsed={collapsed}
            />
          </ul>
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-sidebar-border pt-4">
          <NavLink
            to={`/${workspace.slug}/settings/profile`}
            aria-label="Your profile"
            title={collapsed ? 'Your profile' : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-md py-1.5 transition-colors duration-150',
                'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                collapsed ? 'justify-center px-1' : 'gap-2.5 px-1',
                isActive
                  ? 'bg-sidebar-active text-sidebar-active-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-sidebar-active-foreground active:bg-sidebar-active',
              )
            }
          >
            <Avatar size="sm" name={profileName} seed={state.user.uid} photoUrl={profilePhoto} aria-hidden />
            {!collapsed && <span className="truncate text-sm">{profileName}</span>}
          </NavLink>
          <Button
            variant="outline"
            size="sm"
            title={collapsed ? 'Sign out' : undefined}
            aria-label={collapsed ? 'Sign out' : undefined}
            className={cn(
              'border-sidebar-border bg-transparent text-sidebar-foreground shadow-none hover:bg-sidebar-active hover:text-white',
              collapsed && 'px-0',
            )}
            onClick={() => void signOutUser()}
          >
            {collapsed ? (
              <span aria-hidden="true">{SIGN_OUT_ICON}</span>
            ) : (
              'Sign out'
            )}
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
                displayName={state.user.displayName ?? ''}
                email={state.user.email ?? ''}
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
              path="profile"
              element={
                <ProfileSettingsPage
                  uid={state.user.uid}
                  email={state.user.email ?? ''}
                  displayName={profileName}
                  photoUrl={profilePhoto}
                />
              }
            />
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

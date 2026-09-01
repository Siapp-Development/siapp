import { Avatar, Button, cn } from '@siapp/ui';
import {
  FolderKanban,
  Handshake,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
} from 'lucide-react';
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
import { NotificationBell } from './notifications/NotificationBell.tsx';
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

/** Shared sizing for sidebar lucide icons — matches the prior 16px hand-drawn set. */
const ICON_SIZE = 16;
const ICON_STROKE = 1.8;

const NAV_ICONS = {
  home: <Home size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  projects: <FolderKanban size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  clients: <Users size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  collaborators: <Handshake size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  settings: <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
} as const;

/** Panel icon that reflects the direction the sidebar will move when toggled. */
function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />;
}

const SIGN_OUT_ICON = <LogOut size={ICON_SIZE} strokeWidth={ICON_STROKE} />;

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
          'on-dark sticky top-0 z-30 flex h-screen flex-col bg-sidebar py-5 transition-[width] duration-200 motion-reduce:transition-none',
          collapsed ? 'w-16 px-2' : 'w-60 px-4',
        )}
      >
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between px-3')}>
          <img src={siappLogoSimpleReversed} alt="Siapp" className="h-9 w-9 object-contain" />
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'gap-1')}>
            <NotificationBell
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              uid={state.user.uid}
            />
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

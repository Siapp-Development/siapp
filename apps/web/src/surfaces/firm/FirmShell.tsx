import { Button, cn } from '@siapp/ui';
import { Link, NavLink, Route, Routes, useParams } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { ClientsListPage } from './clients/ClientsListPage.tsx';
import { CollaboratorsListPage } from './collaborators/CollaboratorsListPage.tsx';
import { DashboardPage } from './dashboard/DashboardPage.tsx';
import { ProjectDetailPage } from './projects/ProjectDetailPage.tsx';
import { ProjectsListPage } from './projects/ProjectsListPage.tsx';
import { TeamSettingsPage } from './settings/TeamSettingsPage.tsx';
import { useAuth } from './auth/useAuth.ts';

/** Sidebar nav link — NavLink supplies aria-current="page" on the active route. */
function NavItem({ to, end = false, label }: { to: string; end?: boolean; label: string }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn('text-foreground hover:text-primary', isActive && 'font-semibold text-primary')
        }
      >
        {label}
      </NavLink>
    </li>
  );
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
      <aside className="flex w-56 flex-col border-r border-border bg-card px-4 py-6">
        <p className="text-lg font-semibold text-primary">Siapp</p>
        <nav aria-label="Workspace" className="mt-6">
          <ul className="flex flex-col gap-2">
            <NavItem to={`/${workspace.slug}`} end label="Home" />
            <NavItem to={`/${workspace.slug}/projects`} label="Projects" />
            <NavItem to={`/${workspace.slug}/clients`} label="Clients" />
            <NavItem to={`/${workspace.slug}/collaborators`} label="Collaborators" />
            <NavItem to={`/${workspace.slug}/settings/team`} label="Settings" />
          </ul>
        </nav>
        <div className="mt-auto flex flex-col gap-2 pt-6">
          <p className="text-sm">{state.user.displayName ?? state.user.email}</p>
          <Button variant="outline" size="sm" onClick={() => void signOutUser()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main id="main" className="flex-1 px-8 py-10">
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
              <ClientsListPage workspaceId={workspace.id} role={role} uid={state.user.uid} />
            }
          />
          <Route
            path="collaborators"
            element={
              <CollaboratorsListPage
                workspaceId={workspace.id}
                role={role}
                uid={state.user.uid}
              />
            }
          />
          <Route
            path="settings/team"
            element={
              <TeamSettingsPage
                workspaceId={workspace.id}
                workspaceName={workspace.name}
                role={role}
                uid={state.user.uid}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

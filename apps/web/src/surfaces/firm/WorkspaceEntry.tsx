import { Link, Navigate } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import type { IClaimedWorkspace } from './auth/AuthProvider.tsx';
import { resolveWorkspace } from './auth/resolveWorkspace.ts';
import { useAuth } from './auth/useAuth.ts';

function PendingScreen() {
  return (
    <main id="main" className="px-6 py-16">
      <p role="status" aria-live="polite" className="text-center">
        Loading your workspace…
      </p>
    </main>
  );
}

function ErrorScreen() {
  return (
    <>
      <SkipLink />
      <main id="main" className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p role="alert" className="mt-2">
          We couldn't load your workspace. Refresh the page to try again.
        </p>
      </main>
    </>
  );
}

function NoWorkspaceScreen() {
  return (
    <>
      <SkipLink />
      <main id="main" className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-bold">No workspace yet</h1>
        <p className="mt-2">
          Your account isn't part of a workspace yet. Contact Siapp to get your firm set up.
        </p>
      </main>
    </>
  );
}

interface IWorkspacePickerProps {
  workspaces: IClaimedWorkspace[];
}

function WorkspacePicker({ workspaces }: IWorkspacePickerProps) {
  return (
    <>
      <SkipLink />
      <main id="main" className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-bold">Choose a workspace</h1>
        <ul className="mt-6 flex flex-col gap-2">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link
                to={`/${workspace.slug}`}
                className="block rounded-md border border-border bg-card px-4 py-3 text-foreground hover:bg-primary-tint"
              >
                {workspace.name}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

/** dashboard.siapp.app/ — post-login workspace resolver/redirect. */
export function WorkspaceEntry() {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return <PendingScreen />;
  }
  if (state.status === 'signedOut') {
    return <Navigate to="/login" replace />;
  }
  if (state.workspaces === 'loading') {
    return <PendingScreen />;
  }
  if (state.workspaces === 'error') {
    return <ErrorScreen />;
  }

  const resolution = resolveWorkspace(state.claims, state.defaultWorkspaceId);

  if (resolution.kind === 'none') {
    return <NoWorkspaceScreen />;
  }

  if (resolution.kind === 'one') {
    const target = state.workspaces.find((w) => w.id === resolution.workspaceId);
    if (target === undefined) {
      return <ErrorScreen />;
    }
    return <Navigate to={`/${target.slug}`} replace />;
  }

  return <WorkspacePicker workspaces={state.workspaces} />;
}

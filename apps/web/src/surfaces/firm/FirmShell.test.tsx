import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthContext,
  type IAuthContextValue,
  type TAuthState,
} from './auth/AuthProvider.tsx';
import { FirmShell } from './FirmShell.tsx';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onIdTokenChanged: vi.fn(() => () => {}),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
// Route targets subscribe to Firestore — covered by their own test files.
vi.mock('./dashboard/DashboardPage.tsx', () => ({
  DashboardPage: ({ workspaceName }: { workspaceName: string }) => (
    <h1>Home — {workspaceName}</h1>
  ),
}));
vi.mock('./projects/ProjectsListPage.tsx', () => ({
  ProjectsListPage: ({ workspaceName }: { workspaceName: string }) => (
    <h1>Projects — {workspaceName}</h1>
  ),
}));
vi.mock('./projects/ProjectDetailPage.tsx', () => ({ ProjectDetailPage: () => null }));
vi.mock('./settings/TeamSettingsPage.tsx', () => ({
  TeamSettingsPage: ({ workspaceName }: { workspaceName: string }) => (
    <h1>Team — {workspaceName}</h1>
  ),
}));
vi.mock('./settings/NotificationSettingsPage.tsx', () => ({
  NotificationSettingsPage: ({ workspaceName }: { workspaceName: string }) => (
    <h1>Notifications — {workspaceName}</h1>
  ),
}));
// #24: banners + billing page subscribe to Firestore — covered by their own tests.
vi.mock('./billing/BillingBanners.tsx', () => ({ BillingBanners: () => null }));
vi.mock('./billing/BillingSettingsPage.tsx', () => ({
  BillingSettingsPage: ({ workspaceName }: { workspaceName: string }) => (
    <h1>Billing — {workspaceName}</h1>
  ),
}));

const signedIn: TAuthState = {
  status: 'signedIn',
  user: { uid: 'u1', email: 'alice@firm.test', displayName: 'Alice Tan' } as unknown as User,
  claims: { workspaces: { wksA: { role: 'owner', departments: [] } } },
  workspaces: [{ id: 'wksA', name: 'Acme Builders', slug: 'acme' }],
};

function renderShell(initialEntry: string, signOutUser = vi.fn(async () => {})) {
  const value: IAuthContextValue = { state: signedIn, signOutUser };
  const router = createMemoryRouter(
    [
      {
        path: '/:workspaceSlug/*',
        element: (
          <AuthContext.Provider value={value}>
            <FirmShell />
          </AuthContext.Provider>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

describe('FirmShell', () => {
  it('renders Home at the workspace index when the slug matches a claimed workspace', () => {
    renderShell('/acme');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Home — Acme Builders' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByText('Alice Tan')).toBeInTheDocument();
  });

  it('renders the projects list at /projects', () => {
    renderShell('/acme/projects');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Projects — Acme Builders' }),
    ).toBeInTheDocument();
  });

  it('marks the active nav item with aria-current', () => {
    renderShell('/acme/projects');

    const nav = screen.getByRole('navigation', { name: 'Workspace' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/acme');
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('shows one non-leaking screen for foreign or unknown slugs', () => {
    renderShell('/not-my-workspace');

    expect(
      screen.getByRole('heading', { level: 1, name: /workspace not available/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Acme Builders')).not.toBeInTheDocument();
  });

  it('shows the settings sub-nav linking both settings pages (#18)', () => {
    renderShell('/acme/settings/notifications');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Notifications — Acme Builders' }),
    ).toBeInTheDocument();
    const subNav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(subNav).getByRole('link', { name: 'Team' })).toHaveAttribute(
      'href',
      '/acme/settings/team',
    );
    expect(within(subNav).getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // #24: owners see the Billing tab.
    expect(within(subNav).getByRole('link', { name: 'Billing' })).toHaveAttribute(
      'href',
      '/acme/settings/billing',
    );
  });

  it('signs out from the sidebar button', async () => {
    const signOutUser = vi.fn(async () => {});
    renderShell('/acme', signOutUser);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(signOutUser).toHaveBeenCalledOnce();
  });
});

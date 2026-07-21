import { render, screen } from '@testing-library/react';
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
vi.mock('./projects/ProjectsListPage.tsx', () => ({
  ProjectsListPage: ({ workspaceName }: { workspaceName: string }) => (
    <h1>Projects — {workspaceName}</h1>
  ),
}));
vi.mock('./projects/ProjectDetailPage.tsx', () => ({ ProjectDetailPage: () => null }));

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
  it('renders the workspace when the slug matches a claimed workspace', () => {
    renderShell('/acme');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Projects — Acme Builders' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByText('Alice Tan')).toBeInTheDocument();
  });

  it('shows one non-leaking screen for foreign or unknown slugs', () => {
    renderShell('/not-my-workspace');

    expect(
      screen.getByRole('heading', { level: 1, name: /workspace not available/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Acme Builders')).not.toBeInTheDocument();
  });

  it('signs out from the sidebar button', async () => {
    const signOutUser = vi.fn(async () => {});
    renderShell('/acme', signOutUser);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(signOutUser).toHaveBeenCalledOnce();
  });
});

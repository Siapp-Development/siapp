import { render, screen } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthContext,
  type IAuthContextValue,
  type TAuthState,
} from './auth/AuthProvider.tsx';
import { WorkspaceEntry } from './WorkspaceEntry.tsx';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onIdTokenChanged: vi.fn(() => () => {}),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

const user = { uid: 'u1', email: 'a@firm.test', displayName: 'Alice' } as unknown as User;

function signedIn(overrides: Partial<Extract<TAuthState, { status: 'signedIn' }>>): TAuthState {
  return {
    status: 'signedIn',
    user,
    claims: { workspaces: {} },
    workspaces: [],
    ...overrides,
  };
}

function renderEntry(state: TAuthState) {
  const value: IAuthContextValue = { state, signOutUser: vi.fn(async () => {}) };
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <AuthContext.Provider value={value}>
            <WorkspaceEntry />
          </AuthContext.Provider>
        ),
      },
      { path: '/login', element: <p>login stub</p> },
      { path: '/:workspaceSlug', element: <p>shell stub</p> },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('WorkspaceEntry', () => {
  it('redirects a signed-out visitor to /login', async () => {
    renderEntry({ status: 'signedOut' });

    expect(await screen.findByText('login stub')).toBeInTheDocument();
  });

  it('redirects straight into a single claimed workspace', async () => {
    renderEntry(
      signedIn({
        claims: { workspaces: { wksA: { role: 'owner', departments: [] } } },
        workspaces: [{ id: 'wksA', name: 'Acme Builders', slug: 'acme' }],
      }),
    );

    expect(await screen.findByText('shell stub')).toBeInTheDocument();
  });

  it('offers an accessible picker when multiple workspaces are claimed', () => {
    renderEntry(
      signedIn({
        claims: {
          workspaces: {
            wksA: { role: 'owner', departments: [] },
            wksB: { role: 'pm', departments: [] },
          },
        },
        workspaces: [
          { id: 'wksA', name: 'Acme Builders', slug: 'acme' },
          { id: 'wksB', name: 'Beta Legal', slug: 'beta' },
        ],
      }),
    );

    expect(screen.getByRole('heading', { level: 1, name: /choose a workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acme Builders' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Legal' })).toBeInTheDocument();
  });

  it('shows the empty state when no workspace is claimed (provisioning is #10)', () => {
    renderEntry(signedIn({}));

    expect(screen.getByRole('heading', { level: 1, name: /no workspace yet/i })).toBeInTheDocument();
    expect(screen.getByText(/contact siapp/i)).toBeInTheDocument();
  });

  it('announces a polite loading state while workspace docs resolve', () => {
    renderEntry(
      signedIn({
        claims: { workspaces: { wksA: { role: 'owner', departments: [] } } },
        workspaces: 'loading',
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(/loading your workspace/i);
  });

  it('surfaces workspace-doc fetch failures as an alert', () => {
    renderEntry(
      signedIn({
        claims: { workspaces: { wksA: { role: 'owner', departments: [] } } },
        workspaces: 'error',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load your workspace/i);
  });
});

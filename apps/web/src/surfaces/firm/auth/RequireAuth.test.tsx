import { render, screen } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { RouterProvider, createMemoryRouter, useSearchParams } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type IAuthContextValue, type TAuthState } from './AuthProvider.tsx';
import { RequireAuth } from './RequireAuth.tsx';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onIdTokenChanged: vi.fn(() => () => {}),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

function LoginStub() {
  const [searchParams] = useSearchParams();
  return <p>login stub next={searchParams.get('next')}</p>;
}

function renderGuard(state: TAuthState, initialEntry = '/acme') {
  const value: IAuthContextValue = { state, signOutUser: vi.fn(async () => {}) };
  const router = createMemoryRouter(
    [
      {
        path: '/:workspaceSlug/*',
        element: (
          <AuthContext.Provider value={value}>
            <RequireAuth>
              <p>protected content</p>
            </RequireAuth>
          </AuthContext.Provider>
        ),
      },
      { path: '/login', Component: LoginStub },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

const signedIn: TAuthState = {
  status: 'signedIn',
  user: { uid: 'u1', email: 'a@firm.test', displayName: 'Alice' } as unknown as User,
  claims: { workspaces: { wksA: { role: 'owner', departments: [] } } },
  workspaces: [{ id: 'wksA', name: 'Acme', slug: 'acme' }],
};

describe('RequireAuth', () => {
  it('renders children for a signed-in user', () => {
    renderGuard(signedIn);

    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('redirects a signed-out user to /login with the original path in ?next', async () => {
    renderGuard({ status: 'signedOut' }, '/acme/projects');

    expect(await screen.findByText('login stub next=/acme/projects')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('announces a polite loading state while the session resolves', () => {
    renderGuard({ status: 'loading' });

    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { FirebaseError } from 'firebase/app';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext, type IAuthContextValue, type TAuthState } from './AuthProvider.tsx';
import { LoginPage } from './LoginPage.tsx';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onIdTokenChanged: vi.fn(() => () => {}),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

const signedOut: TAuthState = { status: 'signedOut' };

function renderLogin(state: TAuthState = signedOut, initialEntry = '/login') {
  const value: IAuthContextValue = { state, signOutUser: vi.fn(async () => {}) };
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: (
          <AuthContext.Provider value={value}>
            <LoginPage />
          </AuthContext.Provider>
        ),
      },
      { path: '/', element: <p>home stub</p> },
      { path: '/acme/projects', element: <p>deep-link stub</p> },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
}

beforeEach(() => {
  vi.mocked(signInWithEmailAndPassword).mockReset();
  vi.mocked(signInWithPopup).mockReset();
});

describe('LoginPage', () => {
  it('signs in with email/password and lands on the workspace resolver', async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({} as never);
    renderLogin();

    await fillAndSubmit('alice@firm.test', 'hunter22');

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'alice@firm.test',
      'hunter22',
    );
    expect(await screen.findByText('home stub')).toBeInTheDocument();
  });

  it('honours a safe ?next deep link after sign-in', async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({} as never);
    renderLogin(signedOut, '/login?next=%2Facme%2Fprojects');

    await fillAndSubmit('alice@firm.test', 'hunter22');

    expect(await screen.findByText('deep-link stub')).toBeInTheDocument();
  });

  it('ignores an absolute-URL ?next (open-redirect guard)', async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({} as never);
    renderLogin(signedOut, '/login?next=https%3A%2F%2Fevil.example');

    await fillAndSubmit('alice@firm.test', 'hunter22');

    expect(await screen.findByText('home stub')).toBeInTheDocument();
  });

  it('announces one generic message for bad credentials via role="alert"', async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue(
      new FirebaseError('auth/invalid-credential', 'nope'),
    );
    renderLogin();

    await fillAndSubmit('alice@firm.test', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('announces rate limiting', async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue(
      new FirebaseError('auth/too-many-requests', 'slow down'),
    );
    renderLogin();

    await fillAndSubmit('alice@firm.test', 'hunter22');

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });

  it('points cross-provider accounts at the other sign-in method', async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(
      new FirebaseError('auth/account-exists-with-different-credential', 'other'),
    );
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/different sign-in method/i);
  });

  it('stays silent when the Google popup is dismissed', async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(
      new FirebaseError('auth/popup-closed-by-user', 'closed'),
    );
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('invokes the Google popup flow from its button', async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({} as never);
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(signInWithPopup).toHaveBeenCalledOnce();
    expect(await screen.findByText('home stub')).toBeInTheDocument();
  });

  it('links empty-field errors to their inputs via aria-describedby', async () => {
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter your email address.');
    expect(screen.getByLabelText(/password/i)).toHaveAccessibleDescription(
      'Enter your password.',
    );
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('redirects an already signed-in user away from /login', async () => {
    renderLogin({
      status: 'signedIn',
      user: { uid: 'u1' } as never,
      claims: { workspaces: {} },
      workspaces: [],
    });

    expect(await screen.findByText('home stub')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderLogin();

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});

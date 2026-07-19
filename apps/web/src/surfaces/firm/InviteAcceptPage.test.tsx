import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  sendEmailVerification: vi.fn(),
}));

vi.mock('@/lib/firebase.ts', () => ({
  auth: { currentUser: { getIdToken: vi.fn(async () => 'token') } },
}));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: mocks.sendEmailVerification,
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/callables.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/callables.ts')>()),
  acceptInvite: mocks.acceptInvite,
}));

import {
  AuthContext,
  type IAuthContextValue,
  type TAuthState,
} from './auth/AuthProvider.tsx';
import { InviteAcceptPage } from './InviteAcceptPage.tsx';

const signedOut: TAuthState = { status: 'signedOut' };

function makeUser(overrides: Record<string, unknown> = {}): User {
  return {
    uid: 'u9',
    email: 'new.hire@example.com',
    displayName: null,
    reload: vi.fn(async () => {}),
    getIdToken: vi.fn(async () => 'token'),
    ...overrides,
  } as unknown as User;
}

function signedIn(user = makeUser()): TAuthState {
  return { status: 'signedIn', user, claims: { workspaces: {} }, workspaces: [] };
}

function renderPage(state: TAuthState, signOutUser = vi.fn(async () => {})) {
  const value: IAuthContextValue = { state, signOutUser };
  const router = createMemoryRouter(
    [
      {
        path: '/invite/:workspaceId/:inviteId/:token',
        element: (
          <AuthContext.Provider value={value}>
            <InviteAcceptPage />
          </AuthContext.Provider>
        ),
      },
      { path: '/:slug', element: <p>workspace home</p> },
      { path: '/', element: <p>workspace entry</p> },
    ],
    { initialEntries: ['/invite/wksA/inv1/tok123'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InviteAcceptPage', () => {
  it('offers sign-in and account creation when signed out', async () => {
    renderPage(signedOut);

    expect(
      screen.getByRole('heading', { level: 1, name: /join your team on siapp/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in and join/i })).toBeInTheDocument();
    expect(mocks.acceptInvite).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /create an account/i }));
    expect(
      screen.getByRole('button', { name: /create account and join/i }),
    ).toBeInTheDocument();
  });

  it('accepts the invite for a signed-in user and navigates to the workspace', async () => {
    mocks.acceptInvite.mockResolvedValue({
      workspaceId: 'wksA',
      workspaceSlug: 'acme',
      role: 'pm',
    });
    renderPage(signedIn());

    expect(await screen.findByText(/workspace home/i)).toBeInTheDocument();
    expect(mocks.acceptInvite).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      inviteId: 'inv1',
      token: 'tok123',
    });
  });

  it('renders the stable message for a known error code', async () => {
    mocks.acceptInvite.mockRejectedValue({ details: { code: 'invite/expired' } });
    renderPage(signedIn());

    expect(await screen.findByText(/this invite has expired/i)).toBeInTheDocument();
  });

  it('walks unverified emails through verification and retry', async () => {
    mocks.acceptInvite.mockRejectedValueOnce({ details: { code: 'invite/email-unverified' } });
    mocks.sendEmailVerification.mockResolvedValue(undefined);
    const user = makeUser();
    renderPage(signedIn(user));

    expect(await screen.findByRole('heading', { name: /verify your email/i })).toBeInTheDocument();
    expect(screen.getByText(/new\.hire@example\.com/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
    expect(mocks.sendEmailVerification).toHaveBeenCalledOnce();
    expect(await screen.findByText(/verification email sent/i)).toBeInTheDocument();

    mocks.acceptInvite.mockResolvedValueOnce({
      workspaceId: 'wksA',
      workspaceSlug: 'acme',
      role: 'pm',
    });
    await userEvent.click(screen.getByRole('button', { name: /i've verified — try again/i }));
    expect(await screen.findByText(/workspace home/i)).toBeInTheDocument();
    expect(user.reload).toHaveBeenCalled();
  });

  it('offers switching accounts on an email mismatch', async () => {
    mocks.acceptInvite.mockRejectedValue({ details: { code: 'invite/email-mismatch' } });
    const signOutUser = vi.fn(async () => {});
    renderPage(signedIn(), signOutUser);

    expect(await screen.findByText(/sent to a different email/i)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /sign in with a different account/i }),
    );
    expect(signOutUser).toHaveBeenCalledOnce();
  });
});

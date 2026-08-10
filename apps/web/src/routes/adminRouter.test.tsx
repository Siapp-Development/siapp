import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';
import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
  onIdTokenChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminRoutes } from '@/routes/adminRouter.tsx';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  TotpMultiFactorGenerator: class TotpMultiFactorGenerator {
    static FACTOR_ID = 'totp';
    static generateSecret = vi.fn();
    static assertionForSignIn = vi.fn();
    static assertionForEnrollment = vi.fn();
  },
  getMultiFactorResolver: vi.fn(),
  getRedirectResult: vi.fn(async () => null),
  multiFactor: vi.fn(),
  onIdTokenChanged: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn()),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  limit: vi.fn(),
  startAfter: vi.fn(),
  Timestamp: { fromDate: vi.fn() },
}));

/** Make onIdTokenChanged fire once with the given user (or null). */
function stubAuthUser(user: unknown): void {
  vi.mocked(onIdTokenChanged).mockImplementation((_auth, observer) => {
    if (typeof observer === 'function') {
      observer(user as User | null);
    }
    return () => {};
  });
}

function fakeUser(claims: Record<string, unknown>): unknown {
  return {
    email: 'admin@siapp.test',
    getIdTokenResult: () => Promise.resolve({ claims }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  // .env.local sets VITE_USE_EMULATORS=true, which disables the MFA gate —
  // these tests exercise production behavior.
  vi.stubEnv('VITE_USE_EMULATORS', 'false');
  stubAuthUser(null);
});

function renderAt(path: string) {
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

describe('adminRouter', () => {
  it('redirects to /login when signed out', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { level: 1, name: /siapp admin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('shows login page at /login', async () => {
    renderAt('/login');

    expect(await screen.findByRole('heading', { level: 1, name: /siapp admin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with email/i })).toBeInTheDocument();
  });

  it('submits email/password sign-in from the admin login form', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({} as never);

    renderAt('/login');
    await userEvent.type(await screen.findByLabelText(/^email$/i), 'admin@siapp.test');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: /sign in with email/i }));

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'admin@siapp.test',
      'Passw0rd!',
    );
  });

  it('triggers forgot-password from admin login', async () => {
    const { sendPasswordResetEmail } = await import('firebase/auth');
    vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);

    renderAt('/login');
    await userEvent.type(await screen.findByLabelText(/^email$/i), 'admin@siapp.test');
    await userEvent.click(screen.getByRole('button', { name: /forgot password\?/i }));

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'admin@siapp.test');
    expect(
      await screen.findByText(/if that account exists, a password reset email has been sent/i),
    ).toBeInTheDocument();
  });

  it('makes the skip link the first focusable element', async () => {
    renderAt('/login');

    await screen.findByRole('heading', { level: 1 });
    await userEvent.tab();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });

  it('shows the access-denied screen at /login for a non-admin user (#63 regression)', async () => {
    stubAuthUser(fakeUser({}));

    renderAt('/login');

    expect(await screen.findByText(/does not have siapp admin access/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
  });

  it('walks an unenrolled admin into TOTP enrolment (#63)', async () => {
    stubAuthUser(fakeUser({ isAdmin: true, firebase: {} }));
    vi.mocked(multiFactor).mockReturnValue({
      enrolledFactors: [],
      getSession: vi.fn(() => Promise.resolve({})),
    } as never);
    vi.mocked(TotpMultiFactorGenerator.generateSecret).mockResolvedValue({
      generateQrCodeUrl: () => 'otpauth://totp/Siapp%20Admin:admin@siapp.test?secret=ABC',
      secretKey: 'ABCDEF123456',
    } as never);

    renderAt('/login');

    expect(
      await screen.findByRole('heading', { name: /set up two-factor authentication/i }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(screen.getByText('ABCDEF123456')).toBeInTheDocument();
  });

  it('asks an enrolled admin without a second-factor session to re-sign-in', async () => {
    stubAuthUser(fakeUser({ isAdmin: true, firebase: {} }));
    vi.mocked(multiFactor).mockReturnValue({ enrolledFactors: [{}] } as never);

    renderAt('/');

    expect(
      await screen.findByRole('heading', { name: /multi-factor authentication required/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sign out and sign in again/i)).toBeInTheDocument();
  });

  it('shows the TOTP code form when sign-in raises a multi-factor challenge (#63)', async () => {
    const resolveSignIn = vi.fn(() => Promise.resolve({}));
    vi.mocked(signInWithPopup).mockRejectedValue(
      new FirebaseError('auth/multi-factor-auth-required', 'second factor required'),
    );
    vi.mocked(getMultiFactorResolver).mockReturnValue({
      hints: [{ factorId: 'totp', uid: 'factor-1' }],
      resolveSignIn,
    } as never);
    vi.mocked(TotpMultiFactorGenerator.assertionForSignIn).mockReturnValue(
      'totp-assertion' as never,
    );

    renderAt('/login');
    await userEvent.click(await screen.findByRole('button', { name: /sign in with google/i }));

    const codeInput = await screen.findByLabelText(/authenticator code/i);
    await userEvent.type(codeInput, '123456');
    await userEvent.click(screen.getByRole('button', { name: /^verify$/i }));

    expect(TotpMultiFactorGenerator.assertionForSignIn).toHaveBeenCalledWith('factor-1', '123456');
    expect(resolveSignIn).toHaveBeenCalledWith('totp-assertion');
  });

  it('rejects a malformed authenticator code without calling the resolver', async () => {
    const resolveSignIn = vi.fn(() => Promise.resolve({}));
    vi.mocked(signInWithPopup).mockRejectedValue(
      new FirebaseError('auth/multi-factor-auth-required', 'second factor required'),
    );
    vi.mocked(getMultiFactorResolver).mockReturnValue({
      hints: [{ factorId: 'totp', uid: 'factor-1' }],
      resolveSignIn,
    } as never);

    renderAt('/login');
    await userEvent.click(await screen.findByRole('button', { name: /sign in with google/i }));

    await userEvent.type(await screen.findByLabelText(/authenticator code/i), '12ab');
    await userEvent.click(screen.getByRole('button', { name: /^verify$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/6-digit code/i);
    expect(resolveSignIn).not.toHaveBeenCalled();
  });

  it('shows the error fallback instead of a blank screen when a route render throws', async () => {
    // React + reportError both log the caught error — keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('admin route exploded');
    };
    // A throwing route under the root's configured errorElement.
    const routes = [{ path: '/', Component: Boom, errorElement: adminRoutes[0]?.errorElement }];
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

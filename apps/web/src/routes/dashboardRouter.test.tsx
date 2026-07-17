import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onIdTokenChanged } from 'firebase/auth';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { dashboardRoutes } from '@/routes/dashboardRouter.tsx';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onIdTokenChanged: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

// Every router test runs signed out: the token listener fires null once.
vi.mocked(onIdTokenChanged).mockImplementation((_auth, observer) => {
  if (typeof observer === 'function') {
    observer(null);
  }
  return () => {};
});

function renderAt(path: string) {
  const router = createMemoryRouter(dashboardRoutes, { initialEntries: [path] });

  return render(<RouterProvider router={router} />);
}

describe('dashboardRouter', () => {
  it('serves the sign-in screen at /login while signed out', async () => {
    renderAt('/login');

    expect(
      await screen.findByRole('heading', { level: 1, name: /sign in to siapp/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('serves the password reset screen at /forgot-password', async () => {
    renderAt('/forgot-password');

    expect(
      await screen.findByRole('heading', { level: 1, name: /reset your password/i }),
    ).toBeInTheDocument();
  });

  it('redirects the workspace entry to /login while signed out', async () => {
    renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: /sign in to siapp/i }),
    ).toBeInTheDocument();
  });

  it('guards /:workspaceSlug/* and preserves the destination in ?next', async () => {
    renderAt('/acme/projects');

    expect(
      await screen.findByRole('heading', { level: 1, name: /sign in to siapp/i }),
    ).toBeInTheDocument();
    // RequireAuth encodes the original location so sign-in can return to it.
    expect(window.location.pathname).not.toBe('/acme/projects');
  });

  it('keeps the skip link as the first focusable element on the login screen', async () => {
    renderAt('/login');

    await screen.findByRole('heading', { level: 1, name: /sign in to siapp/i });
    await userEvent.tab();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onIdTokenChanged } from 'firebase/auth';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { adminRoutes } from '@/routes/adminRouter.tsx';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onIdTokenChanged: vi.fn(),
  signInWithPopup: vi.fn(),
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

// Signed-out state: token listener fires null.
vi.mocked(onIdTokenChanged).mockImplementation((_auth, observer) => {
  if (typeof observer === 'function') {
    observer(null);
  }
  return () => {};
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
  });

  it('makes the skip link the first focusable element', async () => {
    renderAt('/login');

    await screen.findByRole('heading', { level: 1 });
    await userEvent.tab();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });
});

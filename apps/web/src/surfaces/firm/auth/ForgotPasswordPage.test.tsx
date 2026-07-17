import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail } from 'firebase/auth';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordPage } from './ForgotPasswordPage.tsx';

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onIdTokenChanged: vi.fn(() => () => {}),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

const NON_ENUMERATING_COPY = /if that account exists, a password reset email has been sent/i;

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/forgot-password', Component: ForgotPasswordPage },
      { path: '/login', element: <p>login stub</p> },
    ],
    { initialEntries: ['/forgot-password'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.mocked(sendPasswordResetEmail).mockReset();
});

describe('ForgotPasswordPage', () => {
  it('shows the non-enumerating confirmation when the email succeeds', async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue();
    renderPage();

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@firm.test');
    await userEvent.click(screen.getByRole('button', { name: /send reset email/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(NON_ENUMERATING_COPY);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'alice@firm.test');
  });

  it('shows the same confirmation for an unknown account (no user enumeration)', async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(
      new FirebaseError('auth/user-not-found', 'unknown'),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText(/email/i), 'nobody@firm.test');
    await userEvent.click(screen.getByRole('button', { name: /send reset email/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(NON_ENUMERATING_COPY);
  });

  it('asks for an email before submitting', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /send reset email/i }));

    expect(screen.getByLabelText(/email/i)).toHaveAccessibleDescription(
      'Enter your email address.',
    );
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('links back to sign-in', () => {
    renderPage();

    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderPage();

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});

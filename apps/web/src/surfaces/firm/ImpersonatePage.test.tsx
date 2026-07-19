import { render, screen } from '@testing-library/react';
import { signInWithCustomToken } from 'firebase/auth';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn() }));

import { ImpersonatePage } from './ImpersonatePage.tsx';

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/impersonate', element: <ImpersonatePage /> },
      { path: '/', element: <p>workspace entry</p> },
    ],
    { initialEntries: ['/impersonate'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/impersonate');
});

describe('ImpersonatePage', () => {
  it('signs in with the fragment token, strips it from the URL, and navigates home', async () => {
    window.location.hash = '#token=custom-token-123';
    vi.mocked(signInWithCustomToken).mockResolvedValue({} as never);

    renderPage();

    expect(await screen.findByText(/workspace entry/i)).toBeInTheDocument();
    expect(signInWithCustomToken).toHaveBeenCalledWith({}, 'custom-token-123');
    expect(window.location.hash).toBe('');
  });

  it('shows an error when the token is missing', async () => {
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/missing impersonation token/i);
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('surfaces sign-in failures', async () => {
    window.location.hash = '#token=expired-token';
    vi.mocked(signInWithCustomToken).mockRejectedValue(new Error('auth/invalid-custom-token'));

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid-custom-token/i);
  });
});

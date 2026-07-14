import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { adminRoutes } from '@/routes/adminRouter.tsx';

function renderRoot() {
  const router = createMemoryRouter(adminRoutes, { initialEntries: ['/'] });

  return render(<RouterProvider router={router} />);
}

describe('adminRouter', () => {
  it('renders the admin shell with heading, env marker, and landmarks', () => {
    renderRoot();

    expect(screen.getByRole('heading', { level: 1, name: 'Siapp Admin' })).toBeInTheDocument();
    expect(screen.getByText(/siapp admin — test/i)).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('makes the skip link the first focusable element', async () => {
    renderRoot();

    await userEvent.tab();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });
});

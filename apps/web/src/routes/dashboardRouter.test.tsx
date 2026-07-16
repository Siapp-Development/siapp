import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { dashboardRoutes } from '@/routes/dashboardRouter.tsx';

function renderAt(path: string) {
  const router = createMemoryRouter(dashboardRoutes, { initialEntries: [path] });

  return render(<RouterProvider router={router} />);
}

describe('dashboardRouter', () => {
  it('asks for a workspace URL at /', () => {
    renderAt('/');

    expect(
      screen.getByRole('heading', { level: 1, name: /siapp dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/enter your workspace url/i)).toBeInTheDocument();
  });

  it('renders the firm shell at /:workspaceSlug and surfaces the slug', () => {
    renderAt('/acme');

    expect(screen.getByRole('heading', { level: 1, name: /workspace acme/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('makes the skip link the first focusable element in the firm shell', async () => {
    renderAt('/acme');

    await userEvent.tab();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { apexRoutes } from '@/routes/apexRouter.tsx';

function renderAt(path: string) {
  const router = createMemoryRouter(apexRoutes, { initialEntries: [path] });

  return render(<RouterProvider router={router} />);
}

describe('apexRouter', () => {
  it('serves the marketing page at / with heading and landmarks', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Siapp' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('makes the skip link the first focusable element on the marketing page', async () => {
    renderAt('/');

    await userEvent.tab();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });

  it('lazy-loads the portal shell at /p/:token and surfaces the token', async () => {
    renderAt('/p/abc');

    expect(await screen.findByRole('heading', { level: 1, name: /your project/i })).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('applies the portal surface theme once the /p tree mounts', async () => {
    renderAt('/p/abc');

    await screen.findByRole('heading', { level: 1, name: /your project/i });

    expect(document.documentElement.dataset.surface).toBe('portal');
  });

  it('lazy-loads the collaborator page at /t/:token and surfaces the token', async () => {
    renderAt('/t/xyz');

    expect(await screen.findByRole('heading', { level: 1, name: /your task/i })).toBeInTheDocument();
    expect(screen.getByText('xyz')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

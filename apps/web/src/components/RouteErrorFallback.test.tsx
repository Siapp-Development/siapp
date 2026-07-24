import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerErrorSink, resetErrorReportingForTests } from '@/lib/reportError.ts';

import { RouteErrorFallback } from './RouteErrorFallback.tsx';

function Boom(): never {
  throw new Error('route exploded');
}

function renderWithThrowingRoute(surface: 'apex' | 'portal') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        Component: Boom,
        errorElement: <RouteErrorFallback surface={surface} />,
      },
    ],
    { initialEntries: ['/'] },
  );

  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  resetErrorReportingForTests();
  vi.restoreAllMocks();
});

describe('RouteErrorFallback', () => {
  it('renders the accessible fallback when a route render throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registerErrorSink(vi.fn());

    renderWithThrowingRoute('apex');

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('moves focus to the fallback heading', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registerErrorSink(vi.fn());

    renderWithThrowingRoute('apex');

    expect(screen.getByRole('heading', { level: 1, name: /something went wrong/i })).toHaveFocus();
  });

  it('reports the thrown error once with source "route-error"', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = vi.fn();
    registerErrorSink(sink);

    renderWithThrowingRoute('portal');

    expect(sink).toHaveBeenCalledOnce();
    const [error, context] = sink.mock.calls[0];
    expect((error as Error).message).toBe('route exploded');
    expect(context).toMatchObject({ surface: 'portal', source: 'route-error' });
  });

  it('renders the not-found variant for route error responses without reporting', () => {
    const sink = vi.fn();
    registerErrorSink(sink);
    const router = createMemoryRouter(
      [
        {
          path: '/',
          Component: () => null,
          errorElement: <RouteErrorFallback surface="apex" />,
          children: [],
        },
      ],
      // No route matches /missing → router produces a 404 ErrorResponse.
      { initialEntries: ['/missing'] },
    );

    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole('heading', { level: 1, name: /page not found/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reload page/i })).not.toBeInTheDocument();
    expect(sink).not.toHaveBeenCalled();
  });
});

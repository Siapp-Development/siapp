import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerErrorSink, resetErrorReportingForTests } from '@/lib/reportError.ts';

import { AppErrorBoundary } from './AppErrorBoundary.tsx';

function Boom(): never {
  throw new Error('render exploded');
}

afterEach(() => {
  resetErrorReportingForTests();
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <AppErrorBoundary surface="apex">
        <p>All good</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the accessible fallback when a child throws', () => {
    // React logs caught render errors in dev — keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registerErrorSink(vi.fn());

    render(
      <AppErrorBoundary surface="portal">
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('moves focus to the fallback heading', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registerErrorSink(vi.fn());

    render(
      <AppErrorBoundary surface="apex">
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /something went wrong/i })).toHaveFocus();
  });

  it('reports the error once with surface, source, and componentStack', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = vi.fn();
    registerErrorSink(sink);

    render(
      <AppErrorBoundary surface="dashboard">
        <Boom />
      </AppErrorBoundary>,
    );

    expect(sink).toHaveBeenCalledOnce();
    const [error, context] = sink.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('render exploded');
    expect(context).toMatchObject({ surface: 'dashboard', source: 'error-boundary' });
    expect(context.componentStack).toEqual(expect.any(String));
  });
});

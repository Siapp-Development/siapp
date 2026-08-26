import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IPortalUpdate, TPortalUpdatesState } from '../updates/usePortalUpdates.ts';
import { PortalUpdatesSection } from './PortalUpdatesSection.tsx';

const usePortalUpdatesMock = vi.fn();

// Mock at the hook boundary — the hook itself is covered by usePortalUpdates.test.ts.
vi.mock('../updates/usePortalUpdates.ts', async () => {
  const actual = await vi.importActual<typeof import('../updates/usePortalUpdates.ts')>(
    '../updates/usePortalUpdates.ts',
  );
  return {
    ...actual,
    usePortalUpdates: (...args: unknown[]) => usePortalUpdatesMock(...args),
  };
});

function setState(state: TPortalUpdatesState): void {
  usePortalUpdatesMock.mockReturnValue({ state, loadMore: vi.fn() });
}

function update(overrides: Partial<IPortalUpdate>): IPortalUpdate {
  return {
    id: 'u1',
    action: 'task_created',
    taskTitleDenorm: '',
    docNameDenorm: '',
    at: null,
    payload: {},
    ...overrides,
  };
}

afterEach(() => {
  usePortalUpdatesMock.mockReset();
});

describe('PortalUpdatesSection', () => {
  it('shows a loading status while updates resolve', () => {
    setState({ status: 'loading' });

    render(<PortalUpdatesSection workspaceId="w1" projectId="p1" />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading updates/i);
  });

  it('shows an alert on error', () => {
    setState({ status: 'error' });

    render(<PortalUpdatesSection workspaceId="w1" projectId="p1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.?t load updates/i);
  });

  it('renders an empty state when there are no updates', () => {
    setState({ status: 'ready', rows: [], hasMore: false });

    render(<PortalUpdatesSection workspaceId="w1" projectId="p1" />);

    expect(screen.getByText(/no updates yet/i)).toBeInTheDocument();
  });

  it('previews client-safe update labels', () => {
    setState({
      status: 'ready',
      hasMore: false,
      rows: [
        update({ id: 'u1', action: 'task_created', taskTitleDenorm: 'Order tiles' }),
        update({ id: 'u2', action: 'project_completed' }),
      ],
    });

    render(<PortalUpdatesSection workspaceId="w1" projectId="p1" />);

    const list = screen.getByRole('list', { name: 'Recent updates' });
    expect(list).toHaveTextContent('New task: Order tiles');
    expect(list).toHaveTextContent('Your project is complete');
  });
});

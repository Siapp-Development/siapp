/**
 * NotificationPanel (#134): loading / error / empty states, Today / Earlier
 * grouping, "Mark all as read" and "Load more" wiring. The useNotifications
 * hook is mocked so the panel is tested in isolation; NotificationItem needs a
 * navigate, so react-router is mocked too.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router', () => ({ useNavigate: () => nav.navigate }));

const hook = vi.hoisted(() => ({
  state: { status: 'loading' } as unknown,
  loadMore: vi.fn(),
  markRead: vi.fn().mockResolvedValue(undefined),
  markAllRead: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./useNotifications.ts', () => ({
  useNotifications: () => ({
    state: hook.state,
    loadMore: hook.loadMore,
    markRead: hook.markRead,
    markAllRead: hook.markAllRead,
  }),
}));

import { NotificationPanel } from './NotificationPanel.tsx';
import type { INotificationRow } from './useNotifications.ts';

function row(overrides: Partial<INotificationRow> = {}): INotificationRow {
  return {
    id: 'n1',
    kind: 'task_assigned',
    read: false,
    actorType: 'user',
    actorName: 'Alice',
    projectId: 'p1',
    projectName: 'Project One',
    taskId: 't1',
    taskTitle: 'Pour foundation',
    excerpt: null,
    at: new Date(),
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <NotificationPanel
      workspaceId="wksA"
      workspaceSlug="acme"
      uid="me"
      onClose={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hook.state = { status: 'loading' };
});

describe('NotificationPanel', () => {
  it('shows a loading state', () => {
    hook.state = { status: 'loading' };
    renderPanel();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('shows an error state', () => {
    hook.state = { status: 'error' };
    renderPanel();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows an empty state when there are no rows', () => {
    hook.state = { status: 'ready', rows: [], hasMore: false, loadingMore: false };
    renderPanel();
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
  });

  it('groups rows into Today and Earlier', () => {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000);
    hook.state = {
      status: 'ready',
      rows: [row({ id: 'today1' }), row({ id: 'old1', at: yesterday })],
      hasMore: false,
      loadingMore: false,
    };
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Earlier' })).toBeInTheDocument();
  });

  it('wires "Mark all as read"', async () => {
    const user = userEvent.setup();
    hook.state = { status: 'ready', rows: [row()], hasMore: false, loadingMore: false };
    renderPanel();
    await user.click(screen.getByRole('button', { name: /mark all as read/i }));
    expect(hook.markAllRead).toHaveBeenCalledTimes(1);
  });

  it('wires "Load more" only when there is more', async () => {
    const user = userEvent.setup();
    hook.state = { status: 'ready', rows: [row()], hasMore: true, loadingMore: false };
    renderPanel();
    const button = screen.getByRole('button', { name: /load more/i });
    await user.click(button);
    expect(hook.loadMore).toHaveBeenCalledTimes(1);
  });

  it('has no "Load more" button when hasMore is false', () => {
    hook.state = { status: 'ready', rows: [row()], hasMore: false, loadingMore: false };
    renderPanel();
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('renders a dialog with an accessible label', () => {
    hook.state = { status: 'ready', rows: [row()], hasMore: false, loadingMore: false };
    renderPanel();
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(dialog).getByText('Pour foundation', { exact: false })).toBeInTheDocument();
  });
});

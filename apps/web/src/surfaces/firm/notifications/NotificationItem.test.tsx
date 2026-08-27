/**
 * NotificationItem (#134): a real button that marks-read then navigates to the
 * correct deep link (task vs project-only) and closes the panel. Unread state
 * is in the accessible name, not colour alone.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router', () => ({ useNavigate: () => nav.navigate }));

import { NotificationItem } from './NotificationItem.tsx';
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

beforeEach(() => vi.clearAllMocks());

describe('NotificationItem', () => {
  it('renders a real button and marks unread rows in the accessible name', () => {
    render(
      <NotificationItem row={row()} workspaceSlug="acme" markRead={vi.fn()} onClose={vi.fn()} />,
    );
    const button = screen.getByRole('button');
    expect(button.tagName).toBe('BUTTON');
    expect(screen.getByText('Unread')).toBeInTheDocument();
  });

  it('does not show the unread affordance for read rows', () => {
    render(
      <NotificationItem
        row={row({ read: true })}
        workspaceSlug="acme"
        markRead={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
  });

  it('marks read, closes, then navigates to the task deep link on click', async () => {
    const user = userEvent.setup();
    const markRead = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <NotificationItem row={row()} workspaceSlug="acme" markRead={markRead} onClose={onClose} />,
    );

    await user.click(screen.getByRole('button'));

    expect(markRead).toHaveBeenCalledWith('n1');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(nav.navigate).toHaveBeenCalledWith('/acme/projects/p1?task=t1');
  });

  it('navigates to a project-only link when there is no task', async () => {
    const user = userEvent.setup();
    render(
      <NotificationItem
        row={row({ kind: 'project_published', taskId: null, taskTitle: null })}
        workspaceSlug="acme"
        markRead={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button'));

    expect(nav.navigate).toHaveBeenCalledWith('/acme/projects/p1');
  });
});

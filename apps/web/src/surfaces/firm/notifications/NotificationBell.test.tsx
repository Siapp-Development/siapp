/**
 * NotificationBell (#134): a real button whose accessible name reflects unread
 * state (not colour alone), that opens the panel and closes it on Escape,
 * restoring focus to the bell. useUnreadNotifications is mocked; the panel is
 * stubbed so the bell is tested in isolation over the real Popover.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const unread = vi.hoisted(() => ({ value: false }));
vi.mock('./useUnreadNotifications.ts', () => ({
  useUnreadNotifications: () => unread.value,
}));
vi.mock('./NotificationPanel.tsx', () => ({
  NotificationPanel: () => <div data-testid="panel">panel</div>,
}));

import { NotificationBell } from './NotificationBell.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  unread.value = false;
});

describe('NotificationBell', () => {
  it('renders a real button labelled "Notifications" when all read', () => {
    render(<NotificationBell workspaceId="wksA" workspaceSlug="acme" uid="me" />);
    const button = screen.getByRole('button', { name: 'Notifications' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('reflects unread state in the accessible name (not colour alone)', () => {
    unread.value = true;
    render(<NotificationBell workspaceId="wksA" workspaceSlug="acme" uid="me" />);
    expect(screen.getByRole('button', { name: 'Notifications, unread' })).toBeInTheDocument();
  });

  it('opens the panel on click and marks the trigger expanded', async () => {
    const user = userEvent.setup();
    render(<NotificationBell workspaceId="wksA" workspaceSlug="acme" uid="me" />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button'));

    expect(screen.getByTestId('panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('closes on Escape and restores focus to the bell', async () => {
    const user = userEvent.setup();
    render(<NotificationBell workspaceId="wksA" workspaceSlug="acme" uid="me" />);
    const button = screen.getByRole('button', { name: 'Notifications' });

    await user.click(button);
    expect(screen.getByTestId('panel')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});

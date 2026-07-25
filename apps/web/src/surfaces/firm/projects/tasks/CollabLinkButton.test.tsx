import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callables = vi.hoisted(() => ({
  issueCollabLink: vi.fn(),
}));

vi.mock('@/lib/callables.ts', () => callables);

import { CollabLinkButton } from './CollabLinkButton.tsx';

const baseProps = {
  workspaceId: 'wks-1',
  projectId: 'proj-1',
  taskId: 'task-1',
  collaboratorId: 'col-1',
  collaboratorName: 'Siti',
  lifecycle: 'published',
  role: 'pm',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  callables.issueCollabLink.mockResolvedValue({
    url: 'https://siapp.app/t/abc_secret',
    expiresAt: '2026-06-01T00:00:00.000Z',
  });
});

describe('CollabLinkButton', () => {
  it('explains why the link is unavailable for drafts and non-issuing roles', () => {
    const { rerender } = render(<CollabLinkButton {...baseProps} lifecycle="draft" />);
    expect(screen.getByText(/publish the project/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<CollabLinkButton {...baseProps} role="viewer" />);
    expect(screen.getByText(/only owners, admins and pms/i)).toBeInTheDocument();
  });

  it('issues a link for the collaborator, copies it and warns about rotation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CollabLinkButton {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /copy task link for siti/i }));

    expect(callables.issueCollabLink).toHaveBeenCalledWith({
      workspaceId: 'wks-1',
      projectId: 'proj-1',
      taskId: 'task-1',
      collaboratorId: 'col-1',
    });
    expect(writeText).toHaveBeenCalledWith('https://siapp.app/t/abc_secret');
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/link copied/i);
    expect(status).toHaveTextContent(/earlier links stop working/i);
  });

  it('shows the URL inline when the clipboard is unavailable', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<CollabLinkButton {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /copy task link/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('https://siapp.app/t/abc_secret');
  });

  it('surfaces a retryable error when issuing fails', async () => {
    callables.issueCollabLink.mockRejectedValue(new Error('boom'));

    render(<CollabLinkButton {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /copy task link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t issue the link/i);
  });
});

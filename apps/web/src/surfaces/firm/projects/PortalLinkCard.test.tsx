import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callables = vi.hoisted(() => ({
  issuePortalLink: vi.fn(),
}));

vi.mock('@/lib/callables.ts', () => callables);

import { PortalLinkCard } from './PortalLinkCard.tsx';

const baseProps = {
  workspaceId: 'wks-1',
  projectId: 'proj-1',
  lifecycle: 'published',
  clientId: 'client-1',
  role: 'pm',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  callables.issuePortalLink.mockResolvedValue({
    url: 'https://siapp.app/p/abc_secret',
    expiresAt: '2026-06-01T00:00:00.000Z',
  });
});

describe('PortalLinkCard', () => {
  it('explains why the link is unavailable for drafts, missing clients and viewers', () => {
    const { rerender } = render(<PortalLinkCard {...baseProps} lifecycle="draft" />);
    expect(screen.getByText(/publish the project/i)).toBeInTheDocument();

    rerender(<PortalLinkCard {...baseProps} clientId="" />);
    expect(screen.getByText(/link a client/i)).toBeInTheDocument();

    rerender(<PortalLinkCard {...baseProps} role="viewer" />);
    expect(screen.getByText(/only owners, admins and pms/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy portal link/i })).not.toBeInTheDocument();
  });

  it('issues a link, copies it and confirms with the expiry', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<PortalLinkCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /copy portal link/i }));

    expect(callables.issuePortalLink).toHaveBeenCalledWith({
      workspaceId: 'wks-1',
      projectId: 'proj-1',
    });
    expect(writeText).toHaveBeenCalledWith('https://siapp.app/p/abc_secret');
    expect(await screen.findByRole('status')).toHaveTextContent(/link copied/i);
  });

  it('requires confirmation before resetting and passes reset: true', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });

    render(<PortalLinkCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /reset link/i }));

    expect(callables.issuePortalLink).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /confirm reset/i }));

    expect(callables.issuePortalLink).toHaveBeenCalledWith({
      workspaceId: 'wks-1',
      projectId: 'proj-1',
      reset: true,
    });
  });

  it('shows the URL inline when the clipboard is unavailable', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<PortalLinkCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /copy portal link/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('https://siapp.app/p/abc_secret');
  });

  it('surfaces a retryable error when issuing fails', async () => {
    callables.issuePortalLink.mockRejectedValue(new Error('boom'));

    render(<PortalLinkCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /copy portal link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t issue the link/i);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callables = vi.hoisted(() => ({
  issuePortalLink: vi.fn(),
  sendPortalLink: vi.fn(),
}));

vi.mock('@/lib/callables.ts', () => callables);

import { PortalLinkCard } from './PortalLinkCard.tsx';

const ONE_CLIENT = [{ id: 'client-1', name: 'Ann Lee' }];
const TWO_CLIENTS = [
  { id: 'client-1', name: 'Ann Lee' },
  { id: 'client-2', name: 'Ben Tan' },
];

const baseProps = {
  workspaceId: 'wks-1',
  projectId: 'proj-1',
  lifecycle: 'published',
  clients: ONE_CLIENT,
  role: 'pm',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  callables.issuePortalLink.mockResolvedValue({
    links: [
      {
        clientId: 'client-1',
        clientName: 'Ann Lee',
        url: 'https://siapp.app/p/abc_secret',
        expiresAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  });
  callables.sendPortalLink.mockResolvedValue({
    results: [
      { clientId: 'client-1', clientName: 'Ann Lee', status: 'queued', expiresAt: '2026-06-01T00:00:00.000Z' },
    ],
  });
});

describe('PortalLinkCard', () => {
  it('explains why the link is unavailable for drafts, missing clients and viewers', () => {
    const { rerender } = render(<PortalLinkCard {...baseProps} lifecycle="draft" />);
    expect(screen.getByText(/publish the project/i)).toBeInTheDocument();

    rerender(<PortalLinkCard {...baseProps} clients={[]} />);
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
    expect(await screen.findByRole('status')).toHaveTextContent(/copied/i);
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

    expect(await screen.findByText('https://siapp.app/p/abc_secret')).toBeInTheDocument();
  });

  it('surfaces a retryable error when issuing fails', async () => {
    callables.issuePortalLink.mockRejectedValue(new Error('boom'));

    render(<PortalLinkCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /copy portal link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t issue the link/i);
  });

  it('lists a link per client for a multi-client project (#157)', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    callables.issuePortalLink.mockResolvedValue({
      links: [
        {
          clientId: 'client-1',
          clientName: 'Ann Lee',
          url: 'https://siapp.app/p/ann_secret',
          expiresAt: '2026-06-01T00:00:00.000Z',
        },
        {
          clientId: 'client-2',
          clientName: 'Ben Tan',
          url: 'https://siapp.app/p/ben_secret',
          expiresAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    render(<PortalLinkCard {...baseProps} clients={TWO_CLIENTS} />);
    await userEvent.click(screen.getByRole('button', { name: /get portal links/i }));

    const list = await screen.findByRole('list', { name: /portal links/i });
    expect(list).toHaveTextContent('Ann Lee');
    expect(list).toHaveTextContent('Ben Tan');
    expect(list).toHaveTextContent('https://siapp.app/p/ann_secret');
    expect(list).toHaveTextContent('https://siapp.app/p/ben_secret');
  });

  describe('Send portal link (#137, Part C; #157 fan-out)', () => {
    it('offers the Send button only for eligible (published + linked) projects', () => {
      const { rerender } = render(<PortalLinkCard {...baseProps} />);
      expect(screen.getByRole('button', { name: /send portal link/i })).toBeInTheDocument();

      rerender(<PortalLinkCard {...baseProps} lifecycle="draft" />);
      expect(screen.queryByRole('button', { name: /send portal link/i })).not.toBeInTheDocument();

      rerender(<PortalLinkCard {...baseProps} clients={[]} />);
      expect(screen.queryByRole('button', { name: /send portal link/i })).not.toBeInTheDocument();

      rerender(<PortalLinkCard {...baseProps} role="viewer" />);
      expect(screen.queryByRole('button', { name: /send portal link/i })).not.toBeInTheDocument();
    });

    it('enqueues over WhatsApp and confirms the sent state with the expiry', async () => {
      render(<PortalLinkCard {...baseProps} />);
      await userEvent.click(screen.getByRole('button', { name: /send portal link/i }));

      expect(callables.sendPortalLink).toHaveBeenCalledWith({
        workspaceId: 'wks-1',
        projectId: 'proj-1',
      });
      expect(await screen.findByRole('list', { name: /send results/i })).toHaveTextContent(
        /sent via whatsapp/i,
      );
    });

    it('surfaces the opted_out result without claiming a send', async () => {
      callables.sendPortalLink.mockResolvedValue({
        results: [{ clientId: 'client-1', clientName: 'Ann Lee', status: 'opted_out' }],
      });
      render(<PortalLinkCard {...baseProps} />);
      await userEvent.click(screen.getByRole('button', { name: /send portal link/i }));

      expect(await screen.findByRole('list', { name: /send results/i })).toHaveTextContent(
        /turned off whatsapp notifications/i,
      );
    });

    it('surfaces the no_consent result', async () => {
      callables.sendPortalLink.mockResolvedValue({
        results: [{ clientId: 'client-1', clientName: 'Ann Lee', status: 'no_consent' }],
      });
      render(<PortalLinkCard {...baseProps} />);
      await userEvent.click(screen.getByRole('button', { name: /send portal link/i }));

      expect(await screen.findByRole('list', { name: /send results/i })).toHaveTextContent(
        /not consented to whatsapp/i,
      );
    });

    it('surfaces the no_phone result when the client has no phone on file', async () => {
      callables.sendPortalLink.mockResolvedValue({
        results: [{ clientId: 'client-1', clientName: 'Ann Lee', status: 'no_phone' }],
      });
      render(<PortalLinkCard {...baseProps} />);
      await userEvent.click(screen.getByRole('button', { name: /send portal link/i }));

      expect(await screen.findByRole('list', { name: /send results/i })).toHaveTextContent(
        /no phone number on file/i,
      );
      expect(screen.queryByText(/sent via whatsapp/i)).not.toBeInTheDocument();
    });

    it('shows a per-client send matrix and flags de-duped phones (#157 D4)', async () => {
      callables.sendPortalLink.mockResolvedValue({
        results: [
          { clientId: 'client-1', clientName: 'Ann Lee', status: 'queued', expiresAt: '2026-06-01T00:00:00.000Z' },
          { clientId: 'client-2', clientName: 'Ben Tan', status: 'duplicate_phone' },
        ],
      });
      render(<PortalLinkCard {...baseProps} clients={TWO_CLIENTS} />);
      await userEvent.click(screen.getByRole('button', { name: /send portal links/i }));

      const list = await screen.findByRole('list', { name: /send results/i });
      expect(list).toHaveTextContent(/Ann Lee.*sent via whatsapp/i);
      expect(list).toHaveTextContent(/Ben Tan.*shares a phone/i);
    });

    it('shows a retryable error when the send throws', async () => {
      callables.sendPortalLink.mockRejectedValue(new Error('boom'));
      render(<PortalLinkCard {...baseProps} />);
      await userEvent.click(screen.getByRole('button', { name: /send portal link/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t issue the link/i);
    });
  });
});

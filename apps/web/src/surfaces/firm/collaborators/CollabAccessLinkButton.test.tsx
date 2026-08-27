import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callables = vi.hoisted(() => ({
  issueCollaboratorLink: vi.fn(),
  sendCollaboratorLink: vi.fn(),
}));
vi.mock('@/lib/callables.ts', () => callables);

import { CollabAccessLinkButton } from './CollabAccessLinkButton.tsx';

const EXPIRES = '2026-11-23T00:00:00Z';
const NAME = 'Lim Electrical';

function renderChip() {
  return render(
    <CollabAccessLinkButton
      workspaceId="wksA"
      collaboratorId="col1"
      collaboratorName={NAME}
      variant="chip"
    />,
  );
}

function renderCard() {
  return render(
    <CollabAccessLinkButton
      workspaceId="wksA"
      collaboratorId="col1"
      collaboratorName={NAME}
      variant="card"
    />,
  );
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  callables.issueCollaboratorLink.mockResolvedValue({
    url: 'https://siapp.app/t/abc_secret',
    expiresAt: EXPIRES,
  });
  callables.sendCollaboratorLink.mockResolvedValue({ status: 'queued', expiresAt: EXPIRES });
});

describe('CollabAccessLinkButton — chip variant (task-panel assignee chip)', () => {
  it('labels the copy-icon button with the collaborator name', () => {
    renderChip();
    expect(
      screen.getByRole('button', { name: `Copy ${NAME}'s access link` }),
    ).toBeInTheDocument();
  });

  it('copies the durable get-or-create link (no reset) and confirms in a live region', async () => {
    renderChip();
    await userEvent.click(screen.getByRole('button', { name: `Copy ${NAME}'s access link` }));

    // Durable get-or-create: no `reset` flag is ever sent from the chip.
    expect(callables.issueCollaboratorLink).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      collaboratorId: 'col1',
    });
    expect(writeText).toHaveBeenCalledWith('https://siapp.app/t/abc_secret');

    const liveRegion = await screen.findByRole('status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveTextContent(/Access link copied/i);
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = renderChip();
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

describe('CollabAccessLinkButton — card variant (Collaborators page)', () => {
  it('exposes Copy, Reset and Send actions', () => {
    renderCard();
    expect(screen.getByRole('button', { name: `Copy ${NAME}'s access link` })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Reset ${NAME}'s access link` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Send ${NAME}'s access link via WhatsApp` }),
    ).toBeInTheDocument();
  });

  it('Copy re-surfaces the same link without a reset flag', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: `Copy ${NAME}'s access link` }));
    expect(callables.issueCollaboratorLink).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      collaboratorId: 'col1',
    });
    expect(await screen.findByText(/Access link copied/i)).toBeInTheDocument();
  });

  it('Reset asks for confirmation, then rotates with reset:true', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: `Reset ${NAME}'s access link` }));

    // Confirmation dialog appears BEFORE any rotation happens.
    const dialog = screen.getByRole('dialog', { name: `Reset ${NAME}'s access link?` });
    expect(callables.issueCollaboratorLink).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/invalidates the collaborator's current link/i)).toBeVisible();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset link' }));
    expect(callables.issueCollaboratorLink).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      collaboratorId: 'col1',
      reset: true,
    });
    expect(await screen.findByText(/Link reset/i)).toBeInTheDocument();
  });

  it('cancelling the reset dialog rotates nothing', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: `Reset ${NAME}'s access link` }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callables.issueCollaboratorLink).not.toHaveBeenCalled();
  });

  it('Send enqueues over WhatsApp and confirms', async () => {
    renderCard();
    await userEvent.click(
      screen.getByRole('button', { name: `Send ${NAME}'s access link via WhatsApp` }),
    );
    expect(callables.sendCollaboratorLink).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      collaboratorId: 'col1',
    });
    expect(await screen.findByText(/sent via WhatsApp/i)).toBeInTheDocument();
  });

  it('Send surfaces the opt-out result without sending a link', async () => {
    callables.sendCollaboratorLink.mockResolvedValue({ status: 'opted_out' });
    renderCard();
    await userEvent.click(
      screen.getByRole('button', { name: `Send ${NAME}'s access link via WhatsApp` }),
    );
    expect(await screen.findByText(/turned off WhatsApp notifications/i)).toBeInTheDocument();
  });

  it('Send surfaces the no-consent result', async () => {
    callables.sendCollaboratorLink.mockResolvedValue({ status: 'no_consent' });
    renderCard();
    await userEvent.click(
      screen.getByRole('button', { name: `Send ${NAME}'s access link via WhatsApp` }),
    );
    expect(await screen.findByText(/not consented to WhatsApp/i)).toBeInTheDocument();
  });

  it('Send surfaces the no-phone result when the collaborator has no phone on file', async () => {
    callables.sendCollaboratorLink.mockResolvedValue({ status: 'no_phone' });
    renderCard();
    await userEvent.click(
      screen.getByRole('button', { name: `Send ${NAME}'s access link via WhatsApp` }),
    );
    expect(await screen.findByText(/no phone number on file/i)).toBeInTheDocument();
    // Fail-soft, not a success: the "sent via WhatsApp" confirmation must not show.
    expect(screen.queryByText(/sent via WhatsApp/i)).not.toBeInTheDocument();
  });

  it('has no detectable accessibility violations (idle)', async () => {
    const { container } = renderCard();
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

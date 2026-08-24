/**
 * PublishProjectDialog (D-027): the header Publish button + confirm modal.
 * Opening runs a `dryRun` to render the WhatsApp count/cost preview; confirming
 * re-calls `setProjectLifecycle` without `dryRun`. Callables are mocked at the
 * boundary. Axe is run on the open dialog.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callables = vi.hoisted(() => ({
  setProjectLifecycle: vi.fn(),
  projectErrorCode: vi.fn(() => null as string | null),
}));

vi.mock('@/lib/callables.ts', () => ({
  setProjectLifecycle: callables.setProjectLifecycle,
  projectErrorCode: callables.projectErrorCode,
}));

import { PublishProjectDialog } from './PublishProjectDialog.tsx';

function renderDialog() {
  return render(<PublishProjectDialog workspaceId="wksA" projectId="p1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  callables.projectErrorCode.mockReturnValue(null);
});

describe('PublishProjectDialog', () => {
  it('renders a Publish button', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs a dry-run on open and shows the WhatsApp preview', async () => {
    callables.setProjectLifecycle.mockResolvedValue({
      lifecycle: 'draft',
      publishPreview: { waCount: 3, estimatedCostMyr: 1.5 },
    });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(callables.setProjectLifecycle).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      projectId: 'p1',
      action: 'publish',
      dryRun: true,
    });
    expect(
      await screen.findByText(/3 WhatsApp messages will be sent — est\. RM 1\.50\./),
    ).toBeInTheDocument();
  });

  it('shows the zero-message copy when no WhatsApps would be sent', async () => {
    callables.setProjectLifecycle.mockResolvedValue({
      lifecycle: 'draft',
      publishPreview: { waCount: 0, estimatedCostMyr: 0 },
    });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('No WhatsApp messages will be sent.')).toBeInTheDocument();
  });

  it('confirms the publish by re-calling without dryRun and closes', async () => {
    callables.setProjectLifecycle
      .mockResolvedValueOnce({ lifecycle: 'draft', publishPreview: { waCount: 1, estimatedCostMyr: 0.5 } })
      .mockResolvedValueOnce({ lifecycle: 'published' });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: /publish this project/i });
    await screen.findByText(/1 WhatsApp message will be sent/);

    // Confirm via the dialog's Publish action.
    const confirm = within(dialog).getByRole('button', { name: 'Publish' });
    await userEvent.click(confirm);

    expect(callables.setProjectLifecycle).toHaveBeenLastCalledWith({
      workspaceId: 'wksA',
      projectId: 'p1',
      action: 'publish',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancels without publishing', async () => {
    callables.setProjectLifecycle.mockResolvedValue({
      lifecycle: 'draft',
      publishPreview: { waCount: 2, estimatedCostMyr: 1 },
    });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: /publish this project/i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Only the dry-run happened — no real transition.
    expect(callables.setProjectLifecycle).toHaveBeenCalledTimes(1);
  });

  it('surfaces a friendly error when confirming the publish fails', async () => {
    callables.setProjectLifecycle
      .mockResolvedValueOnce({ lifecycle: 'draft', publishPreview: { waCount: 0, estimatedCostMyr: 0 } })
      .mockRejectedValueOnce(new Error('boom'));
    callables.projectErrorCode.mockReturnValue('project/forbidden-transition');
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: /publish this project/i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));

    expect(
      await screen.findByText('Your role cannot publish this project.'),
    ).toBeInTheDocument();
    // The dialog stays open on error.
    expect(screen.getByRole('dialog', { name: /publish this project/i })).toBeInTheDocument();
  });

  it('has no axe violations while the confirm dialog is open', async () => {
    callables.setProjectLifecycle.mockResolvedValue({
      lifecycle: 'draft',
      publishPreview: { waCount: 2, estimatedCostMyr: 1 },
    });
    const { container } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText(/2 WhatsApp messages will be sent/);

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});

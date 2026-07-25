import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callables = vi.hoisted(() => ({
  deletePersonalData: vi.fn(),
}));
vi.mock('@/lib/callables.ts', () => callables);

import { DeletePersonalDataDialog } from './DeletePersonalDataDialog.tsx';

const SCRUBBED = {
  scrubbed: { projects: 1, tasks: 2, taskUpdates: 0, activity: 1, messages: 3, magicLinks: 2 },
};

function renderDialog(onClose = vi.fn()) {
  render(
    <DeletePersonalDataDialog
      workspaceId="wksA"
      subjectType="client"
      subjectId="c1"
      subjectName="Ahmad bin Ismail"
      onClose={onClose}
    />,
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  callables.deletePersonalData.mockResolvedValue(SCRUBBED);
});

describe('DeletePersonalDataDialog', () => {
  it('is a labelled modal dialog with consequence copy', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Delete personal data (PDPA)' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it('keeps the destructive button disabled until the exact name is typed', async () => {
    const user = userEvent.setup();
    renderDialog();

    const submit = screen.getByRole('button', { name: 'Delete personal data' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/to confirm/), 'Ahmad');
    expect(submit).toBeDisabled();

    await user.clear(screen.getByLabelText(/to confirm/));
    await user.type(screen.getByLabelText(/to confirm/), 'Ahmad bin Ismail');
    expect(submit).toBeEnabled();
  });

  it('calls the callable and reports the scrub counts on success', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/to confirm/), 'Ahmad bin Ismail');
    await user.click(screen.getByRole('button', { name: 'Delete personal data' }));

    expect(callables.deletePersonalData).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      subjectType: 'client',
      subjectId: 'c1',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'record anonymized and frozen, 2 access link(s) revoked, 4 related record(s) scrubbed, 3 queued message(s) redacted',
    );
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('shows retry guidance and stays open when the callable fails', async () => {
    const user = userEvent.setup();
    callables.deletePersonalData.mockRejectedValue(new Error('partial'));
    renderDialog();

    await user.type(screen.getByLabelText(/to confirm/), 'Ahmad bin Ismail');
    await user.click(screen.getByRole('button', { name: 'Delete personal data' }));

    expect(await screen.findByText(/run it again to finish/i)).toBeInTheDocument();
    // Idempotent retry path stays available.
    expect(screen.getByRole('button', { name: 'Delete personal data' })).toBeEnabled();
  });

  it('closes via Cancel and Escape', async () => {
    const user = userEvent.setup();
    const onClose = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

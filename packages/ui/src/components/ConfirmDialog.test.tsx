import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog.tsx';

describe('ConfirmDialog', () => {
  it('names the dialog via its title and shows the description', () => {
    render(
      <ConfirmDialog
        open
        title="Delete this tag?"
        description="It will be removed everywhere."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Delete this tag?' })).toBeInTheDocument();
    expect(screen.getByText('It will be removed everywhere.')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is activated', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="Publish?" confirmLabel="Publish" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the cancel button is activated', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Publish?" onConfirm={vi.fn()} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('disables both actions and marks the confirm busy while pending', () => {
    render(
      <ConfirmDialog
        open
        title="Publish?"
        confirmLabel="Publish"
        pending
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Publish…' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('surfaces an inline error message', () => {
    render(
      <ConfirmDialog
        open
        title="Publish?"
        error="Something went wrong."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });
});

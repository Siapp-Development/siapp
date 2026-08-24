import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './Dialog.tsx';

describe('Dialog', () => {
  it('renders its children in a dialog when open', () => {
    render(
      <Dialog open onClose={vi.fn()} aria-label="Settings">
        <p>Body content</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('is not shown to assistive tech when closed', () => {
    render(
      <Dialog open={false} onClose={vi.fn()} aria-label="Settings">
        <p>Body content</p>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} aria-label="Settings">
        <p>Body</p>
      </Dialog>,
    );

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop (dialog element itself) is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} aria-label="Settings">
        <button type="button">Inside</button>
      </Dialog>,
    );

    // A click whose target is the dialog element is a backdrop click.
    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT close when a click originates inside the dialog content', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} aria-label="Settings">
        <button type="button">Inside</button>
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));

    expect(onClose).not.toHaveBeenCalled();
  });
});

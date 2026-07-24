import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NeedHelpForm } from './NeedHelpForm.tsx';

describe('NeedHelpForm', () => {
  it('discloses a labeled reason field and submits the trimmed reason', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NeedHelpForm busy={false} alreadyBlocked={false} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /i need help/i }));
    const field = screen.getByLabelText(/what do you need help with/i);
    await userEvent.type(field, '  Missing dimensions  ');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith('Missing dimensions');
  });

  it('does not submit an empty reason', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NeedHelpForm busy={false} alreadyBlocked={false} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /i need help/i }));
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('collapses back and clears the field on cancel', async () => {
    render(<NeedHelpForm busy={false} alreadyBlocked={false} onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /i need help/i }));
    await userEvent.type(screen.getByLabelText(/what do you need help with/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByLabelText(/what do you need help with/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i need help/i })).toBeInTheDocument();
  });

  it('labels the disclosure as an update when already blocked', () => {
    render(<NeedHelpForm busy={false} alreadyBlocked onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /update help request/i })).toBeInTheDocument();
  });
});

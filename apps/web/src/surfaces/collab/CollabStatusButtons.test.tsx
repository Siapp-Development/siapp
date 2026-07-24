import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CollabStatusButtons } from './CollabStatusButtons.tsx';

describe('CollabStatusButtons', () => {
  it('offers "Start task" for todo and fires onStart', async () => {
    const onStart = vi.fn();
    render(
      <CollabStatusButtons status="todo" busy={false} onStart={onStart} onDone={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /start task/i }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('offers "Mark as done" while in progress or blocked', async () => {
    const onDone = vi.fn();
    const { rerender } = render(
      <CollabStatusButtons status="in_progress" busy={false} onStart={vi.fn()} onDone={onDone} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /mark as done/i }));
    expect(onDone).toHaveBeenCalledOnce();

    rerender(
      <CollabStatusButtons status="blocked" busy={false} onStart={vi.fn()} onDone={onDone} />,
    );
    expect(screen.getByRole('button', { name: /mark as done/i })).toBeInTheDocument();
  });

  it('confirms completion (no buttons) once done', () => {
    render(<CollabStatusButtons status="done" busy={false} onStart={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/task completed/i);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('disables the action while a submit is pending', () => {
    render(<CollabStatusButtons status="todo" busy onStart={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: /start task/i })).toBeDisabled();
  });
});

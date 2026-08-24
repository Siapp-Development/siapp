import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Popover } from './Popover.tsx';

function renderPopover(open: boolean, onClose = vi.fn()) {
  return render(
    <div>
      <button type="button">outside</button>
      <Popover
        open={open}
        onClose={onClose}
        trigger={<button type="button">Open menu</button>}
      >
        <button type="button">Panel item</button>
      </Popover>
    </div>,
  );
}

describe('Popover', () => {
  it('always renders the trigger', () => {
    renderPopover(false);

    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('renders panel content only while open', () => {
    const { rerender } = renderPopover(false);

    expect(screen.queryByRole('button', { name: 'Panel item' })).not.toBeInTheDocument();

    rerender(
      <div>
        <button type="button">outside</button>
        <Popover open onClose={vi.fn()} trigger={<button type="button">Open menu</button>}>
          <button type="button">Panel item</button>
        </Popover>
      </div>,
    );

    expect(screen.getByRole('button', { name: 'Panel item' })).toBeInTheDocument();
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    renderPopover(true, onClose);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when clicking outside the popover', async () => {
    const onClose = vi.fn();
    renderPopover(true, onClose);

    await userEvent.click(screen.getByRole('button', { name: 'outside' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT call onClose when interacting inside the panel', async () => {
    const onClose = vi.fn();
    renderPopover(true, onClose);

    await userEvent.click(screen.getByRole('button', { name: 'Panel item' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('restores focus to the previously-focused element on close', () => {
    const trigger = <button type="button">Open menu</button>;
    const { rerender } = render(
      <Popover open={false} onClose={vi.fn()} trigger={trigger}>
        <button type="button">Panel item</button>
      </Popover>,
    );

    const triggerButton = screen.getByRole('button', { name: 'Open menu' });
    triggerButton.focus();
    expect(triggerButton).toHaveFocus();

    rerender(
      <Popover open onClose={vi.fn()} trigger={trigger}>
        <button type="button">Panel item</button>
      </Popover>,
    );
    rerender(
      <Popover open={false} onClose={vi.fn()} trigger={trigger}>
        <button type="button">Panel item</button>
      </Popover>,
    );

    expect(triggerButton).toHaveFocus();
  });
});

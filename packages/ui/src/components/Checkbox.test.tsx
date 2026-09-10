import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from './Checkbox.tsx';

describe('Checkbox', () => {
  it('renders a checkbox with its label as the accessible name', () => {
    render(
      <label>
        <Checkbox />
        Notify me
      </label>,
    );

    expect(screen.getByRole('checkbox', { name: 'Notify me' })).toBeInTheDocument();
  });

  it('supports an aria-label when no visible label is present', () => {
    render(<Checkbox aria-label="Select task" />);

    expect(screen.getByRole('checkbox', { name: 'Select task' })).toBeInTheDocument();
  });

  it('reflects checked / unchecked state', () => {
    render(<Checkbox aria-label="Select task" checked readOnly />);

    expect(screen.getByRole('checkbox', { name: 'Select task' })).toBeChecked();
  });

  it('sets the DOM indeterminate flag and aria-checked="mixed"', () => {
    render(<Checkbox aria-label="Select all" indeterminate checked={false} readOnly />);

    const checkbox = screen.getByRole('checkbox', { name: 'Select all' });
    expect((checkbox as HTMLInputElement).indeterminate).toBe(true);
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
  });

  it('toggles with a click', async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          aria-label="Select task"
          checked={checked}
          onChange={(event) => {
            setChecked(event.target.checked);
            onChange(event.target.checked);
          }}
        />
      );
    }
    render(<Controlled />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select task' }));

    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'Select task' })).toBeChecked();
  });

  it('toggles with the Space key', async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          aria-label="Select task"
          checked={checked}
          onChange={(event) => {
            setChecked(event.target.checked);
            onChange(event.target.checked);
          }}
        />
      );
    }
    render(<Controlled />);

    screen.getByRole('checkbox', { name: 'Select task' }).focus();
    await userEvent.keyboard(' ');

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not fire onChange when disabled', async () => {
    const onChange = vi.fn();
    render(<Checkbox aria-label="Select task" disabled onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select task' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

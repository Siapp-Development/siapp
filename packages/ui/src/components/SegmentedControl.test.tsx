import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl, type ISegmentedOption } from './SegmentedControl.tsx';

type TGranularity = 'day' | 'week' | 'month';

const OPTIONS: ReadonlyArray<ISegmentedOption<TGranularity>> = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

function Controlled({
  initial = 'month',
  onChange,
}: {
  initial?: TGranularity;
  onChange?: (value: TGranularity) => void;
}) {
  const [value, setValue] = useState<TGranularity>(initial);
  return (
    <SegmentedControl
      aria-label="Timeline granularity"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      size="sm"
    />
  );
}

describe('SegmentedControl', () => {
  it('renders a radiogroup with a radio per option and correct aria-checked', () => {
    render(<Controlled initial="week" />);

    const group = screen.getByRole('radiogroup', { name: 'Timeline granularity' });
    expect(group).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Weeks' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Days' })).toHaveAttribute('aria-checked', 'false');
  });

  it('applies roving tabIndex (only the checked option is tabbable)', () => {
    render(<Controlled initial="month" />);

    expect(screen.getByRole('radio', { name: 'Months' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Days' })).toHaveAttribute('tabindex', '-1');
  });

  it('selects on click', async () => {
    const onChange = vi.fn();
    render(<Controlled initial="month" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Days' }));

    expect(onChange).toHaveBeenCalledWith('day');
    expect(screen.getByRole('radio', { name: 'Days' })).toHaveAttribute('aria-checked', 'true');
  });

  it('moves selection with ArrowRight / ArrowLeft (wrapping)', async () => {
    const onChange = vi.fn();
    render(<Controlled initial="day" onChange={onChange} />);

    screen.getByRole('radio', { name: 'Days' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('week');

    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('day');

    // Wraps left from the first option to the last.
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('month');
  });

  it('moves selection with ArrowDown / ArrowUp (vertical keys mirror horizontal)', async () => {
    const onChange = vi.fn();
    render(<Controlled initial="day" onChange={onChange} />);

    screen.getByRole('radio', { name: 'Days' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('week');

    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith('day');
  });

  it('moves DOM focus to the newly selected radio (roving focus)', async () => {
    render(<Controlled initial="day" />);

    screen.getByRole('radio', { name: 'Days' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Weeks' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Weeks' })).toHaveAttribute('tabindex', '0');
  });

  it('renders an option icon as decorative (aria-hidden)', () => {
    render(
      <SegmentedControl
        aria-label="With icon"
        value="day"
        onChange={vi.fn()}
        options={[{ value: 'day', label: 'Days', icon: <svg data-testid="day-icon" /> }]}
      />,
    );

    const icon = screen.getByTestId('day-icon');
    // The icon is wrapped in an aria-hidden span so only the label is announced.
    expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('radio', { name: 'Days' })).toBeInTheDocument();
  });
});

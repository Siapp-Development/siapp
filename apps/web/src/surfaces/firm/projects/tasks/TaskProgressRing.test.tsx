import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TaskProgressRing } from './TaskProgressRing.tsx';

describe('TaskProgressRing', () => {
  it('exposes the completion count as the button accessible name', () => {
    render(<TaskProgressRing completed={1} total={5} />);

    expect(
      screen.getByRole('button', { name: '1 out of 5 tasks completed' }),
    ).toBeInTheDocument();
  });

  it('reveals a tooltip with the count on click and hides it on Escape', async () => {
    render(<TaskProgressRing completed={3} total={4} />);

    const button = screen.getByRole('button', { name: '3 out of 4 tasks completed' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('3 out of 4 tasks completed');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('handles an empty group without dividing by zero', () => {
    render(<TaskProgressRing completed={0} total={0} />);

    expect(
      screen.getByRole('button', { name: '0 out of 0 tasks completed' }),
    ).toBeInTheDocument();
  });
});

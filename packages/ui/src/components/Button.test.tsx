import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.tsx';

describe('Button', () => {
  it('renders a square icon button when size="icon"', () => {
    render(
      <Button size="icon" variant="ghost" aria-label="Close">
        <svg aria-hidden="true" />
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveClass('h-8');
    expect(button).toHaveClass('w-8');
    expect(button).toHaveClass('p-0');
  });

  it('defaults to the medium size', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('h-10');
  });
});

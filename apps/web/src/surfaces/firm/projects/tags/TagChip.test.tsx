import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TagChip } from './TagChip.tsx';

describe('TagChip', () => {
  it('renders the tag name', () => {
    render(<TagChip name="Urgent" color="red" />);

    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('is a static chip with no dismiss button when onRemove is omitted', () => {
    render(<TagChip name="Urgent" color="red" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders an accessible dismiss button that calls onRemove when provided', async () => {
    const onRemove = vi.fn();
    render(<TagChip name="Urgent" color="red" onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Urgent' }));

    expect(onRemove).toHaveBeenCalledOnce();
  });
});

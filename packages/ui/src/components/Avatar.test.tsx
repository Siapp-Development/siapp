import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar, avatarInitials } from './Avatar.tsx';
import { avatarColorForSeed } from '../lib/avatarColor.ts';

describe('avatarInitials', () => {
  it('takes the first letter of one word', () => {
    expect(avatarInitials('Ada')).toBe('A');
  });

  it('takes two leading letters for two words', () => {
    expect(avatarInitials('Ada Lovelace')).toBe('AL');
  });

  it('uses only the first two words for 3+ words', () => {
    expect(avatarInitials('Grace Brewster Hopper')).toBe('GB');
  });

  it('falls back to ? for an empty name', () => {
    expect(avatarInitials('   ')).toBe('?');
  });
});

describe('Avatar', () => {
  it('renders the photo as an image with the name as alt text', () => {
    render(<Avatar name="Ada Lovelace" photoUrl="https://example.test/ada.png" />);

    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });

  it('renders initials with an accessible name when no photo is given', () => {
    render(<Avatar name="Ada Lovelace" />);

    const avatar = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(avatar).toHaveTextContent('AL');
  });

  it('falls back to initials with an accessible name when photoUrl is null', () => {
    render(<Avatar name="Ada Lovelace" photoUrl={null} />);

    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL');
  });

  it('falls back to initials when the photo fails to load (onError)', () => {
    const { container } = render(
      <Avatar name="Ada Lovelace" photoUrl="https://example.test/missing.png" />,
    );

    // Simulate the browser firing the <img> error event (broken/expired URL).
    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL');
  });

  it('is hidden from assistive tech when aria-hidden is set (initials mode)', () => {
    render(<Avatar name="Ada Lovelace" aria-hidden />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a decorative photo with empty alt (no accessible name) when aria-hidden', () => {
    const { container } = render(
      <Avatar name="Ada Lovelace" photoUrl="https://example.test/ada.png" aria-hidden />,
    );

    // The photo is still shown, but exposes no accessible name to avoid a
    // double announcement alongside surrounding text.
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).toHaveAttribute('src', 'https://example.test/ada.png');
    expect(img).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders every size variant while keeping the accessible name', () => {
    for (const size of ['xs', 'sm', 'md', 'lg'] as const) {
      const { unmount } = render(<Avatar name="Ada Lovelace" size={size} />);
      expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toBeInTheDocument();
      unmount();
    }
  });

  it('applies the deterministic colour class for its seed, stable across renders', () => {
    const seed = 'user-abc123';
    const expected = avatarColorForSeed(seed);

    const first = render(<Avatar name="Ada Lovelace" seed={seed} />);
    const firstClass = screen.getByRole('img', { name: 'Ada Lovelace' }).className;
    // The full static Tailwind pair (e.g. "bg-avatar-3 text-avatar-3-fg") is present.
    expect(firstClass).toContain(expected.className);
    first.unmount();

    // Re-rendering the same seed yields the same colour class (no randomness).
    render(<Avatar name="Someone Else" seed={seed} />);
    expect(screen.getByRole('img', { name: 'Someone Else' }).className).toContain(
      expected.className,
    );
  });
});

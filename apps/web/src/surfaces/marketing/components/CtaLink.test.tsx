import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CtaLink } from './CtaLink.tsx';

describe('CtaLink', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('links to the Typeform in a new tab with a safe rel', () => {
    render(<CtaLink location="hero" />);

    const link = screen.getByRole('link', { name: /request early access/i });
    expect(link).toHaveAttribute('href', 'https://form.typeform.com/to/GyoSjy9n');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('tells screen-reader users the link opens a new tab', () => {
    render(<CtaLink location="nav" />);

    expect(
      screen.getByRole('link', { name: /opens in a new tab/i }),
    ).toBeInTheDocument();
  });

  it('fires the early_access_cta_clicked event with its location', async () => {
    const events: { event: string; props?: Record<string, string> }[] = [];
    const listener = (e: Event) => {
      events.push((e as CustomEvent<{ event: string; props?: Record<string, string> }>).detail);
    };
    window.addEventListener('siapp:track', listener);
    // jsdom has no real navigation — neuter the click's default behavior.
    const user = userEvent.setup();
    render(<CtaLink location="final" />);

    const link = screen.getByRole('link', { name: /request early access/i });
    link.addEventListener('click', (e) => {
      e.preventDefault();
    });
    await user.click(link);

    expect(events).toEqual([
      { event: 'early_access_cta_clicked', props: { location: 'final' } },
    ]);
    window.removeEventListener('siapp:track', listener);
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from '../hooks/useReducedMotion.ts';

import { Hero } from './Hero.tsx';

// The hero video honours the user's motion preference, so we drive that
// behaviour by mocking the hook rather than poking at jsdom's matchMedia.
vi.mock('../hooks/useReducedMotion.ts', () => ({
  useReducedMotion: vi.fn(() => false),
}));

const mockedUseReducedMotion = vi.mocked(useReducedMotion);

describe('Hero', () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the hero video with the WhatsApp/portal accessible name', () => {
    render(<Hero />);

    // <video> has no implicit ARIA role, so we reach it by its aria-label.
    const video = screen.getByLabelText(/whatsapp/i, { selector: 'video' });
    expect(video).toBeInTheDocument();
    expect(video.tagName.toLowerCase()).toBe('video');
  });

  it('gives the video source a defined mp4 src', () => {
    const { container } = render(<Hero />);

    const source = container.querySelector('video > source');
    expect(source).not.toBeNull();
    expect(source).toHaveAttribute('type', 'video/mp4');
    expect(source?.getAttribute('src')).toBeTruthy();
  });

  it('does not render leftover interactive demo controls', () => {
    render(<Hero />);

    expect(
      screen.queryByRole('button', { name: /mark task complete/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark task done/i })).not.toBeInTheDocument();
  });

  it('autoplays the looping muted video when motion is allowed', () => {
    mockedUseReducedMotion.mockReturnValue(false);

    const { container } = render(<Hero />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.autoplay).toBe(true);
    expect(video?.hasAttribute('controls')).toBe(false);
    expect(video?.loop).toBe(true);
    expect(video?.muted).toBe(true);
  });

  it('shows native controls and does not autoplay when reduced motion is preferred', () => {
    mockedUseReducedMotion.mockReturnValue(true);

    const { container } = render(<Hero />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.autoplay).toBe(false);
  });
});

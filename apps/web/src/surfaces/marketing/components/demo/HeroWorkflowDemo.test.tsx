import { render, screen, act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeroWorkflowDemo } from './HeroWorkflowDemo.tsx';

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('HeroWorkflowDemo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('runs the timed sequence: task done → bubble → portal 68%', () => {
    mockMatchMedia(false);
    render(<HeroWorkflowDemo />);

    // Initial state: 64%, no announcement, one task already done.
    expect(screen.getByText('64%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark task complete' }));

    // Step 1 (300ms): roof installation ticks done.
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(screen.getByText('Client notified automatically')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();

    // Step 3 (1800ms): portal advances to 68% and announces politely.
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByText('68%')).toBeInTheDocument();
    expect(
      screen.getByText(/task marked done\. whatsapp update sent\. portal progress now 68/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay demo' })).toBeInTheDocument();
  });

  it('fires product demo start and complete events', () => {
    mockMatchMedia(false);
    const events: { event: string }[] = [];
    const listener = (e: Event) => {
      events.push((e as CustomEvent<{ event: string }>).detail);
    };
    window.addEventListener('siapp:track', listener);
    render(<HeroWorkflowDemo />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark task complete' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(events.map((e) => e.event)).toEqual([
      'product_demo_started',
      'product_demo_completed',
    ]);
    window.removeEventListener('siapp:track', listener);
  });

  it('jumps straight to the final state under reduced motion', () => {
    mockMatchMedia(true);
    render(<HeroWorkflowDemo />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark task complete' }));

    // No timers needed — end state is immediate.
    expect(screen.getByText('68%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay demo' })).toBeInTheDocument();
  });
});

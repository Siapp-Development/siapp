import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CircularProgress } from './CircularProgress.tsx';

// Circumference for the shared ring radius (r = 15.9154…), so offset reads as
// a direct percentage of the ~100-unit path.
const CIRCUMFERENCE = 2 * Math.PI * 15.915_494_309_189_533;

function indicatorOffset(container: HTMLElement): number {
  const circles = container.querySelectorAll('circle');
  const indicator = circles[circles.length - 1];
  return Number(indicator?.getAttribute('stroke-dashoffset'));
}

describe('CircularProgress', () => {
  it('exposes the label as an accessible image name', () => {
    render(<CircularProgress value={45} label="45% complete" />);

    expect(screen.getByRole('img', { name: '45% complete' })).toBeInTheDocument();
  });

  it('maps value to stroke-dashoffset (0 → full offset, 100 → no offset)', () => {
    const { container: empty } = render(<CircularProgress value={0} label="0% complete" />);
    expect(indicatorOffset(empty)).toBeCloseTo(CIRCUMFERENCE, 3);

    const { container: full } = render(<CircularProgress value={100} label="100% complete" />);
    expect(indicatorOffset(full)).toBeCloseTo(0, 3);

    const { container: half } = render(<CircularProgress value={50} label="50% complete" />);
    expect(indicatorOffset(half)).toBeCloseTo(CIRCUMFERENCE * 0.5, 3);
  });

  it('clamps values outside 0–100', () => {
    const { container: over } = render(<CircularProgress value={140} label="over" />);
    expect(indicatorOffset(over)).toBeCloseTo(0, 3);

    const { container: under } = render(<CircularProgress value={-20} label="under" />);
    expect(indicatorOffset(under)).toBeCloseTo(CIRCUMFERENCE, 3);
  });

  it('renders decorative center content hidden from assistive tech', () => {
    render(
      <CircularProgress value={60} label="60% complete">
        <span>60%</span>
      </CircularProgress>,
    );

    expect(screen.getByText('60%')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TimespanBar, timespanPercent } from './TimespanBar.tsx';

const d = (iso: string) => new Date(iso);

describe('timespanPercent', () => {
  it('reports the elapsed share of the schedule, rounded', () => {
    expect(timespanPercent(d('2026-01-01'), d('2026-01-11'), d('2026-01-06'))).toBe(50);
  });

  it('clamps before the start to 0 and after the end to 100', () => {
    expect(timespanPercent(d('2026-01-01'), d('2026-01-11'), d('2025-12-25'))).toBe(0);
    expect(timespanPercent(d('2026-01-01'), d('2026-01-11'), d('2026-02-01'))).toBe(100);
  });

  it('treats a zero or negative span as fully elapsed', () => {
    expect(timespanPercent(d('2026-01-01'), d('2026-01-01'), d('2026-01-01'))).toBe(100);
    expect(timespanPercent(d('2026-01-11'), d('2026-01-01'), d('2026-01-05'))).toBe(100);
  });
});

describe('TimespanBar', () => {
  it('renders nothing without both dates', () => {
    const { container } = render(<TimespanBar startDate={null} targetEndDate={d('2026-01-11')} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes the elapsed percentage via an accessible label', () => {
    render(
      <TimespanBar
        startDate={d('2026-01-01')}
        targetEndDate={d('2026-01-11')}
        today={d('2026-01-06')}
      />,
    );

    expect(
      screen.getByRole('img', {
        name: 'Project timespan: 50% of the scheduled time has passed',
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('timespan-fill')).toHaveStyle({ width: '50%' });
  });
});

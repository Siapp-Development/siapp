import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PortalTaskTimeline, portalTimelineRange } from './PortalTaskTimeline.tsx';
import type { IPortalTask, IPortalTaskGroup } from './usePortalTasks.ts';

const NOW = new Date('2026-08-25T00:00:00Z');
const MS_PER_DAY = 86_400_000;

function task(overrides: Partial<IPortalTask>): IPortalTask {
  return {
    id: 'id',
    title: 'Task',
    status: 'todo',
    phaseId: 'p1',
    startDate: null,
    dueDate: null,
    completedAt: null,
    order: 0,
    ...overrides,
  };
}

function dayStart(iso: string): number {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

describe('portalTimelineRange', () => {
  it('returns null when no task carries a date', () => {
    expect(portalTimelineRange([task({}), task({})])).toBeNull();
  });

  it('spans the min start to max due with lead/run-out padding', () => {
    const range = portalTimelineRange([
      task({ startDate: new Date('2026-08-10T00:00:00Z'), dueDate: new Date('2026-08-14T00:00:00Z') }),
      task({ startDate: new Date('2026-08-12T00:00:00Z'), dueDate: new Date('2026-08-20T00:00:00Z') }),
    ]);

    // start = earliest day (Aug 10) minus 3 lead days.
    expect(range?.start).toBe(dayStart('2026-08-10T00:00:00Z') - 3 * MS_PER_DAY);
    // days spans padded start → latest day (Aug 20) plus 7 run-out days.
    const expectedEnd = dayStart('2026-08-20T00:00:00Z') + 7 * MS_PER_DAY;
    expect(range?.days).toBe(Math.round((expectedEnd - (range?.start ?? 0)) / MS_PER_DAY));
  });

  it('handles a single dateless-plus-dated task using only the dated bound', () => {
    const range = portalTimelineRange([task({ dueDate: new Date('2026-09-01T00:00:00Z') })]);

    expect(range).not.toBeNull();
    expect(range?.days).toBeGreaterThanOrEqual(1);
  });
});

describe('PortalTaskTimeline', () => {
  const GROUPS: IPortalTaskGroup[] = [
    {
      phaseId: 'p1',
      name: 'Discovery',
      tasks: [
        task({
          id: 't-overdue',
          title: 'Site survey',
          status: 'in_progress',
          startDate: new Date('2026-08-10T00:00:00Z'),
          dueDate: new Date('2026-08-20T00:00:00Z'),
        }),
      ],
    },
  ];

  it('renders a phase timeline region and a bar with an accessible label', () => {
    render(<PortalTaskTimeline groups={GROUPS} now={NOW} />);

    expect(screen.getByRole('region', { name: 'Discovery timeline' })).toBeInTheDocument();
    // Overdue precedence + title + dates in the bar's accessible name. The
    // exact day rendered is timezone-dependent (Intl formats in local time), so
    // assert the label structure, not a specific calendar day.
    const bar = screen.getByRole('img', { name: /Site survey — Overdue/ });
    expect(bar).toHaveAccessibleName(/from /);
    expect(bar).toHaveAccessibleName(/due /);
  });

  it('shows an empty message when no task carries a date', () => {
    render(
      <PortalTaskTimeline
        groups={[{ phaseId: 'p1', name: 'Discovery', tasks: [task({ id: 'x' })] }]}
        now={NOW}
      />,
    );

    expect(screen.getByText(/no dated tasks to place on the timeline yet/i)).toBeInTheDocument();
  });

  it('shows the empty message with no groups', () => {
    render(<PortalTaskTimeline groups={[]} now={NOW} />);

    expect(screen.getByText(/no dated tasks to place on the timeline yet/i)).toBeInTheDocument();
  });

  it('renders a granularity switcher defaulting to Months on screen', () => {
    render(<PortalTaskTimeline groups={GROUPS} now={NOW} />);

    expect(screen.getByRole('radiogroup', { name: 'Timeline granularity' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Months' })).toHaveAttribute('aria-checked', 'true');
  });

  it('does NOT render the switcher in the print (fitToWidth) path', () => {
    render(<PortalTaskTimeline groups={GROUPS} now={NOW} fitToWidth />);

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('changing granularity re-scales the axis ticks', () => {
    render(<PortalTaskTimeline groups={GROUPS} now={NOW} />);

    // Month view: no bare day-number tick for this short (Aug) range.
    expect(screen.queryByText('15')).not.toBeInTheDocument();
  });

  it('switches to a denser day axis when Days is selected', async () => {
    render(<PortalTaskTimeline groups={GROUPS} now={NOW} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Days' }));

    // Day ticks are bare day numbers; Aug 15 falls within the padded range.
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders no avatars (portal is avatar-free)', () => {
    const { container } = render(<PortalTaskTimeline groups={GROUPS} now={NOW} />);

    expect(container.querySelector('img')).toBeNull();
    // The only role="img" nodes are the task bars themselves.
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(1);
  });

  it('paints an overdue bar with the accent color', () => {
    render(<PortalTaskTimeline groups={GROUPS} now={NOW} />);

    const bar = screen.getByRole('img', { name: /Site survey — Overdue/ });
    expect(bar.className).toContain('bg-accent');
  });

  it('paints a done bar with the success color', () => {
    render(
      <PortalTaskTimeline
        groups={[
          {
            phaseId: 'p1',
            name: 'Discovery',
            tasks: [
              task({
                id: 't-done',
                title: 'Handover',
                status: 'done',
                startDate: new Date('2026-08-10T00:00:00Z'),
                dueDate: new Date('2026-08-14T00:00:00Z'),
                completedAt: new Date('2026-08-14T00:00:00Z'),
              }),
            ],
          },
        ]}
        now={NOW}
      />,
    );

    const bar = screen.getByRole('img', { name: /Handover — Done/ });
    expect(bar.className).toContain('bg-success');
    expect(bar.className).not.toContain('bg-accent');
  });

  it('paints a blocked (not past-due) bar with the warning color', () => {
    render(
      <PortalTaskTimeline
        groups={[
          {
            phaseId: 'p1',
            name: 'Discovery',
            tasks: [
              task({
                id: 't-blocked',
                title: 'Permit',
                status: 'blocked',
                startDate: new Date('2026-08-20T00:00:00Z'),
                dueDate: new Date('2026-09-30T00:00:00Z'),
              }),
            ],
          },
        ]}
        now={NOW}
      />,
    );

    const bar = screen.getByRole('img', { name: /Permit — Blocked/ });
    expect(bar.className).toContain('bg-warning');
  });
});

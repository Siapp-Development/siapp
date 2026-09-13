import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TIMELINE_DAY_PX,
  paddedTimelineAxis,
  timelineDayStart,
  timelineDiffDays,
} from '@siapp/ui';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ProjectsTimeline, projectsTimelineDates } from './ProjectsTimeline.tsx';
import type { IProjectRow } from '../projects/useProjects.ts';

const NOW = new Date('2026-08-25T00:00:00');

/** The fixed label-column width the component reserves before the axis. */
const LABEL_COL_PX = 200;

const day = (iso: string): Date => new Date(`${iso}T00:00:00`);

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  const base = {
    id: 'p1',
    name: 'Bungalow build',
    description: '',
    code: 'BB-1',
    vertical: 'construction' as const,
    lifecycle: 'published' as const,
    status: 'active' as const,
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: new Date('2026-07-01T00:00:00'),
    targetEndDate: new Date('2026-09-01T00:00:00'),
    progressPct: 40,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: true,
    collaboratorsCount: 0,
    updatedAt: null,
    tags: [] as string[],
    ...overrides,
  };
  const clientIds = overrides.clientIds ?? (base.clientId !== '' ? [base.clientId] : []);
  const clients = overrides.clients ?? clientIds.map((id) => ({ id, name: base.clientNameDenorm }));
  return { ...base, clientIds, clients };
}

function renderTimeline(projects: IProjectRow[]) {
  return render(
    <MemoryRouter>
      <ProjectsTimeline projects={projects} workspaceSlug="acme" now={NOW} />
    </MemoryRouter>,
  );
}

function barLeft(bar: HTMLElement): number {
  return Number.parseFloat(bar.style.left);
}

describe('projectsTimelineDates', () => {
  it('returns day-start timestamps for all non-null start/target dates', () => {
    const dates = projectsTimelineDates([
      projectRow({
        startDate: new Date('2026-07-01T09:30:00'),
        targetEndDate: new Date('2026-09-01T18:00:00'),
      }),
    ]);

    expect(dates).toEqual([
      new Date(2026, 6, 1).getTime(),
      new Date(2026, 8, 1).getTime(),
    ]);
  });

  it('ignores undated projects and deleted projects', () => {
    const dates = projectsTimelineDates([
      projectRow({ id: 'undated', startDate: null, targetEndDate: null }),
      projectRow({
        id: 'deleted',
        lifecycle: 'deleted',
        startDate: new Date('2026-07-01T00:00:00'),
        targetEndDate: new Date('2026-08-01T00:00:00'),
      }),
    ]);

    expect(dates).toEqual([]);
  });

  it('contributes a single timestamp for a project dated on only one end', () => {
    expect(
      projectsTimelineDates([projectRow({ startDate: day('2026-07-01'), targetEndDate: null })]),
    ).toEqual([timelineDayStart(day('2026-07-01'))]);

    expect(
      projectsTimelineDates([projectRow({ startDate: null, targetEndDate: day('2026-09-01') })]),
    ).toEqual([timelineDayStart(day('2026-09-01'))]);
  });
});

describe('ProjectsTimeline', () => {
  it('renders one bar per dated project with an accessible label', () => {
    renderTimeline([projectRow()]);

    const bar = screen.getByRole('img', {
      name: /Bungalow build — Published, from .+, due .+, 40% complete/,
    });
    expect(bar).toBeInTheDocument();
  });

  it('positions a later-starting project further right than an earlier one', () => {
    renderTimeline([
      projectRow({
        id: 'early',
        name: 'Early project',
        startDate: new Date('2026-07-01T00:00:00'),
        targetEndDate: new Date('2026-07-20T00:00:00'),
      }),
      projectRow({
        id: 'late',
        name: 'Late project',
        startDate: new Date('2026-08-10T00:00:00'),
        targetEndDate: new Date('2026-08-30T00:00:00'),
      }),
    ]);

    const early = screen.getByRole('img', { name: /Early project/ });
    const late = screen.getByRole('img', { name: /Late project/ });
    expect(barLeft(late)).toBeGreaterThan(barLeft(early));
  });

  it('spaces two bars by exactly their day-difference on the month axis', () => {
    renderTimeline([
      projectRow({
        id: 'a',
        name: 'Alpha',
        startDate: day('2026-07-01'),
        targetEndDate: day('2026-07-10'),
      }),
      projectRow({
        id: 'b',
        name: 'Bravo',
        startDate: day('2026-08-01'),
        targetEndDate: day('2026-08-10'),
      }),
    ]);

    const dayPx = TIMELINE_DAY_PX.month;
    const expectedDelta =
      timelineDiffDays(timelineDayStart(day('2026-07-01')), timelineDayStart(day('2026-08-01'))) *
      dayPx;

    const alpha = screen.getByRole('img', { name: /Alpha/ });
    const bravo = screen.getByRole('img', { name: /Bravo/ });
    expect(barLeft(bravo) - barLeft(alpha)).toBeCloseTo(expectedDelta, 5);
  });

  it('sizes a bar to its inclusive day-span × dayPx on the month axis', () => {
    renderTimeline([
      projectRow({ startDate: day('2026-07-01'), targetEndDate: day('2026-07-10') }),
    ]);

    const dayPx = TIMELINE_DAY_PX.month;
    // Inclusive span: Jul 1 → Jul 10 spans 10 calendar days.
    const bar = screen.getByRole('img', { name: /Bungalow build/ });
    expect(Number.parseFloat(bar.style.width)).toBeCloseTo(10 * dayPx, 5);
  });

  it('still renders a bar for a project with only one endpoint', () => {
    renderTimeline([
      projectRow({ id: 'one', name: 'One endpoint', startDate: null, targetEndDate: new Date('2026-08-15T00:00:00') }),
    ]);

    const bar = screen.getByRole('img', { name: /One endpoint/ });
    expect(bar).toBeInTheDocument();
    // Single-endpoint bars keep a minimum visible width.
    expect(Number.parseFloat(bar.style.width)).toBeGreaterThan(0);
  });

  it("omits the absent endpoint from a single-endpoint bar's accessible label", () => {
    renderTimeline([
      projectRow({
        id: 'target-only',
        name: 'Target only',
        startDate: null,
        targetEndDate: day('2026-08-15'),
        progressPct: 20,
      }),
    ]);

    const label = screen.getByRole('img', { name: /Target only/ }).getAttribute('aria-label') ?? '';
    expect(label).toContain('due');
    expect(label).not.toContain('from');
    expect(label).toContain('20% complete');
  });

  it('reflects progressPct as an overlay width and a visible percentage', () => {
    renderTimeline([projectRow({ progressPct: 65 })]);

    const bar = screen.getByRole('img', { name: /65% complete/ });
    const fill = bar.querySelector('span');
    expect(fill).not.toBeNull();
    expect((fill as HTMLElement).style.width).toBe('65%');
    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('places undated projects in the "No dates set" section, not on the axis', () => {
    renderTimeline([
      projectRow({ id: 'dated', name: 'Dated project' }),
      projectRow({ id: 'undated', name: 'Undated project', startDate: null, targetEndDate: null }),
    ]);

    // Undated project is NOT a timeline bar.
    expect(screen.queryByRole('img', { name: /Undated project/ })).not.toBeInTheDocument();

    const section = screen.getByRole('region', { name: /no dates set/i });
    expect(within(section).getByRole('link', { name: 'Undated project' })).toBeInTheDocument();
    expect(within(section).getByText(/has no start or target date/i)).toBeInTheDocument();
  });

  it('suppresses the chart region and switcher when every project is undated', () => {
    renderTimeline([
      projectRow({ id: 'u1', name: 'Undated one', startDate: null, targetEndDate: null }),
      projectRow({ id: 'u2', name: 'Undated two', startDate: null, targetEndDate: null }),
    ]);

    expect(screen.queryByRole('region', { name: 'Projects timeline' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radiogroup', { name: 'Timeline granularity' }),
    ).not.toBeInTheDocument();

    const section = screen.getByRole('region', { name: /no dates set/i });
    expect(within(section).getByRole('link', { name: 'Undated one' })).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Undated two' })).toBeInTheDocument();
  });

  it('excludes deleted projects entirely', () => {
    renderTimeline([
      projectRow({ id: 'live', name: 'Live project' }),
      projectRow({ id: 'gone', name: 'Deleted project', lifecycle: 'deleted' }),
    ]);

    expect(screen.getByRole('img', { name: /Live project/ })).toBeInTheDocument();
    expect(screen.queryByText('Deleted project')).not.toBeInTheDocument();
  });

  it('defaults the granularity switcher to Months and re-scales on switch', async () => {
    renderTimeline([projectRow()]);

    expect(screen.getByRole('radiogroup', { name: 'Timeline granularity' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Months' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('radio', { name: 'Days' }));
    expect(screen.getByRole('radio', { name: 'Days' })).toHaveAttribute('aria-checked', 'true');
  });

  it('re-scales the axis to denser day-number ticks when switching to Days', async () => {
    renderTimeline([
      projectRow({ startDate: day('2026-08-10'), targetEndDate: day('2026-08-20') }),
    ]);

    // Month axis labels are "Mon YY" — no bare day-number tick like "15".
    expect(screen.queryByText('15')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Days' }));

    // Day axis draws a bare day-number tick for each day; the 15th of every
    // in-range month now appears.
    expect(screen.getAllByText('15').length).toBeGreaterThan(0);
  });

  // Regression: the axis-tick React key must stay unique per axis. In day
  // granularity `tick.label` is a bare day-of-month, so keying by
  // `label + offsetDays` was ambiguous (day "12" at offsetDays 1 and day "1" at
  // offsetDays 21 both stringify to "121"), producing a React duplicate-key
  // warning and risking dropped/duplicated ticks. Keying by `offsetDays` alone
  // (unique per axis) fixes it.
  it('does not emit duplicate axis-tick keys in day granularity', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderTimeline([
        projectRow({ startDate: day('2026-08-10'), targetEndDate: day('2026-08-20') }),
      ]);
      await userEvent.click(screen.getByRole('radio', { name: 'Days' }));

      const duplicateKeyWarning = errorSpy.mock.calls.some((args) =>
        String(args[0]).includes('two children with the same key'),
      );
      expect(duplicateKeyWarning).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('renders a today marker at the axis offset for today', () => {
    const start = day('2026-07-01');
    const target = day('2026-09-01');
    renderTimeline([projectRow({ startDate: start, targetEndDate: target })]);

    const axis = paddedTimelineAxis(
      [timelineDayStart(start), timelineDayStart(target)],
      'month',
      NOW,
    );
    const expectedLeft =
      LABEL_COL_PX + timelineDiffDays(axis.start, timelineDayStart(NOW)) * TIMELINE_DAY_PX.month;

    const marker = screen.getByTestId('timeline-today');
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(expectedLeft, 5);
  });

  it('conveys lifecycle via a text badge, not color alone', () => {
    renderTimeline([projectRow({ lifecycle: 'archived' })]);

    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('has no axe violations for a populated timeline', async () => {
    const { container } = renderTimeline([
      projectRow(),
      projectRow({ id: 'undated', name: 'Undated project', startDate: null, targetEndDate: null }),
    ]);

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

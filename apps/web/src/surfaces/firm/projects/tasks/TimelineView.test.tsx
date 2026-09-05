import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TASK_NOTIFY_DEFAULTS } from '@siapp/shared';

import { TimelineView, timelineRange } from './TimelineView.tsx';
import type { IPhaseRow, ITaskRow, TTaskListRow } from './useTasks.ts';

const DAY = 86_400_000;
// Padding around the whole range at 'month' granularity (mirrors TIMELINE_PAD_DAYS.month).
const MONTH_PAD_DAYS = 210;

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

describe('timelineRange', () => {
  const today = day('2026-07-25');

  it('pads generously around dated task bars and includes today (month default)', () => {
    const rows = [
      {
        restricted: false,
        startDate: day('2026-07-01'),
        dueDate: day('2026-08-01'),
      } as TTaskListRow,
    ];
    const range = timelineRange(rows, null, null, 'month', today);
    const end = range.start + range.days * DAY;

    // Start is snapped to the 1st of a month, on/before the earliest date minus padding.
    expect(new Date(range.start).getDate()).toBe(1);
    expect(range.start).toBeLessThanOrEqual(dayStart(day('2026-07-01')) - MONTH_PAD_DAYS * DAY);
    // End reaches beyond the latest date plus padding.
    expect(end).toBeGreaterThanOrEqual(dayStart(day('2026-08-01')) + MONTH_PAD_DAYS * DAY);
    // Today is inside the padded window.
    expect(dayStart(today)).toBeGreaterThanOrEqual(range.start);
    expect(dayStart(today)).toBeLessThanOrEqual(end);
  });

  it('falls back to a padded window around today when nothing is dated', () => {
    const range = timelineRange([], null, null, 'month', today);
    const end = range.start + range.days * DAY;

    expect(new Date(range.start).getDate()).toBe(1);
    expect(range.start).toBeLessThanOrEqual(dayStart(today) - MONTH_PAD_DAYS * DAY);
    expect(end).toBeGreaterThanOrEqual(dayStart(today) + MONTH_PAD_DAYS * DAY);
  });

  it('stretches to include project bounds', () => {
    const range = timelineRange([], day('2026-06-01'), day('2026-11-01'), 'month', today);
    const end = range.start + range.days * DAY;

    expect(range.start).toBeLessThanOrEqual(dayStart(day('2026-06-01')) - MONTH_PAD_DAYS * DAY);
    expect(end).toBeGreaterThanOrEqual(dayStart(day('2026-11-01')) + MONTH_PAD_DAYS * DAY);
  });

  it('produces a tighter window at day granularity than at month granularity', () => {
    const monthRange = timelineRange([], null, null, 'month', today);
    const dayRange = timelineRange([], null, null, 'day', today);

    expect(dayRange.days).toBeLessThan(monthRange.days);
  });
});

beforeAll(() => {
  // jsdom has no layout engine; the auto-center effect calls scrollTo.
  Element.prototype.scrollTo = vi.fn();
});

function taskRow(overrides: Partial<ITaskRow>): ITaskRow {
  return {
    restricted: false,
    id: 't1',
    title: 'Draft plans',
    description: '',
    phaseId: 'p1',
    status: 'in_progress',
    startDate: day('2026-07-10'),
    dueDate: day('2026-07-20'),
    completedAt: null,
    assignees: [],
    visibleToClient: true,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: { ...TASK_NOTIFY_DEFAULTS },
    tags: [],
    collaboratorCanSeeAllAttachments: true,
    order: 0,
    createdBy: 'u1',
    blockedReason: '',
    blockedBy: null,
    ...overrides,
  };
}

const PHASE: IPhaseRow = {
  id: 'p1',
  name: 'Design',
  order: 0,
  startDate: null,
  endDate: null,
  status: 'todo',
};

function renderTimeline(rows: ITaskRow[], memberPhotos = new Map<string, string>()) {
  return render(
    <TimelineView
      phases={[PHASE]}
      grouped={new Map([['p1', rows]])}
      noPhaseKey="__none__"
      memberPhotos={memberPhotos}
      projectStart={null}
      projectEnd={null}
      selectedId={null}
      onSelect={vi.fn()}
      canEdit
      reorderPendingByGroup={new Set()}
      activeDrag={null}
      dropTargetByGroup={{}}
      onDragStartTask={vi.fn()}
      onHandleKeyDownTask={vi.fn()}
      onDragOverTask={vi.fn()}
      onDropTask={vi.fn()}
      onDragEndTask={vi.fn()}
    />,
  );
}

describe('TimelineView (render)', () => {
  it('shows a granularity radiogroup defaulting to Months and no milestone lane', () => {
    renderTimeline([taskRow({})]);

    expect(screen.getByRole('radiogroup', { name: 'Timeline granularity' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Months' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Milestones')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-milestone')).not.toBeInTheDocument();
  });

  it('folds assignee names into the bar aria-label and caps the avatar stack with +N', () => {
    renderTimeline(
      [
        taskRow({
          assignees: [
            { type: 'user', id: 'u1', name: 'Ada Lovelace' },
            { type: 'collaborator', id: 'c1', name: 'Bo Client', phone: '+60' },
            { type: 'user', id: 'u2', name: 'Cara Dev' },
            { type: 'user', id: 'u3', name: 'Dan Eng' },
          ],
        }),
      ],
      new Map([['u1', 'https://example.test/ada.jpg']]),
    );

    // First three names folded in, fourth summarised as +1.
    const bar = screen.getByRole('button', {
      name: /assigned to Ada Lovelace, Bo Client, Cara Dev \+1/,
    });
    expect(bar).toBeInTheDocument();
    // Overflow chip is rendered.
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('resolves a photo for a user assignee and initials for a collaborator', () => {
    const { container } = renderTimeline(
      [
        taskRow({
          assignees: [
            { type: 'user', id: 'u1', name: 'Ada Lovelace' },
            { type: 'collaborator', id: 'c1', name: 'Bo Client', phone: '+60' },
          ],
        }),
      ],
      new Map([['u1', 'https://example.test/ada.jpg']]),
    );

    // The user assignee renders exactly one photo <img> from memberPhotos.
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', 'https://example.test/ada.jpg');
    // The collaborator has no photo → deterministic initials fallback ("BC").
    expect(screen.getByText('BC')).toBeInTheDocument();
  });

  it('keeps the avatar stack decorative (no img role leaks into the a11y tree)', () => {
    renderTimeline(
      [taskRow({ assignees: [{ type: 'user', id: 'u1', name: 'Ada Lovelace' }] })],
      new Map([['u1', 'https://example.test/ada.jpg']]),
    );

    // Avatars are aria-hidden (names are folded into the bar label instead), so
    // no avatar surfaces as an accessible image.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('paints an overdue bar with the accent color', () => {
    renderTimeline([
      taskRow({ status: 'in_progress', startDate: day('2020-01-01'), dueDate: day('2020-01-10') }),
    ]);

    const bar = screen.getByRole('button', { name: /Draft plans — In progress, overdue/ });
    expect(bar.className).toContain('bg-accent');
  });

  it('paints a done bar with the success color', () => {
    renderTimeline([
      taskRow({ status: 'done', startDate: day('2026-07-10'), dueDate: day('2026-07-20') }),
    ]);

    const bar = screen.getByRole('button', { name: /Draft plans — Done/ });
    expect(bar.className).toContain('bg-success');
    expect(bar.className).not.toContain('bg-accent');
  });

  it('paints an in-progress (not overdue) bar with the warning color to match its status ring', () => {
    renderTimeline([
      taskRow({ status: 'in_progress', startDate: day('2099-01-10'), dueDate: day('2099-01-20') }),
    ]);

    const bar = screen.getByRole('button', { name: /Draft plans — In progress/ });
    expect(bar.className).toContain('bg-warning');
    expect(bar.className).not.toContain('bg-accent');
  });

  it('paints a blocked bar with the danger color to match its status ring', () => {
    renderTimeline([
      taskRow({ status: 'blocked', startDate: day('2099-01-10'), dueDate: day('2099-01-20') }),
    ]);

    const bar = screen.getByRole('button', { name: /Draft plans — Blocked/ });
    expect(bar.className).toContain('bg-danger');
  });

  it('re-scales the axis when the granularity changes (Days is denser than Months)', async () => {
    renderTimeline([taskRow({})]);

    // Month view labels look like "Aug 26"; there are no bare day-number ticks.
    const monthTicks = screen.getAllByText(/^[A-Za-z]{3,} \d{2}$/);
    expect(monthTicks.length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('radio', { name: 'Days' }));

    // Day view: month labels are gone and denser bare day-number ticks appear.
    expect(screen.queryAllByText(/^[A-Za-z]{3,} \d{2}$/)).toHaveLength(0);
    const dayTicks = screen.getAllByText(/^\d{1,2}$/);
    expect(dayTicks.length).toBeGreaterThan(monthTicks.length);
  });

  it('auto-centers on today (scrollTo) on mount and again when granularity changes', async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;

    renderTimeline([taskRow({})]);
    expect(scrollTo).toHaveBeenCalled();

    const callsAfterMount = scrollTo.mock.calls.length;
    await userEvent.click(screen.getByRole('radio', { name: 'Days' }));

    expect(scrollTo.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});

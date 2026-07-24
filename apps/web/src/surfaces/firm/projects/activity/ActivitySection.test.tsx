/**
 * ActivitySection (#23 D9): read-only timeline rendering — labels, day
 * grouping, empty/error states, wouldHaveNotified badge, Load more.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IActivityRow, TActivityState } from './useProjectActivity.ts';

const hook = vi.hoisted(() => ({
  state: { status: 'loading' } as TActivityState,
  loadMore: vi.fn(),
}));
vi.mock('./useProjectActivity.ts', () => ({
  useProjectActivity: () => ({ ...hook.state, loadMore: hook.loadMore }),
}));

import { ActivitySection } from './ActivitySection.tsx';

function row(overrides: Partial<IActivityRow> = {}): IActivityRow {
  return {
    id: 'a1',
    action: 'task_created',
    actorType: 'user',
    actorName: 'Alia',
    taskTitle: 'Piling works',
    docName: '',
    from: null,
    to: null,
    wouldHaveNotified: false,
    restrictedToDepartments: [],
    at: new Date('2026-07-01T10:00:00'),
    ...overrides,
  };
}

function renderSection() {
  return render(
    <ActivitySection workspaceId="wksA" projectId="p1" role="owner" departments={[]} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hook.state = { status: 'loading' };
});

describe('ActivitySection', () => {
  it('shows a loading state', () => {
    renderSection();
    expect(screen.getByText('Loading activity…')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    hook.state = { status: 'error' };
    renderSection();
    expect(screen.getByText('The activity timeline could not be loaded.')).toBeInTheDocument();
  });

  it('shows an empty state when there are no entries', () => {
    hook.state = { status: 'ready', rows: [], hasMore: false, loadingMore: false };
    renderSection();
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument();
  });

  it('renders human labels grouped by day, newest first', () => {
    hook.state = {
      status: 'ready',
      rows: [
        row({
          id: 'a2',
          action: 'task_status_changed',
          taskTitle: 'Piling works',
          to: 'in_progress',
          at: new Date('2026-07-02T09:00:00'),
        }),
        row({ id: 'a1', at: new Date('2026-07-01T10:00:00') }),
      ],
      hasMore: false,
      loadingMore: false,
    };
    renderSection();

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(2);
    // Newest day first (locale-independent: match either "Jul 2" or "2 Jul").
    expect(headings[0].textContent).toMatch(/Jul 2,|2 Jul/);
    expect(headings[1].textContent).toMatch(/Jul 1,|1 Jul/);

    expect(screen.getByText('changed to In progress')).toBeInTheDocument();
    expect(screen.getByText('created task')).toBeInTheDocument();
    expect(screen.getAllByText('Piling works')).toHaveLength(2);
  });

  it('renders the would-have-notified badge for draft-suppressed entries', () => {
    hook.state = {
      status: 'ready',
      rows: [row({ action: 'task_status_changed', to: 'done', wouldHaveNotified: true })],
      hasMore: false,
      loadingMore: false,
    };
    renderSection();
    expect(screen.getByText('Would have notified — draft')).toBeInTheDocument();
  });

  it('strikes through deleted document names', () => {
    hook.state = {
      status: 'ready',
      rows: [row({ action: 'doc_deleted', taskTitle: '', docName: 'floorplan.pdf' })],
      hasMore: false,
      loadingMore: false,
    };
    renderSection();
    expect(screen.getByText('floorplan.pdf')).toHaveClass('line-through');
  });

  it('shows Load more only when more pages exist and forwards clicks', async () => {
    hook.state = { status: 'ready', rows: [row()], hasMore: false, loadingMore: false };
    const { unmount } = renderSection();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    unmount();

    hook.state = { status: 'ready', rows: [row()], hasMore: true, loadingMore: false };
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(hook.loadMore).toHaveBeenCalledTimes(1);
  });
});

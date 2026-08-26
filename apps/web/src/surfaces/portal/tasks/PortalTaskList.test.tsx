import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PortalTaskList } from './PortalTaskList.tsx';
import type { IPortalTaskGroup } from './usePortalTasks.ts';

const NOW = new Date('2026-08-25T00:00:00Z');

const GROUPS: IPortalTaskGroup[] = [
  {
    phaseId: 'p1',
    name: 'Discovery',
    tasks: [
      {
        id: 't-done',
        title: 'Kickoff',
        status: 'done',
        phaseId: 'p1',
        startDate: null,
        dueDate: new Date('2026-08-01T00:00:00Z'),
        completedAt: new Date('2026-08-01T00:00:00Z'),
        order: 0,
      },
      {
        id: 't-overdue',
        title: 'Site survey',
        status: 'in_progress',
        phaseId: 'p1',
        startDate: new Date('2026-08-10T00:00:00Z'),
        dueDate: new Date('2026-08-20T00:00:00Z'),
        completedAt: null,
        order: 1,
      },
    ],
  },
];

describe('PortalTaskList', () => {
  it('renders phase group headings and task titles', () => {
    render(<PortalTaskList groups={GROUPS} now={NOW} />);

    expect(screen.getByRole('heading', { name: 'Discovery' })).toBeInTheDocument();
    expect(screen.getByText('Kickoff')).toBeInTheDocument();
    expect(screen.getByText('Site survey')).toBeInTheDocument();
  });

  it('derives text status chips including Overdue precedence', () => {
    render(<PortalTaskList groups={GROUPS} now={NOW} />);

    expect(screen.getByText('Done')).toBeInTheDocument();
    // in_progress + past due → Overdue chip, not "In Progress".
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
  });

  it('shows an empty message with no groups', () => {
    render(<PortalTaskList groups={[]} now={NOW} />);

    expect(screen.getByText(/no tasks to show yet/i)).toBeInTheDocument();
  });
});

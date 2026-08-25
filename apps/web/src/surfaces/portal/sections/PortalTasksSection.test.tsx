import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PortalTasksSection } from './PortalTasksSection.tsx';
import type { IPortalTaskGroup } from '../tasks/usePortalTasks.ts';

const GROUPS: IPortalTaskGroup[] = [
  {
    phaseId: 'p1',
    name: 'Discovery',
    tasks: [
      {
        id: 't1',
        title: 'Kickoff',
        status: 'done',
        phaseId: 'p1',
        startDate: null,
        dueDate: new Date('2026-08-01T00:00:00Z'),
        completedAt: new Date('2026-08-01T00:00:00Z'),
        order: 0,
      },
    ],
  },
];

describe('PortalTasksSection', () => {
  it('previews the shared tasks with a shared count', () => {
    render(<PortalTasksSection groups={GROUPS} projectName="Cafe Fitout" />);

    const preview = screen.getByRole('region', { name: 'Project tasks' });
    expect(within(preview).getByRole('heading', { name: 'Project tasks' })).toBeInTheDocument();
    expect(within(preview).getByText('1 shared')).toBeInTheDocument();
    // The task + derived status chip render in the preview (the same content is
    // also mounted in the closed, hidden dialog — hence the first, visible row).
    expect(within(preview).getAllByText('Kickoff')[0]).toBeInTheDocument();
    expect(within(preview).getAllByText('Done')[0]).toBeInTheDocument();
  });

  it('opens the full tasks dialog from "Show all tasks"', async () => {
    render(<PortalTasksSection groups={GROUPS} projectName="Cafe Fitout" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show all tasks/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('group', { name: 'Task view' })).toBeInTheDocument();
  });

  it('renders an empty state when no tasks are shared', () => {
    render(<PortalTasksSection groups={[]} projectName="Cafe Fitout" />);

    expect(screen.getByText(/hasn.?t shared any tasks yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show all tasks/i })).not.toBeInTheDocument();
  });
});

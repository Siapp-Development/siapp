import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PortalAllTasksDialog } from './PortalAllTasksDialog.tsx';
import type { IPortalTaskGroup } from './usePortalTasks.ts';

const GROUPS: IPortalTaskGroup[] = [
  {
    phaseId: 'p1',
    name: 'Discovery',
    tasks: [
      {
        id: 't1',
        title: 'Kickoff',
        status: 'todo',
        phaseId: 'p1',
        startDate: new Date('2026-08-10T00:00:00Z'),
        dueDate: new Date('2026-08-20T00:00:00Z'),
        completedAt: null,
        order: 0,
      },
    ],
  },
];

describe('PortalAllTasksDialog', () => {
  it('defaults to the List view and toggles to Timeline via aria-pressed buttons', async () => {
    render(
      <PortalAllTasksDialog open onClose={() => {}} groups={GROUPS} projectName="Cafe Fitout" />,
    );

    const listToggle = screen.getByRole('button', { name: 'List' });
    const timelineToggle = screen.getByRole('button', { name: 'Timeline' });
    expect(listToggle).toHaveAttribute('aria-pressed', 'true');
    expect(timelineToggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(timelineToggle);

    expect(timelineToggle).toHaveAttribute('aria-pressed', 'true');
    expect(listToggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the phase group in both views', async () => {
    render(
      <PortalAllTasksDialog open onClose={() => {}} groups={GROUPS} projectName="Cafe Fitout" />,
    );

    expect(screen.getByRole('heading', { name: 'Discovery' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(screen.getByRole('region', { name: 'Discovery timeline' })).toBeInTheDocument();
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    render(
      <PortalAllTasksDialog open onClose={onClose} groups={GROUPS} projectName="Cafe Fitout" />,
    );

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});

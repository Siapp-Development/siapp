import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const milestones = vi.hoisted(() => ({
  state: {
    status: 'ready',
    rows: [
      {
        id: 'm1',
        name: 'Design sign-off',
        targetDate: new Date('2026-02-15T00:00:00'),
        completedAt: null,
        order: 1,
      },
      {
        id: 'm2',
        name: 'Handover',
        targetDate: new Date('2026-04-01T00:00:00'),
        completedAt: new Date('2026-04-02T00:00:00'),
        order: 2,
      },
    ],
  } as unknown,
  addMilestone: vi.fn(),
  setMilestoneDone: vi.fn(),
  removeMilestone: vi.fn(),
}));

vi.mock('./useMilestones.ts', () => ({
  useMilestones: () => milestones.state,
  addMilestone: milestones.addMilestone,
  setMilestoneDone: milestones.setMilestoneDone,
  removeMilestone: milestones.removeMilestone,
}));

import { MilestonesEditor } from './MilestonesEditor.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  milestones.addMilestone.mockResolvedValue(undefined);
  milestones.setMilestoneDone.mockResolvedValue(undefined);
  milestones.removeMilestone.mockResolvedValue(undefined);
});

describe('MilestonesEditor', () => {
  it('lists milestones with done state and hides editing controls without canEdit', () => {
    render(<MilestonesEditor workspaceId="wks-1" projectId="proj-1" canEdit={false} />);

    expect(screen.getByRole('list', { name: 'Milestones' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /design sign-off/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /handover/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /design sign-off/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /add milestone/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('adds a milestone from the form and clears the inputs', async () => {
    render(<MilestonesEditor workspaceId="wks-1" projectId="proj-1" canEdit />);

    await userEvent.type(screen.getByLabelText('Milestone name'), 'Tender awarded');
    await userEvent.type(screen.getByLabelText('Target date'), '2026-03-10');
    await userEvent.click(screen.getByRole('button', { name: /add milestone/i }));

    expect(milestones.addMilestone).toHaveBeenCalledWith('wks-1', 'proj-1', {
      name: 'Tender awarded',
      targetDate: new Date('2026-03-10T00:00:00'),
    });
    expect(screen.getByLabelText('Milestone name')).toHaveValue('');
  });

  it('toggles done and deletes through the hook helpers', async () => {
    render(<MilestonesEditor workspaceId="wks-1" projectId="proj-1" canEdit />);

    await userEvent.click(screen.getByRole('checkbox', { name: /design sign-off/i }));
    expect(milestones.setMilestoneDone).toHaveBeenCalledWith('wks-1', 'proj-1', 'm1', true);

    await userEvent.click(
      screen.getByRole('button', { name: /delete milestone design sign-off/i }),
    );
    expect(milestones.removeMilestone).toHaveBeenCalledWith('wks-1', 'proj-1', 'm1');
  });
});

/**
 * TaskBulkActionsBar (#156): count label (singular/plural), clear control, the
 * status menu, the assignee picker popover, and the delete ConfirmDialog. The
 * async callbacks are mocked; we assert they are invoked and that a rejection
 * surfaces an error and keeps the bar open.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { IMemberRow } from '../../settings/useTeamData.ts';
import { TaskBulkActionsBar, type ITaskBulkActionsBarProps } from './TaskBulkActionsBar.tsx';

function member(overrides: Partial<IMemberRow> = {}): IMemberRow {
  return {
    uid: 'u1',
    email: 'a@x.com',
    displayName: 'Alice Tan',
    role: 'pm',
    departments: [],
    seatActive: true,
    ...overrides,
  };
}

function renderBar(overrides: Partial<ITaskBulkActionsBarProps> = {}) {
  const props: ITaskBulkActionsBarProps = {
    count: 3,
    members: [member()],
    collaborators: [],
    onClear: vi.fn(),
    onUpdateStatus: vi.fn().mockResolvedValue(undefined),
    onAddAssignee: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<TaskBulkActionsBar {...props} />);
  return props;
}

describe('TaskBulkActionsBar', () => {
  it('is exposed as a labelled region', () => {
    renderBar();

    expect(screen.getByRole('region', { name: 'Bulk task actions' })).toBeInTheDocument();
  });

  it('shows a pluralised count for multiple tasks', () => {
    renderBar({ count: 3 });

    expect(screen.getByText('3 tasks selected')).toBeInTheDocument();
  });

  it('shows a singular count for one task', () => {
    renderBar({ count: 1 });

    expect(screen.getByText('1 task selected')).toBeInTheDocument();
  });

  it('fires onClear from the clear control', async () => {
    const props = renderBar();

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(props.onClear).toHaveBeenCalledOnce();
  });

  it('lists the four statuses and invokes onUpdateStatus', async () => {
    const props = renderBar();

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }));
    const menu = screen.getByRole('menu', { name: 'Set status' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(4);

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Done' }));

    expect(props.onUpdateStatus).toHaveBeenCalledWith('done');
  });

  it('invokes onAddAssignee from the picker', async () => {
    const props = renderBar();

    await userEvent.click(screen.getByRole('button', { name: 'Add assignee' }));
    await userEvent.click(screen.getByRole('option', { name: /Alice Tan/ }));

    expect(props.onAddAssignee).toHaveBeenCalledWith({
      type: 'user',
      id: 'u1',
      name: 'Alice Tan',
    });
  });

  it('opens the delete confirm dialog and invokes onDelete on confirm', async () => {
    const props = renderBar({ count: 2 });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete 2 tasks?')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it('surfaces an error and keeps the selection when a status update fails', async () => {
    renderBar({ onUpdateStatus: vi.fn().mockRejectedValue(new Error('Update failed')) });

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Done' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Update failed');
  });

  it('shows the delete failure inside the confirm dialog', async () => {
    renderBar({ count: 2, onDelete: vi.fn().mockRejectedValue(new Error('1 task could not be deleted')) });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(within(dialog).getByText('1 task could not be deleted')).toBeInTheDocument(),
    );
  });

  it('disables the action buttons while a bulk write is pending', async () => {
    // A status update that never resolves keeps the bar in its pending state.
    let resolveUpdate: (() => void) | undefined;
    const onUpdateStatus = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    renderBar({ onUpdateStatus });

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Done' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update status' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add assignee' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
    });

    // Resolve so no unhandled promise leaks past the test.
    resolveUpdate?.();
  });
});

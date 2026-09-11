/**
 * Floating bulk-actions bar for the firm Tasks list (#156). Appears when ≥1
 * task is selected and the caller can edit. Reads "N tasks selected", offers a
 * clear (×) control, and three actions that fan out to the bulk writers via
 * async callbacks: update status (menu), add assignee (picker popover), and
 * delete (ConfirmDialog). Non-modal `role="region"`; every control is keyboard
 * reachable with a visible focus ring. The callbacks reject on failure so the
 * bar can surface a partial/complete error and keep the selection.
 */

import { Alert, Button, ConfirmDialog, Popover, cn } from '@siapp/ui';
import type { TTaskAssignee, TTaskStatus } from '@siapp/shared';
import { Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';

import type { IMemberRow } from '../../settings/useTeamData.ts';
import type { ICollaboratorRow } from '../../collaborators/useCollaborators.ts';
import { TaskAssigneeBulkPicker } from './TaskAssigneeBulkPicker.tsx';
import { TASK_STATUS_LABELS } from './taskLabels.ts';

const STATUS_ORDER: readonly TTaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];

export interface ITaskBulkActionsBarProps {
  count: number;
  members: readonly IMemberRow[];
  collaborators: readonly ICollaboratorRow[];
  onClear: () => void;
  /** Reject to surface a (possibly partial) failure and keep the selection. */
  onUpdateStatus: (status: TTaskStatus) => Promise<void>;
  onAddAssignee: (assignee: TTaskAssignee) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function TaskBulkActionsBar({
  count,
  members,
  collaborators,
  onClear,
  onUpdateStatus,
  onAddAssignee,
  onDelete,
}: ITaskBulkActionsBarProps) {
  const [openMenu, setOpenMenu] = useState<'status' | 'assignee' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: () => Promise<void>, onSuccess: () => void): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await action();
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  function handleStatus(status: TTaskStatus): void {
    void runAction(
      () => onUpdateStatus(status),
      () => setOpenMenu(null),
    );
  }

  function handleAssignee(assignee: TTaskAssignee): void {
    void runAction(
      () => onAddAssignee(assignee),
      () => setOpenMenu(null),
    );
  }

  function handleDelete(): void {
    void runAction(onDelete, () => setConfirmOpen(false));
  }

  const noun = count === 1 ? 'task' : 'tasks';

  return (
    <div
      role="region"
      aria-label="Bulk task actions"
      className="fixed inset-x-3 bottom-6 z-40 flex flex-col items-center gap-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      {error !== null && !confirmOpen && (
        <Alert variant="destructive" role="alert" className="w-full sm:max-w-md">
          {error}
        </Alert>
      )}
      <div className="flex w-full max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-3xl border border-border bg-card px-3 py-2 shadow-raised sm:w-auto sm:flex-nowrap sm:rounded-full">
        <span className="px-1 text-xs font-medium">
          {count} {noun} selected
        </span>

        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

        <Popover
          open={openMenu === 'status'}
          onClose={() => setOpenMenu(null)}
          side="top"
          align="end"
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'status'}
              onClick={() => setOpenMenu((prev) => (prev === 'status' ? null : 'status'))}
              className="text-xs"
            >
              Update status
            </Button>
          }
        >
          <div role="menu" aria-label="Set status" className="flex flex-col">
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => handleStatus(status)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted',
                  'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {TASK_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </Popover>

        <Popover
          open={openMenu === 'assignee'}
          onClose={() => setOpenMenu(null)}
          side="top"
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              aria-expanded={openMenu === 'assignee'}
              onClick={() => setOpenMenu((prev) => (prev === 'assignee' ? null : 'assignee'))}
              className="text-xs"
            >
              <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
              Add assignee
            </Button>
          }
        >
          <TaskAssigneeBulkPicker
            members={members}
            collaborators={collaborators}
            onSelect={handleAssignee}
            disabled={pending}
          />
        </Popover>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
          className="text-xs text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Delete
        </Button>

        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear selection"
          disabled={pending}
          onClick={onClear}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${count} ${noun}?`}
        description="This permanently removes the selected tasks. This can't be undone."
        confirmLabel="Delete"
        variant="destructive"
        pending={pending}
        error={confirmOpen ? error : null}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!pending) {
            setConfirmOpen(false);
            setError(null);
          }
        }}
      />
    </div>
  );
}

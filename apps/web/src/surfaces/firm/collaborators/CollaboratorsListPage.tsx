/**
 * Collaborators list (A7, #16): live directory of subcontractors/suppliers
 * with phone actions, an Active/Idle chip derived from the server-stamped
 * lastTaskAt (60-day window, decision 6), and a read-only "Notifications
 * off" badge (D-035). Archival replaces deletion (decision 3); archived
 * rows hide behind a toggle. Managing is owner/admin/pm-only.
 */

import { Button, Card, CardContent, CardHeader } from '@siapp/ui';
import { COLLABORATOR_ACTIVE_WINDOW_DAYS, type TMemberRole } from '@siapp/shared';
import { useState } from 'react';

import { NotificationsOffBadge, PhoneActions } from '../clients/PhoneActions.tsx';
import { CollaboratorForm } from './CollaboratorForm.tsx';
import {
  createCollaborator,
  setCollaboratorStatus,
  updateCollaborator,
  useCollaborators,
  type ICollaboratorRow,
} from './useCollaborators.ts';

const ACTIVE_WINDOW_MS = COLLABORATOR_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function activityLabel(lastTaskAt: Date | null): 'Active' | 'Idle' {
  if (lastTaskAt === null) {
    return 'Idle';
  }
  return Date.now() - lastTaskAt.getTime() <= ACTIVE_WINDOW_MS ? 'Active' : 'Idle';
}

function ActivityChip({ lastTaskAt }: { lastTaskAt: Date | null }) {
  const label = activityLabel(lastTaskAt);
  return (
    <span
      className={
        label === 'Active'
          ? 'rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
          : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
      }
    >
      {label}
    </span>
  );
}

export interface ICollaboratorsListPageProps {
  workspaceId: string;
  role: TMemberRole;
  uid: string;
}

interface ICollaboratorRowItemProps {
  collaborator: ICollaboratorRow;
  canManage: boolean;
  onEdit: (collaborator: ICollaboratorRow) => void;
  onSetStatus: (collaborator: ICollaboratorRow, status: 'active' | 'archived') => void;
}

function CollaboratorRowItem({
  collaborator,
  canManage,
  onEdit,
  onSetStatus,
}: ICollaboratorRowItemProps) {
  const archived = collaborator.status === 'archived';
  return (
    <li className="rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{collaborator.name}</span>
          {collaborator.trade !== '' && (
            <span className="text-xs text-muted-foreground">{collaborator.trade}</span>
          )}
          {archived ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Archived
            </span>
          ) : (
            <ActivityChip lastTaskAt={collaborator.lastTaskAt} />
          )}
          {collaborator.notificationsOptOut && <NotificationsOffBadge />}
        </span>
        {canManage && (
          <span className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEdit(collaborator)}
            >
              Edit {collaborator.name}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSetStatus(collaborator, archived ? 'active' : 'archived')}
            >
              {archived ? `Unarchive ${collaborator.name}` : `Archive ${collaborator.name}`}
            </Button>
          </span>
        )}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{collaborator.phone}</span>
        <PhoneActions phone={collaborator.phone} name={collaborator.name} />
        {collaborator.company !== '' && <span>· {collaborator.company}</span>}
        {collaborator.email !== '' && <span>· {collaborator.email}</span>}
      </p>
    </li>
  );
}

export function CollaboratorsListPage({ workspaceId, role, uid }: ICollaboratorsListPageProps) {
  const collaborators = useCollaborators(workspaceId);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState(false);

  const canManage = role === 'owner' || role === 'admin' || role === 'pm';
  const rows = collaborators.status === 'ready' ? collaborators.rows : [];
  const visible = rows.filter((row) => showArchived || row.status === 'active');
  const archivedCount = rows.filter((row) => row.status === 'archived').length;
  const editing = rows.find((row) => row.id === editingId);

  async function handleSetStatus(
    collaborator: ICollaboratorRow,
    status: 'active' | 'archived',
  ): Promise<void> {
    setActionError(false);
    try {
      await setCollaboratorStatus(workspaceId, collaborator.id, status);
    } catch {
      setActionError(true);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Collaborators</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Subcontractors and suppliers you assign tasks to over WhatsApp.
          </p>
        </div>
        {canManage && !creating && editing === undefined && (
          <Button type="button" onClick={() => setCreating(true)}>
            New collaborator
          </Button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          Could not update the collaborator. Try again.
        </p>
      )}

      {creating && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">New collaborator</h2>
          </CardHeader>
          <CardContent>
            <CollaboratorForm
              submitLabel="Add collaborator"
              onCancel={() => setCreating(false)}
              onSubmit={async (values) => {
                await createCollaborator(workspaceId, values, uid);
                setCreating(false);
              }}
            />
          </CardContent>
        </Card>
      )}

      {editing !== undefined && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Edit collaborator</h2>
            {editing.notificationsOptOut && (
              <p className="text-sm text-muted-foreground">
                This collaborator has turned off WhatsApp notifications; only they can turn them
                back on. They can still be assigned tasks.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <CollaboratorForm
              key={editing.id}
              collaborator={editing}
              submitLabel="Save changes"
              onCancel={() => setEditingId(null)}
              onSubmit={async (values) => {
                await updateCollaborator(workspaceId, editing.id, values);
                setEditingId(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      {collaborators.status === 'loading' && <p className="text-sm">Loading collaborators…</p>}
      {collaborators.status === 'error' && (
        <p className="text-sm">Collaborators could not be loaded.</p>
      )}
      {collaborators.status === 'ready' && visible.length === 0 && (
        <p className="text-sm">No collaborators yet.</p>
      )}
      {collaborators.status === 'ready' && visible.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visible.map((row) => (
            <CollaboratorRowItem
              key={row.id}
              collaborator={row}
              canManage={canManage}
              onEdit={(collaborator) => {
                setCreating(false);
                setEditingId(collaborator.id);
              }}
              onSetStatus={(collaborator, status) => void handleSetStatus(collaborator, status)}
            />
          ))}
        </ul>
      )}
      {archivedCount > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
        </Button>
      )}
    </div>
  );
}

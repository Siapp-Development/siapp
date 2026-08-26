/**
 * Collaborators list (A7, #16, redesigned #104): a responsive card grid of
 * subcontractors/suppliers with phone actions, an Active/Idle status chip
 * derived from the server-stamped lastTaskAt (60-day window, decision 6), and
 * a read-only "Notifications off" badge (D-035). Archival replaces deletion
 * (decision 3); an All/Archived segmented control swaps the visible set.
 * Managing is owner/admin/pm-only. New/Edit open in a right-side Drawer.
 * #26: consent badges, and the owner/admin-only "Delete personal data"
 * (PDPA) action — erased rows are frozen (rules deny edits) and render
 * anonymized.
 */

import { Button } from '@siapp/ui';
import {
  COLLABORATOR_ACTIVE_WINDOW_DAYS,
  type TCollaboratorType,
  type TMemberRole,
} from '@siapp/shared';
import {
  Archive,
  ArchiveRestore,
  Briefcase,
  Building2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { ContactModal } from '../clients/ContactModal.tsx';
import { ContactSearchInput } from '../clients/ContactSearchInput.tsx';
import { NotificationsOffBadge, PhoneActions } from '../clients/PhoneActions.tsx';
import { DeletePersonalDataDialog } from '../pdpa/DeletePersonalDataDialog.tsx';
import { NoConsentBadge, PdpaErasedBadge } from '../pdpa/PdpaBadges.tsx';
import { CollabAccessLinkButton } from './CollabAccessLinkButton.tsx';
import { CollaboratorForm } from './CollaboratorForm.tsx';
import {
  createCollaborator,
  setCollaboratorStatus,
  updateCollaborator,
  useCollaborators,
  type ICollaboratorRow,
} from './useCollaborators.ts';

const ACTIVE_WINDOW_MS = COLLABORATOR_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const TYPE_LABELS: Record<TCollaboratorType, string> = {
  individual: 'Individual',
  company: 'Company',
};

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

const ICON_BUTTON_CLASS =
  'h-8 w-8 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card';

export interface ICollaboratorsListPageProps {
  workspaceId: string;
  workspaceName: string;
  role: TMemberRole;
  uid: string;
}

interface ICollaboratorCardProps {
  collaborator: ICollaboratorRow;
  workspaceId: string;
  canManage: boolean;
  canDeleteData: boolean;
  onEdit: (collaborator: ICollaboratorRow) => void;
  onSetStatus: (collaborator: ICollaboratorRow, status: 'active' | 'archived') => void;
  onDeleteData: (collaborator: ICollaboratorRow) => void;
}

function CollaboratorCard({
  collaborator,
  workspaceId,
  canManage,
  canDeleteData,
  onEdit,
  onSetStatus,
  onDeleteData,
}: ICollaboratorCardProps) {
  const archived = collaborator.status === 'archived';
  return (
    <article className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{collaborator.name}</span>
          {archived ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Archived
            </span>
          ) : (
            <ActivityChip lastTaskAt={collaborator.lastTaskAt} />
          )}
          {collaborator.notificationsOptOut && <NotificationsOffBadge />}
          {collaborator.pdpaErased && <PdpaErasedBadge />}
          {!collaborator.pdpaErased && collaborator.waConsentGranted !== true && <NoConsentBadge />}
        </div>
        {!collaborator.pdpaErased && (canManage || canDeleteData) && (
          <div className="flex shrink-0 items-center gap-1">
            {canManage && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${collaborator.name}`}
                  className={ICON_BUTTON_CLASS}
                  onClick={() => onEdit(collaborator)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={
                    archived ? `Unarchive ${collaborator.name}` : `Archive ${collaborator.name}`
                  }
                  className={ICON_BUTTON_CLASS}
                  onClick={() => onSetStatus(collaborator, archived ? 'active' : 'archived')}
                >
                  {archived ? (
                    <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Archive className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </>
            )}
            {canDeleteData && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete personal data (${collaborator.name})`}
                className={ICON_BUTTON_CLASS}
                onClick={() => onDeleteData(collaborator)}
              >
                <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>
      {!collaborator.pdpaErased && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-wrap items-center gap-2">
              <span>{collaborator.phone}</span>
              <PhoneActions phone={collaborator.phone} name={collaborator.name} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{TYPE_LABELS[collaborator.type]}</span>
          </div>
          {collaborator.trade !== '' && (
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{collaborator.trade}</span>
            </div>
          )}
          {collaborator.company !== '' && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{collaborator.company}</span>
            </div>
          )}
          {collaborator.email !== '' && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="break-all">{collaborator.email}</span>
            </div>
          )}
        </dl>
      )}
      {!collaborator.pdpaErased && canManage && !archived && (
        <div className="flex items-center justify-end border-t border-border pt-3">
          {/* #127: distribute the collaborator's one durable access link. */}
          <CollabAccessLinkButton
            variant="card"
            workspaceId={workspaceId}
            collaboratorId={collaborator.id}
            collaboratorName={collaborator.name}
          />
        </div>
      )}
    </article>
  );
}

export function CollaboratorsListPage({
  workspaceId,
  workspaceName,
  role,
  uid,
}: ICollaboratorsListPageProps) {
  const collaborators = useCollaborators(workspaceId);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState(false);
  const [deletingDataFor, setDeletingDataFor] = useState<ICollaboratorRow | null>(null);

  const canManage = role === 'owner' || role === 'admin' || role === 'pm';
  // #26 D4: PDPA deletion is stricter than manage — owner/admin only.
  const canDeleteData = role === 'owner' || role === 'admin';
  const rows = collaborators.status === 'ready' ? collaborators.rows : [];
  const archivedCount = rows.filter((row) => row.status === 'archived').length;
  const editing = rows.find((row) => row.id === editingId);

  const query = search.trim().toLowerCase();
  const byFilter = rows.filter((row) =>
    filter === 'archived' ? row.status === 'archived' : row.status === 'active',
  );
  const visible =
    query === ''
      ? byFilter
      : byFilter.filter(
          (row) =>
            row.name.toLowerCase().includes(query) || row.company.toLowerCase().includes(query),
        );

  const drawerOpen = creating || editing !== undefined;

  function closeDrawer(): void {
    setCreating(false);
    setEditingId(null);
  }

  function openCreate(): void {
    setEditingId(null);
    setCreating(true);
  }

  function openEdit(collaborator: ICollaboratorRow): void {
    setCreating(false);
    setEditingId(collaborator.id);
  }

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

  const drawerLabel =
    editing !== undefined ? `Edit collaborator: ${editing.name}` : 'New collaborator';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Collaborators</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Subcontractors and suppliers you assign tasks to over WhatsApp.
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            New collaborator
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <ContactSearchInput value={search} onChange={setSearch} />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Filter collaborators">
          <Button
            type="button"
            variant={filter === 'all' ? 'primary' : 'outline'}
            size="sm"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            type="button"
            variant={filter === 'archived' ? 'primary' : 'outline'}
            size="sm"
            aria-pressed={filter === 'archived'}
            onClick={() => setFilter('archived')}
          >
            Archived ({archivedCount})
          </Button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          Could not update the collaborator. Try again.
        </p>
      )}

      {collaborators.status === 'loading' && <p className="text-sm">Loading collaborators…</p>}
      {collaborators.status === 'error' && (
        <p className="text-sm">Collaborators could not be loaded.</p>
      )}
      {collaborators.status === 'ready' && rows.length === 0 && (
        <p className="text-sm">No collaborators yet.</p>
      )}
      {collaborators.status === 'ready' && rows.length > 0 && visible.length === 0 && (
        <p className="text-sm">No matches. Try a different search or filter.</p>
      )}
      {collaborators.status === 'ready' && visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => (
            <CollaboratorCard
              key={row.id}
              collaborator={row}
              workspaceId={workspaceId}
              canManage={canManage}
              canDeleteData={canDeleteData}
              onEdit={openEdit}
              onSetStatus={(collaborator, status) => void handleSetStatus(collaborator, status)}
              onDeleteData={(collaborator) => setDeletingDataFor(collaborator)}
            />
          ))}
        </div>
      )}

      <ContactModal open={drawerOpen} onClose={closeDrawer} title={drawerLabel} label={drawerLabel}>
        {editing !== undefined ? (
          <>
            {editing.notificationsOptOut && (
              <p className="mb-4 text-sm text-muted-foreground">
                This collaborator has turned off WhatsApp notifications; only they can turn them back
                on. They can still be assigned tasks.
              </p>
            )}
            <CollaboratorForm
              key={editing.id}
              collaborator={editing}
              firmName={workspaceName}
              submitLabel="Save changes"
              onCancel={closeDrawer}
              onSubmit={async (values) => {
                await updateCollaborator(
                  workspaceId,
                  editing.id,
                  values,
                  uid,
                  editing.waConsentGranted,
                );
                closeDrawer();
              }}
            />
          </>
        ) : (
          <CollaboratorForm
            submitLabel="Add collaborator"
            firmName={workspaceName}
            onCancel={closeDrawer}
            onSubmit={async (values) => {
              await createCollaborator(workspaceId, values, uid);
              closeDrawer();
            }}
          />
        )}
      </ContactModal>

      {deletingDataFor !== null && (
        <DeletePersonalDataDialog
          workspaceId={workspaceId}
          subjectType="collaborator"
          subjectId={deletingDataFor.id}
          subjectName={deletingDataFor.name}
          onClose={() => setDeletingDataFor(null)}
        />
      )}
    </div>
  );
}

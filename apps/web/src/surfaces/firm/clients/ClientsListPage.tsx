/**
 * Clients list (A6, #16, redesigned #104): a responsive card grid of
 * workspace clients with phone actions (Copy · Call · WhatsApp), a name/company
 * search box, and a read-only "Notifications off" badge when the server-only
 * opt-out flag is set (D-035). Creating and editing is owner/admin/pm-only and
 * happens in a right-side Drawer; clients have no archival/status field, so
 * there are no filter chips.
 * #26: consent badges, and the owner/admin-only "Delete personal data"
 * (PDPA) action — erased rows are frozen (rules deny edits) and render
 * anonymized.
 */

import { Button } from '@siapp/ui';
import type { TLocale, TMemberRole } from '@siapp/shared';
import { Globe, Mail, Pencil, Phone, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { DeletePersonalDataDialog } from '../pdpa/DeletePersonalDataDialog.tsx';
import { NoConsentBadge, PdpaErasedBadge } from '../pdpa/PdpaBadges.tsx';
import { ClientForm } from './ClientForm.tsx';
import { ContactDrawer } from './ContactDrawer.tsx';
import { ContactSearchInput } from './ContactSearchInput.tsx';
import { NotificationsOffBadge, PhoneActions } from './PhoneActions.tsx';
import { createClient, updateClient, useClients, type IClientRow } from './useClients.ts';

const LANGUAGE_LABELS: Record<TLocale, string> = {
  en: 'English',
  ms: 'Bahasa Melayu',
};

const ICON_BUTTON_CLASS =
  'h-8 w-8 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card';

export interface IClientsListPageProps {
  workspaceId: string;
  workspaceName: string;
  role: TMemberRole;
  uid: string;
}

interface IClientCardProps {
  client: IClientRow;
  canManage: boolean;
  canDeleteData: boolean;
  onEdit: (client: IClientRow) => void;
  onDeleteData: (client: IClientRow) => void;
}

function ClientCard({ client, canManage, canDeleteData, onEdit, onDeleteData }: IClientCardProps) {
  return (
    <article className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{client.name}</span>
          {client.companyName !== '' && (
            <span className="text-xs text-muted-foreground">{client.companyName}</span>
          )}
          {client.notificationsOptOut && <NotificationsOffBadge />}
          {client.pdpaErased && <PdpaErasedBadge />}
          {!client.pdpaErased && client.waConsentGranted !== true && <NoConsentBadge />}
        </div>
        {!client.pdpaErased && (canManage || canDeleteData) && (
          <div className="flex shrink-0 items-center gap-1">
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Edit ${client.name}`}
                className={ICON_BUTTON_CLASS}
                onClick={() => onEdit(client)}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {canDeleteData && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete personal data (${client.name})`}
                className={ICON_BUTTON_CLASS}
                onClick={() => onDeleteData(client)}
              >
                <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>
      {!client.pdpaErased && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-wrap items-center gap-2">
              <span>{client.phone}</span>
              <PhoneActions phone={client.phone} name={client.name} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{LANGUAGE_LABELS[client.language]}</span>
          </div>
          {client.email !== '' && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="break-all">{client.email}</span>
            </div>
          )}
        </dl>
      )}
      {client.notes !== '' && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <StickyNote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{client.notes}</span>
        </p>
      )}
    </article>
  );
}

export function ClientsListPage({ workspaceId, workspaceName, role, uid }: IClientsListPageProps) {
  const clients = useClients(workspaceId);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deletingDataFor, setDeletingDataFor] = useState<IClientRow | null>(null);

  const canManage = role === 'owner' || role === 'admin' || role === 'pm';
  // #26 D4: PDPA deletion is stricter than manage — owner/admin only.
  const canDeleteData = role === 'owner' || role === 'admin';
  const rows = clients.status === 'ready' ? clients.rows : [];
  const editing = rows.find((client) => client.id === editingId);

  const query = search.trim().toLowerCase();
  const visible =
    query === ''
      ? rows
      : rows.filter(
          (row) =>
            row.name.toLowerCase().includes(query) ||
            row.companyName.toLowerCase().includes(query),
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

  function openEdit(client: IClientRow): void {
    setCreating(false);
    setEditingId(client.id);
  }

  const drawerLabel = editing !== undefined ? `Edit client: ${editing.name}` : 'New client';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People you build for — linked to projects and kept in the loop on WhatsApp.
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            New client
          </Button>
        )}
      </div>

      <div className="w-full max-w-sm">
        <ContactSearchInput value={search} onChange={setSearch} />
      </div>

      {clients.status === 'loading' && <p className="text-sm">Loading clients…</p>}
      {clients.status === 'error' && <p className="text-sm">Clients could not be loaded.</p>}
      {clients.status === 'ready' && rows.length === 0 && <p className="text-sm">No clients yet.</p>}
      {clients.status === 'ready' && rows.length > 0 && visible.length === 0 && (
        <p className="text-sm">No matches. Try a different search.</p>
      )}
      {clients.status === 'ready' && visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              canManage={canManage}
              canDeleteData={canDeleteData}
              onEdit={openEdit}
              onDeleteData={(row) => setDeletingDataFor(row)}
            />
          ))}
        </div>
      )}

      <ContactDrawer open={drawerOpen} onClose={closeDrawer} title={drawerLabel} label={drawerLabel}>
        {editing !== undefined ? (
          <>
            {editing.notificationsOptOut && (
              <p className="mb-4 text-sm text-muted-foreground">
                This client has turned off WhatsApp notifications; only they can turn them back on.
              </p>
            )}
            <ClientForm
              key={editing.id}
              client={editing}
              firmName={workspaceName}
              submitLabel="Save changes"
              onCancel={closeDrawer}
              onSubmit={async (values) => {
                await updateClient(workspaceId, editing.id, values, uid, editing.waConsentGranted);
                closeDrawer();
              }}
            />
          </>
        ) : (
          <ClientForm
            submitLabel="Add client"
            firmName={workspaceName}
            onCancel={closeDrawer}
            onSubmit={async (values) => {
              await createClient(workspaceId, values, uid);
              closeDrawer();
            }}
          />
        )}
      </ContactDrawer>

      {deletingDataFor !== null && (
        <DeletePersonalDataDialog
          workspaceId={workspaceId}
          subjectType="client"
          subjectId={deletingDataFor.id}
          subjectName={deletingDataFor.name}
          onClose={() => setDeletingDataFor(null)}
        />
      )}
    </div>
  );
}

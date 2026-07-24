/**
 * Clients list (A6, #16): live directory of workspace clients with phone
 * actions (Copy · Call · WhatsApp) and a read-only "Notifications off"
 * badge when the server-only opt-out flag is set (D-035). Creating and
 * editing is owner/admin/pm-only; clients have no delete at MVP.
 */

import { Button, Card, CardContent, CardHeader } from '@siapp/ui';
import type { TLocale, TMemberRole } from '@siapp/shared';
import { useState } from 'react';

import { ClientForm } from './ClientForm.tsx';
import { NotificationsOffBadge, PhoneActions } from './PhoneActions.tsx';
import { createClient, updateClient, useClients, type IClientRow } from './useClients.ts';

const LANGUAGE_LABELS: Record<TLocale, string> = {
  en: 'English',
  ms: 'Bahasa Melayu',
};

export interface IClientsListPageProps {
  workspaceId: string;
  role: TMemberRole;
  uid: string;
}

interface IClientRowItemProps {
  client: IClientRow;
  canManage: boolean;
  onEdit: (client: IClientRow) => void;
}

function ClientRowItem({ client, canManage, onEdit }: IClientRowItemProps) {
  return (
    <li className="rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{client.name}</span>
          {client.companyName !== '' && (
            <span className="text-xs text-muted-foreground">{client.companyName}</span>
          )}
          {client.notificationsOptOut && <NotificationsOffBadge />}
        </span>
        {canManage && (
          <Button type="button" variant="outline" size="sm" onClick={() => onEdit(client)}>
            Edit {client.name}
          </Button>
        )}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{client.phone}</span>
        <PhoneActions phone={client.phone} name={client.name} />
        {client.email !== '' && <span>· {client.email}</span>}
        <span>· {LANGUAGE_LABELS[client.language]}</span>
      </p>
      {client.notes !== '' && (
        <p className="mt-1 text-sm text-muted-foreground">{client.notes}</p>
      )}
    </li>
  );
}

export function ClientsListPage({ workspaceId, role, uid }: IClientsListPageProps) {
  const clients = useClients(workspaceId);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const canManage = role === 'owner' || role === 'admin' || role === 'pm';
  const rows = clients.status === 'ready' ? clients.rows : [];
  const editing = rows.find((client) => client.id === editingId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People you build for — linked to projects and kept in the loop on WhatsApp.
          </p>
        </div>
        {canManage && !creating && editing === undefined && (
          <Button type="button" onClick={() => setCreating(true)}>
            New client
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">New client</h2>
          </CardHeader>
          <CardContent>
            <ClientForm
              submitLabel="Add client"
              onCancel={() => setCreating(false)}
              onSubmit={async (values) => {
                await createClient(workspaceId, values, uid);
                setCreating(false);
              }}
            />
          </CardContent>
        </Card>
      )}

      {editing !== undefined && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Edit client</h2>
            {editing.notificationsOptOut && (
              <p className="text-sm text-muted-foreground">
                This client has turned off WhatsApp notifications; only they can turn them back
                on.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ClientForm
              key={editing.id}
              client={editing}
              submitLabel="Save changes"
              onCancel={() => setEditingId(null)}
              onSubmit={async (values) => {
                await updateClient(workspaceId, editing.id, values);
                setEditingId(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      {clients.status === 'loading' && <p className="text-sm">Loading clients…</p>}
      {clients.status === 'error' && <p className="text-sm">Clients could not be loaded.</p>}
      {clients.status === 'ready' && rows.length === 0 && <p className="text-sm">No clients yet.</p>}
      {clients.status === 'ready' && rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((client) => (
            <ClientRowItem
              key={client.id}
              client={client}
              canManage={canManage}
              onEdit={(row) => {
                setCreating(false);
                setEditingId(row.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

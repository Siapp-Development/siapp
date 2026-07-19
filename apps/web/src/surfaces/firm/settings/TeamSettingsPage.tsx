/**
 * Team settings (#11): members, invites, and departments for one workspace.
 *
 * - Invites are callable-only (create/resend/revoke); create/resend surface a
 *   copyable invite link so an admin can share it out-of-band (decision 2026-07-18).
 * - Departments UI follows D-004: member department chips and assignment
 *   controls stay hidden until the first department exists.
 * - pm/viewer see members + departments read-only; invite/manage panels are
 *   owner/admin only (matching rules + callable gates).
 */

import { Alert, Button, Card, CardContent, CardHeader, Input, Label } from '@siapp/ui';
import type { TInviteRole, TMemberRole } from '@siapp/shared';
import { useState, type FormEvent } from 'react';

import {
  createInvite,
  resendInvite,
  revokeInvite,
  setMemberDepartments,
} from '@/lib/callables.ts';
import {
  createDepartment,
  deleteDepartment,
  renameDepartment,
  useDepartments,
  useMembers,
  usePendingInvites,
  type IDepartmentRow,
  type IMemberRow,
} from './useTeamData.ts';

const INVITE_ROLES: readonly TInviteRole[] = ['admin', 'pm', 'viewer'];

const ROLE_LABELS: Record<TMemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  pm: 'Project manager',
  viewer: 'Viewer',
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface IInviteLinkProps {
  url: string;
  emailSent: boolean;
}

function InviteLink({ url, emailSent }: IInviteLinkProps) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert className="mt-3">
      <p className="text-sm">
        {emailSent
          ? 'Invite emailed. You can also share this link directly:'
          : 'Email could not be sent — share this link directly:'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Input readOnly value={url} aria-label="Invite link" className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void copyToClipboard(url).then(setCopied);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </Alert>
  );
}

interface IPanelProps {
  workspaceId: string;
}

function InvitePanel({ workspaceId }: IPanelProps) {
  const invites = usePendingInvites(workspaceId, true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TInviteRole>('pm');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<{ url: string; emailSent: boolean } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (email.trim() === '') {
      setError('Enter an email address.');
      return;
    }
    setPending(true);
    setError(null);
    setLastLink(null);
    try {
      const result = await createInvite({ workspaceId, email: email.trim(), role });
      setLastLink({ url: result.inviteUrl, emailSent: result.emailSent });
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite.');
    } finally {
      setPending(false);
    }
  }

  async function handleResend(inviteId: string): Promise<void> {
    setRowError(null);
    setLastLink(null);
    try {
      const result = await resendInvite({ workspaceId, inviteId });
      setLastLink({ url: result.inviteUrl, emailSent: result.emailSent });
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not resend the invite.');
    }
  }

  async function handleRevoke(inviteId: string): Promise<void> {
    setRowError(null);
    try {
      await revokeInvite({ workspaceId, inviteId });
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not revoke the invite.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Invite teammates</h2>
        <p className="text-sm">Invites expire after 7 days.</p>
      </CardHeader>
      <CardContent>
        {error !== null && (
          <Alert variant="destructive" className="mb-3">
            {error}
          </Alert>
        )}
        <form onSubmit={(event) => void handleInvite(event)} noValidate className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={role}
              onChange={(event) => setRole(event.target.value as TInviteRole)}
            >
              {INVITE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? 'Sending…' : 'Send invite'}
          </Button>
        </form>
        {lastLink !== null && <InviteLink url={lastLink.url} emailSent={lastLink.emailSent} />}

        <h3 className="mt-6 text-sm font-semibold">Pending invites</h3>
        {rowError !== null && (
          <Alert variant="destructive" className="mt-2">
            {rowError}
          </Alert>
        )}
        {invites.status === 'loading' && <p className="mt-2 text-sm">Loading invites…</p>}
        {invites.status === 'error' && (
          <p className="mt-2 text-sm">Pending invites could not be loaded.</p>
        )}
        {invites.status === 'ready' && invites.rows.length === 0 && (
          <p className="mt-2 text-sm">No pending invites.</p>
        )}
        {invites.status === 'ready' && invites.rows.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">
            {invites.rows.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm">
                  {invite.email} — {ROLE_LABELS[invite.role]}
                  {invite.expiresAt !== null && (
                    <span className="text-muted-foreground">
                      {' '}
                      (expires {invite.expiresAt.toLocaleDateString()})
                    </span>
                  )}
                </span>
                <span className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleResend(invite.id)}
                  >
                    Resend
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRevoke(invite.id)}
                  >
                    Revoke
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface IMemberDepartmentsEditorProps {
  workspaceId: string;
  member: IMemberRow;
  departments: IDepartmentRow[];
  onDone: () => void;
}

function MemberDepartmentsEditor({
  workspaceId,
  member,
  departments,
  onDone,
}: IMemberDepartmentsEditorProps) {
  const [selected, setSelected] = useState<string[]>(member.departments);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(depId: string): void {
    setSelected((current) =>
      current.includes(depId) ? current.filter((id) => id !== depId) : [...current, depId],
    );
  }

  async function save(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await setMemberDepartments({ workspaceId, memberUid: member.uid, departments: selected });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update departments.');
      setPending(false);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-border p-3">
      {error !== null && (
        <Alert variant="destructive" className="mb-2">
          {error}
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        {departments.map((department) => (
          <label key={department.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(department.id)}
              onChange={() => toggle(department.id)}
            />
            {department.name}
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => void save()}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface IMembersPanelProps {
  workspaceId: string;
  canManage: boolean;
}

function MembersPanel({ workspaceId, canManage }: IMembersPanelProps) {
  const members = useMembers(workspaceId);
  const departments = useDepartments(workspaceId);
  const [editingUid, setEditingUid] = useState<string | null>(null);

  const departmentRows = departments.status === 'ready' ? departments.rows : [];
  // D-004: departments stay invisible until the first one exists.
  const departmentsVisible = departmentRows.length > 0;
  const departmentName = (id: string): string =>
    departmentRows.find((department) => department.id === id)?.name ?? id;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Members</h2>
      </CardHeader>
      <CardContent>
        {members.status === 'loading' && <p className="text-sm">Loading members…</p>}
        {members.status === 'error' && <p className="text-sm">Members could not be loaded.</p>}
        {members.status === 'ready' && (
          <ul className="flex flex-col gap-2">
            {members.rows.map((member) => (
              <li key={member.uid} className="rounded-md border border-border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <span className="font-medium">{member.displayName}</span>{' '}
                    <span className="text-muted-foreground">{member.email}</span> —{' '}
                    {ROLE_LABELS[member.role]}
                  </span>
                  {canManage && departmentsVisible && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditingUid(editingUid === member.uid ? null : member.uid)
                      }
                    >
                      Edit departments
                    </Button>
                  )}
                </div>
                {departmentsVisible && member.departments.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {member.departments.map((depId) => (
                      <span
                        key={depId}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs"
                      >
                        {departmentName(depId)}
                      </span>
                    ))}
                  </p>
                )}
                {editingUid === member.uid && (
                  <MemberDepartmentsEditor
                    workspaceId={workspaceId}
                    member={member}
                    departments={departmentRows}
                    onDone={() => setEditingUid(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface IDepartmentsPanelProps {
  workspaceId: string;
  canManage: boolean;
  uid: string;
}

function DepartmentsPanel({ workspaceId, canManage, uid }: IDepartmentsPanelProps) {
  const departments = useDepartments(workspaceId);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 60) {
      setError('Department names must be 1–60 characters.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createDepartment(workspaceId, trimmed, uid);
      setName('');
    } catch {
      setError('Could not create the department.');
    } finally {
      setPending(false);
    }
  }

  async function handleRename(departmentId: string): Promise<void> {
    const trimmed = renameValue.trim();
    if (trimmed === '' || trimmed.length > 60) {
      setError('Department names must be 1–60 characters.');
      return;
    }
    setError(null);
    try {
      await renameDepartment(workspaceId, departmentId, trimmed);
      setRenamingId(null);
    } catch {
      setError('Could not rename the department.');
    }
  }

  async function handleDelete(departmentId: string): Promise<void> {
    setError(null);
    try {
      await deleteDepartment(workspaceId, departmentId);
    } catch {
      setError('Could not delete the department. Remove its members first.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Departments</h2>
        <p className="text-sm">
          Restrict tasks, notes and documents to a department — members outside it won't see
          them. Owners and admins always see everything.
        </p>
      </CardHeader>
      <CardContent>
        {error !== null && (
          <Alert variant="destructive" className="mb-3">
            {error}
          </Alert>
        )}
        {departments.status === 'loading' && <p className="text-sm">Loading departments…</p>}
        {departments.status === 'error' && (
          <p className="text-sm">Departments could not be loaded.</p>
        )}
        {departments.status === 'ready' && departments.rows.length === 0 && (
          <p className="text-sm">
            No departments yet. Everyone sees all workspace content until you create one.
          </p>
        )}
        {departments.status === 'ready' && departments.rows.length > 0 && (
          <ul className="flex flex-col gap-2">
            {departments.rows.map((department) => (
              <li
                key={department.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                {renamingId === department.id ? (
                  <span className="flex flex-1 items-center gap-2">
                    <Input
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      aria-label={`New name for ${department.name}`}
                      className="max-w-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleRename(department.id)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <span className="text-sm">
                    <span className="font-medium">{department.name}</span>{' '}
                    <span className="text-muted-foreground">
                      {department.memberCount}{' '}
                      {department.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </span>
                )}
                {canManage && renamingId !== department.id && (
                  <span className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRenamingId(department.id);
                        setRenameValue(department.name);
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={department.memberCount > 0}
                      onClick={() => void handleDelete(department.id)}
                    >
                      Delete
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <form
            onSubmit={(event) => void handleCreate(event)}
            noValidate
            className="mt-4 flex items-end gap-3"
          >
            <div className="flex min-w-48 flex-col gap-1.5">
              <Label htmlFor="department-name">New department</Label>
              <Input
                id="department-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? 'Creating…' : 'Create department'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export interface ITeamSettingsPageProps {
  workspaceId: string;
  workspaceName: string;
  role: TMemberRole;
  uid: string;
}

export function TeamSettingsPage({ workspaceId, workspaceName, role, uid }: ITeamSettingsPageProps) {
  const canManage = role === 'owner' || role === 'admin';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Team settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
      </div>
      {canManage && <InvitePanel workspaceId={workspaceId} />}
      <MembersPanel workspaceId={workspaceId} canManage={canManage} />
      <DepartmentsPanel workspaceId={workspaceId} canManage={canManage} uid={uid} />
    </div>
  );
}

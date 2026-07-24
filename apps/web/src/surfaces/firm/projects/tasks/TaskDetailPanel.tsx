/**
 * Inline task detail panel (#13, wireframe A5): Details form with explicit
 * Save (status/due-date/assignee diffs append matching activity entries) and
 * an Activity tab with the append-only update feed plus a comment box with
 * @mention typeahead. Comments render as markdown (react-markdown, no raw
 * HTML) with mentions bolded.
 */

import { Alert, Button, Card, CardContent, CardHeader, Input, Label, cn } from '@siapp/ui';
import type { TMemberRole, TTaskAssignee, TTaskStatus } from '@siapp/shared';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';

import type { IDepartmentRow, IMemberRow } from '../../settings/useTeamData.ts';
import type { ICollaboratorRow } from '../../collaborators/useCollaborators.ts';
import { TaskAttachments } from '../documents/DocumentsSection.tsx';
import { parseMentions, tokenizeMentions, type IMentionMember } from './mentions.ts';
import { TASK_STATUS_LABELS } from './taskLabels.ts';
import {
  addTaskUpdate,
  deleteTask,
  updateTask,
  useTaskUpdates,
  type IPhaseRow,
  type ITaskRow,
  type ITaskUpdateRow,
} from './useTasks.ts';

const TASK_STATUSES = Object.keys(TASK_STATUS_LABELS) as TTaskStatus[];

function toDateInput(date: Date | null): string {
  if (date === null) {
    return '';
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateInput(value: string): Date | null {
  if (value === '') {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function relativeTime(date: Date | null): string {
  if (date === null) {
    return 'just now';
  }
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return date.toLocaleDateString();
}

/** Bold matched @mentions so they stand out in the rendered markdown. */
function highlightMentions(text: string, members: readonly IMentionMember[]): string {
  return tokenizeMentions(text, members)
    .map((token) => (token.type === 'mention' ? `**${token.value}**` : token.value))
    .join('');
}

function actionLine(row: ITaskUpdateRow): string {
  switch (row.action) {
    case 'status_change':
      return `changed status ${row.from !== '' ? `from ${row.from} ` : ''}to ${row.to}`;
    case 'eta_change':
      return `changed due date ${row.from !== '' ? `from ${row.from} ` : ''}to ${row.to}`;
    case 'assigned':
      return `assigned ${row.to}`;
    default:
      return row.action.replaceAll('_', ' ');
  }
}

interface IActivityFeedProps {
  workspaceId: string;
  projectId: string;
  taskId: string;
  members: readonly IMemberRow[];
  uid: string;
  userName: string;
}

function ActivityFeed({
  workspaceId,
  projectId,
  taskId,
  members,
  uid,
  userName,
}: IActivityFeedProps) {
  const updatesState = useTaskUpdates(workspaceId, projectId, taskId);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const mentionMembers = useMemo<IMentionMember[]>(
    () => members.map((member) => ({ uid: member.uid, displayName: member.displayName })),
    [members],
  );

  // @-typeahead: the partial name being typed after the last unmatched '@'.
  const mentionQuery = useMemo(() => {
    const match = /@([\p{L}\p{N}_ ]{0,30})$/u.exec(comment);
    return match !== null ? match[1].toLowerCase() : null;
  }, [comment]);
  const suggestions =
    mentionQuery !== null
      ? mentionMembers
          .filter(
            (member) =>
              member.displayName.toLowerCase().startsWith(mentionQuery) &&
              member.displayName.toLowerCase() !== mentionQuery,
          )
          .slice(0, 5)
      : [];

  function insertMention(member: IMentionMember): void {
    setComment((prev) => prev.replace(/@[\p{L}\p{N}_ ]{0,30}$/u, `@${member.displayName} `));
    textareaRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = comment.trim();
    if (text === '' || text.length > 5000) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await addTaskUpdate(
        workspaceId,
        projectId,
        taskId,
        { action: 'comment', text, mentions: parseMentions(text, mentionMembers) },
        uid,
        userName,
      );
      setComment('');
    } catch {
      setError('Could not post the comment.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {updatesState.status === 'loading' && <p className="text-sm">Loading activity…</p>}
      {updatesState.status === 'error' && (
        <Alert variant="destructive">Activity could not be loaded.</Alert>
      )}
      {updatesState.status === 'ready' && (
        <ul className="flex flex-col gap-3">
          {updatesState.rows.length === 0 && (
            <li className="text-sm text-muted-foreground">No activity yet.</li>
          )}
          {updatesState.rows.map((row) => (
            <li key={row.id} className="text-sm">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{row.authorNameDenorm}</span>{' '}
                {row.action === 'comment' ? 'commented' : actionLine(row)} ·{' '}
                {relativeTime(row.createdAt)}
              </p>
              {row.action === 'comment' && (
                <div className="prose prose-sm mt-1 max-w-none">
                  <ReactMarkdown>{highlightMentions(row.text, mentionMembers)}</ReactMarkdown>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2">
        {error !== null && <Alert variant="destructive">{error}</Alert>}
        <Label htmlFor="task-comment">Add a comment</Label>
        <textarea
          id="task-comment"
          ref={textareaRef}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          placeholder="Write a comment — @mention teammates, markdown supported"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {suggestions.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Mention suggestions">
            {suggestions.map((member) => (
              <li key={member.uid}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertMention(member)}
                >
                  @{member.displayName}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button type="submit" size="sm" className="self-start" disabled={pending}>
          {pending ? 'Posting…' : 'Comment'}
        </Button>
      </form>
    </div>
  );
}

export interface ITaskDetailPanelProps {
  workspaceId: string;
  projectId: string;
  task: ITaskRow;
  allTasks: readonly ITaskRow[];
  phases: readonly IPhaseRow[];
  members: readonly IMemberRow[];
  collaborators: readonly ICollaboratorRow[];
  departments: readonly IDepartmentRow[];
  role: TMemberRole;
  memberDepartments: readonly string[];
  canEdit: boolean;
  uid: string;
  userName: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function TaskDetailPanel({
  workspaceId,
  projectId,
  task,
  allTasks,
  phases,
  members,
  collaborators,
  departments,
  role,
  memberDepartments,
  canEdit,
  uid,
  userName,
  onClose,
  onDeleted,
}: ITaskDetailPanelProps) {
  const [tab, setTab] = useState<'details' | 'activity'>('details');
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [phaseId, setPhaseId] = useState(task.phaseId ?? '');
  const [status, setStatus] = useState<TTaskStatus>(task.status);
  const [startDate, setStartDate] = useState(toDateInput(task.startDate));
  const [dueDate, setDueDate] = useState(toDateInput(task.dueDate));
  const [assignees, setAssignees] = useState<TTaskAssignee[]>(task.assignees);
  const [visibleToClient, setVisibleToClient] = useState(task.visibleToClient);
  const [restrictedTo, setRestrictedTo] = useState<string[]>(task.restrictedToDepartments);
  const [sendWhatsapp, setSendWhatsapp] = useState(task.sendWhatsapp);
  const [dependsOn, setDependsOn] = useState<string[]>(task.dependsOn);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // A pm can only pick departments they belong to — rules deny restricting a
  // task into invisibility (owner/admin bypass the restriction entirely).
  const selectableDepartments =
    role === 'owner' || role === 'admin'
      ? departments
      : departments.filter((dep) => memberDepartments.includes(dep.id));
  const otherTasks = allTasks.filter((row) => row.id !== task.id);
  const unassignedMembers = members.filter(
    (member) => !assignees.some((entry) => entry.type === 'user' && entry.id === member.uid),
  );
  // Archived collaborators can't take new work; opted-out ones can (D-035) —
  // the option label carries the "(notifications off)" hint instead.
  const assignableCollaborators = collaborators.filter(
    (collaborator) =>
      collaborator.status === 'active' &&
      !assignees.some((entry) => entry.type === 'collaborator' && entry.id === collaborator.id),
  );

  function toggleRestrictedDept(depId: string): void {
    setRestrictedTo((prev) =>
      prev.includes(depId) ? prev.filter((id) => id !== depId) : [...prev, depId],
    );
  }

  function toggleDependsOn(taskId: string): void {
    setDependsOn((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle === '' || trimmedTitle.length > 200) {
      setError('Task titles must be 1–200 characters.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const nextDueDate = fromDateInput(dueDate);
      await updateTask(
        workspaceId,
        projectId,
        task.id,
        {
          title: trimmedTitle,
          description: description.trim(),
          phaseId: phaseId !== '' ? phaseId : null,
          status,
          startDate: fromDateInput(startDate),
          dueDate: nextDueDate,
          assignees,
          visibleToClient,
          restrictedToDepartments: restrictedTo,
          sendWhatsapp,
          dependsOn,
        },
        task.status === 'done',
      );
      const entries: Array<Promise<void>> = [];
      if (status !== task.status) {
        entries.push(
          addTaskUpdate(
            workspaceId,
            projectId,
            task.id,
            { action: 'status_change', from: task.status, to: status },
            uid,
            userName,
          ),
        );
      }
      if (toDateInput(task.dueDate) !== dueDate) {
        entries.push(
          addTaskUpdate(
            workspaceId,
            projectId,
            task.id,
            {
              action: 'eta_change',
              from: toDateInput(task.dueDate),
              to: dueDate,
            },
            uid,
            userName,
          ),
        );
      }
      const addedAssignees = assignees.filter(
        (entry) => !task.assignees.some((prev) => prev.type === entry.type && prev.id === entry.id),
      );
      if (addedAssignees.length > 0) {
        entries.push(
          addTaskUpdate(
            workspaceId,
            projectId,
            task.id,
            { action: 'assigned', to: addedAssignees.map((entry) => entry.name).join(', ') },
            uid,
            userName,
          ),
        );
      }
      await Promise.all(entries);
    } catch {
      setError('Could not save the task.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await deleteTask(workspaceId, projectId, task.id);
      onDeleted();
    } catch {
      setError('Could not delete the task.');
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-base font-semibold">{task.title}</h3>
          <div role="tablist" aria-label="Task detail tabs" className="flex gap-1">
            {(['details', 'activity'] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={tab === entry}
                onClick={() => setTab(entry)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm capitalize',
                  tab === entry
                    ? 'bg-muted font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent>
        {tab === 'activity' ? (
          <ActivityFeed
            workspaceId={workspaceId}
            projectId={projectId}
            taskId={task.id}
            members={members}
            uid={uid}
            userName={userName}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {!canEdit ? (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{TASK_STATUS_LABELS[task.status]}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Due date</dt>
                  <dd>{task.dueDate?.toLocaleDateString() ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Assignees</dt>
                  <dd>
                    {task.assignees.length > 0
                      ? task.assignees.map((entry) => entry.name).join(', ')
                      : '—'}
                  </dd>
                </div>
                {task.description !== '' && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Description</dt>
                    <dd className="whitespace-pre-wrap">{task.description}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <form
                onSubmit={(event) => void handleSave(event)}
                noValidate
                className="flex flex-col gap-4"
              >
                {error !== null && <Alert variant="destructive">{error}</Alert>}
                <div className="flex flex-wrap gap-4">
                  <div className="flex min-w-64 flex-1 flex-col gap-1.5">
                    <Label htmlFor="task-title">Title</Label>
                    <Input
                      id="task-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="task-status">Status</Label>
                    <select
                      id="task-status"
                      className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                      value={status}
                      onChange={(event) => setStatus(event.target.value as TTaskStatus)}
                    >
                      {TASK_STATUSES.map((option) => (
                        <option key={option} value={option}>
                          {TASK_STATUS_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-description">Description</Label>
                  <textarea
                    id="task-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="task-phase">Phase</Label>
                    <select
                      id="task-phase"
                      className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                      value={phaseId}
                      onChange={(event) => setPhaseId(event.target.value)}
                    >
                      <option value="">No phase</option>
                      {phases.map((phase) => (
                        <option key={phase.id} value={phase.id}>
                          {phase.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="task-start">Start date</Label>
                    <Input
                      id="task-start"
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="task-due">Due date</Label>
                    <Input
                      id="task-due"
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </div>
                </div>

                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">Assignees</legend>
                  {assignees.length > 0 && (
                    <ul className="flex flex-wrap gap-1">
                      {assignees.map((entry) => (
                        <li
                          key={`${entry.type}-${entry.id}`}
                          className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {entry.name}
                          <button
                            type="button"
                            aria-label={`Remove ${entry.name}`}
                            onClick={() =>
                              setAssignees((prev) =>
                                prev.filter(
                                  (item) => !(item.type === entry.type && item.id === entry.id),
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {unassignedMembers.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="task-assign">Assign teammate</Label>
                      <select
                        id="task-assign"
                        className="h-10 max-w-64 rounded-md border border-border bg-background px-3 text-sm"
                        value=""
                        onChange={(event) => {
                          const member = members.find((entry) => entry.uid === event.target.value);
                          if (member !== undefined) {
                            setAssignees((prev) => [
                              ...prev,
                              { type: 'user', id: member.uid, name: member.displayName },
                            ]);
                          }
                        }}
                      >
                        <option value="">Choose a teammate…</option>
                        {unassignedMembers.map((member) => (
                          <option key={member.uid} value={member.uid}>
                            {member.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {assignableCollaborators.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="task-assign-collaborator">Assign collaborator</Label>
                      <select
                        id="task-assign-collaborator"
                        className="h-10 max-w-64 rounded-md border border-border bg-background px-3 text-sm"
                        value=""
                        onChange={(event) => {
                          const collaborator = assignableCollaborators.find(
                            (entry) => entry.id === event.target.value,
                          );
                          if (collaborator !== undefined) {
                            setAssignees((prev) => [
                              ...prev,
                              {
                                type: 'collaborator',
                                id: collaborator.id,
                                name: collaborator.name,
                                phone: collaborator.phone,
                              },
                            ]);
                          }
                        }}
                      >
                        <option value="">Choose a collaborator…</option>
                        {assignableCollaborators.map((collaborator) => (
                          <option key={collaborator.id} value={collaborator.id}>
                            {collaborator.name}
                            {collaborator.notificationsOptOut ? ' (notifications off)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </fieldset>

                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">Sharing &amp; access</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={visibleToClient}
                      onChange={(event) => setVisibleToClient(event.target.checked)}
                    />
                    Client can see this task
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sendWhatsapp}
                      onChange={(event) => setSendWhatsapp(event.target.checked)}
                    />
                    Send WhatsApp updates for this task
                  </label>
                  {selectableDepartments.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-muted-foreground">
                        Restrict to departments (empty = visible to the whole team)
                      </p>
                      <ul className="flex flex-wrap gap-1">
                        {selectableDepartments.map((dep) => (
                          <li key={dep.id}>
                            <button
                              type="button"
                              aria-pressed={restrictedTo.includes(dep.id)}
                              onClick={() => toggleRestrictedDept(dep.id)}
                              className={cn(
                                'rounded-full border border-border px-2 py-0.5 text-xs',
                                restrictedTo.includes(dep.id)
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {dep.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </fieldset>

                {otherTasks.length > 0 && (
                  <fieldset className="flex flex-col gap-1">
                    <legend className="text-sm font-medium">Depends on</legend>
                    <ul className="flex flex-col gap-1">
                      {otherTasks.map((row) => (
                        <li key={row.id}>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={dependsOn.includes(row.id)}
                              onChange={() => toggleDependsOn(row.id)}
                            />
                            {row.title}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={pending} aria-busy={pending}>
                    {pending ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete task
                  </Button>
                </div>
                {confirmingDelete && (
                  <Alert variant="destructive">
                    <p className="text-sm font-medium">Delete this task?</p>
                    <p className="mt-1 text-sm">
                      Its activity history is removed too. This cannot be undone.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={pending}
                        onClick={() => void handleDelete()}
                      >
                        Delete task
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmingDelete(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </Alert>
                )}
              </form>
            )}
            <TaskAttachments
              workspaceId={workspaceId}
              projectId={projectId}
              taskId={task.id}
              taskVisibleToClient={task.visibleToClient}
              taskRestrictedToDepartments={task.restrictedToDepartments}
              role={role}
              departments={[...memberDepartments]}
              uid={uid}
              userName={userName}
              canEdit={canEdit}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

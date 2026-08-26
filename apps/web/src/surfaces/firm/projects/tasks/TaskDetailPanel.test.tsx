import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { TASK_NOTIFY_DEFAULTS } from '@siapp/shared';

import type { IMemberRow } from '../../settings/useTeamData.ts';
import type { ICollaboratorRow } from '../../collaborators/useCollaborators.ts';
import type { TDocumentsState } from '../documents/useDocuments.ts';
import type { ITaskRow, TTaskUpdatesState } from './useTasks.ts';

const tasksData = vi.hoisted(() => ({
  updatesState: { status: 'ready', rows: [] } as TTaskUpdatesState,
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  addTaskUpdate: vi.fn(),
}));
vi.mock('./useTasks.ts', () => ({
  useTaskUpdates: () => tasksData.updatesState,
  updateTask: tasksData.updateTask,
  deleteTask: tasksData.deleteTask,
  addTaskUpdate: tasksData.addTaskUpdate,
}));

const docsData = vi.hoisted(() => ({
  state: { status: 'ready', rows: [] } as TDocumentsState,
  uploadDocument: vi.fn(),
  softDeleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
  getPreviewUrl: vi.fn(),
  validateDocumentFile: vi.fn<(file: File) => string | null>(() => null),
}));
vi.mock('../documents/useDocuments.ts', () => ({
  useDocuments: () => docsData.state,
  uploadDocument: docsData.uploadDocument,
  softDeleteDocument: docsData.softDeleteDocument,
  downloadDocument: docsData.downloadDocument,
  getPreviewUrl: docsData.getPreviewUrl,
  validateDocumentFile: docsData.validateDocumentFile,
}));

vi.mock('../../settings/useTeamData.ts', () => ({
  useMembers: () => ({ status: 'ready', rows: [] }),
  useDepartments: () => ({ status: 'ready', rows: [] }),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { TaskDetailPanel } from './TaskDetailPanel.tsx';

function taskRow(overrides: Partial<ITaskRow> = {}): ITaskRow {
  return {
    restricted: false,
    id: 't1',
    title: 'Pour foundation',
    description: '',
    phaseId: null,
    status: 'todo',
    startDate: null,
    dueDate: null,
    completedAt: null,
    assignees: [],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: { ...TASK_NOTIFY_DEFAULTS },
    collaboratorCanSeeAllAttachments: true,
    order: 1,
    createdBy: 'u1',
    blockedReason: '',
    blockedBy: null,
    tags: [],
    ...overrides,
  };
}

function member(uid: string, displayName: string): IMemberRow {
  return { uid, email: `${uid}@x.com`, displayName, role: 'pm', departments: [], seatActive: true };
}

const departments = [
  { id: 'dep-fin', name: 'Finance', memberCount: 1 },
  { id: 'dep-ops', name: 'Operations', memberCount: 2 },
];

function renderPanel(overrides: Partial<Parameters<typeof TaskDetailPanel>[0]> = {}) {
  return render(
    <TaskDetailPanel
      workspaceId="wksA"
      projectId="p1"
      task={taskRow()}
      phases={[]}
      members={[member('u1', 'Alice Tan'), member('u2', 'Sam Lee')]}
      collaborators={[]}
      departments={departments}
      role="pm"
      memberDepartments={['dep-ops']}
      canEdit
      uid="u1"
      userName="Alice Tan"
      onClose={vi.fn()}
      onDeleted={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tasksData.updatesState = { status: 'ready', rows: [] };
  tasksData.updateTask.mockResolvedValue(undefined);
  tasksData.addTaskUpdate.mockResolvedValue(undefined);
  docsData.state = { status: 'ready', rows: [] };
  docsData.validateDocumentFile.mockReturnValue(null);
  docsData.uploadDocument.mockResolvedValue(undefined);
});

describe('TaskDetailPanel details', () => {
  it('saves edits and appends a status_change activity entry', async () => {
    renderPanel();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(tasksData.updateTask).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      expect.objectContaining({ title: 'Pour foundation', status: 'in_progress' }),
      false,
      'u1',
    );
    expect(tasksData.addTaskUpdate).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      { action: 'status_change', from: 'todo', to: 'in_progress' },
      'u1',
      'Alice Tan',
    );
  });

  it('appends an eta_change entry when the due date changes', async () => {
    renderPanel();

    await userEvent.type(screen.getByLabelText('Due date'), '2026-08-01');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(tasksData.addTaskUpdate).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      { action: 'eta_change', from: '', to: '2026-08-01' },
      'u1',
      'Alice Tan',
    );
  });

  it('appends an assigned entry when a teammate is added', async () => {
    renderPanel();

    await userEvent.selectOptions(screen.getByLabelText('Assign teammate'), 'u2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(tasksData.updateTask).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      expect.objectContaining({
        assignees: [{ type: 'user', id: 'u2', name: 'Sam Lee' }],
      }),
      false,
      'u1',
    );
    expect(tasksData.addTaskUpdate).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      { action: 'assigned', to: 'Sam Lee' },
      'u1',
      'Alice Tan',
    );
  });

  it('assigns an active collaborator with their phone and flags opted-out ones (#16)', async () => {
    const collaborators: ICollaboratorRow[] = [
      {
        id: 'col1',
        name: 'Lim Electrical',
        phone: '+60198765432',
        email: '',
        company: '',
        trade: 'Electrical',
        type: 'company',
        status: 'active',
        notificationsOptOut: false,
        lastTaskAt: null,
        waConsentGranted: true,
        waConsentRecordedAt: null,
        pdpaErased: false,
      },
      {
        id: 'col2',
        name: 'Quiet Sub',
        phone: '+60111222333',
        email: '',
        company: '',
        trade: '',
        type: 'individual',
        status: 'active',
        notificationsOptOut: true,
        lastTaskAt: null,
        waConsentGranted: true,
        waConsentRecordedAt: null,
        pdpaErased: false,
      },
      {
        id: 'col3',
        name: 'Gone Sub',
        phone: '+60144555666',
        email: '',
        company: '',
        trade: '',
        type: 'individual',
        status: 'archived',
        notificationsOptOut: false,
        lastTaskAt: null,
        waConsentGranted: null,
        waConsentRecordedAt: null,
        pdpaErased: false,
      },
    ];
    renderPanel({ collaborators });

    const select = screen.getByLabelText('Assign collaborator');
    expect(screen.getByRole('option', { name: 'Quiet Sub (notifications off)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Gone Sub/ })).not.toBeInTheDocument();

    await userEvent.selectOptions(select, 'col1');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(tasksData.updateTask).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      expect.objectContaining({
        assignees: [
          { type: 'collaborator', id: 'col1', name: 'Lim Electrical', phone: '+60198765432' },
        ],
      }),
      false,
      'u1',
    );
  });

  it('disables the notify options while the WhatsApp master toggle is off (#18)', () => {
    renderPanel();

    // Fixture has sendWhatsapp: false — options render but are disabled.
    expect(screen.getByLabelText('Status changes')).toBeDisabled();
    expect(screen.getByLabelText('Client')).toBeDisabled();
    // Defaults still show through (kept, not cleared).
    expect(screen.getByLabelText('Status changes')).toBeChecked();
    expect(screen.getByLabelText('Internal team (assignees)')).not.toBeChecked();
  });

  it('enables the notify options under the master toggle and saves the edited map (#18)', async () => {
    renderPanel({ task: taskRow({ sendWhatsapp: true }) });

    expect(screen.getByLabelText('Due date is approaching')).toBeEnabled();
    await userEvent.click(screen.getByLabelText('Due date is approaching'));
    await userEvent.click(screen.getByLabelText('Internal team (assignees)'));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(tasksData.updateTask).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      expect.objectContaining({
        sendWhatsapp: true,
        notify: {
          statusChange: true,
          dueSoon: false,
          blocked: true,
          toClient: true,
          toInternal: true,
        },
      }),
      false,
      'u1',
    );
  });

  it('saves collaboratorCanSeeAllAttachments toggle (#92)', async () => {
    renderPanel({ task: taskRow({ collaboratorCanSeeAllAttachments: true }) });

    await userEvent.click(screen.getByLabelText('Collaborators can see all task attachments'));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(tasksData.updateTask).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      expect.objectContaining({ collaboratorCanSeeAllAttachments: false }),
      false,
      'u1',
    );
  });

  it('does not append activity entries when nothing tracked changed', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(tasksData.updateTask).toHaveBeenCalled();
    expect(tasksData.addTaskUpdate).not.toHaveBeenCalled();
  });

  it('limits a pm to their own departments in the restriction selector', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Operations' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finance' })).not.toBeInTheDocument();
  });

  it('shows all departments to owners', () => {
    renderPanel({ role: 'owner', memberDepartments: [] });
    expect(screen.getByRole('button', { name: 'Finance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Operations' })).toBeInTheDocument();
  });

  it('hides the restriction selector when no departments are selectable', () => {
    renderPanel({ memberDepartments: [] });
    expect(screen.queryByText(/restrict to departments/i)).not.toBeInTheDocument();
  });

  it('renders read-only details without a form when canEdit is false', () => {
    renderPanel({ canEdit: false });
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.getByText('To do')).toBeInTheDocument();
  });

  it('renders blocked callout with blocker and reason metadata (#93)', () => {
    renderPanel({
      task: taskRow({
        status: 'blocked',
        blockedReason: 'Awaiting revised drawings',
        blockedBy: { kind: 'collaborator', id: 'col-1', name: 'Lim Electrical' },
      }),
    });

    expect(screen.getByText('Task blocked')).toBeInTheDocument();
    expect(screen.getByText(/blocked by: lim electrical \(collaborator\)/i)).toBeInTheDocument();
    expect(screen.getByText(/reason: awaiting revised drawings/i)).toBeInTheDocument();
  });

  it('requires a confirm step before deleting', async () => {
    const onDeleted = vi.fn();
    tasksData.deleteTask.mockResolvedValue(undefined);
    renderPanel({ onDeleted });

    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(tasksData.deleteTask).not.toHaveBeenCalled();
    expect(screen.getByText(/delete this task\?/i)).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Delete task' });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]!);
    expect(tasksData.deleteTask).toHaveBeenCalledWith('wksA', 'p1', 't1');
    expect(onDeleted).toHaveBeenCalled();
  });

  it('dismisses the confirm dialog without deleting when cancelled', async () => {
    const onDeleted = vi.fn();
    tasksData.deleteTask.mockResolvedValue(undefined);
    renderPanel({ onDeleted });

    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    // Confirm dialog is open: two "Delete task" buttons (header + destructive confirm).
    expect(screen.getAllByRole('button', { name: 'Delete task' })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Dialog is dismissed, nothing deleted, and only the header button remains reachable.
    expect(tasksData.deleteTask).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete task' })).toHaveLength(1);
  });

  it('closes via the header Close icon button', async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders both columns and toggles them via the Details/Activity tablist', async () => {
    renderPanel();

    // The small-viewport tablist is always in the DOM (md:hidden is purely CSS).
    expect(screen.getByRole('tablist', { name: 'Task detail tabs' })).toBeInTheDocument();
    const detailsTab = screen.getByRole('tab', { name: 'details' });
    const activityTab = screen.getByRole('tab', { name: 'activity' });

    // Both columns render simultaneously (md+ shows both); tabs only toggle the
    // `hidden` utility class below the breakpoint.
    const detailsColumn = screen.getByLabelText('Status').closest('div.overflow-y-auto');
    const activityColumn = screen.getByLabelText('Add a comment').closest('div.overflow-y-auto');
    expect(detailsColumn).not.toBeNull();
    expect(activityColumn).not.toBeNull();
    expect(detailsColumn).not.toBe(activityColumn);

    // Default: Details selected and visible, Activity hidden (small-viewport rule).
    expect(detailsTab).toHaveAttribute('aria-selected', 'true');
    expect(activityTab).toHaveAttribute('aria-selected', 'false');
    expect(detailsColumn).not.toHaveClass('hidden');
    expect(activityColumn).toHaveClass('hidden');

    // Switch to Activity: selection and the hidden class flip.
    await userEvent.click(activityTab);
    expect(activityTab).toHaveAttribute('aria-selected', 'true');
    expect(detailsTab).toHaveAttribute('aria-selected', 'false');
    expect(activityColumn).not.toHaveClass('hidden');
    expect(detailsColumn).toHaveClass('hidden');
  });

  it('has no axe violations and names its header icon buttons', async () => {
    const { container } = renderPanel();

    // Icon-only header controls expose accessible names via aria-label.
    expect(screen.getByRole('button', { name: 'Delete task' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    const results = await axe.run(
      // The hidden `<input type=file>` is `display:none` in production (Tailwind
      // `hidden`), but jsdom loads no CSS so axe sees it as a visible unlabeled
      // control. Exclude it — the labeled "Attach file" button drives it.
      { include: [container], exclude: [['[data-testid="document-file-input"]']] },
      {
        rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
      },
    );
    expect(results.violations).toEqual([]);
  });
});

describe('TaskDetailPanel activity', () => {
  it('submits comments with parsed mentions', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('tab', { name: 'activity' }));
    await userEvent.type(screen.getByLabelText('Add a comment'), 'ping @Sam Lee re: rebar');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(tasksData.addTaskUpdate).toHaveBeenCalledWith(
      'wksA',
      'p1',
      't1',
      { action: 'comment', text: 'ping @Sam Lee re: rebar', mentions: ['u2'] },
      'u1',
      'Alice Tan',
    );
  });

  it('offers @-typeahead suggestions and inserts the picked member', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('tab', { name: 'activity' }));
    const box = screen.getByLabelText('Add a comment');
    await userEvent.type(box, 'cc @Sa');
    await userEvent.click(screen.getByRole('button', { name: '@Sam Lee' }));

    expect(box).toHaveValue('cc @Sam Lee ');
  });

  it('renders the update feed with non-comment action lines', async () => {
    tasksData.updatesState = {
      status: 'ready',
      rows: [
        {
          id: 'up1',
          authorId: 'u2',
          authorType: 'user',
          authorNameDenorm: 'Sam Lee',
          action: 'status_change',
          text: '',
          mentions: [],
          from: 'todo',
          to: 'in_progress',
          createdAt: new Date(),
        },
        {
          id: 'up2',
          authorId: 'u2',
          authorType: 'collaborator',
          authorNameDenorm: 'Sam Lee',
          action: 'comment',
          text: 'Concrete arrives @Alice Tan',
          mentions: ['u1'],
          from: '',
          to: '',
          createdAt: new Date(),
        },
      ],
    };
    renderPanel();

    await userEvent.click(screen.getByRole('tab', { name: 'activity' }));
    expect(screen.getByText(/changed status from todo to in_progress/i)).toBeInTheDocument();
    expect(screen.getByText('Notes:')).toBeInTheDocument();
    expect(screen.getByText(/concrete arrives \*\*@Alice Tan\*\*/i)).toBeInTheDocument();
  });
});

describe('TaskDetailPanel attachments', () => {
  it('renders task-scoped attachments with a download action', () => {
    docsData.state = {
      status: 'ready',
      rows: [
        {
          id: 'd1',
          name: 'rebar-specs.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
          storagePath: 'workspaces/wksA/projects/p1/uuid-rebar-specs.pdf',
          scope: 'task',
          scopeId: 't1',
          uploadedBy: 'u1',
          uploaderType: 'firm_member',
          uploadedAt: new Date('2026-07-20T10:00:00'),
          visibleToClient: false,
          restrictedToDepartments: [],
          scanStatus: 'pending',
        },
      ],
    };
    renderPanel();

    expect(screen.getByText('rebar-specs.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });

  it("uploads attachments inheriting the task's visibility and restriction", async () => {
    renderPanel({
      task: taskRow({ visibleToClient: true, restrictedToDepartments: ['dep-ops'] }),
    });
    const file = new File(['%PDF'], 'rebar-specs.pdf', { type: 'application/pdf' });

    await userEvent.upload(screen.getByTestId('document-file-input'), file);

    expect(docsData.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'wksA',
        projectId: 'p1',
        file,
        scope: 'task',
        scopeId: 't1',
        visibleToClient: true,
        restrictedToDepartments: ['dep-ops'],
        uid: 'u1',
        userName: 'Alice Tan',
      }),
    );
  });

  it('hides the attach button when canEdit is false', () => {
    renderPanel({ canEdit: false });
    expect(screen.queryByRole('button', { name: 'Attach file' })).not.toBeInTheDocument();
  });
});

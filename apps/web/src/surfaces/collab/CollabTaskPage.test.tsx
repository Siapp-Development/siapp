/**
 * "My Assigned Tasks" switcher (#127): empty state, single-task auto-select
 * (switcher hidden), multi-task Q1 ordering with the "(Active)" suffix, the
 * real associated <label>, loading/error states, and an axe a11y pass.
 *
 * The data hooks are mocked so the page renders without Firebase; the switcher
 * receives already-ordered rows (ordering itself is unit-tested in
 * useCollabAssignedTasks.test.ts).
 */
import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IAssignedTaskRow } from './useCollabAssignedTasks.ts';

const session = vi.hoisted(() => ({
  value: {
    workspaceId: 'wksA',
    collaboratorId: 'col1',
    firmName: 'Firm A',
    collaboratorName: 'Lim Electrical',
    branding: { firmName: 'Firm A' },
  },
}));
const tasks = vi.hoisted(() => ({
  value: { status: 'loading' } as
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; rows: IAssignedTaskRow[] },
}));

vi.mock('@/hooks/useSurfaceTheme.ts', () => ({ useSurfaceTheme: () => undefined }));
vi.mock('./useCollabSession.ts', () => ({
  useCollabSession: () => ({ state: { status: 'ready', session: session.value }, retry: () => undefined }),
  CollabSessionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./useCollabAssignedTasks.ts', () => ({
  useCollabAssignedTasks: () => tasks.value,
}));
vi.mock('./useCollabTask.ts', () => ({
  useCollabTask: () => ({
    status: 'ready',
    task: {
      title: 'Install signage',
      description: '',
      status: 'in_progress',
      dueDate: null,
      blockedReason: '',
      collaboratorCanSeeAllAttachments: true,
      visibleToClient: false,
      restrictedToDepartments: [],
    },
  }),
  useCollabUpdates: () => ({ status: 'ready', rows: [] }),
  useCollabDocuments: () => ({ status: 'ready', rows: [] }),
  collabDownloadUrl: vi.fn(),
  uploadCollabDocument: vi.fn(),
  validateCollabFile: () => null,
}));
vi.mock('@/lib/callables.ts', () => ({ submitCollabUpdate: vi.fn() }));

import { CollabTaskPage } from './CollabTaskPage.tsx';

function row(overrides: Partial<IAssignedTaskRow>): IAssignedTaskRow {
  const status = overrides.status ?? 'in_progress';
  return {
    key: overrides.key ?? `${overrides.projectId ?? 'p1'}_${overrides.taskId ?? 't1'}`,
    projectId: overrides.projectId ?? 'p1',
    taskId: overrides.taskId ?? 't1',
    title: overrides.title ?? 'Task',
    status,
    dueDate: overrides.dueDate ?? null,
    projectName: overrides.projectName ?? 'Tower A',
    active: status !== 'done',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/t/tok']}>
      <CollabTaskPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tasks.value = { status: 'loading' };
});

describe('CollabTaskPage — My Assigned Tasks switcher', () => {
  it('shows a loading status while the mirror query is pending', () => {
    tasks.value = { status: 'loading' };
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(/loading your tasks/i);
  });

  it('shows an alert when the mirror query errors', () => {
    tasks.value = { status: 'error' };
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t load your tasks/i);
  });

  it('shows the empty state and no switcher when nothing is assigned', () => {
    tasks.value = { status: 'ready', rows: [] };
    renderPage();
    expect(screen.getByText('No tasks assigned yet.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('auto-selects the only task and hides the switcher for a single task', () => {
    tasks.value = {
      status: 'ready',
      rows: [row({ taskId: 't1', title: 'Install signage' })],
    };
    renderPage();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Install signage' })).toBeInTheDocument();
  });

  it('renders a labelled switcher for multiple tasks with the "(Active)" suffix', () => {
    tasks.value = {
      status: 'ready',
      rows: [
        row({ taskId: 't1', title: 'Active work', status: 'in_progress', projectName: 'Tower A' }),
        row({ taskId: 't2', title: 'Finished work', status: 'done', projectName: 'Tower B' }),
      ],
    };
    renderPage();

    // The select is named by its real <label htmlFor="collab-task-switcher">.
    const switcher = screen.getByRole('combobox', { name: 'My Assigned Tasks' });
    const options = within(switcher).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Active work (Active) — Tower A', 'Finished work — Tower B']);
  });

  it('has no accessibility violations with the switcher visible', async () => {
    tasks.value = {
      status: 'ready',
      rows: [
        row({ taskId: 't1', title: 'Active work' }),
        row({ taskId: 't2', title: 'Second task' }),
      ],
    };
    const { container } = renderPage();
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

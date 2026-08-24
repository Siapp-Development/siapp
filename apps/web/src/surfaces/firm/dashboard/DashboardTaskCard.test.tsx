import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TASK_NOTIFY_DEFAULTS, type TTaskAssignee } from '@siapp/shared';

import { DashboardTaskCard } from './DashboardTaskCard.tsx';
import type { IDashboardTaskRow } from './useDashboardTasks.ts';

const NOW = new Date(2026, 0, 15, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function taskRow(overrides: Partial<IDashboardTaskRow> = {}): IDashboardTaskRow {
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
    assignees: [{ type: 'user', id: 'u1', name: 'Alice Tan' }] as TTaskAssignee[],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: { ...TASK_NOTIFY_DEFAULTS },
    collaboratorCanSeeAllAttachments: true,
    order: 0,
    createdBy: 'u1',
    blockedReason: '',
    blockedBy: null,
    tags: [],
    projectId: 'p9',
    projectName: 'Office fit-out',
    ...overrides,
  };
}

function renderCard(task: IDashboardTaskRow, memberPhotos: Map<string, string> = new Map()) {
  return render(
    <MemoryRouter>
      <ul>
        <DashboardTaskCard task={task} workspaceSlug="acme" now={NOW} memberPhotos={memberPhotos} />
      </ul>
    </MemoryRouter>,
  );
}

describe('DashboardTaskCard', () => {
  it('exposes a primary link labelled "Open task … in …" that deep-links with ?task=', () => {
    renderCard(taskRow());
    expect(
      screen.getByRole('link', { name: 'Open task Pour foundation in Office fit-out' }),
    ).toHaveAttribute('href', '/acme/projects/p9?task=t1');
  });

  it('exposes a separate project-name link pointing at the project root (no ?task=)', () => {
    renderCard(taskRow());
    const projectLink = screen.getByRole('link', { name: 'Office fit-out' });
    expect(projectLink).toHaveAttribute('href', '/acme/projects/p9');
  });

  it('renders the two links as distinct, non-nested sibling anchors', () => {
    renderCard(taskRow());
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);

    const primary = screen.getByRole('link', {
      name: 'Open task Pour foundation in Office fit-out',
    });
    const projectLink = screen.getByRole('link', { name: 'Office fit-out' });

    expect(primary).not.toBe(projectLink);
    expect(primary).not.toContainElement(projectLink);
    expect(projectLink).not.toContainElement(primary);
  });

  it('renders an overdue due pill with the danger tone and relative label', () => {
    renderCard(taskRow({ dueDate: new Date(NOW.getTime() - 3 * DAY_MS) }));
    const pill = screen.getByText('3 days overdue');
    expect(pill).toBeInTheDocument();
    // Danger tone maps to the danger Badge variant (color paired with text).
    expect(pill).toHaveClass('text-danger');
  });

  it('omits the due pill entirely when the task has no due date', () => {
    renderCard(taskRow({ dueDate: null }));
    expect(screen.queryByText(/overdue|Due (today|tomorrow|in)/)).not.toBeInTheDocument();
  });

  it('renders the task status badge', () => {
    renderCard(taskRow({ status: 'todo' }));
    expect(screen.getByText('To do')).toBeInTheDocument();
  });

  it('shows assignees as avatars only — the assignee name is not rendered as text (#104)', () => {
    renderCard(taskRow({ assignees: [{ type: 'user', id: 'u1', name: 'Alice Tan' }] as TTaskAssignee[] }));

    // Avatars-only cluster: the name drives the initials + accessible label,
    // but the full name never appears as visible body text on the card.
    expect(screen.queryByText('Alice Tan')).not.toBeInTheDocument();
    // Initials fallback (no member photo) is shown instead.
    expect(screen.getByText('AT')).toBeInTheDocument();
  });

  it('collapses assignees beyond the first three into a "+N" avatar-count chip (no names)', () => {
    renderCard(
      taskRow({
        assignees: [
          { type: 'user', id: 'u1', name: 'Alice Tan' },
          { type: 'user', id: 'u2', name: 'Bob Lee' },
          { type: 'user', id: 'u3', name: 'Cara Ng' },
          { type: 'user', id: 'u4', name: 'Dan Poh' },
          { type: 'user', id: 'u5', name: 'Eve Sim' },
        ] as TTaskAssignee[],
      }),
    );

    // Three avatars render; the remaining two collapse into "+2".
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('Alice Tan')).not.toBeInTheDocument();
    expect(screen.queryByText('Dan Poh')).not.toBeInTheDocument();
  });

  it('renders a firm-member assignee photo as an <img> when the member map has it (#104)', () => {
    const { container } = renderCard(
      taskRow({ assignees: [{ type: 'user', id: 'u1', name: 'Alice Tan' }] as TTaskAssignee[] }),
      new Map([['u1', 'https://cdn.test/alice.png']]),
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn.test/alice.png');
    // The decorative avatar exposes no accessible name (the surrounding link labels the row).
    expect(img).toHaveAttribute('alt', '');
  });

  it('falls back to initials for a collaborator assignee even if a uid collides in the photo map', () => {
    const { container } = renderCard(
      taskRow({ assignees: [{ type: 'collaborator', id: 'u1', name: 'Cody Rivera' }] as TTaskAssignee[] }),
      new Map([['u1', 'https://cdn.test/should-not-be-used.png']]),
    );

    // Collaborators have no firm member doc, so their photo is never joined.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('CR')).toBeInTheDocument();
  });

  it('falls back to initials for a firm member with no photo in the map', () => {
    const { container } = renderCard(
      taskRow({ assignees: [{ type: 'user', id: 'u9', name: 'Priya Rao' }] as TTaskAssignee[] }),
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('PR')).toBeInTheDocument();
  });
});

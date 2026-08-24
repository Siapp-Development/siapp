import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import type { IProjectRow } from '../projects/useProjects.ts';
import { AttentionCard } from './AttentionCard.tsx';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Bungalow build',
    code: '',
    vertical: 'construction',
    lifecycle: 'published',
    status: 'active',
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: '',
    startDate: null,
    targetEndDate: null,
    progressPct: 40,
    totalTasks: 5,
    doneTasks: 2,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: false,
    collaboratorsCount: 0,
    updatedAt: null,
    tags: [],
    ...overrides,
  };
}

function renderCard(project: IProjectRow) {
  return render(
    <MemoryRouter>
      <ul>
        <AttentionCard project={project} workspaceSlug="acme" />
      </ul>
    </MemoryRouter>,
  );
}

describe('AttentionCard', () => {
  it('makes the whole card a single link to the project root', () => {
    renderCard(projectRow({ id: 'p9', name: 'Office fit-out', overdueTasks: 1 }));
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/acme/projects/p9');
    // Accessible name carries the health signal, not color alone.
    expect(links[0]).toHaveAccessibleName('Office fit-out — overdue');
  });

  it('renders the lifecycle and health badges', () => {
    renderCard(projectRow({ lifecycle: 'draft', overdueTasks: 4 }));
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // HealthBadge for an overdue project (the metric line repeats the count).
    expect(screen.getAllByText('4 overdue').length).toBeGreaterThan(0);
  });

  it('renders the progress label and percentage', () => {
    renderCard(projectRow({ progressPct: 40, overdueTasks: 1 }));
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('renders the "N overdue · N blocked" metric line with both segments', () => {
    renderCard(projectRow({ overdueTasks: 4, blockedTasks: 2 }));
    // The combined joined string only exists on the metric line (the HealthBadge
    // shows a single "4 overdue" chip), so this text is unambiguous.
    expect(screen.getByText('4 overdue · 2 blocked')).toBeInTheDocument();
  });

  it('omits a zero-count segment from the metric line', () => {
    renderCard(projectRow({ overdueTasks: 0, blockedTasks: 3 }));
    // Health is "blocked" here, so no "overdue" text should appear anywhere.
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
    // The blocked metric still renders (once on the badge, once on the line).
    expect(screen.getAllByText('3 blocked').length).toBeGreaterThan(0);
  });

  it('renders the client name and a separator when clientNameDenorm is present', () => {
    renderCard(
      projectRow({ clientNameDenorm: 'Acme Client', overdueTasks: 4 }),
    );
    const link = screen.getByRole('link');
    expect(within(link).getByText('Acme Client')).toBeInTheDocument();
    // Separator between client name and metric segments.
    expect(within(link).getByText('·')).toBeInTheDocument();
  });

  it('omits the client text and separator when clientNameDenorm is empty', () => {
    renderCard(projectRow({ clientNameDenorm: '', overdueTasks: 4 }));
    const link = screen.getByRole('link');
    // No stray middot separator when there is no client name preceding metrics.
    expect(within(link).queryByText('·')).not.toBeInTheDocument();
  });
});

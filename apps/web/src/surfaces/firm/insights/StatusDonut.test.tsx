import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { StatusDonut, computeStatusMix } from './StatusDonut.tsx';
import type { IProjectRow } from '../projects/useProjects.ts';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  const base = {
    id: 'p1',
    name: 'Bungalow build',
    description: '',
    code: 'BB-1',
    vertical: 'construction' as const,
    lifecycle: 'published' as const,
    status: 'active' as const,
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: null,
    targetEndDate: null,
    progressPct: 40,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: true,
    collaboratorsCount: 0,
    updatedAt: null,
    tags: [] as string[],
    ...overrides,
  };
  return { ...base, clientIds: [], clients: [] };
}

describe('computeStatusMix', () => {
  it('maps raw statuses to the friendly vocabulary in order', () => {
    const rows = [
      projectRow({ id: 'a', status: 'planning' }),
      projectRow({ id: 'b', status: 'active' }),
      projectRow({ id: 'c', status: 'on_hold' }),
      projectRow({ id: 'd', status: 'completed' }),
    ];
    expect(computeStatusMix(rows)).toEqual([
      { key: 'upcoming', label: 'Upcoming', count: 1 },
      { key: 'in_progress', label: 'In progress', count: 1 },
      { key: 'on_hold', label: 'On hold', count: 1 },
      { key: 'completed', label: 'Completed', count: 1 },
    ]);
  });

  it('excludes archived projects from every bucket', () => {
    const rows = [
      projectRow({ id: 'a', status: 'active' }),
      projectRow({ id: 'b', status: 'archived' }),
    ];
    const mix = computeStatusMix(rows);
    expect(mix.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1);
    expect(mix.find((b) => b.key === 'in_progress')?.count).toBe(1);
  });

  it('always returns all four buckets, including zero-count ones', () => {
    const mix = computeStatusMix([projectRow({ status: 'active' })]);
    expect(mix.map((b) => b.key)).toEqual(['upcoming', 'in_progress', 'on_hold', 'completed']);
    expect(mix.find((b) => b.key === 'upcoming')?.count).toBe(0);
  });

  it('buckets a lifecycle-completed/status-active project as Completed (matches the card)', () => {
    const mix = computeStatusMix([
      projectRow({ id: 'a', lifecycle: 'completed', status: 'active' }),
    ]);
    expect(mix.find((b) => b.key === 'completed')?.count).toBe(1);
    expect(mix.find((b) => b.key === 'in_progress')?.count).toBe(0);
  });
});

describe('StatusDonut', () => {
  it('renders an accessible donut summarising the mix', () => {
    const rows = [
      projectRow({ id: 'a', status: 'planning' }),
      projectRow({ id: 'b', status: 'active' }),
      projectRow({ id: 'c', status: 'active' }),
    ];
    render(<StatusDonut projects={rows} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('aria-label', expect.stringContaining('1 Upcoming'));
    expect(img).toHaveAttribute('aria-label', expect.stringContaining('2 In progress'));
  });

  it('lists every bucket with its count in the legend', () => {
    const rows = [
      projectRow({ id: 'a', status: 'planning' }),
      projectRow({ id: 'b', status: 'active' }),
      projectRow({ id: 'c', status: 'on_hold' }),
      projectRow({ id: 'd', status: 'completed' }),
    ];
    render(<StatusDonut projects={rows} />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(items[0]!).getByText('Upcoming')).toBeInTheDocument();
    expect(within(items[1]!).getByText('In progress')).toBeInTheDocument();
    expect(within(items[2]!).getByText('On hold')).toBeInTheDocument();
    expect(within(items[3]!).getByText('Completed')).toBeInTheDocument();
  });

  it('paints each legend swatch with the semantic status colour token', () => {
    const rows = [
      projectRow({ id: 'a', status: 'planning' }),
      projectRow({ id: 'b', status: 'active' }),
      projectRow({ id: 'c', status: 'on_hold' }),
      projectRow({ id: 'd', status: 'completed' }),
    ];
    render(<StatusDonut projects={rows} />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    // Neutral / primary / warning / success, matching the shared TASK-status palette.
    expect(items[0]!.querySelector('span[aria-hidden="true"]')).toHaveClass('text-muted-foreground');
    expect(items[1]!.querySelector('span[aria-hidden="true"]')).toHaveClass('text-primary');
    expect(items[2]!.querySelector('span[aria-hidden="true"]')).toHaveClass('text-warning');
    expect(items[3]!.querySelector('span[aria-hidden="true"]')).toHaveClass('text-success');
    // Colour is never the sole signal — swatches carry bg-current over the token class.
    expect(items[0]!.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-current');
  });

  it('shows an empty message when there are no non-archived projects', () => {
    render(<StatusDonut projects={[projectRow({ status: 'archived' })]} />);

    expect(screen.getByText(/no status data yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const rows = [
      projectRow({ id: 'a', status: 'planning' }),
      projectRow({ id: 'b', status: 'active' }),
    ];
    const { container } = render(<StatusDonut projects={rows} />);

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

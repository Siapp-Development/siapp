import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { PortfolioStats, computePortfolioStats } from './PortfolioStats.tsx';
import type { IProjectRow } from '../projects/useProjects.ts';

const day = (iso: string): Date => new Date(`${iso}T00:00:00`);
const NOW = day('2026-08-25');

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
    startDate: day('2026-07-01'),
    targetEndDate: day('2026-09-01'),
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

describe('computePortfolioStats', () => {
  it('returns all zeros for an empty portfolio', () => {
    expect(computePortfolioStats([], NOW)).toEqual({
      activeCount: 0,
      overallCompletionPct: 0,
      wrappingUpSoonCount: 0,
      completedCount: 0,
    });
  });

  it('counts only published, non-completed, non-archived projects as active', () => {
    const rows = [
      projectRow({ id: 'a', lifecycle: 'published', status: 'active' }),
      projectRow({ id: 'b', lifecycle: 'published', status: 'planning' }),
      projectRow({ id: 'c', lifecycle: 'published', status: 'completed' }),
      projectRow({ id: 'd', lifecycle: 'published', status: 'archived' }),
      projectRow({ id: 'e', lifecycle: 'draft', status: 'active' }),
    ];
    expect(computePortfolioStats(rows, NOW).activeCount).toBe(2);
  });

  it('averages progress across the active set and rounds', () => {
    const rows = [
      projectRow({ id: 'a', progressPct: 40 }),
      projectRow({ id: 'b', progressPct: 41 }),
      projectRow({ id: 'c', progressPct: 42 }),
    ];
    // (40 + 41 + 42) / 3 = 41
    expect(computePortfolioStats(rows, NOW).overallCompletionPct).toBe(41);
  });

  it('rounds a fractional average to the nearest percent', () => {
    const rows = [
      projectRow({ id: 'a', progressPct: 10 }),
      projectRow({ id: 'b', progressPct: 15 }),
    ];
    // 12.5 → 13
    expect(computePortfolioStats(rows, NOW).overallCompletionPct).toBe(13);
  });

  it('reports 0% completion when nothing is in flight', () => {
    const rows = [projectRow({ lifecycle: 'draft', status: 'planning', progressPct: 80 })];
    expect(computePortfolioStats(rows, NOW).overallCompletionPct).toBe(0);
  });

  it('counts a target date exactly 30 days ahead as wrapping up soon (inclusive)', () => {
    const rows = [projectRow({ targetEndDate: day('2026-09-24') })]; // NOW + 30 days
    expect(computePortfolioStats(rows, NOW).wrappingUpSoonCount).toBe(1);
  });

  it('counts a target date on today as wrapping up soon (inclusive)', () => {
    const rows = [projectRow({ targetEndDate: NOW })];
    expect(computePortfolioStats(rows, NOW).wrappingUpSoonCount).toBe(1);
  });

  it('excludes target dates beyond 30 days and in the past', () => {
    const rows = [
      projectRow({ id: 'far', targetEndDate: day('2026-09-25') }), // NOW + 31 days
      projectRow({ id: 'past', targetEndDate: day('2026-08-24') }), // yesterday
    ];
    expect(computePortfolioStats(rows, NOW).wrappingUpSoonCount).toBe(0);
  });

  it('excludes completed/archived and undated projects from wrapping up soon', () => {
    const rows = [
      projectRow({ id: 'done', status: 'completed', targetEndDate: day('2026-09-01') }),
      projectRow({ id: 'arch', status: 'archived', targetEndDate: day('2026-09-01') }),
      projectRow({ id: 'undated', targetEndDate: null }),
    ];
    expect(computePortfolioStats(rows, NOW).wrappingUpSoonCount).toBe(0);
  });

  it('excludes lifecycle-completed/archived projects from wrapping up soon even with a near target date', () => {
    // Lifecycle transitions leave `status` unchanged, so status-only guards would
    // miss these; the count derives its exclusion from the shared status bucket.
    const rows = [
      projectRow({ id: 'life-done', lifecycle: 'completed', status: 'active', targetEndDate: day('2026-09-10') }),
      projectRow({ id: 'life-arch', lifecycle: 'archived', status: 'active', targetEndDate: day('2026-09-10') }),
    ];
    expect(computePortfolioStats(rows, NOW).wrappingUpSoonCount).toBe(0);
  });

  it('counts completed via lifecycle OR status, without double counting', () => {
    const rows = [
      projectRow({ id: 'a', lifecycle: 'completed', status: 'active' }),
      projectRow({ id: 'b', lifecycle: 'published', status: 'completed' }),
      projectRow({ id: 'c', lifecycle: 'completed', status: 'completed' }),
      projectRow({ id: 'd', lifecycle: 'published', status: 'active' }),
    ];
    expect(computePortfolioStats(rows, NOW).completedCount).toBe(3);
  });

  it('counts a lifecycle-completed/status-active project as Completed and not active (donut parity)', () => {
    const rows = [projectRow({ id: 'a', lifecycle: 'completed', status: 'active' })];
    const stats = computePortfolioStats(rows, NOW);
    // Same set the donut buckets as Completed: card and donut can never disagree.
    expect(stats.completedCount).toBe(1);
    expect(stats.activeCount).toBe(0);
  });
});

describe('PortfolioStats', () => {
  it('renders the four metric cards with their numbers', () => {
    const rows = [
      projectRow({ id: 'a', lifecycle: 'published', status: 'active', progressPct: 50 }),
      projectRow({
        id: 'b',
        lifecycle: 'published',
        status: 'active',
        progressPct: 30,
        targetEndDate: day('2026-09-01'),
      }),
      projectRow({ id: 'c', lifecycle: 'completed', status: 'completed' }),
    ];
    render(<PortfolioStats projects={rows} now={NOW} />);

    expect(screen.getByText('In flight')).toBeInTheDocument();
    expect(screen.getByText('Wrapping up soon')).toBeInTheDocument();
    expect(screen.getAllByText('Overall completion').length).toBeGreaterThan(0);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    // Overall completion averages the two active projects: (50 + 30) / 2 = 40%.
    expect(screen.getAllByText('40%').length).toBeGreaterThan(0);
  });

  it('has no axe violations', async () => {
    const rows = [projectRow()];
    const { container } = render(<PortfolioStats projects={rows} now={NOW} />);

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

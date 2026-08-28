/**
 * ProjectForm (#138 slice): focuses on the optional free-text `description`
 * field — that it renders as a labelled textarea, round-trips a value into the
 * submitted `values`, seeds from an existing project, and enforces the
 * client-side 5000-char guard that mirrors `firestore.rules`.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectForm } from './ProjectForm.tsx';
import type { IProjectRow } from './useProjects.ts';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Bungalow build',
    description: '',
    code: '',
    vertical: 'construction',
    lifecycle: 'draft',
    status: 'planning',
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: new Date('2026-07-01T00:00:00'),
    targetEndDate: null,
    updatedAt: null,
    progressPct: 0,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: true,
    collaboratorsCount: 0,
    tags: [],
    ...overrides,
  };
}

describe('ProjectForm description field', () => {
  it('renders a labelled description textarea', () => {
    render(
      <ProjectForm submitLabel="Create draft" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
  });

  it('includes the trimmed description in the submitted values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectForm submitLabel="Create draft" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Name'), 'Riverside Villa');
    await userEvent.type(
      screen.getByLabelText('Description (optional)'),
      '  Two-storey coastal villa.  ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Riverside Villa',
        description: 'Two-storey coastal villa.',
      }),
    );
  });

  it('seeds the description from an existing project when editing', () => {
    render(
      <ProjectForm
        project={projectRow({ description: 'Existing summary text.' })}
        submitLabel="Save changes"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Description (optional)')).toHaveValue(
      'Existing summary text.',
    );
  });

  it('blocks submitting a description longer than 5000 characters', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectForm submitLabel="Create draft" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Name'), 'Riverside Villa');
    await userEvent.click(screen.getByLabelText('Description (optional)'));
    await userEvent.paste('x'.repeat(5001));
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(screen.getByText(/at most 5000 characters/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts a description exactly at the 5000-character limit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectForm submitLabel="Create draft" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Name'), 'Riverside Villa');
    await userEvent.click(screen.getByLabelText('Description (optional)'));
    await userEvent.paste('x'.repeat(5000));
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'x'.repeat(5000) }),
    );
  });
});

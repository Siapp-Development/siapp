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
  const base = {
    id: 'p1',
    name: 'Bungalow build',
    description: '',
    code: '',
    vertical: 'construction' as const,
    lifecycle: 'draft' as const,
    status: 'planning' as const,
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
    tags: [] as string[],
    ...overrides,
  };
  const clientIds = overrides.clientIds ?? (base.clientId !== '' ? [base.clientId] : []);
  const clients =
    overrides.clients ?? clientIds.map((id) => ({ id, name: base.clientNameDenorm }));
  return { ...base, clientIds, clients };
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

describe('ProjectForm multi-client picker (#157)', () => {
  const CLIENTS = [
    { id: 'c1', name: 'Ann Lee', notificationsOptOut: false },
    { id: 'c2', name: 'Ben Tan', notificationsOptOut: false },
    { id: 'c3', name: 'Cara Ng', notificationsOptOut: false },
    { id: 'c4', name: 'Dev Rao', notificationsOptOut: false },
    { id: 'c5', name: 'Eve Sim', notificationsOptOut: false },
    { id: 'c6', name: 'Fay Goh', notificationsOptOut: false },
  ];

  it('adds multiple clients as chips and submits clientIds + clients', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectForm
        submitLabel="Create draft"
        clients={CLIENTS}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText('Name'), 'Partners Villa');
    await userEvent.selectOptions(screen.getByLabelText('Clients (optional)'), 'c1');
    await userEvent.selectOptions(screen.getByLabelText('Clients (optional)'), 'c2');

    const chips = screen.getByRole('list', { name: /linked clients/i });
    expect(chips).toHaveTextContent('Ann Lee');
    expect(chips).toHaveTextContent('Ben Tan');

    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        clientIds: ['c1', 'c2'],
        clients: [
          { id: 'c1', name: 'Ann Lee' },
          { id: 'c2', name: 'Ben Tan' },
        ],
      }),
    );
  });

  it('removes a linked client via its chip', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectForm
        submitLabel="Create draft"
        clients={CLIENTS}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText('Name'), 'Partners Villa');
    await userEvent.selectOptions(screen.getByLabelText('Clients (optional)'), 'c1');
    await userEvent.click(screen.getByRole('button', { name: /remove ann lee/i }));
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ clientIds: [], clients: [] }),
    );
  });

  it('caps the picker at 5 clients (#157 D2)', async () => {
    render(
      <ProjectForm
        submitLabel="Create draft"
        clients={CLIENTS}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const picker = screen.getByLabelText('Clients (optional)');
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      await userEvent.selectOptions(picker, id);
    }

    expect(picker).toBeDisabled();
    expect(screen.getByRole('option', { name: /client limit reached/i })).toBeInTheDocument();
  });
});

/**
 * TaskAssigneeBulkPicker (#156): lists teammates + active collaborators, filters
 * by name, and emits a TTaskAssignee shaped like the detail-panel selects.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { IMemberRow } from '../../settings/useTeamData.ts';
import type { ICollaboratorRow } from '../../collaborators/useCollaborators.ts';
import { TaskAssigneeBulkPicker } from './TaskAssigneeBulkPicker.tsx';

function member(overrides: Partial<IMemberRow> = {}): IMemberRow {
  return {
    uid: 'u1',
    email: 'a@x.com',
    displayName: 'Alice Tan',
    role: 'pm',
    departments: [],
    seatActive: true,
    ...overrides,
  };
}

function collaborator(overrides: Partial<ICollaboratorRow> = {}): ICollaboratorRow {
  return {
    id: 'c1',
    name: 'Acme Co',
    phone: '+100',
    email: '',
    company: '',
    trade: '',
    type: 'individual',
    status: 'active',
    notificationsOptOut: false,
    lastTaskAt: null,
    waConsentGranted: null,
    waConsentRecordedAt: null,
    pdpaErased: false,
    ...overrides,
  };
}

describe('TaskAssigneeBulkPicker', () => {
  it('lists teammates and active collaborators as options', () => {
    render(
      <TaskAssigneeBulkPicker
        members={[member()]}
        collaborators={[collaborator()]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /Alice Tan/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Acme Co/ })).toBeInTheDocument();
  });

  it('excludes archived collaborators', () => {
    render(
      <TaskAssigneeBulkPicker
        members={[]}
        collaborators={[collaborator({ status: 'archived' })]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('option', { name: /Acme Co/ })).not.toBeInTheDocument();
  });

  it('emits a user assignee when a teammate is picked', async () => {
    const onSelect = vi.fn();
    render(
      <TaskAssigneeBulkPicker members={[member()]} collaborators={[]} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole('option', { name: /Alice Tan/ }));

    expect(onSelect).toHaveBeenCalledWith({ type: 'user', id: 'u1', name: 'Alice Tan' });
  });

  it('emits a collaborator assignee with phone when a collaborator is picked', async () => {
    const onSelect = vi.fn();
    render(
      <TaskAssigneeBulkPicker members={[]} collaborators={[collaborator()]} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole('option', { name: /Acme Co/ }));

    expect(onSelect).toHaveBeenCalledWith({
      type: 'collaborator',
      id: 'c1',
      name: 'Acme Co',
      phone: '+100',
    });
  });

  it('filters by the search field', async () => {
    render(
      <TaskAssigneeBulkPicker
        members={[member({ uid: 'u1', displayName: 'Alice Tan' }), member({ uid: 'u2', displayName: 'Bob Lee' })]}
        collaborators={[]}
        onSelect={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Filter people' }), 'bob');

    expect(screen.queryByRole('option', { name: /Alice Tan/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bob Lee/ })).toBeInTheDocument();
  });

  it('shows an empty message when nothing matches', async () => {
    render(<TaskAssigneeBulkPicker members={[member()]} collaborators={[]} onSelect={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Filter people' }), 'zzz');

    expect(screen.getByText('No people found.')).toBeInTheDocument();
  });

  it('disables options while a write is pending', () => {
    render(
      <TaskAssigneeBulkPicker members={[member()]} collaborators={[]} onSelect={vi.fn()} disabled />,
    );

    expect(screen.getByRole('option', { name: /Alice Tan/ })).toBeDisabled();
  });
});

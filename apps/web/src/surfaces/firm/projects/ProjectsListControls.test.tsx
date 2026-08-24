/**
 * ProjectsListControls (#111): presentational search + Date/Tags/Filters pills.
 * It reads the current params and emits a new params object; the page owns URL
 * sync. Tests verify each control produces the right onChange payload and that
 * the pill count badges reflect active filters.
 */

import type { TTagColor } from '@siapp/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectsListControls } from './ProjectsListControls.tsx';
import { DEFAULT_PROJECTS_LIST_PARAMS, type IProjectsListParams } from './projectsListFilter.ts';

function params(overrides: Partial<IProjectsListParams> = {}): IProjectsListParams {
  return { ...DEFAULT_PROJECTS_LIST_PARAMS, ...overrides };
}

const TAGS: ReadonlyMap<string, { name: string; color: TTagColor }> = new Map([
  ['t1', { name: 'Urgent', color: 'red' }],
  ['t2', { name: 'VIP', color: 'blue' }],
]);

function setup(overrides: {
  params?: IProjectsListParams;
  projectTags?: ReadonlyMap<string, { name: string; color: TTagColor }>;
  clients?: ReadonlyArray<{ id: string; name: string }>;
} = {}) {
  const onChange = vi.fn();
  render(
    <ProjectsListControls
      params={overrides.params ?? params()}
      onChange={onChange}
      projectTags={overrides.projectTags ?? TAGS}
      clients={overrides.clients ?? []}
    />,
  );
  return { onChange };
}

describe('ProjectsListControls — search', () => {
  it('has an accessible, labelled search box', () => {
    setup();

    expect(screen.getByRole('searchbox', { name: /search projects by title/i })).toBeInTheDocument();
  });

  it('emits the typed query on change', async () => {
    const { onChange } = setup();

    await userEvent.type(screen.getByRole('searchbox', { name: /search projects by title/i }), 'a');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: 'a' }));
  });
});

describe('ProjectsListControls — sort pill', () => {
  it('changes the sort key', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /sort: last updated/i }));
    await userEvent.click(screen.getByRole('radio', { name: 'Name' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: 'name' }));
  });

  it('changes the sort direction', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /sort: last updated/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Ascending' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dir: 'asc' }));
  });
});

describe('ProjectsListControls — tags pill', () => {
  it('lists the workspace project tags and toggles one into the filter', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /^tags/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /VIP/ }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['t2'] }));
  });

  it('shows an empty-state message when there are no project tags', async () => {
    setup({ projectTags: new Map() });

    await userEvent.click(screen.getByRole('button', { name: /^tags/i }));

    expect(screen.getByText('No project tags yet.')).toBeInTheDocument();
  });

  it('badges the tags pill with the number of selected tags', () => {
    setup({ params: params({ tags: ['t1', 't2'] }) });

    expect(screen.getByRole('button', { name: /tags 2/i })).toBeInTheDocument();
  });
});

describe('ProjectsListControls — filters pill', () => {
  it('toggles a lifecycle filter', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /^filters/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Draft' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lifecycles: ['draft'] }));
  });

  it('toggles a status filter', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /^filters/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Active' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['active'] }));
  });

  it('toggles a vertical filter', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /^filters/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Legal' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ verticals: ['legal'] }));
  });

  it('toggles the has-overdue-tasks filter', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /^filters/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Has overdue tasks' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ overdueOnly: true }));
  });

  it('renders a client filter section only when clients exist', async () => {
    const { onChange } = setup({ clients: [{ id: 'c1', name: 'Ahmad Corp' }] });

    await userEvent.click(screen.getByRole('button', { name: /^filters/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ahmad Corp' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ clientIds: ['c1'] }));
  });

  it('badges the filters pill with the active-filter count', () => {
    setup({ params: params({ lifecycles: ['draft'], statuses: ['active'], overdueOnly: true }) });

    expect(screen.getByRole('button', { name: /filters 3/i })).toBeInTheDocument();
  });
});

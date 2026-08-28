/**
 * ProjectActionsMenu (#138): the project header ⋯ overflow menu. Verifies the
 * WAI-ARIA menu-button semantics (haspopup, roving focus, Escape), the shared
 * D-027 lifecycle/role gating, and that items call the right callable / prop.
 * The `setProjectLifecycle` callable is mocked at the boundary; axe runs on the
 * open menu.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callables = vi.hoisted(() => ({
  setProjectLifecycle: vi.fn(),
  projectErrorCode: vi.fn(() => null as string | null),
}));

vi.mock('@/lib/callables.ts', () => ({
  setProjectLifecycle: callables.setProjectLifecycle,
  projectErrorCode: callables.projectErrorCode,
}));

import { ProjectActionsMenu } from './ProjectActionsMenu.tsx';
import type { IProjectRow } from './useProjects.ts';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Bungalow build',
    description: '',
    code: '',
    vertical: 'construction',
    lifecycle: 'published',
    status: 'active',
    clientId: 'c1',
    clientNameDenorm: 'Ahmad',
    ownerNameDenorm: 'Alice Tan',
    startDate: null,
    targetEndDate: null,
    updatedAt: null,
    progressPct: 40,
    totalTasks: 5,
    doneTasks: 2,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: true,
    collaboratorsCount: 0,
    tags: [],
    ...overrides,
  };
}

function renderMenu(
  project: IProjectRow,
  role: 'owner' | 'admin' | 'pm' | 'viewer',
  onShowPortalLink = vi.fn(),
) {
  render(
    <ProjectActionsMenu
      workspaceId="wksA"
      project={project}
      role={role}
      onShowPortalLink={onShowPortalLink}
    />,
  );
  return { onShowPortalLink };
}

beforeEach(() => {
  vi.clearAllMocks();
  callables.projectErrorCode.mockReturnValue(null);
});

describe('ProjectActionsMenu', () => {
  it('renders a menu trigger with aria-haspopup for a published owner', () => {
    renderMenu(projectRow(), 'owner');

    const trigger = screen.getByRole('button', { name: 'Project actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders nothing when no action is available (draft as pm)', () => {
    const { container } = render(
      <ProjectActionsMenu
        workspaceId="wksA"
        project={projectRow({ lifecycle: 'draft' })}
        role="pm"
        onShowPortalLink={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows all three items for a published owner and focuses the first on open', async () => {
    renderMenu(projectRow(), 'owner');

    await userEvent.click(screen.getByRole('button', { name: 'Project actions' }));

    const items = screen.getAllByRole('menuitem');
    expect(items.map((el) => el.textContent)).toEqual([
      'Mark as Completed',
      'Archive Project',
      'Copy client link',
    ]);
    await waitFor(() => expect(items[0]).toHaveFocus());
  });

  it('hides Archive for a published pm (owner/admin only)', async () => {
    renderMenu(projectRow(), 'pm');

    await userEvent.click(screen.getByRole('button', { name: 'Project actions' }));

    expect(screen.getByRole('menuitem', { name: 'Mark as Completed' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Archive Project' })).not.toBeInTheDocument();
  });

  it('omits Copy client link when no client is linked', async () => {
    renderMenu(projectRow({ clientId: '' }), 'owner');

    await userEvent.click(screen.getByRole('button', { name: 'Project actions' }));

    expect(screen.queryByRole('menuitem', { name: 'Copy client link' })).not.toBeInTheDocument();
  });

  it('moves focus with ArrowDown/ArrowUp and closes on Escape', async () => {
    renderMenu(projectRow(), 'owner');
    const trigger = screen.getByRole('button', { name: 'Project actions' });

    await userEvent.click(trigger);
    const items = screen.getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());

    await userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(items[0]).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('calls setProjectLifecycle when Mark as Completed is clicked', async () => {
    callables.setProjectLifecycle.mockResolvedValue({ lifecycle: 'completed' });
    renderMenu(projectRow(), 'owner');

    await userEvent.click(screen.getByRole('button', { name: 'Project actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark as Completed' }));

    expect(callables.setProjectLifecycle).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      projectId: 'p1',
      action: 'complete',
    });
  });

  it('reveals the portal link card when Copy client link is clicked', async () => {
    const { onShowPortalLink } = renderMenu(projectRow(), 'owner');

    await userEvent.click(screen.getByRole('button', { name: 'Project actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy client link' }));

    expect(onShowPortalLink).toHaveBeenCalledTimes(1);
    expect(callables.setProjectLifecycle).not.toHaveBeenCalled();
  });

  it('has no axe violations when open', async () => {
    const { container } = render(
      <ProjectActionsMenu
        workspaceId="wksA"
        project={projectRow()}
        role="owner"
        onShowPortalLink={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Project actions' }));
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

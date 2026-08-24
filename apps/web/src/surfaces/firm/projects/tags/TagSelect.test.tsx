/**
 * TagSelect (D-041): the reusable, scope-agnostic tag combobox. Verifies chip
 * rendering (incl. orphan-safe id filtering), selecting/creating/removing tags,
 * keyboard interaction, the delete-from-options confirm flow, read-only mode,
 * and that the same component serves both the project and task pools. Axe is
 * run on the open combobox.
 */

import type { TTagColor } from '@siapp/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { TagSelect } from './TagSelect.tsx';

function tagMap(
  entries: Array<[string, { name: string; color: TTagColor }]>,
): ReadonlyMap<string, { name: string; color: TTagColor }> {
  return new Map(entries);
}

const REGISTRY = tagMap([
  ['t1', { name: 'Urgent', color: 'red' }],
  ['t2', { name: 'VIP', color: 'blue' }],
  ['t3', { name: 'Backlog', color: 'slate' }],
]);

interface ISetupOverrides {
  allTags?: ReadonlyMap<string, { name: string; color: TTagColor }>;
  value?: string[];
  canEdit?: boolean;
  label?: string;
  onCreateTag?: (name: string, color: TTagColor) => Promise<string>;
  onDeleteTag?: (tagId: string) => Promise<void>;
}

function setup(overrides: ISetupOverrides = {}) {
  const onChange = vi.fn();
  const onCreateTag = overrides.onCreateTag ?? vi.fn().mockResolvedValue('new-tag');
  const onDeleteTag = overrides.onDeleteTag ?? vi.fn().mockResolvedValue(undefined);
  render(
    <TagSelect
      allTags={overrides.allTags ?? REGISTRY}
      value={overrides.value ?? []}
      onChange={onChange}
      onCreateTag={onCreateTag}
      onDeleteTag={onDeleteTag}
      canEdit={overrides.canEdit ?? true}
      label={overrides.label ?? 'Project tags'}
    />,
  );
  return { onChange, onCreateTag, onDeleteTag };
}

describe('TagSelect — chips', () => {
  it('renders a dismissible chip for each selected id that resolves in the registry', () => {
    setup({ value: ['t1', 't2'] });

    expect(screen.getByRole('button', { name: 'Remove Urgent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove VIP' })).toBeInTheDocument();
  });

  it('silently ignores orphaned ids that no longer exist in the registry', () => {
    setup({ value: ['t1', 'deleted-orphan'] });

    expect(screen.getByRole('button', { name: 'Remove Urgent' })).toBeInTheDocument();
    expect(screen.queryByText('deleted-orphan')).not.toBeInTheDocument();
  });

  it('removes a chip via its × button, emitting the id-less selection', async () => {
    const { onChange } = setup({ value: ['t1', 't2'] });

    await userEvent.click(screen.getByRole('button', { name: 'Remove Urgent' }));

    expect(onChange).toHaveBeenCalledWith(['t2']);
  });
});

describe('TagSelect — read-only mode', () => {
  it('renders selected chips as a static list without an add trigger', () => {
    setup({ value: ['t1'], canEdit: false });

    expect(screen.getByRole('list', { name: 'Project tags' })).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add project tags/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Urgent' })).not.toBeInTheDocument();
  });

  it('renders nothing when there are no selected tags', () => {
    const { container } = render(
      <TagSelect
        allTags={REGISTRY}
        value={[]}
        onChange={vi.fn()}
        onCreateTag={vi.fn()}
        onDeleteTag={vi.fn()}
        canEdit={false}
        label="Project tags"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('TagSelect — selecting tags', () => {
  it('opens the listbox from the dashed + trigger', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Project tags' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Urgent/ })).toBeInTheDocument();
  });

  it('adds an existing tag by clicking its option', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    await userEvent.click(screen.getByRole('option', { name: 'VIP' }));

    expect(onChange).toHaveBeenCalledWith(['t2']);
  });

  it('filters options by the typed query', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    await userEvent.type(screen.getByRole('combobox'), 'vip');

    expect(screen.getByRole('option', { name: /VIP/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Urgent/ })).not.toBeInTheDocument();
  });

  it('removes the last selected tag on Backspace with an empty query', async () => {
    const { onChange } = setup({ value: ['t1', 't2'] });

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    await userEvent.keyboard('{Backspace}');

    expect(onChange).toHaveBeenCalledWith(['t1']);
  });
});

describe('TagSelect — inline create', () => {
  it('offers a "Create" row for a non-matching query and creates on Enter', async () => {
    const onCreateTag = vi.fn().mockResolvedValue('created-id');
    const { onChange } = setup({ onCreateTag });

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    await userEvent.type(screen.getByRole('combobox'), 'Blocker');

    expect(screen.getByRole('option', { name: /Create/ })).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');

    expect(onCreateTag).toHaveBeenCalledWith('Blocker', expect.any(String));
    // The freshly-created id is appended to the selection.
    expect(onChange).toHaveBeenCalledWith(['created-id']);
  });

  it('does NOT offer a create row when the query exactly matches an existing tag', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    await userEvent.type(screen.getByRole('combobox'), 'Urgent');

    expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument();
  });
});

describe('TagSelect — keyboard navigation', () => {
  it('moves the active option with ArrowDown and selects with Enter', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    // Options are sorted alphabetically: Backlog, Urgent, VIP.
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith(['t1']); // Urgent is index 1
  });

  it('closes the listbox on Escape', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('TagSelect — delete from options', () => {
  it('asks for confirmation, then deletes the tag from the registry everywhere', async () => {
    const onDeleteTag = vi.fn().mockResolvedValue(undefined);
    const { onChange } = setup({ value: ['t1'], onDeleteTag });

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Urgent tag' }));

    const dialog = screen.getByRole('dialog', { name: /delete this tag/i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(onDeleteTag).toHaveBeenCalledWith('t1');
    // The deleted id is also pruned from the current selection.
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('cancels the delete without calling onDeleteTag', async () => {
    const onDeleteTag = vi.fn().mockResolvedValue(undefined);
    setup({ value: ['t1'], onDeleteTag });

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Urgent tag' }));
    const dialog = screen.getByRole('dialog', { name: /delete this tag/i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onDeleteTag).not.toHaveBeenCalled();
  });

  it('surfaces an error if the delete fails and keeps the tag selected', async () => {
    const onDeleteTag = vi.fn().mockRejectedValue(new Error('nope'));
    const { onChange } = setup({ value: ['t1'], onDeleteTag });

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Urgent tag' }));
    const dialog = screen.getByRole('dialog', { name: /delete this tag/i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/could not delete this tag/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('TagSelect — scope independence', () => {
  it('works for the task pool with a task-scoped label and add trigger', async () => {
    const { onChange } = setup({ label: 'Task tags' });

    await userEvent.click(screen.getByRole('button', { name: 'Add task tags' }));
    expect(screen.getByRole('listbox', { name: 'Task tags' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: 'Urgent' }));
    expect(onChange).toHaveBeenCalledWith(['t1']);
  });
});

describe('TagSelect — accessibility', () => {
  it('has no axe violations with the combobox open', async () => {
    const { container } = render(
      <TagSelect
        allTags={REGISTRY}
        value={['t1']}
        onChange={vi.fn()}
        onCreateTag={vi.fn()}
        onDeleteTag={vi.fn()}
        canEdit
        label="Project tags"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));

    // Full a11y assertion for the open combobox. `nested-interactive` is NOT
    // disabled: listbox options are non-interactive `role="option"` rows whose
    // per-option Delete control is a sibling (not a descendant) of the option.
    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });

  // Regression guard (WCAG 4.1.2): no listbox option may contain a focusable
  // control. Selection is driven by `aria-activedescendant`/Enter on the input
  // and the Delete affordance sits outside the `role="option"` node.
  it('open combobox options must not contain nested interactive controls', async () => {
    const { container } = render(
      <TagSelect
        allTags={REGISTRY}
        value={['t1']}
        onChange={vi.fn()}
        onCreateTag={vi.fn()}
        onDeleteTag={vi.fn()}
        canEdit
        label="Project tags"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add project tags' }));

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});

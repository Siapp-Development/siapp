/**
 * Reusable, scope-agnostic tag combobox (D-041). Renders the selected tags as
 * dismissible chips plus a dashed `+` trigger that opens a Popover listbox
 * with a filter input, the existing coloured options, an inline
 * "Create '<x>'" row, and a per-option delete (removes the tag from the
 * registry everywhere, behind a confirm). Follows the WAI-ARIA combobox +
 * listbox pattern. One component serves both the project and task pools — the
 * caller wires it to `useTags(wid, scope)` outputs.
 */

import type { TTagColor } from '@siapp/shared';
import { Button, ConfirmDialog, Input, Popover, cn, tagColorClasses } from '@siapp/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { normalizeTagName, nextTagColor } from './useTags.ts';
import { TagChip } from './TagChip.tsx';

export interface ITagSelectProps {
  /** The full registry pool from `useTags(wid, scope)`. */
  allTags: ReadonlyMap<string, { name: string; color: TTagColor }>;
  /** Selected tag ids. */
  value: string[];
  /** Persist the new selection (project/task writer). */
  onChange: (tagIds: string[]) => void;
  /** Create a tag in this registry; resolves to the new tag id. */
  onCreateTag: (name: string, color: TTagColor) => Promise<string>;
  /** Delete a tag from this registry (confirmed by this component). */
  onDeleteTag: (tagId: string) => Promise<void>;
  /** Read-only chips when false. */
  canEdit: boolean;
  /** Accessible label, e.g. "Project tags" / "Task tags". */
  label: string;
}

type TOptionItem =
  | { kind: 'tag'; id: string; name: string; color: TTagColor }
  | { kind: 'create'; name: string };

export function TagSelect({
  allTags,
  value,
  onChange,
  onCreateTag,
  onDeleteTag,
  canEdit,
  label,
}: ITagSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);

  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Only ids that still resolve against the live registry render as chips —
  // orphaned ids (deleted tag) are filtered on read (D-041).
  const selectedChips = value
    .map((id) => {
      const entry = allTags.get(id);
      return entry === null || entry === undefined ? null : { id, ...entry };
    })
    .filter((chip): chip is { id: string; name: string; color: TTagColor } => chip !== null);

  const options = useMemo<TOptionItem[]>(() => {
    const trimmed = query.trim();
    const normalized = normalizeTagName(trimmed);
    const tagOptions: TOptionItem[] = [...allTags.entries()]
      .filter(([, entry]) => entry.name.toLowerCase().includes(normalized))
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, entry]) => ({ kind: 'tag', id, name: entry.name, color: entry.color }));
    const hasExact = [...allTags.values()].some(
      (entry) => normalizeTagName(entry.name) === normalized,
    );
    if (trimmed !== '' && !hasExact) {
      tagOptions.push({ kind: 'create', name: trimmed });
    }
    return tagOptions;
  }, [allTags, query]);

  // Keep the active option within bounds as the list filters.
  useEffect(() => {
    setActiveIndex((current) => (current >= options.length ? Math.max(0, options.length - 1) : current));
  }, [options.length]);

  // Focus the filter input when the popover opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  function closePopover(): void {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  function toggleTag(id: string): void {
    onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id]);
  }

  async function handleCreate(name: string): Promise<void> {
    setCreating(true);
    try {
      const newId = await onCreateTag(name, nextTagColor(allTags.size));
      onChange([...value, newId]);
      setQuery('');
      setActiveIndex(0);
    } finally {
      setCreating(false);
    }
  }

  function activateOption(option: TOptionItem): void {
    if (option.kind === 'create') {
      void handleCreate(option.name);
      return;
    }
    toggleTag(option.id);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (options.length === 0 ? 0 : (current + 1) % options.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        options.length === 0 ? 0 : (current - 1 + options.length) % options.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option !== undefined) {
        activateOption(option);
      }
    } else if (event.key === 'Backspace' && query === '' && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  async function confirmDelete(): Promise<void> {
    if (pendingDelete === null) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteTag(pendingDelete.id);
      onChange(value.filter((id) => id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      setDeleteError('Could not delete this tag. Try again.');
    } finally {
      setDeleting(false);
    }
  }

  if (!canEdit) {
    if (selectedChips.length === 0) {
      return null;
    }
    return (
      <ul aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {selectedChips.map((chip) => (
          <li key={chip.id}>
            <TagChip name={chip.name} color={chip.color} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {selectedChips.map((chip) => (
        <TagChip
          key={chip.id}
          name={chip.name}
          color={chip.color}
          onRemove={() => toggleTag(chip.id)}
        />
      ))}
      <Popover
        open={open}
        onClose={closePopover}
        trigger={
          <button
            type="button"
            aria-label={`Add ${label.toLowerCase()}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        }
      >
        <div className="w-64">
          <label htmlFor={`${listboxId}-input`} className="sr-only">
            Filter or create {label.toLowerCase()}
          </label>
          <Input
            id={`${listboxId}-input`}
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              options.length > 0 ? `${listboxId}-opt-${activeIndex}` : undefined
            }
            value={query}
            placeholder="Filter or add…"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            className="h-9"
          />
          {/*
            Visible option rows live in a plain list; the accessible listbox is
            a separate element that OWNS the option nodes via `aria-owns`. This
            keeps each per-option Delete button a sibling of its `role="option"`
            node — so it is neither a descendant of the option (which would trip
            axe `nested-interactive`, WCAG 4.1.2) nor a descendant of the
            listbox (which would trip `aria-required-children`). Selection is
            driven by click + `aria-activedescendant`/Enter on the input.
          */}
          <span
            id={listboxId}
            role="listbox"
            aria-label={label}
            aria-owns={
              options.length > 0
                ? options.map((_, index) => `${listboxId}-opt-${index}`).join(' ')
                : undefined
            }
            className="sr-only"
          />
          <div className="mt-1 max-h-56 overflow-auto">
            {options.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                No tags yet — type to create one.
              </p>
            ) : (
              <div className="flex flex-col">
                {options.map((option, index) => {
                  const isActive = index === activeIndex;
                  const optionId = `${listboxId}-opt-${index}`;
                  if (option.kind === 'create') {
                    return (
                      <div
                        key="__create"
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn('rounded-md', isActive && 'bg-primary-tint')}
                      >
                        <div
                          id={optionId}
                          role="option"
                          aria-selected={false}
                          onClick={() => activateOption(option)}
                          className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-sm"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                          <span>{creating ? 'Creating…' : `Create “${option.name}”`}</span>
                        </div>
                      </div>
                    );
                  }
                  const selected = value.includes(option.id);
                  return (
                    <div
                      key={option.id}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'relative flex items-center rounded-md',
                        isActive && 'bg-primary-tint',
                      )}
                    >
                      <div
                        id={optionId}
                        role="option"
                        aria-selected={selected}
                        onClick={() => activateOption(option)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 pl-2 pr-9 text-sm"
                      >
                        <span
                          aria-hidden
                          className={cn('h-3 w-3 shrink-0 rounded-full', tagColorClasses(option.color).chip)}
                        />
                        <span className="truncate">{option.name}</span>
                        {selected && <span className="ml-auto text-primary" aria-hidden>✓</span>}
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete ${option.name} tag`}
                        onClick={() => {
                          setDeleteError(null);
                          setPendingDelete({ id: option.id, name: option.name });
                        }}
                        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-tint hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-1 flex justify-end border-t border-border pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={closePopover}>
              Done
            </Button>
          </div>
        </div>
      </Popover>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this tag?"
        description={
          pendingDelete !== null
            ? `“${pendingDelete.name}” will be removed from every project or task that uses it. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        variant="destructive"
        pending={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}

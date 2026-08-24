/**
 * Read-only list of resolved tag chips (D-041). Joins a doc's `tags` (tagIds)
 * against the live registry map and renders coloured `TagChip`s, skipping
 * orphaned ids (their registry doc was deleted). Renders nothing when no tag
 * resolves, so callers don't need to guard on emptiness.
 */

import { cn } from '@siapp/ui';

import { TagChip } from './TagChip.tsx';
import type { ITagEntry } from './useTags.ts';

export interface ITagChipListProps {
  /** Tag ids stored on the project/task doc. */
  tagIds: readonly string[];
  /** Live registry map (tagId → name + colour); orphaned ids are skipped. */
  tags: ReadonlyMap<string, ITagEntry>;
  /** Accessible name for the tag group (e.g. the project/task title). */
  label: string;
  className?: string;
}

export function TagChipList({ tagIds, tags, label, className }: ITagChipListProps) {
  const resolved = tagIds
    .map((id) => ({ id, entry: tags.get(id) }))
    .filter((t): t is { id: string; entry: ITagEntry } => t.entry !== undefined);

  if (resolved.length === 0) {
    return null;
  }

  return (
    <ul aria-label={`Tags for ${label}`} className={cn('flex flex-wrap items-center gap-1', className)}>
      {resolved.map(({ id, entry }) => (
        <li key={id}>
          <TagChip name={entry.name} color={entry.color} />
        </li>
      ))}
    </ul>
  );
}

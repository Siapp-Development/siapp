/**
 * TagChipList (D-041): read-only resolution of a doc's tag ids against the live
 * registry map. Verifies chips render in order, orphaned ids are skipped, an
 * accessible group label is applied, and nothing renders when no id resolves.
 */

import type { TTagColor } from '@siapp/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TagChipList } from './TagChipList.tsx';

function tagMap(
  entries: Array<[string, { name: string; color: TTagColor }]>,
): ReadonlyMap<string, { name: string; color: TTagColor }> {
  return new Map(entries);
}

const REGISTRY = tagMap([
  ['t1', { name: 'Urgent', color: 'red' }],
  ['t2', { name: 'VIP', color: 'blue' }],
]);

describe('TagChipList', () => {
  it('renders a chip for each resolved tag id, in order', () => {
    render(<TagChipList tagIds={['t1', 't2']} tags={REGISTRY} label="Site survey" />);
    const list = screen.getByRole('list', { name: 'Tags for Site survey' });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(list).toHaveTextContent('Urgent');
    expect(list).toHaveTextContent('VIP');
  });

  it('skips orphaned ids that are not in the registry', () => {
    render(<TagChipList tagIds={['t1', 'gone']} tags={REGISTRY} label="Site survey" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.queryByText('gone')).not.toBeInTheDocument();
  });

  it('renders nothing when no id resolves', () => {
    const { container } = render(
      <TagChipList tagIds={['gone']} tags={REGISTRY} label="Site survey" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no tags', () => {
    const { container } = render(<TagChipList tagIds={[]} tags={REGISTRY} label="Site survey" />);
    expect(container).toBeEmptyDOMElement();
  });
});

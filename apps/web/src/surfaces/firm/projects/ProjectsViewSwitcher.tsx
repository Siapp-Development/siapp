/**
 * Projects view switcher (#166): a thin wrapper over the shared `@siapp/ui`
 * `SegmentedControl` (an accessible ARIA radio group, keyboard operable) that
 * toggles the List / Table / Timeline views. The selected view is URL-driven —
 * the parent owns the `view` search param and passes `value`/`onChange`.
 */

import { SegmentedControl } from '@siapp/ui';

import type { TProjectsView } from './projectsView.ts';

const VIEW_OPTIONS: ReadonlyArray<{ value: TProjectsView; label: string }> = [
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
  { value: 'timeline', label: 'Timeline' },
];

interface IProjectsViewSwitcherProps {
  value: TProjectsView;
  onChange: (view: TProjectsView) => void;
}

export function ProjectsViewSwitcher({ value, onChange }: IProjectsViewSwitcherProps) {
  return (
    <SegmentedControl
      aria-label="Projects view"
      value={value}
      onChange={onChange}
      options={VIEW_OPTIONS}
      size="sm"
    />
  );
}

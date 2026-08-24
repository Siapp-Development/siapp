/**
 * Projects-list search + Date/Tags/Filters pill controls (#111). Presentational
 * only — reads the current params and emits a new params object; the page owns
 * URL sync. All dropdowns use the accessible `Popover` primitive.
 */

import type { TProjectStatus, TProjectVertical, TTagColor } from '@siapp/shared';
import { Button, Input, Popover, cn, tagColorClasses } from '@siapp/ui';
import { ChevronDown, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { LIFECYCLE_LABELS, STATUS_LABELS, VERTICAL_LABELS } from './projectLabels.ts';
import {
  FILTERABLE_LIFECYCLES,
  activeFilterCount,
  type IProjectsListParams,
  type TProjectSortKey,
} from './projectsListFilter.ts';

const SORT_LABELS: Record<TProjectSortKey, string> = {
  updated: 'Last updated',
  start: 'Start date',
  targetEnd: 'Target end date',
  name: 'Name',
  progress: '% complete',
};

const SORT_ORDER: TProjectSortKey[] = ['updated', 'start', 'targetEnd', 'name', 'progress'];
const STATUS_ORDER: TProjectStatus[] = ['planning', 'active', 'on_hold', 'completed', 'archived'];
const VERTICAL_ORDER: TProjectVertical[] = ['construction', 'legal', 'other'];

export interface IProjectsListControlsProps {
  params: IProjectsListParams;
  onChange: (next: IProjectsListParams) => void;
  projectTags: ReadonlyMap<string, { name: string; color: TTagColor }>;
  clients: ReadonlyArray<{ id: string; name: string }>;
}

interface IFilterPillProps {
  label: string;
  count?: number;
  children: ReactNode;
}

function FilterPill({ label, count = 0, children }: IFilterPillProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
            count > 0
              ? 'border-primary bg-primary-tint text-primary-deep'
              : 'border-border bg-card text-foreground hover:border-primary/40',
          )}
        >
          {label}
          {count > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
              {count}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      }
    >
      <div className="w-64 p-2">{children}</div>
    </Popover>
  );
}

interface ICheckboxRowProps {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function CheckboxRow({ checked, onToggle, children }: ICheckboxRowProps) {
  return (
    <label className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      {children}
    </label>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function ProjectsListControls({
  params,
  onChange,
  projectTags,
  clients,
}: IProjectsListControlsProps) {
  const tagOptions = [...projectTags.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <label htmlFor="projects-search" className="sr-only">
          Search projects by title
        </label>
        <Input
          id="projects-search"
          type="search"
          value={params.q}
          placeholder="Search projects by title…"
          onChange={(event) => onChange({ ...params, q: event.target.value })}
          className="pl-9"
        />
      </div>

      {/* Date pill — sort control. */}
      <FilterPill label={`Sort: ${SORT_LABELS[params.sort]}`}>
        <fieldset>
          <legend className="px-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Sort by
          </legend>
          {SORT_ORDER.map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name="projects-sort"
                checked={params.sort === key}
                onChange={() => onChange({ ...params, sort: key })}
              />
              {SORT_LABELS[key]}
            </label>
          ))}
        </fieldset>
        <div className="mt-2 border-t border-border pt-2">
          <span id="projects-sort-dir-label" className="px-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Direction
          </span>
          <div className="mt-1 flex gap-1" role="group" aria-labelledby="projects-sort-dir-label">
            <Button
              type="button"
              size="sm"
              variant={params.dir === 'asc' ? 'primary' : 'outline'}
              className="flex-1"
              onClick={() => onChange({ ...params, dir: 'asc' })}
            >
              {params.sort === 'name' ? 'A → Z' : 'Ascending'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={params.dir === 'desc' ? 'primary' : 'outline'}
              className="flex-1"
              onClick={() => onChange({ ...params, dir: 'desc' })}
            >
              {params.sort === 'name' ? 'Z → A' : 'Descending'}
            </Button>
          </div>
        </div>
      </FilterPill>

      {/* Tags pill — multi-select OR filter. */}
      <FilterPill label="Tags" count={params.tags.length}>
        <fieldset>
          <legend className="px-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Filter by tag
          </legend>
          {tagOptions.length === 0 && (
            <p className="px-1.5 py-1 text-sm text-muted-foreground">No project tags yet.</p>
          )}
          {tagOptions.map(([id, entry]) => (
            <CheckboxRow
              key={id}
              checked={params.tags.includes(id)}
              onToggle={() => onChange({ ...params, tags: toggle(params.tags, id) })}
            >
              <span
                aria-hidden
                className={cn('h-3 w-3 shrink-0 rounded-full', tagColorClasses(entry.color).chip)}
              />
              <span className="truncate">{entry.name}</span>
            </CheckboxRow>
          ))}
        </fieldset>
      </FilterPill>

      {/* Filters pill — lifecycle / status / vertical / client / overdue. */}
      <FilterPill label="Filters" count={activeFilterCount(params)}>
        <div className="max-h-80 overflow-auto">
          <fieldset>
            <legend className="px-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Lifecycle
            </legend>
            {FILTERABLE_LIFECYCLES.map((lifecycle) => (
              <CheckboxRow
                key={lifecycle}
                checked={params.lifecycles.includes(lifecycle)}
                onToggle={() =>
                  onChange({ ...params, lifecycles: toggle(params.lifecycles, lifecycle) })
                }
              >
                {LIFECYCLE_LABELS[lifecycle]}
              </CheckboxRow>
            ))}
          </fieldset>

          <fieldset className="mt-2 border-t border-border pt-2">
            <legend className="px-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </legend>
            {STATUS_ORDER.map((status) => (
              <CheckboxRow
                key={status}
                checked={params.statuses.includes(status)}
                onToggle={() => onChange({ ...params, statuses: toggle(params.statuses, status) })}
              >
                {STATUS_LABELS[status]}
              </CheckboxRow>
            ))}
          </fieldset>

          <fieldset className="mt-2 border-t border-border pt-2">
            <legend className="px-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Vertical
            </legend>
            {VERTICAL_ORDER.map((vertical) => (
              <CheckboxRow
                key={vertical}
                checked={params.verticals.includes(vertical)}
                onToggle={() =>
                  onChange({ ...params, verticals: toggle(params.verticals, vertical) })
                }
              >
                {VERTICAL_LABELS[vertical]}
              </CheckboxRow>
            ))}
          </fieldset>

          {clients.length > 0 && (
            <fieldset className="mt-2 border-t border-border pt-2">
              <legend className="px-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Client
              </legend>
              {clients.map((client) => (
                <CheckboxRow
                  key={client.id}
                  checked={params.clientIds.includes(client.id)}
                  onToggle={() =>
                    onChange({ ...params, clientIds: toggle(params.clientIds, client.id) })
                  }
                >
                  <span className="truncate">{client.name}</span>
                </CheckboxRow>
              ))}
            </fieldset>
          )}

          <div className="mt-2 border-t border-border pt-2">
            <CheckboxRow
              checked={params.overdueOnly}
              onToggle={() => onChange({ ...params, overdueOnly: !params.overdueOnly })}
            >
              Has overdue tasks
            </CheckboxRow>
          </div>
        </div>
      </FilterPill>
    </div>
  );
}

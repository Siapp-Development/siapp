/**
 * URL state for the Projects page view switcher (#166). The active view lives
 * on the `view` search param so it is shareable and survives back/forward. The
 * default (`list`) is omitted from the URL to keep it clean, mirroring the
 * `projectsListFilter` convention.
 */

export type TProjectsView = 'list' | 'table' | 'timeline';

export const DEFAULT_PROJECTS_VIEW: TProjectsView = 'list';

const PROJECTS_VIEWS: readonly TProjectsView[] = ['list', 'table', 'timeline'];

function isProjectsView(value: string): value is TProjectsView {
  return (PROJECTS_VIEWS as readonly string[]).includes(value);
}

/** Read the active view from the URL, falling back to `list` for anything unknown. */
export function parseProjectsView(sp: URLSearchParams): TProjectsView {
  const raw = sp.get('view');
  if (raw !== null && isProjectsView(raw)) {
    return raw;
  }
  return DEFAULT_PROJECTS_VIEW;
}

/**
 * Write the active view onto a copy of `sp`, preserving all other params. The
 * default view is omitted so the URL stays clean.
 */
export function writeProjectsView(sp: URLSearchParams, view: TProjectsView): URLSearchParams {
  const next = new URLSearchParams(sp);
  if (view === DEFAULT_PROJECTS_VIEW) {
    next.delete('view');
  } else {
    next.set('view', view);
  }
  return next;
}

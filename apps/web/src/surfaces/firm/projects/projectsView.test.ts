import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROJECTS_VIEW,
  parseProjectsView,
  writeProjectsView,
} from './projectsView.ts';

describe('parseProjectsView', () => {
  it('defaults to list when the param is absent', () => {
    expect(parseProjectsView(new URLSearchParams())).toBe('list');
    expect(DEFAULT_PROJECTS_VIEW).toBe('list');
  });

  it('reads a valid view', () => {
    expect(parseProjectsView(new URLSearchParams('view=table'))).toBe('table');
    expect(parseProjectsView(new URLSearchParams('view=timeline'))).toBe('timeline');
    expect(parseProjectsView(new URLSearchParams('view=list'))).toBe('list');
  });

  it('falls back to list for an unknown value', () => {
    expect(parseProjectsView(new URLSearchParams('view=board'))).toBe('list');
    expect(parseProjectsView(new URLSearchParams('view='))).toBe('list');
  });
});

describe('writeProjectsView', () => {
  it('omits the default view from the URL', () => {
    const sp = writeProjectsView(new URLSearchParams('view=table'), 'list');
    expect(sp.has('view')).toBe(false);
  });

  it('sets a non-default view', () => {
    const sp = writeProjectsView(new URLSearchParams(), 'timeline');
    expect(sp.get('view')).toBe('timeline');
  });

  it('preserves unrelated params', () => {
    const sp = writeProjectsView(new URLSearchParams('q=foo&tag=t1'), 'table');
    expect(sp.get('q')).toBe('foo');
    expect(sp.get('tag')).toBe('t1');
    expect(sp.get('view')).toBe('table');
  });

  it('round-trips write → parse', () => {
    for (const view of ['list', 'table', 'timeline'] as const) {
      const sp = writeProjectsView(new URLSearchParams(), view);
      expect(parseProjectsView(sp)).toBe(view);
    }
  });
});

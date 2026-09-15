import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectsViewSwitcher } from './ProjectsViewSwitcher.tsx';
import type { TProjectsView } from './projectsView.ts';

function Harness({ initial = 'list' as TProjectsView, onChange = vi.fn() }) {
  const [value, setValue] = useState<TProjectsView>(initial);
  return (
    <ProjectsViewSwitcher
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('ProjectsViewSwitcher', () => {
  it('renders an accessible radiogroup with the three views', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Projects view' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Table' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Timeline' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('invokes onChange when a view is selected', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Table' }));
    expect(onChange).toHaveBeenCalledWith('table');
    expect(screen.getByRole('radio', { name: 'Table' })).toHaveAttribute('aria-checked', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness />);
    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

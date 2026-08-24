/**
 * TaskStatusRing: the circular status indicator that replaced the status chip
 * on the task list. Verifies each status keeps an accessible text label (so
 * status is never conveyed by colour/shape alone) and renders an SVG.
 */

import type { TTaskStatus } from '@siapp/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TASK_STATUS_LABELS } from './taskLabels.ts';
import { TaskStatusRing } from './TaskStatusRing.tsx';

const STATUSES: TTaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];

describe('TaskStatusRing', () => {
  it.each(STATUSES)('exposes an accessible label for the %s status', (status) => {
    const { container } = render(<TaskStatusRing status={status} />);
    expect(screen.getByText(TASK_STATUS_LABELS[status])).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('sets a title tooltip matching the status label', () => {
    render(<TaskStatusRing status="in_progress" />);
    expect(screen.getByTitle('In progress')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IPortalProject } from '../usePortalProject.ts';
import { PortalHeader } from './PortalHeader.tsx';

function project(overrides: Partial<IPortalProject> = {}): IPortalProject {
  return {
    name: 'Residential Build Starter',
    clientName: 'Lee Chong Wei',
    lifecycle: 'published',
    startDate: new Date('2026-08-24T00:00:00Z'),
    targetEndDate: null,
    progressPct: 2,
    ...overrides,
  };
}

function renderHeader(overrides: Partial<IPortalProject> = {}) {
  return render(
    <PortalHeader
      project={project(overrides)}
      workspaceId="w1"
      projectId="p1"
      clientId="c1"
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PortalHeader', () => {
  it('shows the project and client detail with dates', () => {
    renderHeader();

    expect(screen.getByRole('heading', { name: 'Residential Build Starter' })).toBeInTheDocument();
    expect(screen.getByText('Lee Chong Wei')).toBeInTheDocument();
    expect(screen.getByText('Start date')).toBeInTheDocument();
    expect(screen.getByText('Target completion')).toBeInTheDocument();
  });

  it('opens the file picker when Upload Document is clicked', async () => {
    renderHeader();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const clickSpy = vi.spyOn(input as HTMLInputElement, 'click').mockImplementation(() => {});

    await userEvent.click(screen.getByRole('button', { name: /upload document/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('triggers the browser print dialog from the Print action', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderHeader();

    await userEvent.click(screen.getByRole('button', { name: /print project summary/i }));

    expect(printSpy).toHaveBeenCalledTimes(1);
  });
});

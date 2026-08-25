import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PortalProgressSection } from './PortalProgressSection.tsx';

describe('PortalProgressSection', () => {
  it('names the section and renders the ring with an accessible percentage label', () => {
    render(<PortalProgressSection progressPct={45} />);

    expect(screen.getByRole('heading', { name: 'Overall progress' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '45% complete' })).toBeInTheDocument();
  });

  it('rounds the percentage for the decorative center label', () => {
    render(<PortalProgressSection progressPct={66.7} />);

    expect(screen.getByRole('img', { name: '67% complete' })).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('clamps out-of-range progress to 0–100', () => {
    const { rerender } = render(<PortalProgressSection progressPct={140} />);
    expect(screen.getByRole('img', { name: '100% complete' })).toBeInTheDocument();

    rerender(<PortalProgressSection progressPct={-10} />);
    expect(screen.getByRole('img', { name: '0% complete' })).toBeInTheDocument();
  });
});

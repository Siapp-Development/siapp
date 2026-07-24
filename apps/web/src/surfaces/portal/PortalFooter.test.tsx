import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PortalFooter } from './PortalFooter.tsx';

describe('PortalFooter', () => {
  it('shows the powered-by badge for non-business tiers', () => {
    render(<PortalFooter tier="standard" firmName="Studio North" />);

    expect(screen.getByText(/powered by/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Siapp' })).toHaveAttribute(
      'href',
      'https://siapp.app',
    );
  });

  it('white-labels for business tier: firm name only', () => {
    render(<PortalFooter tier="business" firmName="Studio North" />);

    expect(screen.getByText('Studio North')).toBeInTheDocument();
    expect(screen.queryByText(/powered by/i)).not.toBeInTheDocument();
  });

  it('always carries the bilingual PDPA notice (#26 D5)', () => {
    render(<PortalFooter tier="standard" firmName="Studio North" />);

    expect(
      screen.getByText(/contact Studio North to access, correct or delete/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hubungi Studio North untuk akses/i)).toBeInTheDocument();
  });
});

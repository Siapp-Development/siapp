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
});

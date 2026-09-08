import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { MarketingFooter } from './MarketingFooter.tsx';

function renderFooter() {
  return render(
    <MemoryRouter>
      <MarketingFooter />
    </MemoryRouter>,
  );
}

describe('MarketingFooter', () => {
  it('renders a Privacy link to /privacy', () => {
    renderFooter();

    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });

  it('renders a Terms link to /terms', () => {
    renderFooter();

    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });

  it('keeps the existing section anchor links', () => {
    renderFooter();

    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '#how-it-works',
    );
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq');
  });

  it('no longer links to the removed Product / Industries / Client portal sections', () => {
    renderFooter();

    expect(screen.queryByRole('link', { name: /product/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /industries/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /client portal/i })).not.toBeInTheDocument();
  });
});

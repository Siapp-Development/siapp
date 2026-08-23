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

    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute('href', '#product');
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq');
  });
});

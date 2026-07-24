import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentPreview } from './DocumentPreview.tsx';

describe('DocumentPreview', () => {
  it('renders an iframe for PDFs', () => {
    render(
      <DocumentPreview
        name="site-plan.pdf"
        mimeType="application/pdf"
        url="blob:pdf-url"
        onClose={vi.fn()}
      />,
    );
    const frame = screen.getByTitle('site-plan.pdf');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'blob:pdf-url');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders an img for images', () => {
    render(
      <DocumentPreview
        name="photo.png"
        mimeType="image/png"
        url="blob:img-url"
        onClose={vi.fn()}
      />,
    );
    const img = screen.getByRole('img', { name: 'photo.png' });
    expect(img).toHaveAttribute('src', 'blob:img-url');
  });

  it('calls onClose from the Close button', async () => {
    const onClose = vi.fn();
    render(
      <DocumentPreview
        name="photo.png"
        mimeType="image/png"
        url="blob:img-url"
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

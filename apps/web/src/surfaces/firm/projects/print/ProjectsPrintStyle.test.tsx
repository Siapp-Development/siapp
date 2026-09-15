import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectsPrintStyle } from './ProjectsPrintStyle.tsx';
import { PROJECTS_PRINT_ROOT_ID } from './printView.ts';

function styleCss(orientation: 'portrait' | 'landscape'): {
  el: HTMLStyleElement | null;
  css: string;
} {
  const { container } = render(<ProjectsPrintStyle orientation={orientation} />);
  const el = container.querySelector('style');
  return { el, css: el?.textContent ?? '' };
}

describe('ProjectsPrintStyle', () => {
  it('emits a print-only <style> element', () => {
    const { el } = styleCss('portrait');
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('media', 'print');
  });

  it('isolates the print root and forces exact colours', () => {
    const { css } = styleCss('landscape');
    // Everything hidden, only the print root (and its subtree) revealed.
    expect(css).toContain('body * { visibility: hidden');
    expect(css).toContain(`#${PROJECTS_PRINT_ROOT_ID}, #${PROJECTS_PRINT_ROOT_ID} *`);
    expect(css).toContain('visibility: visible');
    // Colour-exact so status rings / timeline bars print.
    expect(css).toContain('print-color-adjust: exact');
  });

  it('uses a landscape @page for wide Table/Timeline views', () => {
    const { css } = styleCss('landscape');
    expect(css).toContain('@page');
    expect(css).toContain('size: landscape');
    expect(css).not.toContain('size: portrait');
  });

  it('uses a portrait @page for the List view', () => {
    const { css } = styleCss('portrait');
    expect(css).toContain('@page');
    expect(css).toContain('size: portrait');
    expect(css).not.toContain('size: landscape');
  });
});

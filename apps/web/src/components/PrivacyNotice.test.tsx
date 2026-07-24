import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PrivacyNotice } from './PrivacyNotice.tsx';

describe('PrivacyNotice', () => {
  it('names the firm as controller in English and Malay with lang attributes', () => {
    render(<PrivacyNotice firmName="Studio North" />);

    const en = screen.getByText(/contact Studio North to access, correct or delete/i);
    expect(en).toHaveAttribute('lang', 'en');
    const ms = screen.getByText(/Hubungi Studio North untuk akses/i);
    expect(ms).toHaveAttribute('lang', 'ms');
  });
});

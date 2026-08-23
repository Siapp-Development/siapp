import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { CampaignPrivacyPage } from './CampaignPrivacyPage.tsx';
import { PrivacyPolicyPage } from './PrivacyPolicyPage.tsx';
import { SmsTermsPage } from './SmsTermsPage.tsx';
import { TermsPage } from './TermsPage.tsx';

function renderPage(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/** All four public legal pages, keyed by their rendered <h1>. */
const ALL_PAGES: [name: string, ui: React.ReactElement][] = [
  ['PrivacyPolicyPage', <PrivacyPolicyPage />],
  ['TermsPage', <TermsPage />],
  ['CampaignPrivacyPage', <CampaignPrivacyPage />],
  ['SmsTermsPage', <SmsTermsPage />],
];

/** The three messaging pages carrying the Twilio A2P carrier disclosures. */
const MESSAGING_PAGES: [name: string, ui: React.ReactElement][] = [
  ['PrivacyPolicyPage', <PrivacyPolicyPage />],
  ['CampaignPrivacyPage', <CampaignPrivacyPage />],
  ['SmsTermsPage', <SmsTermsPage />],
];

describe('legal pages — structure & a11y', () => {
  it.each([
    ['PrivacyPolicyPage', <PrivacyPolicyPage />, 'Siapp Privacy Policy'],
    ['TermsPage', <TermsPage />, 'Siapp Terms & Conditions'],
    ['CampaignPrivacyPage', <CampaignPrivacyPage />, 'Siapp Messaging Campaign Privacy Policy'],
    ['SmsTermsPage', <SmsTermsPage />, 'Siapp SMS / Messaging Program Terms & Conditions'],
  ])('%s renders a single h1, a main landmark, and a home link', (_name, ui, title) => {
    renderPage(ui);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(title);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /siapp — home/i })).toHaveAttribute('href', '/');
  });
});

describe('legal pages — Twilio-mandated disclosures', () => {
  it.each([
    ['CampaignPrivacyPage', <CampaignPrivacyPage />],
    ['SmsTermsPage', <SmsTermsPage />],
    ['PrivacyPolicyPage', <PrivacyPolicyPage />],
  ])('%s preserves the carrier-required clauses verbatim', (_name, ui) => {
    const { container } = renderPage(ui);
    const text = container.textContent ?? '';

    // (a) non-sharing statement (campaign/privacy: "share, sell, rent";
    // sms terms: "share or sell")
    expect(text).toMatch(/do not share(,| or) sell/i);
    // (b) message frequency varies
    expect(text).toMatch(/frequency varies/i);
    // (c) message and data rates may apply
    expect(text).toMatch(/message and data rates may apply/i);
    // (d) STOP/HELP opt-out
    expect(text).toMatch(/STOP/);
    expect(text).toMatch(/HELP/);
  });
});

describe('PrivacyPolicyPage — data tables', () => {
  it('renders the collected-data table with column headers', () => {
    renderPage(<PrivacyPolicyPage />);

    const tables = screen.getAllByRole('table');
    expect(tables.length).toBeGreaterThanOrEqual(2);

    const dataTable = tables[0];
    const headers = within(dataTable).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Category', 'Examples', 'Source']);
  });
});

describe('legal pages — cross-links use in-app routes', () => {
  it('SmsTermsPage links to the other legal routes, not .md paths', () => {
    renderPage(<SmsTermsPage />);

    const main = within(screen.getByRole('main'));
    for (const link of main.getAllByRole('link', { name: 'Terms & Conditions' })) {
      expect(link).toHaveAttribute('href', '/terms');
    }
    for (const link of main.getAllByRole('link', { name: 'Campaign Privacy Policy' })) {
      expect(link).toHaveAttribute('href', '/legal/campaign-privacy');
    }
    // No cross-link should point at a raw markdown file.
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/\.md/);
    }
  });
});

describe('legal pages — no axe violations', () => {
  it.each(ALL_PAGES)('%s has no axe violations', async (_name, ui) => {
    const { container } = renderPage(ui);

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});

describe('legal pages — mobile non-sharing statement (A2P)', () => {
  it.each(MESSAGING_PAGES)(
    '%s states it does not share/sell mobile numbers',
    (_name, ui) => {
      const { container } = renderPage(ui);
      const text = container.textContent ?? '';

      // The non-sharing promise must be present…
      expect(text).toMatch(/do not (share|sell)/i);
      // …and it must be about mobile phone numbers.
      expect(text).toMatch(/mobile/i);
    },
  );
});

describe('legal pages — message-frequency disclosure (A2P)', () => {
  it.each(MESSAGING_PAGES)('%s discloses that message frequency varies', (_name, ui) => {
    const { container } = renderPage(ui);
    const text = container.textContent ?? '';

    expect(text).toMatch(/(message )?frequency (varies|may vary)/i);
  });
});

describe('legal pages — message-and-data-rates disclosure (A2P)', () => {
  it.each(MESSAGING_PAGES)(
    '%s carries the verbatim "Message and data rates may apply"',
    (_name, ui) => {
      const { container } = renderPage(ui);
      const text = container.textContent ?? '';

      expect(text).toMatch(/message and data rates may apply/i);
    },
  );
});

describe('legal pages — STOP/HELP opt-out instructions (A2P)', () => {
  it.each([
    ['CampaignPrivacyPage', <CampaignPrivacyPage />],
    ['SmsTermsPage', <SmsTermsPage />],
  ])('%s tells recipients to reply STOP and HELP', (_name, ui) => {
    const { container } = renderPage(ui);
    const text = container.textContent ?? '';

    expect(text).toMatch(/\bSTOP\b/);
    expect(text).toMatch(/\bHELP\b/);
  });
});

describe('legal pages — support contact', () => {
  it.each(ALL_PAGES)('%s publishes the support@siapp.app contact', (_name, ui) => {
    const { container } = renderPage(ui);

    expect(container.textContent ?? '').toContain('support@siapp.app');
  });
});

describe('legal pages — entity name simplified to "Siapp"', () => {
  it.each([
    ['PrivacyPolicyPage', <PrivacyPolicyPage />],
    ['TermsPage', <TermsPage />],
    ['CampaignPrivacyPage', <CampaignPrivacyPage />],
    ['SmsTermsPage', <SmsTermsPage />],
  ])('%s no longer references "Sdn Bhd"', (_name, ui) => {
    const { container } = renderPage(ui);

    expect(container.textContent ?? '').not.toMatch(/Sdn\.?\s*Bhd/i);
  });
});

describe('legal pages — every cross-link uses an in-app router path', () => {
  it.each(ALL_PAGES)('%s never links to a raw .md document', (_name, ui) => {
    renderPage(ui);

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/\.md/);
    }
  });

  it('PrivacyPolicyPage cross-links resolve to the legal routes', () => {
    renderPage(<PrivacyPolicyPage />);

    const main = within(screen.getByRole('main'));
    for (const link of main.getAllByRole('link', { name: 'SMS / Messaging Terms' })) {
      expect(link).toHaveAttribute('href', '/legal/sms-terms');
    }
    for (const link of main.getAllByRole('link', { name: 'Campaign Privacy Policy' })) {
      expect(link).toHaveAttribute('href', '/legal/campaign-privacy');
    }
  });

  it('CampaignPrivacyPage cross-links resolve to the legal routes', () => {
    renderPage(<CampaignPrivacyPage />);

    const main = within(screen.getByRole('main'));
    for (const link of main.getAllByRole('link', { name: 'Privacy Policy' })) {
      expect(link).toHaveAttribute('href', '/privacy');
    }
    for (const link of main.getAllByRole('link', { name: 'SMS / Messaging Terms' })) {
      expect(link).toHaveAttribute('href', '/legal/sms-terms');
    }
  });
});

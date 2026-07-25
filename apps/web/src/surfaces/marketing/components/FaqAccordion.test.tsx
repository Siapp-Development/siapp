import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FaqAccordion, type IFaqItem } from './FaqAccordion.tsx';

const ITEMS: IFaqItem[] = [
  { id: 'one', question: 'What is Siapp?', answer: 'A client-facing PM platform.' },
  { id: 'two', question: 'Is it available now?', answer: 'Early access only.' },
];

describe('FaqAccordion', () => {
  it('renders every question as a collapsed button with wired aria', () => {
    render(<FaqAccordion items={ITEMS} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-expanded', 'false');
      const panelId = button.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();
      expect(document.getElementById(panelId ?? '')).toBeInTheDocument();
    }
  });

  it('expands and collapses a question with keyboard activation', async () => {
    const user = userEvent.setup();
    render(<FaqAccordion items={ITEMS} />);

    const first = screen.getByRole('button', { name: 'What is Siapp?' });
    first.focus();
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-expanded', 'false');
  });

  it('allows multiple questions open at once', async () => {
    const user = userEvent.setup();
    render(<FaqAccordion items={ITEMS} />);

    await user.click(screen.getByRole('button', { name: 'What is Siapp?' }));
    await user.click(screen.getByRole('button', { name: 'Is it available now?' }));

    expect(screen.getByRole('button', { name: 'What is Siapp?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Is it available now?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('fires faq_opened only when opening, not when closing', async () => {
    const events: { event: string; props?: Record<string, string> }[] = [];
    const listener = (e: Event) => {
      events.push((e as CustomEvent<{ event: string; props?: Record<string, string> }>).detail);
    };
    window.addEventListener('siapp:track', listener);
    const user = userEvent.setup();
    render(<FaqAccordion items={ITEMS} />);

    const first = screen.getByRole('button', { name: 'What is Siapp?' });
    await user.click(first); // open
    await user.click(first); // close — no event

    expect(events).toEqual([{ event: 'faq_opened', props: { question: 'one' } }]);
    window.removeEventListener('siapp:track', listener);
  });
});

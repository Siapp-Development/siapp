import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { TIndustry } from './demo/demoContent.ts';
import { IndustrySwitcher } from './IndustrySwitcher.tsx';

function Harness() {
  const [industry, setIndustry] = useState<TIndustry>('construction');
  return <IndustrySwitcher value={industry} onChange={setIndustry} />;
}

describe('IndustrySwitcher', () => {
  it('is a radiogroup with only the selected option tabbable', () => {
    render(<Harness />);

    expect(screen.getByRole('radiogroup', { name: 'Industry' })).toBeInTheDocument();
    const construction = screen.getByRole('radio', { name: 'Construction' });
    const legal = screen.getByRole('radio', { name: 'Legal' });
    expect(construction).toHaveAttribute('aria-checked', 'true');
    expect(construction).toHaveAttribute('tabindex', '0');
    expect(legal).toHaveAttribute('aria-checked', 'false');
    expect(legal).toHaveAttribute('tabindex', '-1');
  });

  it('switches selection with arrow keys and moves focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    screen.getByRole('radio', { name: 'Construction' }).focus();
    await user.keyboard('{ArrowRight}');

    const legal = screen.getByRole('radio', { name: 'Legal' });
    expect(legal).toHaveAttribute('aria-checked', 'true');
    expect(legal).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Construction' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('switches selection on click and fires the industry view event', async () => {
    const events: { event: string }[] = [];
    const listener = (e: Event) => {
      events.push((e as CustomEvent<{ event: string }>).detail);
    };
    window.addEventListener('siapp:track', listener);
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('radio', { name: 'Legal' }));

    expect(screen.getByRole('radio', { name: 'Legal' })).toHaveAttribute('aria-checked', 'true');
    expect(events.map((e) => e.event)).toEqual(['industry_view_legal']);
    window.removeEventListener('siapp:track', listener);
  });
});

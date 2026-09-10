/**
 * #157 D10: the firm list/detail client column shows the FIRST client's name
 * plus a "＋N" overflow marker — never the full list, never a bare count, and
 * empty ('' → caller renders "No client linked") when nothing is linked.
 */
import { describe, expect, it } from 'vitest';

import { clientSummaryLabel } from './projectLabels.ts';

describe('clientSummaryLabel (#157 D10)', () => {
  it('returns an empty string when no clients are linked', () => {
    expect(clientSummaryLabel([])).toBe('');
  });

  it('returns just the name for a single client (no overflow marker)', () => {
    expect(clientSummaryLabel([{ name: 'Ann Lee' }])).toBe('Ann Lee');
  });

  it('shows the first name + ＋N overflow for two clients', () => {
    expect(clientSummaryLabel([{ name: 'Ann Lee' }, { name: 'Ben Tan' }])).toBe('Ann Lee ＋1');
  });

  it('counts every client past the first (＋4 for five clients)', () => {
    const clients = [
      { name: 'Ann Lee' },
      { name: 'Ben Tan' },
      { name: 'Cai Wong' },
      { name: 'Dee Ong' },
      { name: 'Eve Lim' },
    ];
    expect(clientSummaryLabel(clients)).toBe('Ann Lee ＋4');
  });

  it('never lists the co-client names, only the first + count', () => {
    const label = clientSummaryLabel([{ name: 'Ann Lee' }, { name: 'Ben Tan' }]);
    expect(label).not.toContain('Ben Tan');
  });
});

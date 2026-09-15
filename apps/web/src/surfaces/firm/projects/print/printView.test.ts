import { describe, expect, it } from 'vitest';

import { PRINT_TARGET_PX, computeScaleToFit } from './printView.ts';

describe('computeScaleToFit', () => {
  it('returns 1 when the content already fits', () => {
    expect(computeScaleToFit(500, 1000)).toBe(1);
    expect(computeScaleToFit(1000, 1000)).toBe(1);
  });

  it('never upscales', () => {
    expect(computeScaleToFit(200, 1000)).toBe(1);
  });

  it('scales down oversized content', () => {
    expect(computeScaleToFit(2000, 1000)).toBe(0.5);
  });

  it('returns 1 for an unmeasurable width (jsdom guard)', () => {
    expect(computeScaleToFit(0)).toBe(1);
    expect(computeScaleToFit(-5)).toBe(1);
  });

  it('defaults the target to the safe landscape width', () => {
    expect(computeScaleToFit(PRINT_TARGET_PX * 2)).toBe(0.5);
  });
});

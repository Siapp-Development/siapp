import { describe, expect, it } from 'vitest';

import {
  AVATAR_CLASSES,
  AVATAR_PALETTE_SIZE,
  avatarColorForSeed,
} from './avatarColor.ts';

/**
 * The palette background hex values, kept in lockstep with `tokens.css`. The
 * contrast guardrail below asserts every pair clears WCAG 2.1 AA against white
 * — the same check that keeps future palette edits honest.
 */
const AVATAR_BACKGROUNDS = [
  '#3e4c77',
  '#0f766e',
  '#15803d',
  '#a33f2b',
  '#92600a',
  '#9f1239',
  '#6b21a8',
  '#1d4ed8',
  '#155e75',
  '#7c2d6b',
] as const;

const WHITE = '#ffffff';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('avatarColorForSeed', () => {
  it('is deterministic for the same seed', () => {
    const first = avatarColorForSeed('user-abc123');
    const second = avatarColorForSeed('user-abc123');

    expect(second).toEqual(first);
  });

  it('returns an in-range index and matching class pair', () => {
    const result = avatarColorForSeed('some-uid');

    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThan(AVATAR_PALETTE_SIZE);
    expect(result.className).toBe(AVATAR_CLASSES[result.index]);
  });

  it('spreads across multiple palette entries for varied seeds', () => {
    const indices = new Set(
      Array.from({ length: 100 }, (_, i) => avatarColorForSeed(`uid-${i}`).index),
    );

    expect(indices.size).toBeGreaterThan(1);
  });

  it('reaches most of the palette across a large sample (distribution sanity)', () => {
    const indices = new Set(
      Array.from({ length: 1000 }, (_, i) => avatarColorForSeed(`member-${i}`).index),
    );

    // A healthy hash spreads a large sample across nearly every bucket.
    expect(indices.size).toBeGreaterThanOrEqual(AVATAR_PALETTE_SIZE - 1);
  });
});

describe('avatar palette contrast (WCAG 2.1 AA)', () => {
  it('every palette background clears 4.5:1 against white text', () => {
    for (const background of AVATAR_BACKGROUNDS) {
      expect(contrastRatio(background, WHITE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('defines exactly one background per class pair', () => {
    expect(AVATAR_BACKGROUNDS).toHaveLength(AVATAR_PALETTE_SIZE);
  });
});

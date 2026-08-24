import { describe, expect, it } from 'vitest';

import { TAG_COLOR_KEYS, isTagColorKey, tagColorClasses } from './tagColor.ts';

describe('isTagColorKey', () => {
  it('accepts every palette key', () => {
    for (const key of TAG_COLOR_KEYS) {
      expect(isTagColorKey(key)).toBe(true);
    }
  });

  it('rejects an unknown key', () => {
    expect(isTagColorKey('chartreuse')).toBe(false);
    expect(isTagColorKey('')).toBe(false);
  });
});

describe('tagColorClasses', () => {
  it('returns the matching chip + ring classes for a known key', () => {
    const classes = tagColorClasses('blue');

    expect(classes.chip).toBe('bg-tag-blue text-tag-blue-fg');
    expect(classes.ring).toBe('ring-tag-blue');
  });

  it('resolves a distinct class trio for every palette key', () => {
    const chips = new Set(TAG_COLOR_KEYS.map((key) => tagColorClasses(key).chip));

    expect(chips.size).toBe(TAG_COLOR_KEYS.length);
  });

  it('falls back to slate for an unknown/legacy key so a tag never renders invisibly', () => {
    expect(tagColorClasses('not-a-color')).toEqual(tagColorClasses('slate'));
  });
});

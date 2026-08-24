/**
 * Tag colour classes (D-041). A tag's colour is one of a curated palette of
 * keys stored on the registry doc; this module resolves a key to a WCAG-safe
 * (>= 4.5:1) Tailwind class trio, mirroring `avatarColor.ts`.
 *
 * The class strings are written out in full (never interpolated) so
 * Tailwind's JIT can see every `bg-tag-{key}` / `text-tag-{key}-fg` utility
 * and keep it in the build. Contrast pairs are asserted in `tagColor.test.ts`.
 *
 * Kept `string`-keyed on purpose: `@siapp/ui` does not depend on
 * `@siapp/shared`. The canonical `TTagColor` union lives in
 * `@siapp/shared/enums` and MUST stay in lockstep with `TAG_COLOR_KEYS`.
 */

/** Ordered palette keys — the source of truth for the shared `TTagColor`. */
export const TAG_COLOR_KEYS = [
  'slate',
  'red',
  'amber',
  'green',
  'blue',
  'violet',
  'pink',
  'teal',
] as const;

export type TTagColorKey = (typeof TAG_COLOR_KEYS)[number];

export interface ITagColorClasses {
  /** Filled chip: coloured background + white text. */
  chip: string;
  /** Focus/selected ring utility. */
  ring: string;
}

/** Full, static Tailwind classes per key. */
const TAG_CLASS_MAP: Record<TTagColorKey, ITagColorClasses> = {
  slate: { chip: 'bg-tag-slate text-tag-slate-fg', ring: 'ring-tag-slate' },
  red: { chip: 'bg-tag-red text-tag-red-fg', ring: 'ring-tag-red' },
  amber: { chip: 'bg-tag-amber text-tag-amber-fg', ring: 'ring-tag-amber' },
  green: { chip: 'bg-tag-green text-tag-green-fg', ring: 'ring-tag-green' },
  blue: { chip: 'bg-tag-blue text-tag-blue-fg', ring: 'ring-tag-blue' },
  violet: { chip: 'bg-tag-violet text-tag-violet-fg', ring: 'ring-tag-violet' },
  pink: { chip: 'bg-tag-pink text-tag-pink-fg', ring: 'ring-tag-pink' },
  teal: { chip: 'bg-tag-teal text-tag-teal-fg', ring: 'ring-tag-teal' },
};

/** Type guard: is `value` a known tag colour key? */
export function isTagColorKey(value: string): value is TTagColorKey {
  return (TAG_COLOR_KEYS as readonly string[]).includes(value);
}

/**
 * Resolve a tag colour key to its class trio. Unknown/legacy keys fall back
 * to `slate` so a bad value can never render invisibly.
 */
export function tagColorClasses(color: string): ITagColorClasses {
  return isTagColorKey(color) ? TAG_CLASS_MAP[color] : TAG_CLASS_MAP.slate;
}

/**
 * Deterministic, accessible avatar colour (#104, D-039).
 *
 * A user's avatar colour is a pure function of a stable seed (their `uid`) —
 * never stored in Firestore. `avatarColorForSeed` hashes the seed into one of
 * the curated palette pairs defined as `--avatar-N-bg` / `--avatar-N-fg`
 * tokens in `tokens.css`. Every pair uses white text on a dark background and
 * clears WCAG 2.1 AA (>= 4.5:1) — asserted in `avatarColor.test.ts`.
 *
 * The class strings below are written out in full (never interpolated) so
 * Tailwind's JIT can see every `bg-avatar-N` / `text-avatar-N-fg` utility and
 * keep it in the build.
 */

/** Full, static Tailwind class pairs — index N-1 maps to `--avatar-N-*`. */
export const AVATAR_CLASSES = [
  'bg-avatar-1 text-avatar-1-fg',
  'bg-avatar-2 text-avatar-2-fg',
  'bg-avatar-3 text-avatar-3-fg',
  'bg-avatar-4 text-avatar-4-fg',
  'bg-avatar-5 text-avatar-5-fg',
  'bg-avatar-6 text-avatar-6-fg',
  'bg-avatar-7 text-avatar-7-fg',
  'bg-avatar-8 text-avatar-8-fg',
  'bg-avatar-9 text-avatar-9-fg',
  'bg-avatar-10 text-avatar-10-fg',
] as const;

/** Number of pairs in the palette. */
export const AVATAR_PALETTE_SIZE = AVATAR_CLASSES.length;

export interface IAvatarColor {
  /** 0-based palette index. */
  index: number;
  /** Full Tailwind class pair, e.g. `'bg-avatar-3 text-avatar-3-fg'`. */
  className: string;
}

/**
 * FNV-1a 32-bit string hash — small, stable, and deterministic across
 * sessions and devices. Returned as an unsigned 32-bit integer.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in integer range.
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

/** Map a stable seed (e.g. a uid) to a deterministic palette colour. */
export function avatarColorForSeed(seed: string): IAvatarColor {
  const index = fnv1a(seed) % AVATAR_PALETTE_SIZE;
  return { index, className: AVATAR_CLASSES[index] };
}

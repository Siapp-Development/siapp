import { cva, type VariantProps } from 'class-variance-authority';
import { useState, type HTMLAttributes } from 'react';

import { avatarColorForSeed } from '../lib/avatarColor.ts';
import { cn } from '../lib/cn.ts';

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-[0.625rem]',
        sm: 'h-7 w-7 text-xs',
        md: 'h-8 w-8 text-xs',
        lg: 'h-16 w-16 text-xl',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

/**
 * Up to two leading letters from a display name, e.g. "Ada Lovelace" → "AL".
 * Falls back to '?' for an empty/whitespace name. Consolidates the previously
 * duplicated `initials()` / `userInitials()` helpers (#104).
 */
export function avatarInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((part) => part !== '')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

export interface IAvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof avatarVariants> {
  /** Display name (or email fallback) — drives the initials and accessible name. */
  name: string;
  /** Stable id (the user's uid) for the deterministic colour. Defaults to `name`. */
  seed?: string;
  /** When present and it loads, the photo renders; otherwise initials + colour. */
  photoUrl?: string | null;
}

/**
 * Avatar primitive (#104, D-038): renders a profile photo when available and
 * falls back to deterministic initials + an accessible colour keyed on `seed`.
 *
 * Accessibility: when not decorative the avatar exposes an accessible name
 * (`<img alt>` for a photo, `role="img"` + `aria-label` for initials). Pass
 * `aria-hidden` for chips whose meaning is already conveyed by surrounding
 * text (e.g. a task card that names the assignee elsewhere) to avoid a double
 * announcement.
 */
export function Avatar({
  name,
  seed,
  photoUrl,
  size,
  className,
  'aria-hidden': ariaHidden,
  ...rest
}: IAvatarProps) {
  const [errored, setErrored] = useState(false);
  const color = avatarColorForSeed(seed ?? name);
  const showPhoto = typeof photoUrl === 'string' && photoUrl !== '' && !errored;
  const decorative = ariaHidden === true || ariaHidden === 'true';

  if (showPhoto) {
    return (
      <span className={cn(avatarVariants({ size }), className)} aria-hidden={ariaHidden} {...rest}>
        <img
          src={photoUrl}
          alt={decorative ? '' : name}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(avatarVariants({ size }), color.className, className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={ariaHidden}
      {...rest}
    >
      <span aria-hidden="true">{avatarInitials(name)}</span>
    </span>
  );
}

export { avatarVariants };

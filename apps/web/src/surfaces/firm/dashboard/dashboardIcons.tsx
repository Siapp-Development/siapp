/**
 * Decorative inline-SVG icon set for the #102 Home redesign, following the
 * `ICON_PROPS` convention from FirmShell (Lucide-style, 24×24, strokeWidth 1.8).
 * Every icon is purely decorative — it accompanies a text label — so each is
 * marked `aria-hidden` and never carries meaning on its own.
 */

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Right chevron — card affordance that nudges on hover. */
export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Folder — "Active projects" stat tile. */
export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

/** Target with check — "On track" stat tile. */
export function TargetCheckIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

/** Alarm clock — "Overdue" stat tile. */
export function AlarmIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v3l2 2" />
      <path d="M5 3 2.5 5.5M19 3l2.5 2.5" />
    </svg>
  );
}

/** Calendar — "Due this week" stat tile. */
export function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

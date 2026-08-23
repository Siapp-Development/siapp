/**
 * Decorative icon set for the #102 Home redesign, backed by `lucide-react`.
 * Every icon is purely decorative — it accompanies a text label — so each is
 * marked `aria-hidden` and never carries meaning on its own. A `className`
 * (e.g. `h-6 w-6`) overrides the 16px default where a larger glyph is needed.
 */

import {
  AlarmClock,
  CalendarDays,
  ChevronRight,
  CircleCheckBig,
  ClipboardList,
  Folder,
} from 'lucide-react';

const ICON_SIZE = 16;
const ICON_STROKE = 1.8;

/** Right chevron — card affordance that nudges on hover. */
export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <ChevronRight size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden className={className} />
  );
}

/** Clipboard — "My tasks" bucket tab. */
export function ClipboardListIcon({ className }: { className?: string }) {
  return (
    <ClipboardList size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden className={className} />
  );
}

/** Folder — "Active projects" stat tile. */
export function FolderIcon({ className }: { className?: string }) {
  return <Folder size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden className={className} />;
}

/** Circled check — "On track" stat tile. */
export function TargetCheckIcon({ className }: { className?: string }) {
  return (
    <CircleCheckBig size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden className={className} />
  );
}

/** Alarm clock — "Overdue" stat tile. */
export function AlarmIcon({ className }: { className?: string }) {
  return <AlarmClock size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden className={className} />;
}

/** Calendar — "Due this week" stat tile. */
export function CalendarIcon({ className }: { className?: string }) {
  return (
    <CalendarDays size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden className={className} />
  );
}

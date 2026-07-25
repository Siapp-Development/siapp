/**
 * Minimal inline icon set for the marketing page — no icon library needed.
 * All icons are decorative (aria-hidden); pair them with visible text.
 */

interface IIconProps {
  className?: string;
}

export function CheckIcon({ className }: IIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" />
    </svg>
  );
}

export function ChatIcon({ className }: IIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 7.7c0 3-2.7 5.4-6 5.4-.8 0-1.6-.1-2.3-.4L2 13.5l.9-2.7A5 5 0 0 1 2 7.7c0-3 2.7-5.4 6-5.4s6 2.4 6 5.4Z" />
    </svg>
  );
}

export function MenuIcon({ className }: IIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className={className}
    >
      <path d="M2.5 4.5h11m-11 3.5h11m-11 3.5h11" />
    </svg>
  );
}

export function CloseIcon({ className }: IIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className={className}
    >
      <path d="m4 4 8 8m0-8-8 8" />
    </svg>
  );
}

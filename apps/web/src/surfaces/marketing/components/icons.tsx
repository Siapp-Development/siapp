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

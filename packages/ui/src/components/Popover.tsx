/**
 * Minimal anchored popover for composite widgets (e.g. a combobox listbox).
 * Renders an always-present `trigger` and, while `open`, a panel positioned
 * directly beneath it. Dismisses on outside pointer-down and Escape, and
 * restores focus to whatever was focused when it opened (normally the
 * trigger) on close. Positioning is CSS-only (absolute under the anchor) — no
 * portal, so the panel stays inside the widget's focus/DOM scope.
 */

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/cn.ts';

export interface IPopoverProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  /** The anchor, always rendered (e.g. a trigger button). */
  trigger: ReactNode;
  /** Panel content, rendered only while `open`. */
  children: ReactNode;
  /** Horizontal alignment of the panel against the anchor. */
  align?: 'start' | 'end';
}

export function Popover({
  open,
  onClose,
  trigger,
  children,
  align = 'start',
  className,
  ...props
}: IPopoverProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // Capture the pre-open focus target on open; restore it on close so
  // keyboard users land back on the trigger (WAI-ARIA popup guidance).
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    if (!open && wasOpenRef.current) {
      restoreFocusRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  // Outside pointer-down + Escape dismissal.
  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointer(event: MouseEvent): void {
      if (wrapperRef.current !== null && !wrapperRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open, onClose]);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      {trigger}
      {open && (
        <div
          className={cn(
            'absolute top-full z-50 mt-1 min-w-56 rounded-lg border border-border bg-card p-1 shadow-raised',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      )}
    </div>
  );
}

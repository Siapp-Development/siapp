/**
 * Centered modal dialog built on the native <dialog> element: modal focus
 * containment, Escape-to-close, and focus restore come from the platform.
 * Clicking the backdrop closes; state stays owned by the caller via `open`
 * + `onClose`. Non-essential motion is gated behind `prefers-reduced-motion`
 * (see globals.css). `role="dialog"` + `aria-modal` are implicit on a
 * modally-shown <dialog>; an accessible name is required via `aria-label` or
 * `aria-labelledby`.
 */

import { useEffect, useRef, type HTMLAttributes, type MouseEvent } from 'react';

import { cn } from '../lib/cn.ts';

export interface IDialogProps extends HTMLAttributes<HTMLDialogElement> {
  open: boolean;
  onClose: () => void;
  /**
   * Shell sizing. `'sm'` (default) keeps the compact `max-w-md` used by
   * `ConfirmDialog` and other simple prompts. `'lg'` yields a wide,
   * height-capped shell for two-column / form modals that manage their own
   * internal scrolling.
   */
  size?: 'sm' | 'lg';
}

const DIALOG_SIZE_CLASSES: Record<'sm' | 'lg', string> = {
  sm: 'max-w-md p-6',
  lg: 'max-w-4xl max-h-[90vh] overflow-hidden p-0',
};

export function Dialog({
  open,
  onClose,
  size = 'sm',
  className,
  children,
  ...props
}: IDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Explicit Escape handling (preventDefault suppresses the native cancel
  // path) so closing is deterministic across browsers and jsdom.
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [open, onClose]);

  // The native dialog can close itself (Escape → cancel → close); keep the
  // caller's state in sync instead of trapping the event.
  function handleNativeClose(): void {
    if (open) {
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    // Clicks on the ::backdrop target the dialog element itself.
    if (event.target === ref.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      className={cn(
        'm-auto w-full rounded-lg border border-border bg-card text-foreground shadow-raised',
        'motion-safe:duration-150 backdrop:bg-slate-950/40',
        DIALOG_SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </dialog>
  );
}

/**
 * Right-side drawer built on the native <dialog> element: modal focus
 * containment, Escape-to-close, and focus restore come from the platform.
 * Clicking the backdrop closes; state stays owned by the caller via `open`
 * + `onClose`.
 */

import { useEffect, useRef, type HTMLAttributes, type MouseEvent } from 'react';

import { cn } from '../lib/cn.ts';

export interface IDrawerProps extends HTMLAttributes<HTMLDialogElement> {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  'aria-label': string;
}

export function Drawer({ open, onClose, className, children, ...props }: IDrawerProps) {
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
        'fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-xl overflow-y-auto',
        'border-l border-border bg-card text-foreground shadow-raised',
        'backdrop:bg-slate-950/40',
        className,
      )}
      {...props}
    >
      {children}
    </dialog>
  );
}

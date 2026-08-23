/**
 * Right-side drawer shell for the A6/A7 contact forms (#104). Wraps the
 * shared UI `Drawer` (native <dialog>: focus trap, Escape, focus restore)
 * with a titled header + close button and a scrollable body. The caller owns
 * open state and renders the form (with its own Cancel/submit footer) inside.
 */

import { Drawer } from '@siapp/ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export interface IContactDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Visible header text. */
  title: string;
  /** Accessible name for the dialog. */
  label: string;
  children: ReactNode;
}

export function ContactDrawer({ open, onClose, title, label, children }: IContactDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} aria-label={label}>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-primary-tint hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{open ? children : null}</div>
      </div>
    </Drawer>
  );
}

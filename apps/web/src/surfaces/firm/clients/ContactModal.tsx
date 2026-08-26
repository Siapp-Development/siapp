/**
 * Centered modal shell for the A6/A7 contact forms (#104). Wraps the shared UI
 * `Dialog` (native <dialog>: focus trap, Escape, focus restore) at `size="lg"`
 * with a titled header + icon close button and a scrollable body. The caller
 * owns open state and renders the form (with its own Cancel/submit footer)
 * inside; children mount only while open.
 */

import { Button, Dialog } from '@siapp/ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export interface IContactModalProps {
  open: boolean;
  onClose: () => void;
  /** Visible header text. */
  title: string;
  /** Accessible name for the dialog. */
  label: string;
  children: ReactNode;
}

export function ContactModal({ open, onClose, title, label, children }: IContactModalProps) {
  return (
    <Dialog open={open} onClose={onClose} size="lg" aria-label={label}>
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{open ? children : null}</div>
      </div>
    </Dialog>
  );
}

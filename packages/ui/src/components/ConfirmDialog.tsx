/**
 * Confirm/cancel convenience wrapper over `Dialog`. Renders a titled body
 * with a description (or arbitrary children) and two actions. The dialog is
 * named via `aria-labelledby` pointing at the rendered title.
 */

import { useId, type ReactNode } from 'react';

import { Alert } from './Alert.tsx';
import { Button } from './Button.tsx';
import { Dialog } from './Dialog.tsx';

export interface IConfirmDialogProps {
  open: boolean;
  title: string;
  /** Optional descriptive text; use `children` for richer bodies. */
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions use the danger button styling. */
  variant?: 'primary' | 'destructive';
  /** Disables both actions and shows the pending label while true. */
  pending?: boolean;
  /** Inline error message shown above the actions. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: IConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby={titleId}
      aria-describedby={description !== undefined ? descriptionId : undefined}
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      {description !== undefined && (
        <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children}
      {error !== null && (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={variant === 'destructive' ? 'destructive' : 'primary'}
          size="sm"
          onClick={onConfirm}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? `${confirmLabel}…` : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

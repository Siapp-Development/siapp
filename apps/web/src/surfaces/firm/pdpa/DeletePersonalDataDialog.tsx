/**
 * PDPA deletion confirmation dialog (#26, D3/D4). Owner/admin-only entry
 * point for the deletePersonalData callable: explicit consequence copy, a
 * typed-name confirmation, and the per-collection scrub counts on success.
 * Failure keeps the dialog open with retry guidance — the callable is
 * idempotent, so running it again finishes any remaining scrubs.
 */

import { Alert, Button, Input, Label } from '@siapp/ui';
import type { IDeletePersonalDataResponse, TPdpaSubjectType } from '@siapp/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { deletePersonalData } from '@/lib/callables.ts';

import { scrubSummary } from './consent.ts';

export interface IDeletePersonalDataDialogProps {
  workspaceId: string;
  subjectType: TPdpaSubjectType;
  subjectId: string;
  subjectName: string;
  onClose: () => void;
}

export function DeletePersonalDataDialog({
  workspaceId,
  subjectType,
  subjectId,
  subjectName,
  onClose,
}: IDeletePersonalDataDialogProps) {
  const headingId = useId();
  const confirmId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirmText, setConfirmText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<IDeletePersonalDataResponse | null>(null);

  // Focus the dialog on open; restore focus to the trigger on close.
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' && !pending) {
      event.stopPropagation();
      onClose();
      return;
    }
    // Minimal focus trap: keep Tab cycling inside the dialog.
    if (event.key === 'Tab' && dialogRef.current !== null) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (confirmText.trim() !== subjectName || pending) {
      return;
    }
    setPending(true);
    setError(false);
    try {
      setResult(await deletePersonalData({ workspaceId, subjectType, subjectId }));
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
      >
        <h2 id={headingId} className="text-lg font-semibold">
          Delete personal data (PDPA)
        </h2>

        {result === null ? (
          <>
            <p className="mt-3 text-sm">
              This permanently anonymizes <strong>{subjectName}</strong> — name, phone, email and
              other personal details are erased everywhere they appear, their access links are
              revoked, and the record is frozen: it can never be edited or restored. Projects,
              tasks and history are kept, showing “Deleted {subjectType}” instead.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">This cannot be undone.</p>
            {error && (
              <Alert variant="destructive" className="mt-3">
                Deletion did not complete. Nothing is lost — run it again to finish the remaining
                clean-up.
              </Alert>
            )}
            <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={confirmId}>
                  Type <strong>{subjectName}</strong> to confirm
                </Label>
                <Input
                  id={confirmId}
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={pending || confirmText.trim() !== subjectName}
                  aria-busy={pending}
                >
                  {pending ? 'Deleting…' : 'Delete personal data'}
                </Button>
                <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm" role="status">
              Personal data deleted: {scrubSummary(result)}.
            </p>
            <div className="mt-4">
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessageKey } from '@/api/errors';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** While the action runs the dialog can't be closed, so its outcome stays visible. */
  pending: boolean;
  /** The failed attempt; shown until the next one. */
  error?: unknown;
  /** Replaces the generic message for `error`. */
  errorMessage?: string;
  /** Extra fields between the description and the buttons. */
  children?: ReactNode;
  variant?: 'destructive' | 'default';
}

/** Asks before an action that is hard to undo (leave, remove, hand over, delete, report). */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel,
  pending,
  error,
  errorMessage,
  children,
  variant = 'destructive',
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error !== undefined && error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage ?? t(errorMessageKey(error))}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            {t('app.cancel')}
          </Button>
          <Button variant={variant} disabled={pending} onClick={onConfirm}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

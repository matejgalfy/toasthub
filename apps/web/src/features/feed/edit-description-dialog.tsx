import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedItem } from '@toasthub/shared';

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
import { SessionDescriptionField } from '@/features/toast-sessions/session-description-field';
import { useUpdateSession } from '@/features/toast-sessions/toast-sessions-api';

/** Mounted for each edit, so canceling discards the draft and the next edit starts fresh. */
export function EditDescriptionDialog({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateSession();
  const [description, setDescription] = useState(item.description ?? '');
  const savedDescription = description.trim() || null;
  const changed = savedDescription !== (item.description ?? null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !update.isPending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        showCloseButton={!update.isPending}
        onEscapeKeyDown={(event) => {
          if (update.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (update.isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('feed.editDescription')}</DialogTitle>
          <DialogDescription>{t('feed.editDescriptionDialog.description')}</DialogDescription>
        </DialogHeader>
        <SessionDescriptionField
          value={description}
          onChange={setDescription}
          disabled={update.isPending}
        />
        {update.error && (
          <p role="alert" className="text-sm text-destructive">
            {t(errorMessageKey(update.error))}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={update.isPending} onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button
            disabled={!changed || update.isPending}
            onClick={() => {
              // Including count would apply its same-day restriction to past posts (BR-TOAST-8).
              update.mutate(
                { id: item.sessionId, description: savedDescription },
                { onSuccess: onClose },
              );
            }}
          >
            {update.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {t('toasts.edit.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

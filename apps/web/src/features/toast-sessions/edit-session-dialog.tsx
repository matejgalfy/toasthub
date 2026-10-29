import { Check, LoaderCircle, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { ToastSession } from '@toasthub/shared';

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
import { useFormat } from '@/i18n/format';

import { CountStepper } from './count-stepper';
import { isTooLarge, PhotoPicker, photoErrorMessageKey, usePickedPhoto } from './photo-picker';
import {
  useDeleteSession,
  useRemoveSessionPhoto,
  useSetSessionPhoto,
  useUpdateSessionCount,
} from './toast-sessions-api';

type ErrorKey = ReturnType<typeof photoErrorMessageKey>;

/**
 * Changes one of today's sessions: its count, its photo, or deletes it after a confirmation (SPEC §4.3
 * BR-TOAST-7). `session` is null while the dialog is closed.
 */
export function EditSessionDialog({
  session,
  onClose,
}: {
  session: ToastSession | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={session !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Mounted per session, so pending changes and errors start fresh. */}
      {session && <EditSessionContent key={session.id} session={session} onDone={onClose} />}
    </Dialog>
  );
}

function EditSessionContent({ session, onDone }: { session: ToastSession; onDone: () => void }) {
  const { t } = useTranslation();
  const format = useFormat();
  const updateCount = useUpdateSessionCount();
  const setPhoto = useSetSessionPhoto();
  const removePhoto = useRemoveSessionPhoto();
  const deleteSession = useDeleteSession();
  const [count, setCount] = useState(session.count);
  const [picked, setPicked] = usePickedPhoto();
  const [removeStored, setRemoveStored] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  const tooLarge = isTooLarge(picked);
  const shownError = tooLarge ? 'home.photo.tooLarge' : error;
  const changed = count !== session.count || picked !== null || removeStored;
  const time = format.dateTime(session.loggedAt, { timeStyle: 'short' });

  const pickPhoto = (file: File | null) => {
    setError(null);
    setPicked(file);
  };

  /** Photo first, so an unreadable file stops the save before the count changes. */
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (picked) {
        await setPhoto.mutateAsync({ id: session.id, photo: picked.file });
        setPicked(null);
      } else if (removeStored) {
        await removePhoto.mutateAsync({ id: session.id });
        setRemoveStored(false);
      }
      if (count !== session.count) await updateCount.mutateAsync({ id: session.id, count });
      onDone();
    } catch (cause) {
      setError(photoErrorMessageKey(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await deleteSession.mutateAsync({ id: session.id });
      toast.success(t('toasts.delete.done'));
      onDone();
    } catch (cause) {
      setError(errorMessageKey(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent
      // Closing mid-request would hide whether the change was saved.
      showCloseButton={!saving}
      onEscapeKeyDown={(event) => {
        if (saving) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (saving) event.preventDefault();
      }}
    >
      {confirmingDelete ? (
        <>
          <DialogHeader>
            <DialogTitle>{t('toasts.delete.title')}</DialogTitle>
            <DialogDescription>
              {t('toasts.delete.description', { count: session.count })}
            </DialogDescription>
          </DialogHeader>
          {shownError && <ErrorText messageKey={shownError} />}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setError(null);
                setConfirmingDelete(false);
              }}
            >
              {t('toasts.delete.cancel')}
            </Button>
            <Button variant="destructive" disabled={saving} onClick={() => void remove()}>
              {saving ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {t('toasts.delete.confirm')}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogHeader>
            <DialogTitle>{t('toasts.edit.title')}</DialogTitle>
            <DialogDescription>{t('toasts.edit.description', { time })}</DialogDescription>
          </DialogHeader>

          <CountStepper value={count} onChange={setCount} disabled={saving} />
          {session.photoHidden ? (
            <HiddenPhoto
              stored={session.hasPhoto && !removeStored}
              disabled={saving}
              onRemove={() => {
                setRemoveStored(true);
              }}
            />
          ) : (
            <PhotoPicker
              imageUrl={picked?.previewUrl ?? (removeStored ? null : session.photoUrl)}
              imageKey={picked?.key}
              imageAlt={t(picked ? 'home.photo.previewAlt' : 'toasts.edit.photoAlt')}
              onPick={pickPhoto}
              onRemove={() => {
                pickPhoto(null);
                setRemoveStored(session.hasPhoto);
              }}
              disabled={saving}
            />
          )}

          {shownError && <ErrorText messageKey={shownError} />}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={saving}
              onClick={() => {
                setError(null);
                setConfirmingDelete(true);
              }}
            >
              <Trash2 aria-hidden="true" />
              {t('toasts.edit.delete')}
            </Button>
            <Button size="lg" disabled={!changed || tooLarge || saving} onClick={() => void save()}>
              {saving ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {saving ? t('home.log.saving') : t('toasts.edit.save')}
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  );
}

/** An admin hid the photo: it can be removed, but nothing replaces it (SPEC §4.3 BR-TOAST-7). */
function HiddenPhoto({
  stored,
  disabled,
  onRemove,
}: {
  stored: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
      <p>{t(stored ? 'toasts.edit.photoHidden' : 'toasts.edit.photoLocked')}</p>
      {stored && (
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
          <X aria-hidden="true" />
          {t('home.photo.remove')}
        </Button>
      )}
    </div>
  );
}

function ErrorText({ messageKey }: { messageKey: ErrorKey }) {
  const { t } = useTranslation();
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(messageKey)}
    </p>
  );
}

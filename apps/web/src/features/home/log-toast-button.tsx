import { Check, LoaderCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CountStepper } from '@/features/toast-sessions/count-stepper';
import {
  isTooLarge,
  PhotoPicker,
  photoErrorMessageKey,
  usePickedPhoto,
} from '@/features/toast-sessions/photo-picker';

import { useLogToasts } from './use-log-toasts';

/** "+ Toast" → how many toasts and an optional photo → log (SPEC §4.3: two taps for one toast). */
export function LogToastButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="h-20 w-full rounded-xl text-xl font-bold [&_svg:not([class*='size-'])]:size-7"
        >
          <Plus aria-hidden="true" />
          {t('home.logToast')}
        </Button>
      </DialogTrigger>
      {/* Mounted per opening, so the count, the photo and any error start fresh. */}
      {open && (
        <LogToastsDialog
          onDone={() => {
            setOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}

function LogToastsDialog({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const logToasts = useLogToasts();
  const [count, setCount] = useState(1);
  const [photo, setPhoto] = usePickedPhoto();
  const pending = logToasts.isPending;
  const tooLarge = isTooLarge(photo);
  const error = tooLarge
    ? 'home.photo.tooLarge'
    : logToasts.isError && photoErrorMessageKey(logToasts.error);

  const changePhoto = (file: File | null) => {
    // An error about the old photo no longer applies.
    logToasts.reset();
    setPhoto(file);
  };

  return (
    <DialogContent
      // Closing mid-upload would hide whether the toasts were saved.
      showCloseButton={!pending}
      onEscapeKeyDown={(event) => {
        if (pending) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('home.log.title')}</DialogTitle>
        <DialogDescription>{t('home.log.description')}</DialogDescription>
      </DialogHeader>

      <CountStepper value={count} onChange={setCount} disabled={pending} />
      <PhotoPicker
        imageUrl={photo?.previewUrl ?? null}
        imageKey={photo?.key}
        imageAlt={t('home.photo.previewAlt')}
        onPick={changePhoto}
        onRemove={() => {
          changePhoto(null);
        }}
        disabled={pending}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <DialogFooter>
        <Button
          size="lg"
          disabled={tooLarge || pending}
          onClick={() => {
            logToasts.mutate(photo ? { count, photo: photo.file } : { count }, {
              onSuccess: onDone,
            });
          }}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
          {pending ? t('home.log.saving') : t('home.log.confirm', { count })}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

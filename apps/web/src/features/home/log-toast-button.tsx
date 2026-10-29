import { Check, ImagePlus, LoaderCircle, Minus, Plus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PHOTO_MAX_BYTES } from '@toasthub/shared';

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
import { useFormat } from '@/i18n/format';

import { MAX_TOASTS_PER_LOG, photoErrorMessageKey, useLogToasts } from './use-log-toasts';

// The types the server accepts (SPEC §4.3); `.heic` too, because some browsers report HEIC with no type.
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

interface Picked {
  file: File;
  previewUrl: string;
  // Remounts the preview per pick, so a failed preview doesn't carry over.
  key: number;
}

/** "+ Toast" → how many toasts and an optional photo → log (SPEC §4.3: two taps for one toast). */
export function LogToastButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<Picked | null>(null);

  const changePhoto = (file: File | null) => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(file && { file, previewUrl: URL.createObjectURL(file), key: (photo?.key ?? 0) + 1 });
  };
  const close = () => {
    setOpen(false);
    changePhoto(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="h-20 w-full rounded-xl text-xl font-bold [&_svg:not([class*='size-'])]:size-7"
        >
          <Plus aria-hidden="true" />
          {t('home.logToast')}
        </Button>
      </DialogTrigger>
      {/* Mounted per opening, so the count and any error start fresh. */}
      {open && <LogToastsDialog photo={photo} onPhotoChange={changePhoto} onDone={close} />}
    </Dialog>
  );
}

function LogToastsDialog({
  photo,
  onPhotoChange,
  onDone,
}: {
  photo: Picked | null;
  onPhotoChange: (file: File | null) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const logToasts = useLogToasts();
  const inputRef = useRef<HTMLInputElement>(null);
  const countId = useId();
  const [count, setCount] = useState(1);
  const pending = logToasts.isPending;
  const tooLarge = photo !== null && photo.file.size > PHOTO_MAX_BYTES;
  const error = tooLarge
    ? 'home.photo.tooLarge'
    : logToasts.isError && photoErrorMessageKey(logToasts.error);

  const pick = () => inputRef.current?.click();
  const changePhoto = (file: File | null) => {
    // An error about the old photo no longer applies.
    logToasts.reset();
    onPhotoChange(file);
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

      <div role="group" aria-labelledby={countId} className="flex flex-col items-center gap-2">
        <p id={countId} className="text-sm font-medium text-muted-foreground">
          {t('home.log.count')}
        </p>
        <div className="flex items-center gap-6">
          <Button
            variant="outline"
            size="icon-lg"
            className="rounded-full"
            aria-label={t('home.log.fewer')}
            disabled={pending || count <= 1}
            onClick={() => {
              setCount(count - 1);
            }}
          >
            <Minus aria-hidden="true" />
          </Button>
          <output
            aria-labelledby={countId}
            className="w-12 text-center text-4xl font-bold tabular-nums"
          >
            {format.number(count)}
          </output>
          <Button
            variant="outline"
            size="icon-lg"
            className="rounded-full"
            aria-label={t('home.log.more')}
            disabled={pending || count >= MAX_TOASTS_PER_LOG}
            onClick={() => {
              setCount(count + 1);
            }}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>

      {photo ? (
        <div className="flex flex-col gap-2">
          <PhotoPreview key={photo.key} url={photo.previewUrl} />
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={pending} onClick={pick}>
              {t('home.photo.change')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                changePhoto(null);
              }}
            >
              <X aria-hidden="true" />
              {t('home.photo.remove')}
            </Button>
          </div>
        </div>
      ) : (
        // No `capture`, so phones offer the gallery as well as the camera.
        <Button variant="outline" disabled={pending} onClick={pick}>
          <ImagePlus aria-hidden="true" />
          {t('home.photo.add')}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file again still fires a change.
          event.target.value = '';
          if (file) changePhoto(file);
        }}
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

function PhotoPreview({ url }: { url: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  return failed ? (
    // HEIC has no preview outside Safari; the server still converts it.
    <p className="rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">
      {t('home.photo.noPreview')}
    </p>
  ) : (
    <img
      src={url}
      alt={t('home.photo.previewAlt')}
      className="max-h-[40dvh] w-full rounded-lg bg-muted object-contain"
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

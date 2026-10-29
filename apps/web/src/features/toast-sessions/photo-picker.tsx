import { ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PHOTO_FIELD, PHOTO_MAX_BYTES } from '@toasthub/shared';

import { ApiError, errorMessageKey } from '@/api/errors';
import { Button } from '@/components/ui/button';

// The types the server accepts (SPEC §4.3); `.heic` too, because some browsers report HEIC with no type.
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

export interface PickedPhoto {
  file: File;
  previewUrl: string;
  // Remounts the preview per pick, so a failed preview doesn't carry over.
  key: number;
}

/** A photo picked from the device, with an object URL for its preview that is freed on change and unmount. */
export function usePickedPhoto() {
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const current = useRef<PickedPhoto | null>(null);
  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current.previewUrl);
    },
    [],
  );
  const change = (file: File | null) => {
    if (current.current) URL.revokeObjectURL(current.current.previewUrl);
    const next = file && {
      file,
      previewUrl: URL.createObjectURL(file),
      key: (current.current?.key ?? 0) + 1,
    };
    current.current = next;
    setPicked(next);
  };
  return [picked, change] as const;
}

export function isTooLarge(picked: PickedPhoto | null): boolean {
  return picked !== null && picked.file.size > PHOTO_MAX_BYTES;
}

/** The message for a failed upload; the server names the photo field when it can't read the file. */
export function photoErrorMessageKey(error: unknown) {
  if (error instanceof ApiError && error.fields?.[PHOTO_FIELD]) return 'home.photo.invalid';
  if (error instanceof ApiError && error.code === 'PAYLOAD_TOO_LARGE') return 'home.photo.tooLarge';
  return errorMessageKey(error);
}

/**
 * Shows the photo (`imageUrl`) with "Choose another" and "Remove", or an "Add a photo" button. Picking
 * goes through a file input without `capture`, so phones offer the gallery as well as the camera.
 */
export function PhotoPicker({
  imageUrl,
  imageAlt,
  imageKey,
  onPick,
  onRemove,
  disabled = false,
}: {
  imageUrl: string | null;
  imageAlt: string;
  imageKey?: string | number;
  onPick: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = () => inputRef.current?.click();
  return (
    <>
      {imageUrl ? (
        <div className="flex flex-col gap-2">
          <PhotoPreview key={imageKey ?? imageUrl} url={imageUrl} alt={imageAlt} />
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={disabled} onClick={pick}>
              {t('home.photo.change')}
            </Button>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
              <X aria-hidden="true" />
              {t('home.photo.remove')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" disabled={disabled} onClick={pick}>
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
          if (file) onPick(file);
        }}
      />
    </>
  );
}

function PhotoPreview({ url, alt }: { url: string; alt: string }) {
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
      alt={alt}
      className="max-h-[40dvh] w-full rounded-lg bg-muted object-contain"
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

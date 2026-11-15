import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { TOAST_SESSION_DESCRIPTION_MAX_LENGTH } from '@toasthub/shared';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function SessionDescriptionField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t('toasts.descriptionLabel')}</Label>
      <Textarea
        id={id}
        rows={3}
        maxLength={TOAST_SESSION_DESCRIPTION_MAX_LENGTH}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        disabled={disabled}
      />
    </div>
  );
}
